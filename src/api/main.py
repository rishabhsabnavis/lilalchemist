"""
FastAPI server for PotionMaster frontend.

Provides REST API endpoints to connect the React frontend with the Python backend.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from potion_agent.anomaly_detection import AnomalyDetector
from potion_agent.data_ingestion import CauldronAPIClient, TransportLogAPIClient, NetworkAPIClient
from potion_agent.data_models import CauldronStatus, TransportTicket
from potion_agent.forecasting import ForecastEngine
from potion_agent.routing import RouteOptimizer
from potion_agent.ticket_matching import TicketMatcher, DrainEvent

# Initialize FastAPI app
app = FastAPI(
    title="PotionMaster API",
    description="API bridge for PotionMaster frontend",
    version="1.0.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize backend clients and services (singleton instances)
# These maintain state across requests for dynamic updates
cauldron_client = CauldronAPIClient()
transport_client = TransportLogAPIClient()
network_client = NetworkAPIClient()
anomaly_detector = AnomalyDetector()
forecast_engine = ForecastEngine()
route_optimizer = RouteOptimizer()
ticket_matcher = TicketMatcher()

# WebSocket connections for real-time updates
active_connections: List[WebSocket] = []


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "PotionMaster API",
        "version": "1.0.0"
    }


@app.get("/api/cauldrons")
async def get_cauldrons() -> List[Dict]:
    """
    Get current cauldron levels.
    
    Returns list of all cauldrons with their current status.
    Levels are dynamically updated based on fill_rate and time elapsed.
    """
    try:
        cauldrons = await cauldron_client.fetch_current_levels()
        tickets = await transport_client.fetch_recent_tickets(limit=50)
        
        # Detect active drains from recent tickets
        # A cauldron is draining if there's a recent ticket (within last 15 minutes)
        from datetime import timedelta
        now = datetime.utcnow()
        active_drains = set()
        
        for ticket in tickets:
            # Check if ticket is recent (simulating active drain)
            # In real system, we'd check ticket timestamp, but EOG only provides dates
            # So we'll use a heuristic: if ticket date is today, consider it active
            ticket_date = datetime.fromisoformat(ticket.date + "T00:00:00+00:00").date()
            today = now.date()
            
            # If ticket is from today and volume > 0, consider it an active drain
            if ticket_date == today and ticket.volume_liters > 0:
                active_drains.add(ticket.cauldron_id)
        
        # Convert to JSON-serializable format
        result = []
        for cauldron in cauldrons:
            is_draining = cauldron.cauldron_id in active_drains
            
            # If draining, apply drain rate to current level
            current_level = cauldron.fill_level_liters
            if is_draining:
                # Calculate time since last update (assume drain started recently)
                time_elapsed_minutes = 0.1  # Small increment for real-time effect
                # During drain: level decreases by (drain_rate - fill_rate) * time
                # (fill continues during drain, but drain is faster)
                net_drain_rate = cauldron.drain_rate_liters_per_min - cauldron.fill_rate_liters_per_min
                current_level = max(0.0, current_level - (net_drain_rate * time_elapsed_minutes))
            
            result.append({
                "cauldron_id": cauldron.cauldron_id,
                "id": cauldron.cauldron_id,  # For frontend compatibility
                "name": cauldron.name,
                "fill_level_liters": round(current_level, 2),
                "capacity_liters": round(cauldron.capacity_liters, 2),
                "level": round((current_level / cauldron.capacity_liters) * 100, 1),
                "latitude": cauldron.latitude,
                "longitude": cauldron.longitude,
                "fill_rate_liters_per_min": round(cauldron.fill_rate_liters_per_min, 2),
                "drain_rate_liters_per_min": round(cauldron.drain_rate_liters_per_min, 2),
                "fillRate": round(cauldron.fill_rate_liters_per_min, 2),  # Frontend compatibility
                "last_updated": cauldron.last_updated.isoformat(),
                "utilization": round((current_level / cauldron.capacity_liters) * 100, 1),
                "isDraining": is_draining,  # Add draining status
                "hasAnomaly": False,  # Will be set by anomaly detection
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching cauldrons: {str(e)}")


@app.get("/api/tickets")
async def get_tickets(limit: Optional[int] = None) -> List[Dict]:
    """
    Get transport tickets with discrepancy detection and matching.
    
    EOG Requirement: Match tickets to drain events, verify volumes match,
    account for continuous potion flow during drainage.
    
    Args:
        limit: Optional limit on number of tickets to return
    
    Returns list of transport tickets with matching status.
    """
    try:
        tickets = await transport_client.fetch_recent_tickets(limit=limit)
        cauldrons = await cauldron_client.fetch_current_levels()
        
        # Fetch historical data for drain event detection
        # Get data for the last 7 days to detect drain events
        from datetime import timedelta
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=7)
        
        # Fetch historical data from EOG API
        async with httpx.AsyncClient(timeout=30.0) as client:
            data_resp = await client.get(
                cauldron_client.DATA_ENDPOINT,
                params={"start_date": 0, "end_date": 2000000000}
            )
            data_resp.raise_for_status()
            historical_data = data_resp.json()
        
        # Build cauldron history for drain detection
        cauldron_history: Dict[str, List[Tuple[datetime, CauldronStatus]]] = {}
        for data_point in historical_data:
            timestamp = datetime.fromisoformat(data_point["timestamp"].replace("Z", "+00:00"))
            cauldron_levels = data_point["cauldron_levels"]
            
            for cauldron in cauldrons:
                cauldron_id = cauldron.cauldron_id
                if cauldron_id not in cauldron_history:
                    cauldron_history[cauldron_id] = []
                
                level = cauldron_levels.get(cauldron_id, 0.0)
                # Create a status snapshot for this timestamp
                status_snapshot = CauldronStatus(
                    cauldron_id=cauldron_id,
                    name=cauldron.name,
                    fill_level_liters=level,
                    capacity_liters=cauldron.capacity_liters,
                    latitude=cauldron.latitude,
                    longitude=cauldron.longitude,
                    fill_rate_liters_per_min=cauldron.fill_rate_liters_per_min,
                    drain_rate_liters_per_min=cauldron.drain_rate_liters_per_min,
                    last_updated=timestamp,
                )
                cauldron_history[cauldron_id].append((timestamp, status_snapshot))
        
        # Detect drain events for all cauldrons
        all_drain_events = []
        for cauldron_id, history in cauldron_history.items():
            drain_events = ticket_matcher.detect_drain_events(history)
            all_drain_events.extend(drain_events)
        
        # Match tickets to drain events
        matching_results = ticket_matcher.match_tickets_to_drains(tickets, all_drain_events)
        
        # Convert to JSON-serializable format with matching results
        result = []
        for ticket in tickets:
            ticket_id = ticket.ticket_id
            match_result = matching_results.get(ticket_id, (ticket, None, "unknown"))
            matched_ticket, matched_drain, status = match_result
            
            ticket_dict = {
                "ticket_id": ticket.ticket_id,
                "id": ticket.ticket_id,  # For frontend compatibility
                "cauldron_id": ticket.cauldron_id,
                "cauldronId": ticket.cauldron_id,  # Frontend compatibility
                "volume_liters": round(ticket.volume_liters, 2),
                "volume": round(ticket.volume_liters, 2),  # Frontend compatibility
                "direction": ticket.direction,
                "courier_id": ticket.courier_id,
                "date": ticket.date,
                "timestamp": ticket.timestamp.isoformat() if ticket.timestamp else None,
                "status": status,  # "matched", "mismatch", "missing_drain"
            }
            
            # Add matching details for discrepancy detection
            if matched_drain:
                ticket_dict["matched_drain"] = {
                    "start_time": matched_drain.start_time.isoformat(),
                    "end_time": matched_drain.end_time.isoformat(),
                    "expected_total_volume": round(matched_drain.expected_total_volume, 2),
                    "level_drop": round(matched_drain.level_drop, 2),
                    "potion_generated_during_drain": round(matched_drain.potion_generated_during_drain, 2),
                    "duration_minutes": round(matched_drain.duration_minutes, 2),
                }
                ticket_dict["volume_difference"] = round(
                    abs(ticket.volume_liters - matched_drain.expected_total_volume), 2
                )
            
            result.append(ticket_dict)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching tickets: {str(e)}")


@app.get("/api/historical/cauldrons")
async def get_historical_cauldrons(date: Optional[str] = None) -> Dict:
    """
    Get historical cauldron data for a specific date.
    
    EOG Requirement: Historic Data Playback - Ability to review historical potion levels.
    
    Args:
        date: Optional date in YYYY-MM-DD format. If not provided, returns latest data.
    
    Returns historical cauldron levels for the specified date.
    """
    try:
        if not HAS_HTTPX:
            raise HTTPException(status_code=500, detail="httpx not available")
        
        # Fetch historical data from EOG API
        async with httpx.AsyncClient(timeout=30.0) as client:
            data_resp = await client.get(
                cauldron_client.DATA_ENDPOINT,
                params={"start_date": 0, "end_date": 2000000000}
            )
            data_resp.raise_for_status()
            historical_data = data_resp.json()
        
        # Get cauldron info
        cauldrons = await cauldron_client.fetch_current_levels()
        cauldron_info_map = {c.cauldron_id: c for c in cauldrons}
        
        # Filter by date if provided
        target_date = date
        if target_date:
            # Filter data points for the specified date
            filtered_data = []
            for data_point in historical_data:
                timestamp = datetime.fromisoformat(data_point["timestamp"].replace("Z", "+00:00"))
                if timestamp.date().isoformat() == target_date:
                    filtered_data.append(data_point)
            
            # Get all unique timestamps for the date
            timestamps = sorted(set(
                datetime.fromisoformat(dp["timestamp"].replace("Z", "+00:00"))
                for dp in filtered_data
            ))
            
            # Build time series data for each cauldron
            cauldron_time_series = {}
            for cauldron in cauldrons:
                cauldron_id = cauldron.cauldron_id
                cauldron_time_series[cauldron_id] = []
                
                for timestamp in timestamps:
                    # Find closest data point for this timestamp
                    closest_point = min(
                        filtered_data,
                        key=lambda dp: abs(
                            (datetime.fromisoformat(dp["timestamp"].replace("Z", "+00:00")) - timestamp).total_seconds()
                        )
                    )
                    level = closest_point["cauldron_levels"].get(cauldron_id, 0.0)
                    cauldron_time_series[cauldron_id].append({
                        "timestamp": timestamp.isoformat(),
                        "level": round(level, 2),
                    })
        else:
            # Return latest data
            if historical_data:
                latest = historical_data[-1]
                timestamp = datetime.fromisoformat(latest["timestamp"].replace("Z", "+00:00"))
                cauldron_time_series = {}
                for cauldron in cauldrons:
                    cauldron_id = cauldron.cauldron_id
                    level = latest["cauldron_levels"].get(cauldron_id, 0.0)
                    cauldron_time_series[cauldron_id] = [{
                        "timestamp": timestamp.isoformat(),
                        "level": round(level, 2),
                    }]
            else:
                cauldron_time_series = {}
        
        # Build result
        result = {
            "date": target_date or datetime.utcnow().date().isoformat(),
            "cauldrons": []
        }
        
        for cauldron in cauldrons:
            cauldron_id = cauldron.cauldron_id
            time_series = cauldron_time_series.get(cauldron_id, [])
            
            # Get latest level for this date
            latest_level = time_series[-1]["level"] if time_series else 0.0
            
            result["cauldrons"].append({
                "cauldron_id": cauldron_id,
                "name": cauldron.name,
                "fill_level_liters": latest_level,
                "capacity_liters": round(cauldron.capacity_liters, 2),
                "level": round((latest_level / cauldron.capacity_liters) * 100, 1) if cauldron.capacity_liters > 0 else 0,
                "time_series": time_series,  # Historical levels for the date
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching historical data: {str(e)}")


@app.get("/api/anomalies")
async def get_anomalies() -> List[Dict]:
    """
    Get current anomalies detected.
    
    Returns list of anomalies detected in cauldrons.
    """
    try:
        cauldrons = await cauldron_client.fetch_current_levels()
        tickets = await transport_client.fetch_recent_tickets()
        
        anomalies = anomaly_detector.detect(cauldrons, tickets)
        
        # Convert to JSON-serializable format
        result = []
        for anomaly in anomalies:
            result.append({
                "cauldron_id": anomaly.cauldron_id,
                "anomaly_type": anomaly.anomaly_type,
                "severity": round(anomaly.severity, 2),
                "description": anomaly.description,
                "detected_at": anomaly.detected_at.isoformat(),
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching anomalies: {str(e)}")


@app.get("/api/forecasts")
async def get_forecasts() -> List[Dict]:
    """
    Get overflow forecasts.
    
    Returns list of overflow forecasts for cauldrons.
    """
    try:
        cauldrons = await cauldron_client.fetch_current_levels()
        forecast_engine.update_history(cauldrons)
        forecasts = forecast_engine.forecast_overflow(cauldrons)
        
        # Convert to JSON-serializable format
        result = []
        for forecast in forecasts:
            result.append({
                "cauldron_id": forecast.cauldron_id,
                "projected_overflow_time": forecast.projected_overflow_time.isoformat() if forecast.projected_overflow_time else None,
                "projected_fill_level": round(forecast.projected_fill_level, 2),
                "confidence": round(forecast.confidence, 2),
                "supporting_points": forecast.supporting_points,
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching forecasts: {str(e)}")


@app.get("/api/routes")
async def get_routes() -> List[Dict]:
    """
    Get optimal courier routes.
    
    Returns list of optimized routes for couriers.
    """
    try:
        cauldrons = await cauldron_client.fetch_current_levels()
        forecast_engine.update_history(cauldrons)
        forecasts = forecast_engine.forecast_overflow(cauldrons)
        
        # Sort by earliest overflow projection (None means low risk)
        from datetime import datetime
        prioritized = sorted(
            forecasts,
            key=lambda item: (
                item.projected_overflow_time or datetime.max,
                -item.confidence,
            ),
        )
        demand_order = [forecast.cauldron_id for forecast in prioritized if forecast.projected_overflow_time]
        
        if not demand_order:
            return []
        
        # Fetch couriers from API
        couriers_info = await network_client.fetch_couriers_info()
        courier_ids = []
        if couriers_info and isinstance(couriers_info, dict):
            # Extract courier IDs from API response
            if "couriers" in couriers_info:
                courier_ids = [c.get("courier_id") or c.get("id") for c in couriers_info["couriers"] if c.get("courier_id") or c.get("id")]
            elif isinstance(couriers_info, list):
                courier_ids = [c.get("courier_id") or c.get("id") for c in couriers_info if c.get("courier_id") or c.get("id")]
        
        # If no couriers from API, return empty (no fallback)
        if not courier_ids:
            return []
        
        routes = []
        for index, courier in enumerate(courier_ids):
            if index >= len(demand_order):
                break
            starting_node = demand_order[index % len(demand_order)]
            plan = route_optimizer.generate_pickup_plan(
                courier_id=courier,
                current_location=starting_node,
                demand_order=demand_order,
            )
            routes.append(plan)
        
        # Convert to JSON-serializable format
        result = []
        for route in routes:
            result.append({
                "courier_id": route.courier_id,
                "ordered_stops": route.ordered_stops,
                "total_distance_km": round(route.total_distance_km, 2),
                "estimated_completion_minutes": round(route.estimated_completion_minutes, 2),
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching routes: {str(e)}")


@app.get("/api/network-map")
async def get_network_map() -> Dict:
    """
    Get the potion network map with travel times.
    
    Returns network map with nodes and edges (travel times in minutes).
    """
    try:
        network_map = await network_client.fetch_network_map()
        return network_map
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching network map: {str(e)}")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.
    
    Sends periodic updates of cauldron levels, tickets, and anomalies.
    """
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Fetch latest data
            cauldrons = await cauldron_client.fetch_current_levels()
            tickets = await transport_client.fetch_recent_tickets(limit=10)
            
            # Prepare update message
            update = {
                "type": "update",
                "timestamp": datetime.utcnow().isoformat(),
                "cauldrons": [
                    {
                        "cauldron_id": c.cauldron_id,
                        "level": round((c.fill_level_liters / c.capacity_liters) * 100, 1),
                        "fill_level_liters": round(c.fill_level_liters, 2),
                        "capacity_liters": round(c.capacity_liters, 2),
                    }
                    for c in cauldrons
                ],
                "tickets_count": len(tickets),
            }
            
            # Send update to client
            await websocket.send_json(update)
            
            # Wait before next update
            await asyncio.sleep(2)  # Update every 2 seconds
            
    except WebSocketDisconnect:
        active_connections.remove(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

