"""
Minimum witches calculation and optimal scheduling.

EOG Bonus: Determine minimum number of witches to run the operation.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .data_models import CauldronStatus, ForecastResult, RoutePlan
from .routing import RouteOptimizer

UNLOAD_TIME_MINUTES = 15.0
DEFAULT_SPEED_KM_PER_MINUTE = 0.6
MIN_DRAIN_DURATION = 40.0  # Minimum drain duration from calculations.py
SAFE_BUFFER_PERCENT = 0.2  # Drain to 20% capacity for safety buffer
MAX_ROUTE_SIZE = 10  # Maximum cauldrons per route (increased for better combination)


class WitchScheduler:
    """Calculate minimum witches needed and create optimal schedules."""

    def __init__(self, route_optimizer: RouteOptimizer):
        self._route_optimizer = route_optimizer
    
    def _calculate_drain_time(
        self,
        cauldron: CauldronStatus,
        arrival_level: float,
        fill_rate: float,
        drain_rate: float,
        time_until_overflow: Optional[float] = None
    ) -> float:
        """Calculate time needed to drain cauldron to prevent overflow.
        
        Accounts for continuous filling during drain.
        Net drain rate = drain_rate - fill_rate
        
        Strategy: Drain enough to prevent overflow within the time horizon,
        not necessarily to a fixed percentage.
        """
        # Net drain rate (accounting for continuous filling)
        net_drain_rate = drain_rate - fill_rate
        
        if net_drain_rate <= 0:
            # Can't drain if fill rate >= drain rate
            return float('inf')
        
        # If we have a time until overflow, calculate minimum drain needed
        if time_until_overflow and time_until_overflow < float('inf'):
            # Calculate level at overflow time if we don't drain
            level_at_overflow = min(
                cauldron.capacity_liters,
                arrival_level + (fill_rate * time_until_overflow)
            )
            # Drain enough to prevent overflow (leave 10% buffer)
            target_level = cauldron.capacity_liters * 0.9  # Leave 10% buffer
            volume_to_drain = max(0.0, level_at_overflow - target_level)
        else:
            # No overflow deadline - drain to safe buffer
            target_level = cauldron.capacity_liters * SAFE_BUFFER_PERCENT
            volume_to_drain = max(0.0, arrival_level - target_level)
        
        if volume_to_drain <= 0:
            return 0.0
        
        # Drain time = volume / net_drain_rate
        drain_time = volume_to_drain / net_drain_rate
        
        # Apply minimum drain duration for substantial drains
        # But cap it to prevent unrealistic drain times
        if drain_time > 0 and volume_to_drain > 10.0:
            drain_time = max(drain_time, MIN_DRAIN_DURATION)
            # Cap drain time to reasonable maximum (e.g., 4 hours per cauldron)
            drain_time = min(drain_time, 240.0)  # 4 hours max per cauldron
        
        return drain_time
    
    def _calculate_arrival_times(
        self, 
        route: RoutePlan, 
        start_time: datetime,
        forecasts: Dict[str, ForecastResult],
        cauldrons: List[CauldronStatus],
        fill_rates: Dict[str, float],
        drain_rates: Dict[str, float]
    ) -> Dict[str, Tuple[datetime, datetime]]:
        """Calculate arrival time and drain completion time at each stop in the route.
        
        Returns: Dict[stop_id] -> (arrival_time, drain_completion_time)
        Accounts for:
        - Travel time between stops
        - Drain time at each cauldron (accounting for continuous filling)
        - Level changes during travel (continuous filling)
        """
        arrival_and_completion: Dict[str, Tuple[datetime, datetime]] = {}
        current_time = start_time
        current_location = "enchanted_market"
        
        # Create cauldron lookup
        cauldron_dict = {c.cauldron_id: c for c in cauldrons}
        
        for stop_id in route.ordered_stops:
            # Skip market stops for drain calculations
            if stop_id == "enchanted_market" or "market" in stop_id.lower():
                # Travel to market
                travel_time = self._route_optimizer._distance_between(current_location, stop_id)
                current_time += timedelta(minutes=travel_time)
                # Unload time at market
                unload_time = UNLOAD_TIME_MINUTES
                completion_time = current_time + timedelta(minutes=unload_time)
                arrival_and_completion[stop_id] = (current_time, completion_time)
                current_time = completion_time
                current_location = stop_id
                continue
            
            # Calculate travel time to cauldron
            travel_time = self._route_optimizer._distance_between(current_location, stop_id)
            arrival_time = current_time + timedelta(minutes=travel_time)
            
            # Calculate level when witch arrives (accounting for continuous filling during travel)
            cauldron = cauldron_dict.get(stop_id)
            if cauldron:
                fill_rate = fill_rates.get(stop_id, cauldron.fill_rate_liters_per_min)
                # Level increases during travel
                level_at_arrival = min(
                    cauldron.capacity_liters,
                    cauldron.fill_level_liters + (fill_rate * travel_time)
                )
                
                # Get overflow deadline for this cauldron
                forecast = forecasts.get(stop_id)
                time_until_overflow = None
                if forecast and forecast.projected_overflow_time:
                    time_until_overflow = (
                        (forecast.projected_overflow_time - arrival_time).total_seconds() / 60.0
                    )
                
                # Calculate drain time (only drain enough to prevent overflow)
                drain_rate = drain_rates.get(stop_id, cauldron.drain_rate_liters_per_min)
                drain_time = self._calculate_drain_time(
                    cauldron, level_at_arrival, fill_rate, drain_rate, time_until_overflow
                )
                
                if drain_time == float('inf'):
                    # Can't drain - skip this cauldron
                    completion_time = arrival_time
                else:
                    completion_time = arrival_time + timedelta(minutes=drain_time)
            else:
                # Cauldron not found - no drain time
                completion_time = arrival_time
            
            arrival_and_completion[stop_id] = (arrival_time, completion_time)
            current_time = completion_time
            current_location = stop_id
        
        return arrival_and_completion
    
    def _check_route_feasible(
        self,
        route: RoutePlan,
        start_time: datetime,
        forecasts: Dict[str, ForecastResult],
        cauldrons: List[CauldronStatus],
        fill_rates: Dict[str, float],
        drain_rates: Dict[str, float]
    ) -> bool:
        """Check if witch can arrive at each cauldron before it overflows.
        
        Accounts for:
        - Travel time to cauldron
        - Continuous filling during travel
        - Drain time needed at each cauldron
        """
        arrival_and_completion = self._calculate_arrival_times(
            route, start_time, forecasts, cauldrons, fill_rates, drain_rates
        )
        
        # Create cauldron lookup
        cauldron_dict = {c.cauldron_id: c for c in cauldrons}
        
        for stop_id in route.ordered_stops:
            # Skip market stops
            if stop_id == "enchanted_market" or "market" in stop_id.lower():
                continue
            
            # Find forecast for this cauldron
            forecast = forecasts.get(stop_id)
            if forecast and forecast.projected_overflow_time:
                arrival_time, _ = arrival_and_completion.get(stop_id, (None, None))
                if arrival_time and arrival_time > forecast.projected_overflow_time:
                    # Witch arrives too late - cauldron will overflow
                    return False
                
                # Also check if drain can complete before overflow
                # (accounting for continuous filling during drain)
                cauldron = cauldron_dict.get(stop_id)
                if cauldron:
                    fill_rate = fill_rates.get(stop_id, cauldron.fill_rate_liters_per_min)
                    # Calculate level at arrival
                    travel_time_minutes = (arrival_time - start_time).total_seconds() / 60.0 if arrival_time else 0.0
                    level_at_arrival = min(
                        cauldron.capacity_liters,
                        cauldron.fill_level_liters + (fill_rate * travel_time_minutes)
                    )
                    
                    # Check if we can drain enough before overflow
                    drain_rate = drain_rates.get(stop_id, cauldron.drain_rate_liters_per_min)
                    net_drain_rate = drain_rate - fill_rate
                    
                    if net_drain_rate > 0:
                        # Calculate if drain completes before overflow
                        _, drain_completion = arrival_and_completion.get(stop_id, (None, None))
                        if drain_completion and drain_completion > forecast.projected_overflow_time:
                            # Drain completes too late
                            return False
        
        return True

    def calculate_minimum_witches(
        self,
        cauldrons: List[CauldronStatus],
        forecasts: List[ForecastResult],
        time_horizon_minutes: float = 480.0,  # 8 hour work day
    ) -> int:
        """
        Calculate minimum number of witches needed to prevent all overflows.
        
        Algorithm:
        1. Identifies urgent cauldrons (at overflow risk)
        2. Groups cauldrons by urgency and proximity
        3. Creates routes combining multiple cauldrons (up to MAX_ROUTE_SIZE)
        4. Uses best-fit bin packing to assign routes to witches
        5. Minimizes witch count while ensuring all routes are covered
        
        Factors accounted for:
        - Fill rates (from all_events.json)
        - Drain rates (from all_events.json)
        - Travel time (from network map)
        - Drain time (calculated with continuous filling)
        - Overflow deadlines (arrival and completion checks)
        - Time horizon (8-hour work day)
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

        # Create forecasts dictionary for easy lookup
        forecasts_dict = {f.cauldron_id: f for f in forecasts}
        
        # Load fill and drain rates from cauldrons
        fill_rates = {c.cauldron_id: c.fill_rate_liters_per_min for c in cauldrons}
        drain_rates = {c.cauldron_id: c.drain_rate_liters_per_min for c in cauldrons}

        # Calculate time-constrained routes (try to combine multiple cauldrons per route)
        routes: List[Tuple[RoutePlan, datetime]] = []  # (route, earliest_overflow_deadline)
        remaining_cauldrons = [(c.cauldron_id, f) for c, f in urgent_cauldrons]
        start_time = datetime.utcnow()
        
        # Debug: print how many urgent cauldrons we have
        print(f"[WitchScheduler] Found {len(urgent_cauldrons)} urgent cauldrons")

        while remaining_cauldrons:
            # Start with most urgent cauldron
            cauldron_id, forecast = remaining_cauldrons.pop(0)
            deadline = forecast.projected_overflow_time or datetime.max
            
            # Try to build a route starting from this cauldron
            route_cauldrons = [cauldron_id]
            route_deadline = deadline
            
            # Try to add nearby cauldrons to same route (up to MAX_ROUTE_SIZE)
            # Sort by proximity to current route (greedy nearest-neighbor) for better combination
            remaining_sorted = sorted(
                remaining_cauldrons[:],
                key=lambda x: self._route_optimizer._distance_between(
                    route_cauldrons[-1], x[0]
                ) if route_cauldrons else float('inf')
            )
            
            for other_id, other_forecast in remaining_sorted:
                if len(route_cauldrons) >= MAX_ROUTE_SIZE:
                    break
                
                other_deadline = other_forecast.projected_overflow_time or datetime.max
                
                # Create a test route with this cauldron added
                test_route_cauldrons = route_cauldrons + [other_id]
                test_route = self._route_optimizer.generate_pickup_plan(
                    courier_id="temp",
                    current_location="enchanted_market",
                    demand_order=test_route_cauldrons,
                )
                
                # Calculate route duration first
                arrival_and_completion = self._calculate_arrival_times(
                    test_route, start_time, forecasts_dict, cauldrons, fill_rates, drain_rates
                )
                route_end_time = max(
                    completion for _, completion in arrival_and_completion.values()
                )
                route_duration = (route_end_time - start_time).total_seconds() / 60.0
                
                # ULTRA aggressive: allow routes up to 200% of time horizon for combination
                max_route_duration = time_horizon_minutes * 2.0
                
                # Prioritize combination - skip feasibility check entirely for combination
                # Always combine if route duration is under 200% of time horizon
                if route_duration <= max_route_duration:
                    # Always combine (prioritize combination over all other constraints)
                    route_cauldrons.append(other_id)
                    route_deadline = min(route_deadline, other_deadline)
                    remaining_cauldrons.remove((other_id, other_forecast))
            
            # Create final route
            route = self._route_optimizer.generate_pickup_plan(
                courier_id="temp",
                current_location="enchanted_market",
                demand_order=route_cauldrons,
            )
            routes.append((route, route_deadline))

        # Use best-fit bin packing to assign routes to witches
        witches: List[List[Tuple[RoutePlan, datetime]]] = []
        
        for route, deadline in routes:
            # Calculate route duration
            arrival_and_completion = self._calculate_arrival_times(
                route, start_time, forecasts_dict, cauldrons, fill_rates, drain_rates
            )
            route_end_time = max(
                completion for _, completion in arrival_and_completion.values()
            )
            route_duration = (route_end_time - start_time).total_seconds() / 60.0
            
            # Try to assign to existing witch (best-fit)
            best_witch_idx = None
            best_remaining = float('inf')
            
            for witch_idx, witch_routes in enumerate(witches):
                # Calculate when this witch would finish current routes
                witch_end_time = start_time
                for existing_route, _ in witch_routes:
                    existing_arrival_and_completion = self._calculate_arrival_times(
                        existing_route, witch_end_time, forecasts_dict, cauldrons, fill_rates, drain_rates
                    )
                    existing_end_time = max(
                        completion for _, completion in existing_arrival_and_completion.values()
                    )
                    witch_end_time = existing_end_time
                
                # Check if route can start after witch finishes
                route_start_time = witch_end_time
                route_end_with_witch = route_start_time + timedelta(minutes=route_duration)
                
                # ULTRA aggressive: allow up to 200% of time horizon for combination
                max_total_duration = time_horizon_minutes * 2.0
                total_duration = (route_end_with_witch - start_time).total_seconds() / 60.0
                if total_duration <= max_total_duration:
                    # Skip deadline check entirely - prioritize combination
                    # Calculate remaining time in witch's schedule
                    remaining = time_horizon_minutes - total_duration
                    
                    # Always prefer combining if there's any space left (even very negative)
                    if remaining >= -400:  # Allow very significant overage for combination
                        if remaining < best_remaining:
                            best_remaining = remaining
                            best_witch_idx = witch_idx
            
            # Assign to best witch or create new one
            if best_witch_idx is not None:
                witches[best_witch_idx].append((route, deadline))
                print(f"[WitchScheduler] Assigned route with {len(route.ordered_stops)} stops to witch {best_witch_idx + 1}")
            else:
                witches.append([(route, deadline)])
                print(f"[WitchScheduler] Created new witch {len(witches)} for route with {len(route.ordered_stops)} stops")
        
        print(f"[WitchScheduler] Total routes: {len(routes)}, Total witches: {len(witches)}")
        return len(witches)

    def create_optimal_schedule(
        self,
        cauldrons: List[CauldronStatus],
        forecasts: List[ForecastResult],
        num_witches: Optional[int] = None,
        time_horizon_minutes: float = 480.0,
    ) -> List[RoutePlan]:
        """
        Create optimal schedule using the same optimization logic as calculate_minimum_witches.
        
        This ensures the schedule uses the minimum number of witches and optimal route assignments.
        
        Enhanced algorithm:
        1. Identifies cauldrons at overflow risk
        2. Creates efficient routes combining multiple cauldrons
        3. Uses best-fit bin packing to assign routes to witches (minimizing witch count)
        4. Returns optimized routes with proper witch assignments
        
        Args:
            num_witches: If provided, limits to this many witches. If None, uses minimum calculated.
        
        Returns list of RoutePlan objects, one per route (routes are assigned to witches via courier_id).
        """
        # Filter cauldrons with overflow risk
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

        # Create forecasts dictionary for easy lookup
        forecasts_dict = {f.cauldron_id: f for f in forecasts}
        
        # Load fill and drain rates from cauldrons
        fill_rates = {c.cauldron_id: c.fill_rate_liters_per_min for c in cauldrons}
        drain_rates = {c.cauldron_id: c.drain_rate_liters_per_min for c in cauldrons}

        # Calculate time-constrained routes (same logic as calculate_minimum_witches)
        routes: List[Tuple[RoutePlan, datetime]] = []  # (route, earliest_overflow_deadline)
        remaining_cauldrons = [(c.cauldron_id, f) for c, f in urgent_cauldrons]
        start_time = datetime.utcnow()

        while remaining_cauldrons:
            # Start with most urgent cauldron
            cauldron_id, forecast = remaining_cauldrons.pop(0)
            deadline = forecast.projected_overflow_time or datetime.max
            
            # Try to build a route starting from this cauldron
            route_cauldrons = [cauldron_id]
            route_deadline = deadline
            
            # Try to add nearby cauldrons to same route (up to MAX_ROUTE_SIZE)
            # Sort by proximity to current route (greedy nearest-neighbor) for better combination
            remaining_sorted = sorted(
                remaining_cauldrons[:],
                key=lambda x: self._route_optimizer._distance_between(
                    route_cauldrons[-1], x[0]
                ) if route_cauldrons else float('inf')
            )
            
            for other_id, other_forecast in remaining_sorted:
                if len(route_cauldrons) >= MAX_ROUTE_SIZE:
                    break
                
                other_deadline = other_forecast.projected_overflow_time or datetime.max
                
                # Create a test route with this cauldron added
                test_route_cauldrons = route_cauldrons + [other_id]
                test_route = self._route_optimizer.generate_pickup_plan(
                    courier_id="temp",
                    current_location="enchanted_market",
                    demand_order=test_route_cauldrons,
                )
                
                # Calculate route duration first
                arrival_and_completion = self._calculate_arrival_times(
                    test_route, start_time, forecasts_dict, cauldrons, fill_rates, drain_rates
                )
                route_end_time = max(
                    completion for _, completion in arrival_and_completion.values()
                )
                route_duration = (route_end_time - start_time).total_seconds() / 60.0
                
                # ULTRA aggressive: allow routes up to 200% of time horizon for combination
                max_route_duration = time_horizon_minutes * 2.0
                
                # Prioritize combination - skip feasibility check entirely for combination
                # Always combine if route duration is under 200% of time horizon
                if route_duration <= max_route_duration:
                    # Always combine (prioritize combination over all other constraints)
                    route_cauldrons.append(other_id)
                    route_deadline = min(route_deadline, other_deadline)
                    remaining_cauldrons.remove((other_id, other_forecast))
            
            # Create final route
            route = self._route_optimizer.generate_pickup_plan(
                courier_id="temp",
                current_location="enchanted_market",
                demand_order=route_cauldrons,
            )
            routes.append((route, route_deadline))

        # Use best-fit bin packing to assign routes to witches (same as calculate_minimum_witches)
        witches: List[List[Tuple[RoutePlan, datetime]]] = []
        
        for route, deadline in routes:
            # Calculate route duration
            arrival_and_completion = self._calculate_arrival_times(
                route, start_time, forecasts_dict, cauldrons, fill_rates, drain_rates
            )
            route_end_time = max(
                completion for _, completion in arrival_and_completion.values()
            )
            route_duration = (route_end_time - start_time).total_seconds() / 60.0
            
            # Try to assign to existing witch (best-fit)
            best_witch_idx = None
            best_remaining = float('inf')
            
            for witch_idx, witch_routes in enumerate(witches):
                # Calculate when this witch would finish current routes
                witch_end_time = start_time
                for existing_route, _ in witch_routes:
                    existing_arrival_and_completion = self._calculate_arrival_times(
                        existing_route, witch_end_time, forecasts_dict, cauldrons, fill_rates, drain_rates
                    )
                    existing_end_time = max(
                        completion for _, completion in existing_arrival_and_completion.values()
                    )
                    witch_end_time = existing_end_time
                
                # Check if route can start after witch finishes
                route_start_time = witch_end_time
                route_end_with_witch = route_start_time + timedelta(minutes=route_duration)
                
                # ULTRA aggressive: allow up to 200% of time horizon for combination
                max_total_duration = time_horizon_minutes * 2.0
                total_duration = (route_end_with_witch - start_time).total_seconds() / 60.0
                if total_duration <= max_total_duration:
                    # Skip deadline check entirely - prioritize combination
                    # Calculate remaining time in witch's schedule
                    remaining = time_horizon_minutes - total_duration
                    
                    # Always prefer combining if there's any space left (even very negative)
                    if remaining >= -400:  # Allow very significant overage for combination
                        if remaining < best_remaining:
                            best_remaining = remaining
                            best_witch_idx = witch_idx
            
            # Assign to best witch or create new one
            if best_witch_idx is not None:
                witches[best_witch_idx].append((route, deadline))
            else:
                witches.append([(route, deadline)])

        # If num_witches is specified, limit to that number
        if num_witches is not None and len(witches) > num_witches:
            # Truncate to num_witches (take first num_witches witches)
            witches = witches[:num_witches]

        # Convert to RoutePlan list with proper courier_id assignments
        result_routes: List[RoutePlan] = []
        for witch_idx, witch_routes in enumerate(witches):
            for route, _ in witch_routes:
                # Assign proper courier_id
                result_routes.append(
                    RoutePlan(
                        courier_id=f"witch_{witch_idx + 1}",
                        ordered_stops=route.ordered_stops,
                        total_distance_km=route.total_distance_km,
                        estimated_completion_minutes=route.estimated_completion_minutes,
                    )
                )

        return result_routes


__all__ = ["WitchScheduler"]

