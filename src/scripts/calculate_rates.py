import json
from pathlib import Path

import numpy as np

try:
    from sklearn.linear_model import LinearRegression
except ImportError as exc:
    raise ImportError(
        "scikit-learn is required to run this script. "
        "Install it with 'pip install scikit-learn' or via your environment manager."
    ) from exc

def calculate_cauldron_rates(level_data):
    """
    Args:
        level_data: a list of dicts with 'timestamp' and 'cauldron_levels'
    Returns:
        rate_map: dict of {cauldron_id: [average_fill_rate, corrected_drain_rate]}
    """
    rate_map = {}
    cauldron_keys = list(level_data[0]['cauldron_levels'].keys())
    for cauldron_key in cauldron_keys:
        levels = [row['cauldron_levels'][cauldron_key] for row in level_data]
        n = len(levels)

        # Find all strictly increasing chunks (for fill rate)
        fill_rates = []
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
        avg_fill_rate = np.mean(fill_rates) if fill_rates else None

        # Find the longest strictly decreasing chunk (for drain rate)
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
            x = np.arange(e-s+1).reshape(-1, 1)
            y = np.array(levels[s:e+1]).reshape(-1, 1)
            reg = LinearRegression().fit(x, y)
            regression_slope = float(reg.coef_[0][0])  # This is net rate during draining
            if avg_fill_rate is not None:
                corrected_drain_rate = avg_fill_rate - regression_slope
        rate_map[cauldron_key] = [
            float(avg_fill_rate) if avg_fill_rate is not None else None,
            float(corrected_drain_rate) if corrected_drain_rate is not None else None,
        ]
    return rate_map

if __name__ == "__main__":
    candidate_paths = [
        Path(__file__).resolve().parents[2] / "challengeresources" / "filllevels.json",
        Path("filllevels.json").resolve(),
    ]

    data_path = next((p for p in candidate_paths if p.exists()), None)
    if data_path is None:
        tried = "\n - ".join(str(p) for p in candidate_paths)
        raise FileNotFoundError(
            "Could not locate 'filllevels.json'. Checked:\n - " + tried
        )

    with data_path.open("r") as f:
        level_data = json.load(f)

    rate_map = calculate_cauldron_rates(level_data)
    print(rate_map)
