"""
Minimum witches calculation and optimal scheduling.

EOG Bonus: Determine minimum number of witches to run the operation.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .data_models import CauldronStatus, ForecastResult, RoutePlan
from .routing import RouteOptimizer

UNLOAD_TIME_MINUTES = 15.0
DEFAULT_SPEED_KM_PER_MINUTE = 0.6


class WitchScheduler:
    """Calculate minimum witches needed and create optimal schedules."""

    def __init__(self, route_optimizer: RouteOptimizer):
        self._route_optimizer = route_optimizer

    def calculate_minimum_witches(
        self,
        cauldrons: List[CauldronStatus],
        forecasts: List[ForecastResult],
        time_horizon_minutes: float = 480.0,  # 8 hour work day
    ) -> int:
        """
        Calculate minimum number of witches needed to prevent all overflows.
        
        Algorithm:
        1. Identify cauldrons at overflow risk
        2. Calculate time to overflow for each
        3. Group cauldrons by urgency
        4. Calculate routes and time needed
        5. Determine minimum witches to cover all routes
        """
        # Filter cauldrons with overflow risk
        urgent_cauldrons = [
            (c, f)
            for c, f in zip(cauldrons, forecasts)
            if f.projected_overflow_time is not None
        ]

        if not urgent_cauldrons:
            return 0

        # Sort by urgency (earliest overflow first)
        urgent_cauldrons.sort(
            key=lambda x: x[1].projected_overflow_time or datetime.max
        )

        # Calculate routes for each urgent cauldron
        routes: List[RoutePlan] = []
        for cauldron, forecast in urgent_cauldrons:
            if forecast.projected_overflow_time:
                time_to_overflow = (
                    forecast.projected_overflow_time - datetime.utcnow()
                ).total_seconds() / 60.0

                # Create route starting from market
                route = self._route_optimizer.generate_pickup_plan(
                    courier_id="temp",
                    current_location="enchanted_market",
                    demand_order=[cauldron.cauldron_id],
                )

                # Add market return time
                return_distance = self._route_optimizer._distance_between(
                    cauldron.cauldron_id, "enchanted_market"
                )
                return_time = return_distance / DEFAULT_SPEED_KM_PER_MINUTE
                total_route_time = (
                    route.estimated_completion_minutes
                    + return_time
                    + UNLOAD_TIME_MINUTES
                )

                routes.append(route)

        # Greedy bin packing: assign routes to witches
        witches: List[List[RoutePlan]] = []
        for route in routes:
            assigned = False
            for witch_routes in witches:
                # Check if witch can handle this route within time horizon
                total_time = sum(
                    r.estimated_completion_minutes for r in witch_routes
                )
                if total_time + route.estimated_completion_minutes <= time_horizon_minutes:
                    witch_routes.append(route)
                    assigned = True
                    break

            if not assigned:
                # Need a new witch
                witches.append([route])

        return len(witches)

    def create_optimal_schedule(
        self,
        cauldrons: List[CauldronStatus],
        forecasts: List[ForecastResult],
        num_witches: int,
    ) -> List[RoutePlan]:
        """
        Create optimal schedule for given number of witches.
        
        Returns list of RoutePlan objects, one per witch.
        """
        # Get urgent cauldrons
        urgent_cauldrons = [
            (c, f)
            for c, f in zip(cauldrons, forecasts)
            if f.projected_overflow_time is not None
        ]

        if not urgent_cauldrons:
            return []

        # Sort by urgency
        urgent_cauldrons.sort(
            key=lambda x: x[1].projected_overflow_time or datetime.max
        )

        # Create routes for each witch
        cauldron_ids = [c.cauldron_id for c, _ in urgent_cauldrons]
        routes: List[RoutePlan] = []

        for witch_idx in range(num_witches):
            # Distribute cauldrons across witches
            witch_cauldrons = [
                cauldron_ids[i]
                for i in range(witch_idx, len(cauldron_ids), num_witches)
            ]

            if witch_cauldrons:
                route = self._route_optimizer.generate_pickup_plan(
                    courier_id=f"witch_{witch_idx + 1}",
                    current_location="enchanted_market",
                    demand_order=witch_cauldrons,
                )
                routes.append(route)

        return routes


__all__ = ["WitchScheduler"]

