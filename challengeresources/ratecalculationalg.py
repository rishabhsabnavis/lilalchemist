import numpy as np
from sklearn.linear_model import LinearRegression

def calculate_rates(level_data, cauldron_key):
    """
    Calculates average fill rate and corrected drain rate for a cauldron.
    
    Args:
        level_data (list of dict): [{'timestamp': str, 'cauldron_levels': {'cauldron_X': float, ...}}, ...]
        cauldron_key (str): Cauldron to analyze (e.g., 'cauldron_001')
    Returns:
        dict with average_fill_rate, regression_slope, corrected_drain_rate
    """
    # Extract levels and timestamps
    levels = [row['cauldron_levels'][cauldron_key] for row in level_data]
    timestamps = [row['timestamp'] for row in level_data]
    
    # ---- Find increasing (fill) intervals ----
    fill_rates = []
    n = len(levels)
    i = 0
    while i < n:
        while i < n-1 and levels[i+1] <= levels[i]:
            i += 1
        start = i
        while i < n-1 and levels[i+1] >= levels[i]:
            i += 1
        end = i
        if end - start > 0:
            rate = (levels[end] - levels[start]) / (end - start)
            fill_rates.append(rate)
        i += 1
    average_fill_rate = np.mean(fill_rates) if fill_rates else None

    # ---- Find longest decreasing (draining) interval ----
    max_len = 0
    max_chunk = (0, 0)
    i = 0
    while i < n:
        while i < n-1 and levels[i+1] >= levels[i]:
            i += 1
        start = i
        while i < n-1 and levels[i+1] < levels[i]:
            i += 1
        end = i
        if end - start > max_len:
            max_len = end - start
            max_chunk = (start, end)
        i += 1
    s, e = max_chunk
    regression_slope = None
    corrected_drain_rate = None
    if e - s > 0:
        x = np.arange(e - s + 1).reshape(-1, 1)
        y = np.array(levels[s:e+1]).reshape(-1, 1)
        reg = LinearRegression().fit(x, y)
        regression_slope = float(reg.coef_[0][0])
        corrected_drain_rate = (average_fill_rate - regression_slope
                                if average_fill_rate is not None else None)
    
    return {
        'average_fill_rate': average_fill_rate,
        'regression_slope': regression_slope,
        'corrected_drain_rate': corrected_drain_rate
    }

# Example Usage:
# result = calculate_rates(data, 'cauldron_001')
# print(result)
