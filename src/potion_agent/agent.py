"""
LangChain + Nemotron agent assembly.
"""

from __future__ import annotations

from typing import List

from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from .config import get_settings
from .tools import AgentContextProtocol, build_toolkit

try:
    from langchain_nvidia_ai_assistant import ChatNVIDIA
except ImportError:  # pragma: no cover
    ChatNVIDIA = None  # type: ignore[assignment]


def _build_llm() -> "ChatNVIDIA":
    settings = get_settings()
    if ChatNVIDIA is None:
        raise ImportError(
            "langchain_nvidia_ai_assistant is required to use the Nemotron agent. "
            "Install it via `pip install langchain-nvidia-ai-assistant`."
        )
    if not settings.nvidia_api_key:
        raise EnvironmentError(
            "NVIDIA_API_KEY must be set to authenticate with the Nemotron NIM endpoint."
        )
    return ChatNVIDIA(
        model=settings.nemotron_model,
        api_key=settings.nvidia_api_key,
        base_url=settings.nvidia_api_base,
        temperature=0.2,
        top_p=0.9,
    )


def create_agent_executor(context: AgentContextProtocol) -> AgentExecutor:
    """Create an AgentExecutor wired with Nemotron and the project tools."""

    tools = build_toolkit(context)
    llm = _build_llm()

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are the Potion Logistics Coordinator AI. "
                    "Continuously monitor cauldron telemetry, transport logs, and routing plans. "
                    "When anomalies or overflow risks arise, decide which tools to call, "
                    "explain your reasoning, and document every action for the audit trail. "
                    "Prefer concise JSON-formatted responses when responding directly."
                ),
            ),
            MessagesPlaceholder(variable_name="chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ]
    )

    agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
    return executor


__all__ = ["create_agent_executor"]

