# Optimized Courier Routes & Forecasting Implementation Guide

## Overview

This document describes the implementation of the **Optimized Courier Routes & Forecasting** feature, which addresses the EOG Bonus requirement to:
- Determine the minimum number of witches needed to run the operation
- Predict cauldron fill levels and generate efficient routes
- Create optimal schedules that prevent overflow
- Visualize routes on the map

## Implementation Components

### 1. Enhanced Forecasting (`src/potion_agent/forecasting.py`)

**Improvements:**
- Uses per-cauldron fill rates (`fill_rate_liters_per_min`) when available
- Validates fill rates against historical trends
- Uses weighted average (70% per-cauldron rate, 30% historical) for accuracy
- Accounts for continuous filling during drainage
- Calculates precise overflow times based on remaining capacity

**Key Method:**
```python
forecast_overflow(cauldrons: Iterable[CauldronStatus]) -> List[ForecastResult]
```

### 2. Improved Routing (`src/potion_agent/routing.py`)

**Current Implementation:**
- Greedy nearest-neighbor algorithm
- Accounts for travel time (36 km/h average speed)
- Includes 15-minute unload time at market
- Calculates total distance and completion time

**Future Enhancement Opportunities:**
- TSP (Traveling Salesman Problem) solver for optimal routes
- Dynamic programming for multi-stop optimization
- Consider traffic/weather conditions
- Account for cauldron capacity constraints

### 3. Minimum Witches Calculation (`src/potion_agent/witch_scheduling.py`)

**Algorithm:**
1. Identifies cauldrons at overflow risk
2. Groups cauldrons by urgency and proximity
3. Creates routes that combine multiple cauldrons when feasible
4. Uses bin packing algorithm to assign routes to witches
5. Minimizes number of witches while ensuring all routes are covered

**Key Method:**
```python
calculate_minimum_witches(
    cauldrons: List[CauldronStatus],
    forecasts: List[ForecastResult],
    time_horizon_minutes: float = 480.0
) -> int
```

### 4. Optimal Schedule Generation (`src/potion_agent/witch_scheduling.py`)

**Algorithm:**
1. Sorts cauldrons by urgency (earliest overflow first)
2. Groups nearby cauldrons into efficient routes
3. Ensures routes can be completed before overflow deadlines
4. Distributes routes across available witches
5. Limits route size for efficiency (max 5 cauldrons per route)

**Key Method:**
```python
create_optimal_schedule(
    cauldrons: List[CauldronStatus],
    forecasts: List[ForecastResult],
    num_witches: int,
    time_horizon_minutes: float = 480.0
) -> List[RoutePlan]
```

### 5. API Endpoints (`src/api/main.py`)

**New Endpoints:**

#### `/api/minimum-witches`
- Calculates minimum number of witches needed
- Returns: `{minimum_witches, urgent_cauldrons, total_cauldrons, time_horizon_minutes}`
- Query params: `time_horizon_minutes` (default: 480)

#### `/api/optimal-schedule`
- Creates optimal schedule for witches
- Returns: `{num_witches, routes[], urgent_forecasts[], time_horizon_minutes, total_routes}`
- Query params: `num_witches` (optional), `time_horizon_minutes` (default: 480)

#### Existing Endpoints (Enhanced):
- `/api/forecasts` - Overflow forecasts with improved accuracy
- `/api/routes` - Optimized courier routes

## Usage Examples

### Backend (Python)

```python
from potion_agent.witch_scheduling import WitchScheduler
from potion_agent.routing import RouteOptimizer
from potion_agent.forecasting import ForecastEngine

# Initialize
route_optimizer = RouteOptimizer()
scheduler = WitchScheduler(route_optimizer)
forecast_engine = ForecastEngine()

# Get forecasts
forecasts = forecast_engine.forecast_overflow(cauldrons)

# Calculate minimum witches
min_witches = scheduler.calculate_minimum_witches(
    cauldrons=cauldrons,
    forecasts=forecasts,
    time_horizon_minutes=480.0
)

# Create optimal schedule
routes = scheduler.create_optimal_schedule(
    cauldrons=cauldrons,
    forecasts=forecasts,
    num_witches=min_witches,
    time_horizon_minutes=480.0
)
```

