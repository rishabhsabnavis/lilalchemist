"""
LangChain tool definitions used by the potion logistics agent.
"""

from __future__ import annotations

from typing import Protocol

from langchain.tools import StructuredTool


class AgentContextProtocol(Protocol):
    """Minimal interface the orchestrator must expose to the toolset."""

    def log_event(self, action: str, details: str) -> str:
        ...

    def notify_team(self, channel: str, message: str) -> str:
        ...

    def update_schedule(self, courier_id: str, new_route: str) -> str:
        ...

    def fetch_cauldron_snapshot(self, cauldron_id: str) -> str:
        ...

    def fetch_transport_summary(self, cauldron_id: str) -> str:
        ...


def build_toolkit(context: AgentContextProtocol) -> list[StructuredTool]:
    """Return the suite of LangChain tools for the agent."""

    def log_event(action: str, details: str) -> str:
        """Log an operational event for auditability."""

        return context.log_event(action=action, details=details)

    def notify(channel: str, message: str) -> str:
        """Send a notification to the specified channel."""

        return context.notify_team(channel=channel, message=message)

    def update_schedule(courier_id: str, new_route: str) -> str:
        """Persist schedule changes for a courier."""

        return context.update_schedule(courier_id=courier_id, new_route=new_route)

    def cauldron_snapshot(cauldron_id: str) -> str:
        """Retrieve the latest telemetry snapshot for a cauldron."""

        return context.fetch_cauldron_snapshot(cauldron_id=cauldron_id)

    def transport_summary(cauldron_id: str) -> str:
        """Summarise recent transport activity for a cauldron."""

        return context.fetch_transport_summary(cauldron_id=cauldron_id)

    return [
        StructuredTool.from_function(
            name="log_event",
            func=log_event,
            description="Record an operational event for future auditing.",
        ),
        StructuredTool.from_function(
            name="notify_team",
            func=notify,
            description="Send an informative message to the given channel (pager, ops, guildhall).",
        ),
        StructuredTool.from_function(
            name="update_schedule",
            func=update_schedule,
            description="Update courier pickup routes with a new schedule string.",
        ),
        StructuredTool.from_function(
            name="fetch_cauldron_snapshot",
            func=cauldron_snapshot,
            description="Return the latest fill-level snapshot of a cauldron.",
        ),
        StructuredTool.from_function(
            name="fetch_transport_summary",
            func=transport_summary,
            description="Summarise recent transport activity for a cauldron.",
        ),
    ]


__all__ = ["AgentContextProtocol", "build_toolkit"]

