"""
Nemotron agent assembly leveraging NVIDIA's LangChain endpoints.
"""

from __future__ import annotations

from typing import Any, Dict

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from .config import Settings, get_settings
from .tools import AgentContextProtocol, build_toolkit

try:
    from langchain_nvidia_ai_endpoints import ChatNVIDIA  # type: ignore[import]
except ImportError:  # pragma: no cover
    ChatNVIDIA = None  # type: ignore[assignment]


class LangGraphAgentExecutor:
    """Lightweight wrapper exposing the same interface we use in the orchestrator."""

    def __init__(self, runnable) -> None:
        self._runnable = runnable

    async def ainvoke(self, inputs: Dict[str, Any]) -> Any:
        prompt = inputs.get("input", "")
        chat_history = inputs.get("chat_history", [])
        payload = {
            "messages": [HumanMessage(content=prompt)],
            "chat_history": chat_history,
        }
        return await self._runnable.ainvoke(payload)


def _build_llm(settings: Settings) -> object:
    if ChatNVIDIA is None:
        raise ImportError(
            "langchain-nvidia-ai-endpoints is required to use the Nemotron agent. "
            "Install it via `pip install langchain-nvidia-ai-endpoints`."
        )
    if not settings.nvidia_api_key:
        raise EnvironmentError(
            "NVIDIA_API_KEY must be set to authenticate with the Nemotron NIM endpoint."
        )

    return ChatNVIDIA(
        model=settings.nemotron_model,
        api_key=settings.nvidia_api_key,
        base_url=settings.nvidia_api_base,
        temperature=0.6,
        top_p=0.95,
        max_tokens=2048,
    )


def create_agent_executor(context: AgentContextProtocol) -> LangGraphAgentExecutor:
    """Create a LangGraph-powered ReAct agent wired with Nemotron tools."""

    settings = get_settings()
    tools = build_toolkit(context)
    llm = _build_llm(settings)

    system_prompt = (
        "You are the Potion Logistics Coordinator AI.\n"
        "- Monitor cauldron telemetry, transport tickets, forecasting insights, and routing plans.\n"
        "- Decide which tool to call next when anomalies or overflow risks appear.\n"
        "- Always log your actions for auditability and keep responses concise.\n"
        "- Prefer structured (JSON-like) summaries when returning final answers.\n"
        "- If a tool call fails, explain the failure and propose a fallback."
    )

    runnable = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
    )
    return LangGraphAgentExecutor(runnable)


__all__ = ["LangGraphAgentExecutor", "create_agent_executor"]

