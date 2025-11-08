"""
Simple forecasting pipeline for predicting cauldron overflow risk.
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Deque, Dict, Iterable, List, Tuple

from .config import get_settings
from .data_models import CauldronStatus, ForecastResult


class ForecastEngine:
    """Maintain rolling histories and project near-term overflow risks."""

    def __init__(self) -> None:
        settings = get_settings()
        self._history: Dict[str, Deque[Tuple[datetime, float]]] = defaultdict(
            lambda: deque(maxlen=settings.max_history_points)
        )
        self._horizon_minutes = settings.forecast_horizon_minutes

    def update_history(self, snapshots: Iterable[CauldronStatus]) -> None:
        """Update the rolling history for each cauldron."""

        for snapshot in snapshots:
            series = self._history[snapshot.cauldron_id]
            series.append((snapshot.last_updated, snapshot.fill_level_liters))

    def forecast_overflow(
        self, cauldrons: Iterable[CauldronStatus]
    ) -> List[ForecastResult]:
        """Return projections for each cauldron."""

        results: List[ForecastResult] = []
        for cauldron in cauldrons:
            history = self._history.get(cauldron.cauldron_id, deque())
            if len(history) < 2:
                results.append(
                    ForecastResult(
                        cauldron_id=cauldron.cauldron_id,
                        projected_overflow_time=None,
                        projected_fill_level=cauldron.fill_level_liters,
                        confidence=0.1,
                        supporting_points=len(history),
                    )
                )
                continue

            slope = self._estimate_slope(history)
            projected = cauldron.fill_level_liters + slope * self._horizon_minutes
            if slope <= 0:
                results.append(
                    ForecastResult(
                        cauldron_id=cauldron.cauldron_id,
                        projected_overflow_time=None,
                        projected_fill_level=max(projected, 0.0),
                        confidence=min(len(history) / 10.0, 0.8),
                        supporting_points=len(history),
                    )
                )
                continue

            remaining_capacity = cauldron.capacity_liters - cauldron.fill_level_liters
            minutes_to_overflow = (
                remaining_capacity / slope if slope else float("inf")
            )
            projected_time = (
                cauldron.last_updated + timedelta(minutes=minutes_to_overflow)
                if minutes_to_overflow != float("inf")
                else None
            )
            confidence = min(len(history) / 10.0, 0.95)

            results.append(
                ForecastResult(
                    cauldron_id=cauldron.cauldron_id,
                    projected_overflow_time=projected_time,
                    projected_fill_level=min(projected, cauldron.capacity_liters),
                    confidence=confidence,
                    supporting_points=len(history),
                )
            )

        return results

    @staticmethod
    def _estimate_slope(history: Deque[Tuple[datetime, float]]) -> float:
        """Least-squares fit slope (liters per minute) from historic readings."""

        if len(history) < 2:
            return 0.0

        # Convert timestamps to minutes elapsed relative to the earliest point.
        start_time = history[0][0]
        xs: List[float] = [
            max((point[0] - start_time).total_seconds() / 60.0, 0.0)
            for point in history
        ]
        ys: List[float] = [point[1] for point in history]

        n = len(xs)
        sum_x = sum(xs)
        sum_y = sum(ys)
        sum_xx = sum(x * x for x in xs)
        sum_xy = sum(x * y for x, y in zip(xs, ys))

        denominator = n * sum_xx - sum_x * sum_x
        if denominator == 0:
            return 0.0

        slope_per_minute = (n * sum_xy - sum_x * sum_y) / denominator
        return slope_per_minute


__all__ = ["ForecastEngine"]

