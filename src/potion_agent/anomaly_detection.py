"""
Anomaly detection logic for potion logistics.

Updated to account for continuous potion flow during drainage (EOG requirement).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from .config import get_settings
from .data_models import AnomalyFlag, CauldronStatus, TransportTicket
from .ticket_matching import TicketMatcher


class AnomalyDetector:
    """Detect mismatches between cauldron telemetry and transport activity."""

    def __init__(self, anomaly_threshold: Optional[float] = None) -> None:
        settings = get_settings()
        self._threshold = anomaly_threshold or settings.anomaly_threshold
        self._previous_levels: Dict[str, float] = {}
        self._previous_timestamp: Dict[str, datetime] = {}
        self._ticket_matcher = TicketMatcher()

    def detect(
        self,
        cauldrons: Iterable[CauldronStatus],
        transport_tickets: Iterable[TransportTicket],
    ) -> List[AnomalyFlag]:
        """Return a list of anomalies based on the latest telemetry."""

        transport_deltas = self._summarise_transports(transport_tickets)
        anomalies: List[AnomalyFlag] = []

        for cauldron in cauldrons:
            prev_level = self._previous_levels.get(cauldron.cauldron_id)
            prev_ts = self._previous_timestamp.get(cauldron.cauldron_id)
            transport_delta = transport_deltas.get(cauldron.cauldron_id, 0.0)

            if prev_level is not None and prev_ts is not None:
                # EOG: Account for continuous fill during any drain period
                # Calculate time elapsed and expected fill
                time_elapsed_minutes = (cauldron.last_updated - prev_ts).total_seconds() / 60.0
                expected_fill = cauldron.fill_rate_liters_per_min * time_elapsed_minutes
                
                # Expected level = previous level + fill - transport delta
                # (transport_delta is negative for pickups, positive for dropoffs)
                expected_level = prev_level + expected_fill + transport_delta
                
                deviation = cauldron.fill_level_liters - expected_level
                severity = abs(deviation) / max(cauldron.capacity_liters, 1.0)
                if severity >= self._threshold:
                    anomaly_type = (
                        "unexpected_gain" if deviation > 0 else "unexpected_loss"
                    )
                    anomalies.append(
                        AnomalyFlag(
                            cauldron_id=cauldron.cauldron_id,
                            anomaly_type=anomaly_type,
                            severity=severity,
                            description=(
                                f"Deviation of {deviation:.1f}L vs transport logs "
                                f"(expected {expected_level:.1f}L, observed {cauldron.fill_level_liters:.1f}L). "
                                f"Accounted for {expected_fill:.1f}L continuous fill during period."
                            ),
                        )
                    )

            if cauldron.utilization() >= 0.98:
                anomalies.append(
                    AnomalyFlag(
                        cauldron_id=cauldron.cauldron_id,
                        anomaly_type="overflow_risk",
                        severity=cauldron.utilization(),
                        description=(
                            "Cauldron utilization above 98%; consider immediate pickup."
                        ),
                    )
                )

            if cauldron.utilization() <= 0.05:
                anomalies.append(
                    AnomalyFlag(
                        cauldron_id=cauldron.cauldron_id,
                        anomaly_type="critical_shortage",
                        severity=1.0 - cauldron.utilization(),
                        description=(
                            "Cauldron nearly empty; verify transport schedule."
                        ),
                    )
                )

            self._previous_levels[cauldron.cauldron_id] = cauldron.fill_level_liters
            self._previous_timestamp[cauldron.cauldron_id] = cauldron.last_updated

        return anomalies

    @staticmethod
    def _summarise_transports(
        tickets: Iterable[TransportTicket],
    ) -> Dict[str, float]:
        deltas: Dict[str, float] = defaultdict(float)
        for ticket in tickets:
            if ticket.direction == "pickup":
                deltas[ticket.cauldron_id] -= ticket.volume_liters
            else:
                deltas[ticket.cauldron_id] += ticket.volume_liters
        return deltas


__all__ = ["AnomalyDetector"]

