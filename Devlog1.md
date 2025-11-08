# HackUTD NVIDIA+EOG Agent Project Log

## Team: [list names]

### 1. Goal
> Build an agent that monitors cauldron fill, predicts overflows, and optimizes courier routes.

### 2. Stack
- Python, LangChain, NVIDIA Nemotron (Nano/Super/Ultra), EOG APIs, Streamlit (for visualization)

### 3. Major Steps
- [x] Set up codebase and install dependencies.
- [x] Connect to Nemotron via LangChain.
- [x] Write tools for cauldron status and route optimization.
- [x] Build ReAct-style agent to orchestrate API calls.
- [ ] Test agent with simulated data.
- [ ] Polish UI/dashboard for demo.

### 4. Key Files
- `main.py` - Launch/entrypoint
- `agent.py` - Agent logic
- `tools/eog_api.py` - Integrations for EOG endpoints
- `tools/routing.py` - Courier optimization logic

### 5. To-Do
- Integrate live EOG data
- Tune agent for hackathon edge-cases
- Prepare demo script
