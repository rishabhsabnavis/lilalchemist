"""
LangChain + Nemotron agent assembly.
"""

from __future__ import annotations

from typing import Literal, Tuple

from langchain.agents import (
    AgentExecutor,
    create_openai_tools_agent,
    create_react_agent,
)
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from .config import Settings, get_settings
from .tools import AgentContextProtocol, build_toolkit

try:
    from langchain_community.llms import HuggingFacePipeline  # type: ignore[import]
except ImportError:  # pragma: no cover
    HuggingFacePipeline = None  # type: ignore[assignment]


try:
    from langchain_nvidia_ai_assistant import ChatNVIDIA  # type: ignore[import]
except ImportError:  # pragma: no cover
    ChatNVIDIA = None  # type: ignore[assignment]


def _build_llm(settings: Settings) -> Tuple[object, Literal["nvidia_nim", "huggingface"]]:
    provider = settings.llm_provider.lower()
    if provider == "huggingface":
        return _build_huggingface_llm(settings), "huggingface"
    # default to NVIDIA NIM
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


def _build_huggingface_llm(settings: Settings) -> "HuggingFacePipeline":
    if HuggingFacePipeline is None:
        raise ImportError(
            "langchain-community is required for HuggingFace integration. "
            "Install it via `pip install langchain-community`."
        )

    try:
        import torch  # type: ignore[import]
        from transformers import (  # type: ignore[import]
            AutoModelForCausalLM,
            AutoTokenizer,
            pipeline,
        )
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "transformers, torch, and accelerate are required for HuggingFace models. "
            "Install them via `pip install transformers accelerate torch`."
        ) from exc

    dtype_name = settings.huggingface_dtype.lower()
    dtype = {
        "bfloat16": torch.bfloat16,
        "float16": torch.float16,
        "float32": torch.float32,
    }.get(dtype_name, torch.float32)

    tokenizer = AutoTokenizer.from_pretrained(
        settings.huggingface_model_id,
        trust_remote_code=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        settings.huggingface_model_id,
        torch_dtype=dtype,
        device_map=settings.huggingface_device,
        trust_remote_code=True,
    )

    generation_pipeline = pipeline(
        task="text-generation",
        model=model,
        tokenizer=tokenizer,
        max_new_tokens=settings.huggingface_max_new_tokens,
        temperature=settings.huggingface_temperature,
        top_p=settings.huggingface_top_p,
        do_sample=True,
    )

    return HuggingFacePipeline(pipeline=generation_pipeline)


def create_agent_executor(context: AgentContextProtocol) -> AgentExecutor:
    """Create an AgentExecutor wired with Nemotron and the project tools."""

    settings = get_settings()
    tools = build_toolkit(context)
    llm, mode = _build_llm(settings)

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

    if mode == "huggingface":
        agent = create_react_agent(llm=llm, tools=tools, prompt=prompt)
    else:
        agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False)
    return executor


__all__ = ["create_agent_executor"]

