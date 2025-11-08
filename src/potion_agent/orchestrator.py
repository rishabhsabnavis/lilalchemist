"""
High-level orchestration and agent workflow management.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Iterable, List, Sequence

from langchain.agents import AgentExecutor

from .anomaly_detection import AnomalyDetector
from .config import get_settings
from .data_ingestion import CauldronAPIClient, TransportLogAPIClient
from .data_models import (
    AnomalyFlag,
    CauldronStatus,
    ForecastResult,
    RoutePlan,
    TransportTicket,
)
from .forecasting import ForecastEngine
from .logging_utils import configure_logging
from .routing import RouteOptimizer
from .tools import AgentContextProtocol


class AgentContext(AgentContextProtocol):
    """Hold shared state that tools can read or mutate."""

    def __init__(self) -> None:
        self.audit_trail: List[Dict[str, str]] = []
        self.cauldron_snapshots: Dict[str, CauldronStatus] = {}
        self.transport_activity: Dict[str, List[TransportTicket]] = {}
        self.route_plans: Dict[str, RoutePlan] = {}

    def update_state(
        self,
        cauldrons: Iterable[CauldronStatus],
        tickets: Iterable[TransportTicket],
        routes: Iterable[RoutePlan],
    ) -> None:
        self.cauldron_snapshots = {c.cauldron_id: c for c in cauldrons}
        summary_map: Dict[str, List[TransportTicket]] = {}
        for ticket in tickets:
            summary_map.setdefault(ticket.cauldron_id, []).append(ticket)
        self.transport_activity = summary_map
        self.route_plans = {route.courier_id: route for route in routes}

    def log_event(self, action: str, details: str) -> str:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "details": details,
        }
        self.audit_trail.append(entry)
        logging.getLogger("potion_agent.audit").info(
            "Logged event", extra={"context": entry}
        )
        return json.dumps(entry)

    def notify_team(self, channel: str, message: str) -> str:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "channel": channel,
            "message": message,
        }
        logging.getLogger("potion_agent.notify").info(
            "Notification issued", extra={"context": entry}
        )
        self.audit_trail.append(
            {"timestamp": entry["timestamp"], "action": "notify", "details": message}
        )
        return json.dumps(entry)

    def update_schedule(self, courier_id: str, new_route: str) -> str:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "courier_id": courier_id,
            "route": new_route,
        }
        logging.getLogger("potion_agent.schedule").info(
            "Schedule update", extra={"context": entry}
        )
        self.audit_trail.append(
            {
                "timestamp": entry["timestamp"],
                "action": "schedule_update",
                "details": new_route,
            }
        )
        return json.dumps(entry)

    def fetch_cauldron_snapshot(self, cauldron_id: str) -> str:
        snapshot = self.cauldron_snapshots.get(cauldron_id)
        if not snapshot:
            return json.dumps({"error": "unknown cauldron"})
        return json.dumps(
            {
                "cauldron_id": snapshot.cauldron_id,
                "name": snapshot.name,
                "fill_level_liters": snapshot.fill_level_liters,
                "capacity_liters": snapshot.capacity_liters,
                "latitude": snapshot.latitude,
                "longitude": snapshot.longitude,
                "fill_rate_liters_per_min": snapshot.fill_rate_liters_per_min,
                "drain_rate_liters_per_min": snapshot.drain_rate_liters_per_min,
                "last_updated": snapshot.last_updated.isoformat(),
            }
        )

    def fetch_transport_summary(self, cauldron_id: str) -> str:
        tickets = self.transport_activity.get(cauldron_id, [])
        payload = [
            {
                "ticket_id": ticket.ticket_id,
                "direction": ticket.direction,
                "volume_liters": ticket.volume_liters,
                "courier_id": ticket.courier_id,
                "date": ticket.date,  # EOG: date only
                "timestamp": ticket.timestamp.isoformat() if ticket.timestamp else None,
            }
            for ticket in tickets
        ]
        return json.dumps(payload)


class PotionLogisticsOrchestrator:
    """Coordinate data ingestion, analytics, and the autonomous agent workflow."""

    def __init__(
        self,
        agent: AgentExecutor,
        cauldron_client: CauldronAPIClient | None = None,
        transport_client: TransportLogAPIClient | None = None,
        anomaly_detector: AnomalyDetector | None = None,
        forecast_engine: ForecastEngine | None = None,
        route_optimizer: RouteOptimizer | None = None,
        context: AgentContext | None = None,
    ) -> None:
        configure_logging()
        self._settings = get_settings()
        self._agent = agent
        self._cauldron_client = cauldron_client or CauldronAPIClient()
        self._transport_client = transport_client or TransportLogAPIClient()
        self._anomaly_detector = anomaly_detector or AnomalyDetector()
        self._forecast_engine = forecast_engine or ForecastEngine()
        self._route_optimizer = route_optimizer or RouteOptimizer()
        self._context = context or AgentContext()
        self._logger = logging.getLogger("potion_agent.orchestrator")

    @property
    def context(self) -> AgentContext:
        return self._context

    async def run_forever(self) -> None:
        """Start the continuous monitoring loop."""

        self._logger.info("Starting orchestration loop")
        while True:
            await self.run_cycle()
            await asyncio.sleep(self._settings.poll_interval_seconds)

    async def run_cycle(self) -> None:
        """Perform a single monitoring + planning cycle."""

        self._logger.info("Starting orchestration cycle")
        cauldrons = await self._cauldron_client.fetch_current_levels()
        tickets = await self._transport_client.fetch_recent_tickets()

        self._forecast_engine.update_history(cauldrons)
        anomalies = self._anomaly_detector.detect(cauldrons, tickets)
        forecasts = self._forecast_engine.forecast_overflow(cauldrons)
        routes = self._plan_routes(forecasts)

        self._context.update_state(cauldrons, tickets, routes)

        narrative = self._compose_agent_input(cauldrons, tickets, anomalies, forecasts, routes)
        self._logger.debug("Agent input prepared", extra={"context": {"input": narrative}})

        try:
            await self._agent.ainvoke({"input": narrative})
        except Exception as exc:  # pragma: no cover
            self._logger.exception("Agent execution failed: %s", exc)

    def _plan_routes(self, forecasts: Sequence[ForecastResult]) -> List[RoutePlan]:
        """Create route plans prioritising highest-risk cauldrons."""

        # Sort by earliest overflow projection (None means low risk).
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

        couriers = ("wyvern_01", "wyvern_02", "griffin_03")
        routes: List[RoutePlan] = []
        for index, courier in enumerate(couriers):
            if index >= len(demand_order):
                break
            starting_node = demand_order[index % len(demand_order)]
            plan = self._route_optimizer.generate_pickup_plan(
                courier_id=courier,
                current_location=starting_node,
                demand_order=demand_order,
            )
            routes.append(plan)
        return routes

    @staticmethod
    def _compose_agent_input(
        cauldrons: Iterable[CauldronStatus],
        tickets: Iterable[TransportTicket],
        anomalies: Iterable[AnomalyFlag],
        forecasts: Iterable[ForecastResult],
        routes: Iterable[RoutePlan],
    ) -> str:
        """Construct a structured textual summary for the autonomous agent."""

        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "cauldrons": [
                {
                    "id": c.cauldron_id,
                    "fill_level_liters": c.fill_level_liters,
                    "capacity_liters": c.capacity_liters,
                    "utilisation": c.utilization(),
                }
                for c in cauldrons
            ],
            "recent_transport_tickets": [
                {
                    "id": t.ticket_id,
                    "cauldron_id": t.cauldron_id,
                    "volume_liters": t.volume_liters,
                    "direction": t.direction,
                    "courier_id": t.courier_id,
                    "date": t.date,  # EOG: date only
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                }
                for t in tickets
            ],
            "anomalies": [
                {
                    "cauldron_id": a.cauldron_id,
                    "type": a.anomaly_type,
                    "severity": a.severity,
                    "description": a.description,
                    "detected_at": a.detected_at.isoformat(),
                }
                for a in anomalies
            ],
            "forecasts": [
                {
                    "cauldron_id": f.cauldron_id,
                    "projected_overflow_time": f.projected_overflow_time.isoformat()
                    if f.projected_overflow_time
                    else None,
                    "projected_fill_level": f.projected_fill_level,
                    "confidence": f.confidence,
                }
                for f in forecasts
            ],
            "route_plans": [
                {
                    "courier_id": r.courier_id,
                    "ordered_stops": r.ordered_stops,
                    "total_distance_km": r.total_distance_km,
                    "estimated_completion_minutes": r.estimated_completion_minutes,
                }
                for r in routes
            ],
        }
        return json.dumps(payload)


__all__ = ["AgentContext", "PotionLogisticsOrchestrator"]

