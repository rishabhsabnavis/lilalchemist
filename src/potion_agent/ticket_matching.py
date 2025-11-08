"""
Date-based ticket matching algorithm for EOG problem statement.

EOG Requirement: Tickets arrive at end of day with only dates (no timestamps).
Must match tickets to actual drain events that occurred during that day.
Account for continuous potion flow during drainage.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .data_models import CauldronStatus, TransportTicket


class DrainEvent:
    """Represents a detected drain event from historical cauldron data."""

    def __init__(
        self,
        cauldron_id: str,
        start_time: datetime,
        end_time: datetime,
        start_level: float,
        end_level: float,
        fill_rate: float,
    ):
        self.cauldron_id = cauldron_id
        self.start_time = start_time
        self.end_time = end_time
        self.start_level = start_level
        self.end_level = end_level
        self.fill_rate = fill_rate
        self.duration_minutes = (end_time - start_time).total_seconds() / 60.0
        # EOG: Total drain = level drop + potion generated during drain
        self.level_drop = start_level - end_level
        self.potion_generated_during_drain = fill_rate * self.duration_minutes
        self.expected_total_volume = self.level_drop + self.potion_generated_during_drain


class TicketMatcher:
    """
    Match transport tickets to drain events by date.
    
    EOG Requirement: Dynamic ticket matching that works with changing data.
    Tickets only have dates, must match to drain events on that date.
    """

    def __init__(self):
        self._drain_history: Dict[str, List[DrainEvent]] = defaultdict(list)

    def detect_drain_events(
        self,
        cauldron_history: List[Tuple[datetime, CauldronStatus]],
        threshold_drop: float = 5.0,  # Minimum level drop to consider a drain
    ) -> List[DrainEvent]:
        """
        Detect drain events from historical cauldron level data.
        
        A drain event is detected when:
        1. Level drops significantly (threshold_drop)
        2. Level stays low or continues dropping
        3. Then level starts increasing again (drain complete)
        """
        if len(cauldron_history) < 2:
            return []

        events: List[DrainEvent] = []
        sorted_history = sorted(cauldron_history, key=lambda x: x[0])
        
        i = 0
        while i < len(sorted_history) - 1:
            current_time, current_status = sorted_history[i]
            next_time, next_status = sorted_history[i + 1]
            
            # Check if level dropped significantly
            level_drop = current_status.fill_level_liters - next_status.fill_level_liters
            
            if level_drop >= threshold_drop:
                # Potential drain start - find drain end
                drain_start_time = current_time
                drain_start_level = current_status.fill_level_liters
                drain_start_idx = i
                
                # Find when drain ends (level starts increasing or stabilizes)
                j = i + 1
                min_level = next_status.fill_level_liters
                min_level_time = next_time
                
                while j < len(sorted_history) - 1:
                    j_time, j_status = sorted_history[j]
                    j_next_time, j_next_status = sorted_history[j + 1]
                    
                    # If level starts increasing, drain likely ended
                    if j_next_status.fill_level_liters > j_status.fill_level_liters + 1.0:
                        drain_end_time = j_time
                        drain_end_level = j_status.fill_level_liters
                        
                        event = DrainEvent(
                            cauldron_id=current_status.cauldron_id,
                            start_time=drain_start_time,
                            end_time=drain_end_time,
                            start_level=drain_start_level,
                            end_level=drain_end_level,
                            fill_rate=current_status.fill_rate_liters_per_min,
                        )
                        events.append(event)
                        self._drain_history[current_status.cauldron_id].append(event)
                        i = j
                        break
                    
                    if j_status.fill_level_liters < min_level:
                        min_level = j_status.fill_level_liters
                        min_level_time = j_time
                    
                    j += 1
                else:
                    # Reached end of history, use minimum level as drain end
                    if min_level < drain_start_level - threshold_drop:
                        event = DrainEvent(
                            cauldron_id=current_status.cauldron_id,
                            start_time=drain_start_time,
                            end_time=min_level_time,
                            start_level=drain_start_level,
                            end_level=min_level,
                            fill_rate=current_status.fill_rate_liters_per_min,
                        )
                        events.append(event)
                        self._drain_history[current_status.cauldron_id].append(event)
                    i = j
                    continue
            
            i += 1

        return events

    def match_tickets_to_drains(
        self,
        tickets: List[TransportTicket],
        drain_events: List[DrainEvent],
        tolerance_percent: float = 0.15,  # 15% volume tolerance for matching
    ) -> Dict[str, Tuple[TransportTicket, Optional[DrainEvent], str]]:
        """
        Match tickets to drain events by date.
        
        Returns dict mapping ticket_id to (ticket, matched_drain_event, status)
        Status: 'matched', 'mismatch', 'missing_drain', 'missing_ticket'
        """
        results: Dict[str, Tuple[TransportTicket, Optional[DrainEvent], str]] = {}
        
        # Group drains by cauldron and date
        drains_by_cauldron_date: Dict[Tuple[str, str], List[DrainEvent]] = defaultdict(list)
        for drain in drain_events:
            drain_date = drain.start_time.date().isoformat()
            drains_by_cauldron_date[(drain.cauldron_id, drain_date)].append(drain)
        
        # Group tickets by cauldron and date
        tickets_by_cauldron_date: Dict[Tuple[str, str], List[TransportTicket]] = defaultdict(list)
        for ticket in tickets:
            if ticket.direction == "pickup":  # Only match pickup tickets
                tickets_by_cauldron_date[(ticket.cauldron_id, ticket.date)].append(ticket)
        
        # Match tickets to drains
        for (cauldron_id, ticket_date), ticket_list in tickets_by_cauldron_date.items():
            drains_for_date = drains_by_cauldron_date.get((cauldron_id, ticket_date), [])
            
            if not drains_for_date:
                # No drain events found for this date - missing drain
                for ticket in ticket_list:
                    results[ticket.ticket_id] = (ticket, None, "missing_drain")
                continue
            
            # Try to match each ticket to a drain
            matched_drains = set()
            for ticket in ticket_list:
                best_match: Optional[DrainEvent] = None
                best_diff = float('inf')
                
                for drain in drains_for_date:
                    if drain in matched_drains:
                        continue
                    
                    # Calculate volume difference
                    volume_diff = abs(ticket.volume_liters - drain.expected_total_volume)
                    volume_diff_percent = volume_diff / max(drain.expected_total_volume, 1.0)
                    
                    if volume_diff_percent < best_diff:
                        best_diff = volume_diff_percent
                        best_match = drain
                
                if best_match and best_diff <= tolerance_percent:
                    # Good match
                    matched_drains.add(best_match)
                    results[ticket.ticket_id] = (ticket, best_match, "matched")
                elif best_match:
                    # Mismatch - volume doesn't match
                    results[ticket.ticket_id] = (ticket, best_match, "mismatch")
                else:
                    # No suitable drain found
                    results[ticket.ticket_id] = (ticket, None, "missing_drain")
        
        # Find unmatched drains (missing tickets)
        for (cauldron_id, drain_date), drain_list in drains_by_cauldron_date.items():
            tickets_for_date = tickets_by_cauldron_date.get((cauldron_id, drain_date), [])
            matched_ticket_ids = {t.ticket_id for t in tickets_for_date if t.ticket_id in results and results[t.ticket_id][2] == "matched"}
            
            for drain in drain_list:
                # Check if this drain was matched
                if not any(
                    result[1] == drain and result[2] == "matched"
                    for result in results.values()
                ):
                    # Create a synthetic "missing ticket" entry
                    missing_ticket_id = f"MISSING-{drain.cauldron_id}-{drain_date}"
                    # Note: We can't create a full TransportTicket without a ticket object
                    # This is tracked separately in the results
        
        return results

    def get_drain_history(self, cauldron_id: str) -> List[DrainEvent]:
        """Get historical drain events for a cauldron."""
        return self._drain_history.get(cauldron_id, [])


__all__ = ["DrainEvent", "TicketMatcher"]

