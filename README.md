# Potion Logistics Autonomous Agent

This project assembles an autonomous LangChain agent (compatible with NVIDIA Nemotron NIM or the Hugging Face `nvidia/NVIDIA-Nemotron-Nano-9B-v2` model) that manages potion distribution logistics. It continuously watches simulated cauldron telemetry, compares it against transport ticket logs, forecasts overflow risk, optimises courier pickup routes, and executes multi-step remediation plans through agentic tool orchestration.

## Key Capabilities

- **Real-time ingestion** – Simulated cauldron fill-level and potion transport APIs with extension points for production endpoints.
- **Anomaly detection** – Detects mismatches between telemetry and transport logs, plus overflow/shortage conditions.
- **Predictive forecasting** – Maintains rolling histories and projects overflow horizons using lightweight regression.
- **Route optimisation** – Greedy nearest-neighbour routing over a configurable potion network map.
- **Agentic orchestration** – LangChain agent powered by NVIDIA Nemotron NIM selects tools (logging, notifications, scheduling, data lookups) to respond to emerging issues while maintaining an audit trail.
- **Structured observability** – JSON logging for major workflows and decisions.

## Project Layout

- `src/potion_agent/config.py` – Environment-driven settings.
- `src/potion_agent/data_ingestion.py` – Simulated API clients with pluggable fetch logic.
- `src/potion_agent/anomaly_detection.py` – Telemetry vs. transport anomaly detector.
- `src/potion_agent/forecasting.py` – Rolling history maintenance and overflow forecasting.
- `src/potion_agent/routing.py` – Courier route planning.
- `src/potion_agent/logging_utils.py` – Structured logging configuration.
- `src/potion_agent/tools.py` – LangChain tool definitions.
- `src/potion_agent/agent.py` – LangChain agent assembly (supports NVIDIA NIM or Hugging Face deployments).
- `src/potion_agent/orchestrator.py` – Core orchestration loop and tool context.
- `src/potion_agent/main.py` – CLI entrypoint.
- `config/potion_network_map.json` – Sample potion network graph.

## Getting Started

1. **Install dependencies**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configure environment**

   **Using Hugging Face (local or self-hosted Nemotron Nano 9B v2)**
   ```bash
   export POTION_LLM_PROVIDER="huggingface"
   export POTION_HF_MODEL_ID="nvidia/NVIDIA-Nemotron-Nano-9B-v2"  # optional override
   export POTION_HF_DEVICE="auto"                                # or "cuda", "cpu"
   export POTION_HF_DTYPE="bfloat16"                             # float16/float32 also supported
   ```

   **Using NVIDIA Nemotron NIM endpoint**
   ```bash
   export POTION_LLM_PROVIDER="nvidia_nim"
   export NVIDIA_API_KEY="your-nvidia-key"
   export POTION_NEMOTRON_MODEL="nemotron-4-340b-instruct"   # optional override
   # Optional: override simulated endpoints, thresholds, logging output, etc.
   ```

3. **Run the agent**
   ```bash
   python -m potion_agent.main --run-once    # single cycle for testing
   python -m potion_agent.main               # continuous monitoring loop
   ```

## Extending the Simulated APIs

- Replace `_fetch_from_source` in `CauldronAPIClient` / `TransportLogAPIClient` with real HTTP (or message bus) calls.
- Adjust the anomaly threshold via `POTION_ANOMALY_THRESHOLD`.
- Update or replace `config/potion_network_map.json` with actual distance matrices.

## Operational Notes

- The agent writes structured JSON logs to `logs/potion_agent.log`.
- Tool executions (e.g. notifications, schedule updates) are captured in the audit trail and can be republished downstream.
- LangChain’s `AgentExecutor` runs asynchronously; failures are logged but do not terminate the loop.

## Requirements

See `requirements.txt` for the precise package list. Using the Hugging Face model requires adequate local GPU/CPU resources. NVIDIA Nemotron access requires network connectivity to the configured NIM endpoint.

