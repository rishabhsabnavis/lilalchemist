import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import DefaultDict, Dict, List, Tuple

MATCH_TOLERANCE = 0.20  # 10%


@dataclass
class EventRecord:
    event: Dict
    matched: bool = False
    reason: str | None = None


@dataclass
class TicketRecord:
    ticket: Dict
    matched: bool = False
    category: str | None = None  # "faulty", "unlogged"
    reason: str | None = None
    matched_event: Dict | None = None


def load_data(all_events_path: Path, tickets_path: Path) -> Tuple[Dict, List[Dict], int]:
    with all_events_path.open("r") as f:
        all_events = json.load(f)

    with tickets_path.open("r") as f:
        tickets_payload = json.load(f)

    long_drain_events = all_events.get("long_drain_events", {})
    transport_tickets = tickets_payload.get("transport_tickets", [])
    total_tickets = tickets_payload.get("metadata", {}).get("total_tickets", len(transport_tickets))
    return long_drain_events, transport_tickets, total_tickets


def group_long_drains(long_drain_events: Dict) -> Dict[str, Dict[str, List[Dict]]]:
    grouped: Dict[str, Dict[str, List[Dict]]] = {}
    for cauldron, day_map in long_drain_events.items():
        for day, events in day_map.items():
            bucket = grouped.setdefault(day, {}).setdefault(cauldron, [])
            bucket.extend(sorted(events, key=lambda e: e.get("start_timestamp", "")))
    return grouped


def group_tickets(tickets: List[Dict]) -> Dict[str, Dict[str, List[Dict]]]:
    grouped: Dict[str, Dict[str, List[Dict]]] = {}
    for ticket in tickets:
        day = ticket.get("date")
        cauldron = ticket.get("cauldron_id")
        if not day or not cauldron:
            continue
        bucket = grouped.setdefault(day, {}).setdefault(cauldron, [])
        bucket.append(ticket)
    return grouped


def amount_matches(event_amount: float, ticket_amount: float) -> bool:
    tolerance = MATCH_TOLERANCE * abs(event_amount)
    return abs(event_amount - ticket_amount) <= tolerance


def match_bucket(events: List[EventRecord], tickets: List[TicketRecord]) -> None:
    for ticket_record in tickets:
        ticket_amount = ticket_record.ticket.get("amount_collected")
        if ticket_amount is None:
            ticket_record.category = "faulty"
            ticket_record.reason = "missing_amount"
            continue
        for event_record in events:
            if event_record.matched:
                continue
            net_change = event_record.event.get("net_change")
            if net_change is None:
                event_amount = event_record.event.get("drained_volume_estimate") or event_record.event.get("volume_drained")
            else:
                event_amount = abs(net_change)
            if event_amount is None:
                continue
            if amount_matches(event_amount, ticket_amount):
                event_record.matched = True
                ticket_record.matched = True
                ticket_record.matched_event = event_record.event
                break
    for ticket_record in tickets:
        if ticket_record.matched:
            continue
        if ticket_record.category is None:
            ticket_record.category = "faulty"
            ticket_record.reason = "no_matching_event"
    for event_record in events:
        if not event_record.matched:
            event_record.reason = "no_matching_ticket"


