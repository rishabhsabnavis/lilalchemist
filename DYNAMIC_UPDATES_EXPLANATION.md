# Dynamic Cauldron Level Updates - Explanation

## How Fill Rate is Calculated

**Fill Rate Calculation:**
1. **Source**: Historical data from EOG API (`/api/Data`)
2. **Method**: 
   - Analyzes the last 10 data points from historical data
   - Calculates the average rate of change (level increase) over time
   - Only counts **positive changes** (filling, not draining)
   - Formula: `fill_rate = total_positive_change / total_time_minutes`

**Example:**
- If a cauldron's level increases from 200L to 205L over 2 minutes
- Fill rate = (205 - 200) / 2 = 2.5 L/min

**Code Location**: `src/potion_agent/data_ingestion.py` → `_estimate_fill_rate()`

---

## How Drain Rate is Calculated

**Drain Rate:**
- **Currently**: Hardcoded to **20.0 L/min** (default value)
- **Reason**: EOG API doesn't provide drain rate data
- **Future Enhancement**: Could be calculated from historical data by analyzing level drops

**Code Location**: `src/potion_agent/data_ingestion.py` → Line 212

---

## How Dynamic Updates Work

**Problem**: EOG API returns static historical data (last update: 2025-11-09 23:59:00). Levels don't update in real-time.

**Solution**: Dynamic level simulation based on:
1. **Last known level** from EOG API
2. **Time elapsed** since last update
3. **Fill rate** (continuous filling)
4. **Drain rate** (when actively draining)

**Update Formula:**
```
current_level = last_level + (fill_rate × time_elapsed_minutes)
```

**During Drain:**
```
current_level = last_level - ((drain_rate - fill_rate) × time_elapsed_minutes)
```
*(Fill continues during drain, but drain is faster)*

**Code Location**: `src/potion_agent/data_ingestion.py` → `_fetch_from_eog_api()`

---

## Active Drain Detection

**How Drains are Detected:**
1. Check recent transport tickets
2. If ticket date is **today** and volume > 0 → Active drain
3. Apply drain rate to reduce level

**Code Location**: `src/api/main.py` → `get_cauldrons()` endpoint

---

## Current Status

✅ **Fill Rate**: Calculated from historical data (working)
✅ **Drain Rate**: Hardcoded to 20.0 L/min (working)
✅ **Dynamic Updates**: Levels update based on time elapsed (working)
✅ **Active Drains**: Detected from today's tickets (working)

**Next Poll**: Levels will continue to increase based on fill_rate every 5 seconds.

