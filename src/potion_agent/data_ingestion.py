"""
Data ingestion layer for the potion logistics agent.

Includes both simulated API clients (for local testing and demos) and
extension points for integrating real network APIs.
"""

from __future__ import annotations

import asyncio
import math
import random
from collections import deque
from datetime import datetime, timedelta
from typing import Deque, Iterable, List, Optional

from .config import get_settings
from .data_models import CauldronStatus, TransportTicket

DEFAULT_CAULDRON_IDS = ("north_tower", "east_garden", "grand_hall", "crypt_chamber")


class CauldronDataSimulator:
    """Generate synthetic cauldron telemetry for local experimentation."""

    def __init__(
        self,
        cauldron_ids: Iterable[str] = DEFAULT_CAULDRON_IDS,
        base_capacity_liters: float = 500.0,
    ) -> None:
        self._rng = random.Random(42)
        self._state = {
            cauldron_id: {
                "fill_level": self._rng.uniform(0.35, 0.75) * base_capacity_liters,
                "capacity": base_capacity_liters * self._rng.uniform(0.9, 1.1),
                "location": cauldron_id.replace("_", " ").title(),
            }
            for cauldron_id in cauldron_ids
        }
        self._history: Deque[CauldronStatus] = deque(maxlen=200)

    def sample(self) -> List[CauldronStatus]:
        """Return a simulated snapshot of all cauldrons."""

        now = datetime.utcnow()
        readings: List[CauldronStatus] = []
        for cauldron_id, payload in self._state.items():
            # Apply a random walk with gentle seasonal component.
            seasonal = math.sin(now.minute / 60.0 * math.pi * 2) * 5
            delta = self._rng.uniform(-8, 12) + seasonal
            payload["fill_level"] = max(
                0.0, min(payload["capacity"], payload["fill_level"] + delta)
            )
            status = CauldronStatus(
                cauldron_id=cauldron_id,
                fill_level_liters=payload["fill_level"],
                capacity_liters=payload["capacity"],
                location=payload["location"],
                last_updated=now,
            )
            readings.append(status)
            self._history.append(status)

        return readings

    def history(self) -> Iterable[CauldronStatus]:
        """Expose historic readings for analytics."""

        return tuple(self._history)


class TransportLogSimulator:
    """Generate synthetic transport logs to complement the cauldron simulator."""

    def __init__(self, cauldron_ids: Iterable[str] = DEFAULT_CAULDRON_IDS) -> None:
        self._rng = random.Random(1717)
        self._tickets: Deque[TransportTicket] = deque(maxlen=300)
        self._cauldron_ids = tuple(cauldron_ids)
        self._courier_pool = ("wyvern_01", "wyvern_02", "griffin_03", "banshee_07")

    def sample(self) -> List[TransportTicket]:
        """Return a burst of recent transport tickets."""

        now = datetime.utcnow()
        batch: List[TransportTicket] = []
        ticket_count = self._rng.randint(1, 4)
        for idx in range(ticket_count):
            cauldron_id = self._rng.choice(self._cauldron_ids)
            direction = self._rng.choice(("pickup", "dropoff"))
            volume = abs(self._rng.gauss(20, 7))
            ticket = TransportTicket(
                ticket_id=f"T-{now.strftime('%H%M%S')}-{idx}",
                cauldron_id=cauldron_id,
                volume_liters=volume,
                direction=direction,
                courier_id=self._rng.choice(self._courier_pool),
                timestamp=now - timedelta(minutes=self._rng.random() * 5.0),
            )
            self._tickets.append(ticket)
            batch.append(ticket)

        return batch

    def history(self) -> Iterable[TransportTicket]:
        """Expose historic ticket data."""

        return tuple(self._tickets)


class CauldronAPIClient:
    """
    Abstract access layer for cauldron telemetry.

    Swap the simulator with real requests by overriding `_fetch_from_source`.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._simulator = CauldronDataSimulator()

    async def fetch_current_levels(self) -> List[CauldronStatus]:
        """Fetch the latest cauldron states."""

        # Placeholder for real HTTP call; ready for injection when endpoints exist.
        return await self._fetch_from_source()

    async def _fetch_from_source(self) -> List[CauldronStatus]:
        await asyncio.sleep(0)  # yield control back to the event loop
        return self._simulator.sample()


class TransportLogAPIClient:
    """
    Abstract access layer for potion transport logs.

    Swap the simulator with real requests by overriding `_fetch_from_source`.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._simulator = TransportLogSimulator()

    async def fetch_recent_tickets(self, limit: Optional[int] = None) -> List[TransportTicket]:
        """Fetch a window of recent transport tickets."""

        tickets = await self._fetch_from_source()
        if limit is not None:
            return tickets[-limit:]
        return tickets

    async def _fetch_from_source(self) -> List[TransportTicket]:
        await asyncio.sleep(0)
        batch = self._simulator.sample()
        return list(self._simulator.history())


__all__ = [
    "CauldronAPIClient",
    "CauldronDataSimulator",
    "TransportLogAPIClient",
    "TransportLogSimulator",
]