def detect_anomalies(
    long_drain_events: Dict[str, Dict[str, List[Dict]]],
    tickets: List[Dict],
) -> Dict:
    drains_by_day = group_long_drains(long_drain_events)
    tickets_by_day = group_tickets(tickets)

    faulty_tickets: List[Dict] = []
    unlogged_tickets: List[Dict] = []
    unaccounted_events: List[Dict] = []

    faulty_by_day: DefaultDict[str, DefaultDict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))
    unlogged_by_day: DefaultDict[str, DefaultDict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))
    unaccounted_by_day: DefaultDict[str, DefaultDict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))

    daily_stats: DefaultDict[str, Dict[str, int]] = defaultdict(
        lambda: {
            "tickets_reported": 0,
            "long_drain_events": 0,
            "matched_tickets": 0,
            "matched_events": 0,
            "faulty_tickets": 0,
            "unlogged_tickets": 0,
            "unaccounted_events": 0,
        }
    )

    all_days = set(drains_by_day.keys()) | set(tickets_by_day.keys())

    for day in all_days:
        cauldron_ids = set(drains_by_day.get(day, {}).keys()) | set(tickets_by_day.get(day, {}).keys())
        for cauldron in cauldron_ids:
            event_records = [EventRecord(event=e) for e in drains_by_day.get(day, {}).get(cauldron, [])]
            ticket_records = [TicketRecord(ticket=t) for t in tickets_by_day.get(day, {}).get(cauldron, [])]

            event_count = len(event_records)
            ticket_count = len(ticket_records)

            daily_stats[day]["tickets_reported"] += ticket_count
            daily_stats[day]["long_drain_events"] += event_count

            if ticket_count < event_count:
                deficit = event_count - ticket_count
                selection = event_records[:deficit]
                for record in selection:
                    record.reason = "missing_ticket_before_matching"
                    unlogged_tickets.append(
                        {
                            "day": day,
                            "cauldron": cauldron,
                            "expected_ticket_for_event": record.event,
                        }
                    )
                    unlogged_by_day[day][cauldron].append(record.event)
                    daily_stats[day]["unlogged_tickets"] += 1

            match_bucket(event_records, ticket_records)

            for ticket_record in ticket_records:
                if ticket_record.matched:
                    daily_stats[day]["matched_tickets"] += 1
                    if ticket_record.matched_event:
                        daily_stats[day]["matched_events"] += 1
                    continue
                if ticket_record.category == "faulty":
                    faulty_tickets.append(ticket_record.ticket)
                    faulty_by_day[day][cauldron].append(ticket_record.ticket)
                    daily_stats[day]["faulty_tickets"] += 1
                elif ticket_record.category == "unlogged":
                    unlogged_tickets.append(ticket_record.ticket)
                    unlogged_by_day[day][cauldron].append(ticket_record.ticket)
                    daily_stats[day]["unlogged_tickets"] += 1

            for event_record in event_records:
                if event_record.matched:
                    continue
                if event_record.reason == "missing_ticket_before_matching":
                    unaccounted_events.append(event_record.event)
                    unaccounted_by_day[day][cauldron].append(event_record.event)
                    daily_stats[day]["unaccounted_events"] += 1
                elif event_record.reason == "no_matching_ticket":
                    unaccounted_events.append(event_record.event)
                    unaccounted_by_day[day][cauldron].append(event_record.event)
                    daily_stats[day]["unaccounted_events"] += 1

    result = {
        "summary": {
            "total_tickets_reported": len(tickets),
            "total_long_drain_events": sum(len(events) for day_map in drains_by_day.values() for events in day_map.values()),
            "matched_tickets": sum(stats["matched_tickets"] for stats in daily_stats.values()),
            "matched_events": sum(stats["matched_events"] for stats in daily_stats.values()),
            "faulty_ticket_count": len(faulty_tickets),
            "unlogged_ticket_count": len(unlogged_tickets),
            "unaccounted_event_count": len(unaccounted_events),
        },
        "faulty_tickets": faulty_tickets,
        "unlogged_tickets": unlogged_tickets,
        "unaccounted_events": unaccounted_events,
        "faulty_tickets_by_day": {day: dict(cauldron_map) for day, cauldron_map in faulty_by_day.items()},
        "unlogged_tickets_by_day": {day: dict(cauldron_map) for day, cauldron_map in unlogged_by_day.items()},
        "unaccounted_events_by_day": {day: dict(cauldron_map) for day, cauldron_map in unaccounted_by_day.items()},
        "daily_summary": {day: dict(stats) for day, stats in daily_stats.items()},
    }
    return result


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    all_events_path = root / "all_events.json"
    tickets_path = root / "challengeresources" / "ticket.json"

    if not all_events_path.exists():
        raise FileNotFoundError(f"Missing all_events.json at {all_events_path}")
    if not tickets_path.exists():
        raise FileNotFoundError(f"Missing ticket.json at {tickets_path}")

    long_drain_events, tickets, total_ticket_count = load_data(all_events_path, tickets_path)
    anomalies = detect_anomalies(long_drain_events, tickets)
    anomalies["summary"]["total_tickets_expected"] = total_ticket_count

    output_path = root / "anomalies.json"
    with output_path.open("w") as f:
        json.dump(anomalies, f, indent=2)
    print(f"Wrote anomalies report to {output_path}")


if __name__ == "__main__":
    main()

