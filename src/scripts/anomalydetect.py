import argparse
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import DefaultDict, Dict, List, Tuple

import requests
from requests import RequestException

from calculations import (
    DEFAULT_END_DATE,
    DEFAULT_START_DATE,
    annotate_drain_volumes,
    collect_events,
    compute_drain_rates,
    compute_fill_rates,
    load_level_data,
)

MATCH_TOLERANCE = 0.20  # 20%
TICKETS_API_URL = "https://hackutd2025.eog.systems/api/tickets"


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


def prepare_long_drain_events(level_data: List[dict]) -> Dict[str, Dict[str, List[Dict]]]:
    events = collect_events(level_data)
    fill_rates = compute_fill_rates(events)
    drain_rates = compute_drain_rates(events, fill_rates)
    filtered = annotate_drain_volumes(events, drain_rates)

    return {
        cauldron: {
            day: [event.to_dict() for event in day_events]
            for day, day_events in day_map.items()
        }
        for cauldron, day_map in filtered.items()
    }


def load_long_events_and_tickets(
    start_date: str,
    end_date: str,
    *,
    use_local_file: bool,
    tickets_url: str,
    use_local_tickets: bool,
    tickets_path: Path,
) -> Tuple[Dict[str, Dict[str, List[Dict]]], List[Dict], int, str]:
    candidate_paths = [
        Path(__file__).resolve().parents[2] / "challengeresources" / "filllevels.json",
        Path("filllevels.json").resolve(),
    ]

    level_data, source = load_level_data(
        start_date,
        end_date,
        use_local_file=use_local_file,
        candidate_paths=candidate_paths,
    )
    logging.info("Loaded %d readings from %s", len(level_data), source)

    long_events = prepare_long_drain_events(level_data)

    tickets_payload: Dict
    tickets_source: str

    if not use_local_tickets:
        try:
            response = requests.get(tickets_url, timeout=30)
            response.raise_for_status()
            tickets_payload = response.json()
            tickets_source = tickets_url
        except (RequestException, ValueError) as exc:
            logging.warning("Failed to fetch tickets from API (%s); falling back to %s", exc, tickets_path)
            use_local_tickets = True

    if use_local_tickets:
        if not tickets_path.exists():
            raise FileNotFoundError(f"Missing ticket.json at {tickets_path}")
        with tickets_path.open("r") as f:
            tickets_payload = json.load(f)
        tickets_source = str(tickets_path)

    transport_tickets = tickets_payload.get("transport_tickets", [])
    total_tickets = tickets_payload.get("metadata", {}).get("total_tickets", len(transport_tickets))

    return long_events, transport_tickets, total_tickets, source + f" | tickets:{tickets_source}"


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
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(
        description="Detect anomalies between transport tickets and long drain events."
    )
    parser.add_argument(
        "--start-date",
        default=DEFAULT_START_DATE,
        help="Start date parameter for the API (default: %(default)s).",
    )
    parser.add_argument(
        "--end-date",
        default=DEFAULT_END_DATE,
        help="End date parameter for the API (default: %(default)s).",
    )
    parser.add_argument(
        "--use-local-file",
        action="store_true",
        help="Skip API fetch and read from the local filllevels.json instead.",
    )
    parser.add_argument(
        "--tickets-path",
        default=str(Path(__file__).resolve().parents[2] / "challengeresources" / "ticket.json"),
        help="Path to the transport tickets JSON file (used when --use-local-tickets is set or API fetch fails).",
    )
    parser.add_argument(
        "--tickets-url",
        default=TICKETS_API_URL,
        help="API endpoint for fetching transport tickets.",
    )
    parser.add_argument(
        "--use-local-tickets",
        action="store_true",
        help="Load tickets from the local JSON file instead of the API.",
    )
    parser.add_argument(
        "--output",
        default="anomalies.json",
        help="Path to write the anomaly report (default: %(default)s).",
    )
    args = parser.parse_args()

    tickets_path = Path(args.tickets_path)
    long_drain_events, tickets, total_ticket_count, source = load_long_events_and_tickets(
        args.start_date,
        args.end_date,
        use_local_file=args.use_local_file,
        tickets_url=args.tickets_url,
        use_local_tickets=args.use_local_tickets,
        tickets_path=tickets_path,
    )
    logging.info(
        "Computed long-drain events for %d cauldrons using data from %s",
        len(long_drain_events),
        source,
    )

    anomalies = detect_anomalies(long_drain_events, tickets)
    anomalies["summary"]["total_tickets_expected"] = total_ticket_count
    anomalies["summary"]["level_data_source"] = source

    output_path = Path(args.output)
    with output_path.open("w") as f:
        json.dump(anomalies, f, indent=2)
    logging.info("Wrote anomalies report to %s", output_path)


if __name__ == "__main__":
    main()