### Frontend (JavaScript/React)

```javascript
// Fetch minimum witches
const minWitchesResponse = await fetch('/api/minimum-witches?time_horizon_minutes=480');
const { minimum_witches, urgent_cauldrons } = await minWitchesResponse.json();

// Fetch optimal schedule
const scheduleResponse = await fetch('/api/optimal-schedule?num_witches=3');
const { routes, urgent_forecasts } = await scheduleResponse.json();

// Display routes
routes.forEach(route => {
  console.log(`Witch: ${route.courier_id}`);
  console.log(`Stops: ${route.ordered_stops.join(' → ')}`);
  console.log(`Distance: ${route.total_distance_km} km`);
  console.log(`Time: ${route.estimated_completion_minutes} minutes`);
});
```

## Frontend Visualization (To Be Enhanced)

### Current State
- Basic route display in dashboard
- Simple list of routes with cauldron names

### Recommended Enhancements

1. **Map Visualization:**
   - Draw polylines connecting route stops
   - Color-code routes by witch
   - Show estimated arrival times at each stop
   - Display overflow countdown timers

2. **Route Details Panel:**
   - Show total distance and time for each route
   - List all stops in order
   - Display urgency indicators
   - Show estimated potion collection at each stop

3. **Schedule Timeline:**
   - Visual timeline showing when each route starts/ends
   - Overlap detection between routes
   - Buffer time visualization

### Example Frontend Code

```jsx
// In App.jsx - Map visualization
{routes.map((route, idx) => {
  const routeColor = routeColors[idx % routeColors.length];
  const routeCoordinates = route.ordered_stops.map(stopId => {
    const cauldron = cauldrons.find(c => c.cauldron_id === stopId);
    return cauldron ? [cauldron.latitude, cauldron.longitude] : null;
  }).filter(Boolean);
  
  return (
    <Polyline
      key={route.courier_id}
      positions={routeCoordinates}
      color={routeColor}
      weight={3}
      opacity={0.7}
    />
  );
})}
```

## Key Features

### ✅ Implemented
- Enhanced forecasting with per-cauldron fill rates
- Minimum witches calculation using bin packing
- Optimal schedule generation
- API endpoints for minimum witches and schedules
- Route optimization with nearest-neighbor heuristic
- Accounts for travel time and unload time (15 min)

### 🔄 Future Enhancements
- TSP solver for optimal route calculation
- Real-time route updates based on current conditions
- Multi-day scheduling optimization
- Dynamic re-routing when conditions change
- Machine learning for better fill rate prediction
- Integration with actual EOG API endpoints

## Testing

### Test the Implementation

1. **Start the backend:**
   ```bash
   source .venv/bin/activate
   python -m src.api.main
   ```

2. **Test API endpoints:**
   ```bash
   # Get minimum witches
   curl http://localhost:8000/api/minimum-witches
   
   # Get optimal schedule
   curl http://localhost:8000/api/optimal-schedule
   
   # Get schedule with specific number of witches
   curl http://localhost:8000/api/optimal-schedule?num_witches=3
   ```

3. **Verify in frontend:**
   - Navigate to dashboard
   - Check "Forecasting & Scheduling" section
   - View minimum witches calculation
   - Review route details

## Algorithm Complexity

- **Forecasting:** O(n) where n = number of cauldrons
- **Route Generation:** O(n²) for nearest-neighbor heuristic
- **Minimum Witches:** O(n²) for route generation + O(n×m) for bin packing
- **Schedule Creation:** O(n²×m) where m = number of witches

## Performance Considerations

- Forecasting uses rolling history (max 20 points per cauldron)
- Route optimization limits to 5 cauldrons per route
- Bin packing uses greedy algorithm (good enough for most cases)
- All calculations are cached in memory for fast API responses

## Notes

- Travel speed: 36 km/h (0.6 km/min) average
- Unload time: 15 minutes at market (EOG requirement)
- Default time horizon: 8 hours (480 minutes)
- Maximum route size: 5 cauldrons (configurable)

