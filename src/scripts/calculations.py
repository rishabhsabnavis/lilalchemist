import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np  # type: ignore

try:
    from sklearn.linear_model import LinearRegression
except ImportError as exc:
    raise ImportError(
        "scikit-learn is required to run this script. "
        "Install it with 'pip install scikit-learn' or via your environment manager."
    ) from exc

TURNAROUND_MINUTES = 5
MIN_DRAIN_DURATION = 40.0  # minutes


@dataclass
class Event:
    cauldron: str
    day: str
    event_type: str  # "fill" or "drain"
    start_timestamp: str
    end_timestamp: str
    duration_minutes: float
    num_samples: int
    start_level: float
    end_level: float
    net_change: float
    slope: float
    true_drain_rate: float | None = None
    drained_volume_estimate: float | None = None

    def to_dict(self) -> Dict[str, float | str | None]:
        return {
            "cauldron": self.cauldron,
            "day": self.day,
            "event_type": self.event_type,
            "start_timestamp": self.start_timestamp,
            "end_timestamp": self.end_timestamp,
            "duration_minutes": self.duration_minutes,
            "num_samples": self.num_samples,
            "start_level": self.start_level,
            "end_level": self.end_level,
            "net_change": self.net_change,
            "slope": self.slope,
            "true_drain_rate": self.true_drain_rate,
            "drained_volume_estimate": self.drained_volume_estimate,
        }


