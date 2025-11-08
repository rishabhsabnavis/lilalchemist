"""
Entry point for the potion logistics autonomous agent.
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

from .agent import create_agent_executor
from .orchestrator import AgentContext, PotionLogisticsOrchestrator


async def _async_main(run_once: bool) -> None:
    context = AgentContext()
    agent = create_agent_executor(context)
    orchestrator = PotionLogisticsOrchestrator(agent=agent, context=context)

    if run_once:
        await orchestrator.run_cycle()
    else:
        await orchestrator.run_forever()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Potion Logistics Autonomous Agent")
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Execute a single orchestration cycle instead of running indefinitely.",
    )
    args = parser.parse_args(argv)
    asyncio.run(_async_main(run_once=args.run_once))


if __name__ == "__main__":
    main()

