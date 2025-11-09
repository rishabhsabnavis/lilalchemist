"""
Data ingestion layer for the potion logistics agent.

Includes both simulated API clients (for local testing and demos) and
extension points for integrating real network APIs.
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import sys
from collections import deque
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Deque, Dict, Iterable, List, Optional

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

# Import calculate_cauldron_rates from scripts directory
# Add scripts directory to path for import
_scripts_path = Path(__file__).resolve().parent.parent / "scripts"
if str(_scripts_path) not in sys.path:
    sys.path.insert(0, str(_scripts_path))

try:
    from calculate_rates import calculate_cauldron_rates
    HAS_CALCULATE_RATES = True
except ImportError:
    HAS_CALCULATE_RATES = False

from .config import get_settings
from .data_models import CauldronStatus, TransportTicket

DEFAULT_CAULDRON_IDS = ()  # Empty - use only real API data


class CauldronDataSimulator:
    """Generate synthetic cauldron telemetry for local experimentation."""

    def __init__(
        self,
        cauldron_ids: Iterable[str] = DEFAULT_CAULDRON_IDS,
        base_capacity_liters: float = 500.0,
    ) -> None:
        self._rng = random.Random(42)
        # No hardcoded coordinates - simulator will only work if cauldron_ids are provided
        self._state = {}
        for idx, cauldron_id in enumerate(cauldron_ids):
            # Generate random coordinates if needed (but prefer API data)
            self._state[cauldron_id] = {
                "fill_level": self._rng.uniform(0.35, 0.75) * base_capacity_liters,
                "capacity": base_capacity_liters * self._rng.uniform(0.9, 1.1),
                "name": cauldron_id.replace("_", " ").title(),
                "latitude": 33.0 + self._rng.uniform(-0.1, 0.1),  # Generic location
                "longitude": -97.0 + self._rng.uniform(-0.1, 0.1),  # Generic location
                "fill_rate": self._rng.uniform(1.0, 6.0),  # L/min
                "drain_rate": self._rng.uniform(10.0, 30.0),  # L/min
            }
        self._history: Deque[CauldronStatus] = deque(maxlen=200)

    def sample(self) -> List[CauldronStatus]:
        """Return a simulated snapshot of all cauldrons."""

        now = datetime.utcnow()
        readings: List[CauldronStatus] = []
        for cauldron_id, payload in self._state.items():
            # Apply a random walk with gentle seasonal component.
            seasonal = math.sin(now.minute / 60.0 * math.pi * 2) * 5
            delta = self._rng.uniform(-8, 12) + seasonal
            payload["fill_level"] = max(
                0.0, min(payload["capacity"], payload["fill_level"] + delta)
            )
            status = CauldronStatus(
                cauldron_id=cauldron_id,
                name=payload["name"],
                fill_level_liters=payload["fill_level"],
                capacity_liters=payload["capacity"],
                latitude=payload["latitude"],
                longitude=payload["longitude"],
                fill_rate_liters_per_min=payload["fill_rate"],
                drain_rate_liters_per_min=payload["drain_rate"],
                last_updated=now,
            )
            readings.append(status)
            self._history.append(status)

        return readings

    def history(self) -> Iterable[CauldronStatus]:
        """Expose historic readings for analytics."""

        return tuple(self._history)


class TransportLogSimulator:
    """Generate synthetic transport logs to complement the cauldron simulator."""

    def __init__(self, cauldron_ids: Iterable[str] = DEFAULT_CAULDRON_IDS) -> None:
        self._rng = random.Random(1717)
        self._tickets: Deque[TransportTicket] = deque(maxlen=300)
        self._cauldron_ids = tuple(cauldron_ids)
        # Courier pool - should be fetched from API, not hardcoded
        # Empty pool means simulator should not be used (API only)
        self._courier_pool = ()

    def sample(self) -> List[TransportTicket]:
        """Return a burst of recent transport tickets."""

        now = datetime.utcnow()
        batch: List[TransportTicket] = []
        ticket_count = self._rng.randint(1, 4)
        for idx in range(ticket_count):
            cauldron_id = self._rng.choice(self._cauldron_ids)
            direction = self._rng.choice(("pickup", "dropoff"))
            volume = abs(self._rng.gauss(20, 7))
            ticket_timestamp = now - timedelta(minutes=self._rng.random() * 5.0)
            ticket_date = ticket_timestamp.date().isoformat()  # EOG: date only
            
            ticket = TransportTicket(
                ticket_id=f"T-{now.strftime('%H%M%S')}-{idx}",
                cauldron_id=cauldron_id,
                volume_liters=volume,
                direction=direction,
                # No fallback courier - simulator should not be used
                courier_id="unknown_courier",
                date=ticket_date,  # EOG requirement: date only
                timestamp=ticket_timestamp,  # Optional internal timestamp
            )
            self._tickets.append(ticket)
            batch.append(ticket)

        return batch

    def history(self) -> Iterable[TransportTicket]:
        """Expose historic ticket data."""

        return tuple(self._tickets)


class CauldronAPIClient:
    """
    Abstract access layer for cauldron telemetry.

    Fetches from EOG API: https://hackutd2025.eog.systems
    Falls back to simulator if API unavailable or httpx not installed.
    
    Implements dynamic level updates: calculates current level based on:
    - Last known level from EOG API
    - Time elapsed since last update
    - Fill rate (continuous filling)
    - Active drains (if any)
    """

    EOG_BASE_URL = "https://hackutd2025.eog.systems"
    CAULDRONS_ENDPOINT = f"{EOG_BASE_URL}/api/Information/cauldrons"
    DATA_ENDPOINT = f"{EOG_BASE_URL}/api/Data"
    DATA_METADATA_ENDPOINT = f"{EOG_BASE_URL}/api/Data/metadata"

    def __init__(self) -> None:
        self._settings = get_settings()
        self._simulator = CauldronDataSimulator()
        self._cauldron_info_cache: Optional[List[Dict]] = None
        self._use_api = HAS_HTTPX and getattr(self._settings, 'use_eog_api', True)
        # Store last known state for dynamic updates
        self._last_levels: Dict[str, float] = {}  # cauldron_id -> fill_level_liters
        self._last_timestamps: Dict[str, datetime] = {}  # cauldron_id -> last_updated
        self._last_fetch_time: Optional[datetime] = None

    async def fetch_current_levels(self) -> List[CauldronStatus]:
        """Fetch the latest cauldron states from EOG API or simulator."""

        if not self._use_api:
            return await self._fetch_from_simulator()
        
        try:
            return await self._fetch_from_eog_api()
        except Exception as e:
            # Fallback to simulator on error
            print(f"Warning: EOG API fetch failed ({e}), using simulator")
            return await self._fetch_from_simulator()

    async def _fetch_from_eog_api(self) -> List[CauldronStatus]:
        """Fetch current cauldron levels from EOG API and apply dynamic updates."""
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch cauldron information (id, name, location, capacity)
            if self._cauldron_info_cache is None:
                cauldrons_resp = await client.get(self.CAULDRONS_ENDPOINT)
                cauldrons_resp.raise_for_status()
                self._cauldron_info_cache = cauldrons_resp.json()
            
            # Fetch latest data (current levels) with query parameters
            # Using start_date=0 and end_date=2000000000 to get all available data
            data_resp = await client.get(
                self.DATA_ENDPOINT,
                params={"start_date": 0, "end_date": 2000000000}
            )
            data_resp.raise_for_status()
            historical_data = data_resp.json()
            
            if not historical_data:
                raise ValueError("No historical data available")
            
            # Get the latest timestamp data from EOG API
            latest_data = historical_data[-1]
            eog_timestamp = datetime.fromisoformat(latest_data["timestamp"].replace("Z", "+00:00"))
            eog_levels = latest_data["cauldron_levels"]
            
            # Current time for dynamic updates
            now = datetime.utcnow()
            
            # Calculate fill and drain rates for all cauldrons using calculate_cauldron_rates
            # This uses the sophisticated algorithm from calculate_rates.py
            rate_map: Dict[str, List[Optional[float]]] = {}
            if HAS_CALCULATE_RATES and historical_data:
                try:
                    rate_map = calculate_cauldron_rates(historical_data)
                except Exception as e:
                    print(f"Warning: calculate_cauldron_rates failed ({e}), using fallback method")
                    rate_map = {}
            
            # Combine cauldron info with current levels and apply dynamic updates
            statuses: List[CauldronStatus] = []
            for cauldron_info in self._cauldron_info_cache:
                cauldron_id = cauldron_info["id"]
                base_level = eog_levels.get(cauldron_id, 0.0)
                capacity = cauldron_info["max_volume"]
                
                # Get fill and drain rates from calculate_cauldron_rates if available
                if cauldron_id in rate_map and rate_map[cauldron_id][0] is not None:
                    fill_rate = rate_map[cauldron_id][0]
                else:
                    # Fallback to old method if calculate_cauldron_rates not available or failed
                    fill_rate = self._estimate_fill_rate(historical_data, cauldron_id)
                
                # Get drain rate from calculate_cauldron_rates if available
                if cauldron_id in rate_map and rate_map[cauldron_id][1] is not None:
                    drain_rate = rate_map[cauldron_id][1]
                else:
                    # Fallback to default drain rate if not calculated
                    drain_rate = 20.0  # Default drain rate (EOG API doesn't provide this)
                
                # Apply dynamic updates: simulate continuous filling since last update
                if cauldron_id in self._last_levels and self._last_timestamps.get(cauldron_id):
                    # Calculate time elapsed since last update
                    time_elapsed_minutes = (now - self._last_timestamps[cauldron_id]).total_seconds() / 60.0
                    
                    # Start from last known level (or EOG base level if first time)
                    last_level = self._last_levels.get(cauldron_id, base_level)
                    
                    # Apply continuous filling: level increases by fill_rate * time
                    # Cap at capacity, floor at 0
                    current_level = min(
                        capacity,
                        max(0.0, last_level + (fill_rate * time_elapsed_minutes))
                    )
                else:
                    # First time fetching - use EOG base level
                    current_level = base_level
                    # Initialize tracking
                    self._last_levels[cauldron_id] = base_level
                    self._last_timestamps[cauldron_id] = now
                
                # Update stored state (use calculated level, not base_level)
                self._last_levels[cauldron_id] = current_level
                self._last_timestamps[cauldron_id] = now
                
                status = CauldronStatus(
                    cauldron_id=cauldron_id,
                    name=cauldron_info["name"],
                    fill_level_liters=current_level,
                    capacity_liters=capacity,
                    latitude=cauldron_info["latitude"],
                    longitude=cauldron_info["longitude"],
                    fill_rate_liters_per_min=fill_rate,
                    drain_rate_liters_per_min=drain_rate,
                    last_updated=now,  # Use current time for dynamic updates
                )
                statuses.append(status)
            
            self._last_fetch_time = now
            return statuses
    
    async def fetch_data_metadata(self) -> Dict:
        """Fetch metadata from the Data endpoint."""
        if not self._use_api:
            return {}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.DATA_METADATA_ENDPOINT)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"Warning: EOG API data metadata fetch failed ({e})")
            return {}

    def _estimate_fill_rate(self, historical_data: List[Dict], cauldron_id: str) -> float:
        """Estimate fill rate from historical data by calculating average rate of change.
        
        Only counts positive changes (filling) to estimate the natural fill rate.
        Negative changes (draining) are excluded from the calculation.
        
        Uses a larger window (last 100 data points) to get more accurate fill rates
        and avoid the minimum threshold masking differences between cauldrons.
        """
        
        if len(historical_data) < 2:
            return 2.5  # Default fill rate
        
        # Use larger window (last 100 data points) for more accurate calculation
        # This gives us ~100 minutes of data (1 minute intervals)
        window_size = min(100, len(historical_data))
        recent_data = historical_data[-window_size:]
        total_change = 0.0
        total_minutes = 0.0
        
        for i in range(1, len(recent_data)):
            prev_level = recent_data[i-1]["cauldron_levels"].get(cauldron_id, 0.0)
            curr_level = recent_data[i]["cauldron_levels"].get(cauldron_id, 0.0)
            
            prev_time = datetime.fromisoformat(recent_data[i-1]["timestamp"].replace("Z", "+00:00"))
            curr_time = datetime.fromisoformat(recent_data[i]["timestamp"].replace("Z", "+00:00"))
            
            minutes = (curr_time - prev_time).total_seconds() / 60.0
            if minutes > 0:
                change = curr_level - prev_level
                # Only count positive changes (filling, not draining)
                # This gives us the natural fill rate when not being drained
                if change > 0:
                    total_change += change
                    total_minutes += minutes
        
        if total_minutes > 0:
            calculated_rate = total_change / total_minutes
            # Use calculated rate directly (no minimum) to preserve differences between cauldrons
            # If rate is very low (< 0.1), use a small default to avoid zero
            if calculated_rate < 0.1:
                return 0.1  # Very small but non-zero rate
            return calculated_rate
        
        # If no positive changes found, estimate from overall trend
        if len(recent_data) >= 2:
            first_level = recent_data[0]["cauldron_levels"].get(cauldron_id, 0.0)
            last_level = recent_data[-1]["cauldron_levels"].get(cauldron_id, 0.0)
            first_time = datetime.fromisoformat(recent_data[0]["timestamp"].replace("Z", "+00:00"))
            last_time = datetime.fromisoformat(recent_data[-1]["timestamp"].replace("Z", "+00:00"))
            
            total_time = (last_time - first_time).total_seconds() / 60.0
            if total_time > 0:
                net_change = last_level - first_level
                if net_change > 0:
                    return net_change / total_time
        
        return 2.5  # Default fill rate

    async def _fetch_from_simulator(self) -> List[CauldronStatus]:
        """Fallback to simulator."""
        await asyncio.sleep(0)
        return self._simulator.sample()

    async def _fetch_from_source(self) -> List[CauldronStatus]:
        """Legacy method - redirects to fetch_current_levels."""
        return await self.fetch_current_levels()


class TransportLogAPIClient:
    """
    Abstract access layer for potion transport logs.

    Fetches from EOG API: https://hackutd2025.eog.systems/api/Tickets
    Falls back to simulator if API unavailable or httpx not installed.
    """

    EOG_BASE_URL = "https://hackutd2025.eog.systems"
    TICKETS_ENDPOINT = f"{EOG_BASE_URL}/api/Tickets"

    def __init__(self) -> None:
        self._settings = get_settings()
        self._simulator = TransportLogSimulator()
        self._use_api = HAS_HTTPX and getattr(self._settings, 'use_eog_api', True)

    async def fetch_recent_tickets(self, limit: Optional[int] = None) -> List[TransportTicket]:
        """Fetch a window of recent transport tickets from EOG API or simulator."""

        if not self._use_api:
            return await self._fetch_from_simulator()
        
        try:
            tickets = await self._fetch_from_eog_api()
            if limit is not None:
                return tickets[-limit:]
            return tickets
        except Exception as e:
            # Fallback to simulator on error
            print(f"Warning: EOG API fetch failed ({e}), using simulator")
            return await self._fetch_from_simulator()

    async def _fetch_from_eog_api(self) -> List[TransportTicket]:
        """Fetch transport tickets from EOG API."""
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.TICKETS_ENDPOINT)
            resp.raise_for_status()
            data = resp.json()
            
            # EOG API returns: {metadata: {...}, transport_tickets: [...]}
            tickets_data = data.get("transport_tickets", [])
            
            tickets: List[TransportTicket] = []
            for ticket_data in tickets_data:
                # Map EOG API format to our TransportTicket schema
                ticket = TransportTicket(
                    ticket_id=ticket_data["ticket_id"],
                    cauldron_id=ticket_data["cauldron_id"],
                    volume_liters=ticket_data["amount_collected"],  # EOG uses "amount_collected"
                    direction="pickup",  # EOG tickets are for collections (pickups)
                    courier_id=ticket_data["courier_id"],
                    date=ticket_data["date"],  # EOG requirement: date only (YYYY-MM-DD)
                    timestamp=None,  # EOG doesn't provide timestamps, only dates
                )
                tickets.append(ticket)
            
            return tickets

    async def _fetch_from_simulator(self) -> List[TransportTicket]:
        """Fallback to simulator."""
        await asyncio.sleep(0)
        batch = self._simulator.sample()
        return list(self._simulator.history())

    async def _fetch_from_source(self) -> List[TransportTicket]:
        """Legacy method - redirects to fetch_recent_tickets."""
        return await self.fetch_recent_tickets()


class NetworkAPIClient:
    """
    Abstract access layer for network map information.
    
    Fetches from EOG API: https://hackutd2025.eog.systems/api/Information/network
    Falls back to local JSON file if API unavailable.
    """
    
    EOG_BASE_URL = "https://hackutd2025.eog.systems"
    NETWORK_ENDPOINT = f"{EOG_BASE_URL}/api/Information/network"
    MARKET_ENDPOINT = f"{EOG_BASE_URL}/api/Information/market"
    COURIERS_ENDPOINT = f"{EOG_BASE_URL}/api/Information/couriers"
    
    def __init__(self) -> None:
        self._settings = get_settings()
        self._network_cache: Optional[Dict] = None
        self._use_api = HAS_HTTPX and getattr(self._settings, 'use_eog_api', True)
    
    async def fetch_network_map(self) -> Dict:
        """
        Fetch the network map from EOG API or local file.
        
        Returns network map with nodes and edges (travel times).
        """
        if not self._use_api:
            return self._fetch_from_local_file()
        
        try:
            return await self._fetch_from_eog_api()
        except Exception as e:
            print(f"Warning: EOG API network fetch failed ({e}), using local file")
            return self._fetch_from_local_file()
    
    async def _fetch_from_eog_api(self) -> Dict:
        """Fetch network map from EOG API and transform to nested object format."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.NETWORK_ENDPOINT)
            resp.raise_for_status()
            data = resp.json()
            
            # Transform edges array format to nested object format
            # API returns: {"edges": [{"from": "node1", "to": "node2", "travel_time_minutes": 5}]}
            # We need: {"node1": {"node2": 5}, "node2": {"node1": 5}}
            network_map: Dict[str, Dict[str, float]] = {}
            
            if "edges" in data:
                for edge in data["edges"]:
                    from_node = edge.get("from", "")
                    to_node = edge.get("to", "")
                    travel_time = edge.get("travel_time_minutes", 0.0)
                    
                    if from_node and to_node:
                        # Initialize nested dict if needed
                        if from_node not in network_map:
                            network_map[from_node] = {}
                        network_map[from_node][to_node] = travel_time
                        
                        # Also add reverse direction (bidirectional)
                        if to_node not in network_map:
                            network_map[to_node] = {}
                        network_map[to_node][from_node] = travel_time
            
            # Cache the transformed network map
            self._network_cache = network_map
            return network_map
    
    def _fetch_from_local_file(self) -> Dict:
        """Fallback to local network map file."""
        network_map_path = Path(self._settings.network_map_path)
        if not network_map_path.exists():
            return {}
        
        with network_map_path.open("r", encoding="utf-8") as fp:
            return json.load(fp)
    
    async def fetch_market_info(self) -> Dict:
        """Fetch market information from EOG API."""
        if not self._use_api:
            return {}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.MARKET_ENDPOINT)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"Warning: EOG API market fetch failed ({e})")
            return {}
    
    async def fetch_couriers_info(self) -> Dict:
        """Fetch couriers information from EOG API."""
        if not self._use_api:
            return {}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.COURIERS_ENDPOINT)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"Warning: EOG API couriers fetch failed ({e})")
            return {}
    
    async def fetch_graph_neighbors(self, node_id: str, directed: bool = False) -> Dict:
        """
        Fetch graph neighbors for a specific node.
        
        Args:
            node_id: The node ID to get neighbors for
            directed: If True, use directed neighbors endpoint
        """
        if not self._use_api:
            return {}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if directed:
                    endpoint = f"{self.EOG_BASE_URL}/api/Information/graph/neighbors/directed/{node_id}"
                else:
                    endpoint = f"{self.EOG_BASE_URL}/api/Information/graph/neighbors/{node_id}"
                
                resp = await client.get(endpoint)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            print(f"Warning: EOG API graph neighbors fetch failed ({e})")
            return {}


__all__ = [
    "CauldronAPIClient",
    "CauldronDataSimulator",
    "TransportLogAPIClient",
    "TransportLogSimulator",
    "NetworkAPIClient",
]