def parse_timestamp(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def build_event(
    cauldron: str,
    day: str,
    event_type: str,
    samples: List[Tuple[datetime, float]],
) -> Event | None:
    if len(samples) < 2:
        return None

    start_ts, start_level = samples[0]
    end_ts, end_level = samples[-1]
    duration_minutes = (end_ts - start_ts).total_seconds() / 60.0
    if duration_minutes <= 0:
        return None

    net_change = float(end_level - start_level)
    x = np.arange(len(samples)).reshape(-1, 1)
    y = np.array([level for _, level in samples]).reshape(-1, 1)
    reg = LinearRegression().fit(x, y)
    slope = float(reg.coef_[0][0])

    if event_type == "fill" and slope <= 0:
        return None
    if event_type == "drain" and slope >= 0:
        return None

    return Event(
        cauldron=cauldron,
        day=day,
        event_type=event_type,
        start_timestamp=start_ts.isoformat().replace("+00:00", "Z"),
        end_timestamp=end_ts.isoformat().replace("+00:00", "Z"),
        duration_minutes=duration_minutes,
        num_samples=len(samples),
        start_level=float(start_level),
        end_level=float(end_level),
        net_change=net_change,
        slope=slope,
    )


def collect_events(level_data: List[dict]) -> Dict[str, Dict[str, Dict[str, List[Event]]]]:
    per_cauldron: Dict[str, Dict[str, List[Tuple[datetime, float]]]] = defaultdict(lambda: defaultdict(list))
    for row in level_data:
        ts = parse_timestamp(row["timestamp"])
        day = ts.date().isoformat()
        for cauldron, level in row["cauldron_levels"].items():
            per_cauldron[cauldron][day].append((ts, float(level)))

    events: Dict[str, Dict[str, Dict[str, List[Event]]]] = defaultdict(
        lambda: defaultdict(lambda: {"fill_events": [], "drain_events": []})
    )

    def segment_events(samples: List[Tuple[datetime, float]]) -> List[Tuple[str, List[Tuple[datetime, float]]]]:
        segments: List[Tuple[str, List[Tuple[datetime, float]]]] = []
        n = len(samples)
        if n < 2:
            return segments

        idx = 0
        current_type: str | None = None
        event_start_idx = 0
        opposite_count = 0
        opposite_start_idx = 0

        def determine_initial(idx: int) -> Tuple[str | None, int]:
            while idx < n - 1:
                delta = samples[idx + 1][1] - samples[idx][1]
                if delta > 0:
                    return "fill", idx
                if delta < 0:
                    return "drain", idx
                idx += 1
            return None, idx

        current_type, event_start_idx = determine_initial(idx)
        if current_type is None:
            return segments
        idx = event_start_idx

        while idx < n - 1:
            delta = samples[idx + 1][1] - samples[idx][1]

            if delta == 0:
                opposite_count = 0
                idx += 1
                continue

            if current_type == "fill":
                if delta > 0:
                    opposite_count = 0
                    idx += 1
                else:  # delta < 0
                    if opposite_count == 0:
                        opposite_start_idx = idx
                    opposite_count += 1
                    idx += 1
                    if opposite_count >= TURNAROUND_MINUTES:
                        end_idx = opposite_start_idx
                        segment = samples[event_start_idx : end_idx + 1]
                        if len(segment) >= 2:
                            segments.append(("fill", segment))
                        current_type = "drain"
                        event_start_idx = end_idx
                        idx = event_start_idx
                        opposite_count = 0
            else:  # current_type == "drain"
                if delta < 0:
                    opposite_count = 0
                    idx += 1
                else:  # delta > 0
                    if opposite_count == 0:
                        opposite_start_idx = idx
                    opposite_count += 1
                    idx += 1
                    if opposite_count >= TURNAROUND_MINUTES:
                        end_idx = opposite_start_idx
                        segment = samples[event_start_idx : end_idx + 1]
                        if len(segment) >= 2:
                            segments.append(("drain", segment))
                        current_type = "fill"
                        event_start_idx = end_idx
                        idx = event_start_idx
                        opposite_count = 0

        if current_type is not None:
            segment = samples[event_start_idx:]
            if len(segment) >= 2:
                segments.append((current_type, segment))

        return segments

    for cauldron, day_map in per_cauldron.items():
        for day, samples in day_map.items():
            if len(samples) < 2:
                continue
            samples.sort(key=lambda x: x[0])

            for event_type, run in segment_events(samples):
                event = build_event(
                    cauldron,
                    day,
                    event_type,
                    run,
                )
                if event:
                    events[cauldron][day][f"{event_type}_events"].append(event)

    return events


def compute_fill_rates(events: Dict[str, Dict[str, Dict[str, List[Event]]]]) -> Dict[str, float]:
    fill_rates: Dict[str, float] = {}
    for cauldron, day_map in events.items():
        slopes = [
            event.slope
            for day_events in day_map.values()
            for event in day_events["fill_events"]
        ]
        if slopes:
            fill_rates[cauldron] = float(np.mean(slopes))
    return fill_rates


def compute_drain_rates(
    events: Dict[str, Dict[str, Dict[str, List[Event]]]], fill_rates: Dict[str, float]
) -> Dict[str, float]:
    drain_rates: Dict[str, float] = {}
    for cauldron, day_map in events.items():
        fill_rate = fill_rates.get(cauldron, 0.0)
        true_rates: List[float] = []
        for day_events in day_map.values():
            for event in day_events["drain_events"]:
                perceived_rate = abs(event.slope)
                true_rate = fill_rate + perceived_rate
                event.true_drain_rate = true_rate
                true_rates.append(true_rate)
        if true_rates:
            drain_rates[cauldron] = float(np.mean(true_rates))
    return drain_rates


def annotate_drain_volumes(
    events: Dict[str, Dict[str, Dict[str, List[Event]]]], drain_rates: Dict[str, float]
) -> Dict[str, Dict[str, List[Event]]]:
    long_drain_events: Dict[str, Dict[str, List[Event]]] = defaultdict(lambda: defaultdict(list))
    for cauldron, day_map in events.items():
        drain_rate = drain_rates.get(cauldron)
        if drain_rate is None:
            continue
        for day_events in day_map.values():
            for event in day_events["drain_events"]:
                event.drained_volume_estimate = drain_rate * event.duration_minutes
                if event.duration_minutes > MIN_DRAIN_DURATION:
                    long_drain_events[cauldron][event.day].append(event)
    return long_drain_events


def events_to_serializable(
    events: Dict[str, Dict[str, Dict[str, List[Event]]]]
) -> Dict[str, Dict[str, Dict[str, List[Dict[str, float | str | None]]]]]:
    serializable: Dict[str, Dict[str, Dict[str, List[Dict[str, float | str | None]]]]] = {}
    for cauldron, day_map in events.items():
        serializable[cauldron] = {}
        for day, day_events in day_map.items():
            serializable[cauldron][day] = {
                "fill_events": [event.to_dict() for event in day_events["fill_events"]],
                "drain_events": [event.to_dict() for event in day_events["drain_events"]],
            }
    return serializable


def main() -> None:
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

    events = collect_events(level_data)
    fill_rates = compute_fill_rates(events)
    drain_rates = compute_drain_rates(events, fill_rates)
    filtered_drain_events = annotate_drain_volumes(events, drain_rates)

    summary = {
        "fill_rates": fill_rates,
        "drain_rates": drain_rates,
        "events": events_to_serializable(events),
        "long_drain_events": {
            cauldron: {
                day: [event.to_dict() for event in day_events]
                for day, day_events in day_map.items()
            }
            for cauldron, day_map in filtered_drain_events.items()
        },
    }

    with open("all_events.json", "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()