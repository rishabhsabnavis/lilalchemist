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
        
        Enhanced algorithm:
        1. Identify cauldrons at overflow risk
        2. Calculate time to overflow for each
        3. Group cauldrons by urgency and proximity
        4. Calculate optimal routes combining multiple cauldrons
        5. Use bin packing to determine minimum witches
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

        # Calculate time-constrained routes
        # Try to combine multiple cauldrons per route when possible
        routes: List[RoutePlan] = []
        remaining_cauldrons = [c.cauldron_id for c, _ in urgent_cauldrons]
        
        while remaining_cauldrons:
            # Get most urgent cauldron
            most_urgent = remaining_cauldrons[0]
            
            # Find other cauldrons that can be visited in the same route
            # within the overflow deadline
            route_cauldrons = [most_urgent]
            remaining_cauldrons.remove(most_urgent)
            
            # Try to add nearby cauldrons to the same route
            for other_id in remaining_cauldrons[:]:
                # Check if adding this cauldron is feasible
                test_route = self._route_optimizer.generate_pickup_plan(
                    courier_id="temp",
                    current_location="enchanted_market",
                    demand_order=route_cauldrons + [other_id],
                )
                
                # Check if route can be completed before overflow
                if test_route.estimated_completion_minutes <= time_horizon_minutes:
                    route_cauldrons.append(other_id)
                    remaining_cauldrons.remove(other_id)
                    # Limit route size for efficiency
                    if len(route_cauldrons) >= 5:
                        break
            
            # Create final route
            route = self._route_optimizer.generate_pickup_plan(
                courier_id="temp",
                current_location="enchanted_market",
                demand_order=route_cauldrons,
            )
            routes.append(route)

        # Bin packing: assign routes to witches
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
        time_horizon_minutes: float = 480.0,
    ) -> List[RoutePlan]:
        """
        Create optimal schedule for given number of witches.
        
        Enhanced algorithm:
        1. Groups cauldrons by urgency and proximity
        2. Creates efficient routes that combine multiple cauldrons
        3. Distributes routes across available witches
        4. Ensures all routes can be completed within time horizon
        
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

        # Sort by urgency (earliest overflow first)
        urgent_cauldrons.sort(
            key=lambda x: x[1].projected_overflow_time or datetime.max
        )

        # Create optimized routes by grouping nearby cauldrons
        routes: List[RoutePlan] = []
        remaining_cauldrons = [(c.cauldron_id, f) for c, f in urgent_cauldrons]
        
        while remaining_cauldrons and len(routes) < num_witches:
            # Get most urgent cauldron
            most_urgent_id, most_urgent_forecast = remaining_cauldrons[0]
            route_cauldrons = [most_urgent_id]
            remaining_cauldrons.remove((most_urgent_id, most_urgent_forecast))
            
            # Try to add nearby cauldrons to the same route
            for other_id, other_forecast in remaining_cauldrons[:]:
                # Check if adding this cauldron is feasible
                test_route = self._route_optimizer.generate_pickup_plan(
                    courier_id="temp",
                    current_location="enchanted_market",
                    demand_order=route_cauldrons + [other_id],
                )
                
                # Check if route can be completed before overflow and within time horizon
                overflow_deadline = (
                    (other_forecast.projected_overflow_time - datetime.utcnow()).total_seconds() / 60.0
                    if other_forecast.projected_overflow_time
                    else time_horizon_minutes
                )
                
                if (test_route.estimated_completion_minutes <= min(overflow_deadline, time_horizon_minutes) and
                    len(route_cauldrons) < 5):  # Limit route size
                    route_cauldrons.append(other_id)
                    remaining_cauldrons.remove((other_id, other_forecast))
            
            # Create final route
            route = self._route_optimizer.generate_pickup_plan(
                courier_id=f"witch_{len(routes) + 1}",
                current_location="enchanted_market",
                demand_order=route_cauldrons,
            )
            routes.append(route)
        
        # If we have more witches than routes, create additional routes from remaining cauldrons
        if len(routes) < num_witches and remaining_cauldrons:
            for witch_idx in range(len(routes), num_witches):
                if not remaining_cauldrons:
                    break
                
                # Distribute remaining cauldrons
                witch_cauldrons = [
                    remaining_cauldrons[i][0]
                    for i in range(witch_idx - len(routes), len(remaining_cauldrons), num_witches - len(routes))
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

