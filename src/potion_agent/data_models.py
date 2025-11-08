"""
Shared dataclasses and typing primitives for the potion logistics agent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


@dataclass(slots=True)
class CauldronStatus:
    """Represent the current state of a cauldron in the network."""

    cauldron_id: str
    fill_level_liters: float
    capacity_liters: float
    location: str
    last_updated: datetime

    def utilization(self) -> float:
        """Return the fractional capacity being used (0.0 - 1.0)."""

        if not self.capacity_liters:
            return 0.0
        return min(max(self.fill_level_liters / self.capacity_liters, 0.0), 1.0)


@dataclass(slots=True)
class TransportTicket:
    """Represent an individual potion transport event."""

    ticket_id: str
    cauldron_id: str
    volume_liters: float
    direction: str  # "pickup" or "dropoff"
    courier_id: str
    timestamp: datetime


@dataclass(slots=True)
class AnomalyFlag:
    """Capture anomalies detected between cauldron readings and transport logs."""

    cauldron_id: str
    anomaly_type: str
    severity: float
    description: str
    detected_at: datetime = field(default_factory=datetime.utcnow)


@dataclass(slots=True)
class ForecastResult:
    """Forecast results for a given cauldron."""

    cauldron_id: str
    projected_overflow_time: Optional[datetime]
    projected_fill_level: float
    confidence: float
    supporting_points: int


@dataclass(slots=True)
class RoutePlan:
    """Route plan recommendation for couriers."""

    courier_id: str
    ordered_stops: List[str]
    total_distance_km: float
    estimated_completion_minutes: float


PotionNetworkMap = Dict[str, Dict[str, float]]


__all__ = [
    "AnomalyFlag",
    "CauldronStatus",
    "ForecastResult",
    "PotionNetworkMap",
    "RoutePlan",
    "TransportTicket",
]

