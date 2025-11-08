"""
Courier routing utilities leveraging a simple greedy nearest-neighbour heuristic.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

from .config import get_settings
from .data_models import PotionNetworkMap, RoutePlan, CauldronStatus, ForecastResult

DEFAULT_SPEED_KM_PER_MINUTE = 0.6  # ~36 km/h average gryphon speed
UNLOAD_TIME_MINUTES = 15.0  # EOG: Witches take 15 minutes to unload at market


class RouteOptimizer:
    """Optimise courier pickup routes based on projected demand."""

    def __init__(self, network_map: PotionNetworkMap | None = None) -> None:
        settings = get_settings()
        self._network: PotionNetworkMap = (
            network_map or self._load_network_map(settings.network_map_path)
        )

    def generate_pickup_plan(
        self,
        courier_id: str,
        current_location: str,
        demand_order: Sequence[str],
    ) -> RoutePlan:
        """
        Produce an ordered list of stops using a greedy nearest neighbour path.

        Args:
            courier_id: The courier responsible for the route.
            current_location: Starting node in the potion network graph.
            demand_order: Candidate cauldron IDs sorted by priority (e.g. overflow risk).
        """

        pending = [loc for loc in demand_order if loc in self._network]
        if current_location not in self._network:
            pending.insert(0, pending.pop(0)) if pending else None
            current_location = pending[0] if pending else current_location

        route = [current_location]
        total_distance = 0.0

        while pending:
            last = route[-1]
            next_stop = self._select_nearest(last, pending)
            if next_stop is None:
                break
            total_distance += self._distance_between(last, next_stop)
            route.append(next_stop)
            pending.remove(next_stop)

        # Calculate travel time
        travel_minutes = total_distance / DEFAULT_SPEED_KM_PER_MINUTE if total_distance else 0.0
        
        # EOG: Add 15 minutes unload time for each market visit
        # Count how many times route goes to market (assuming route ends at market)
        market_visits = 1  # At least one visit to drop off
        estimated_minutes = travel_minutes + (market_visits * UNLOAD_TIME_MINUTES)

        return RoutePlan(
            courier_id=courier_id,
            ordered_stops=route[1:],  # exclude starting location for clarity
            total_distance_km=round(total_distance, 2),
            estimated_completion_minutes=round(estimated_minutes, 1),
        )

    def _select_nearest(self, origin: str, candidates: Iterable[str]) -> str | None:
        shortest_distance = math.inf
        selected = None
        for candidate in candidates:
            distance = self._distance_between(origin, candidate)
            if distance < shortest_distance:
                shortest_distance = distance
                selected = candidate
        return selected

    def _distance_between(self, a: str, b: str) -> float:
        if a == b:
            return 0.0
        if a in self._network and b in self._network[a]:
            return self._network[a][b]
        if b in self._network and a in self._network[b]:
            return self._network[b][a]
        return 10.0  # fallback distance for disconnected nodes

    @staticmethod
    def _load_network_map(path: str) -> PotionNetworkMap:
        file_path = Path(path)
        if not file_path.exists():
            return {}
        with file_path.open("r", encoding="utf-8") as fp:
            data: Dict[str, Dict[str, float]] = json.load(fp)
        return data


__all__ = ["RouteOptimizer"]

