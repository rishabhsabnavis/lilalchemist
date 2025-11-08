# CauldronMind: The Potion Flow Monitoring Dashboard

**EOG × NVIDIA HackUTD 2025**

A full-stack solution combining a real-time React dashboard with an autonomous LangChain + NVIDIA Nemotron agent system for monitoring potion flow across enchanted cauldrons.

## 🧙🏽‍♀️ Overview

Deep within Poyo's Potion Factory, dozens of enchanted cauldrons bubble away, collecting potions from brewing towers. This system tracks potion levels in real-time, detects anomalies, reconciles transport tickets, forecasts overflow risks, and optimizes courier routes using agentic AI.

## 🏗️ Architecture

### Frontend (React + Vite)
- **Real-time dashboard** with animated cauldron map
- **Agent workflow visualization** (Monitor → Detect → Reconcile → Plan → Report)
- **Ticket reconciliation** with mismatch detection
- **Forecasting & scheduling** for overflow prevention
- **Dark futuristic UI** with Tailwind CSS + Framer Motion

### Backend (Python + LangChain + NVIDIA Nemotron)
- **Autonomous agent** powered by NVIDIA Nemotron NIM
- **Anomaly detection** between telemetry and transport logs
- **Predictive forecasting** for overflow risks
- **Route optimization** for courier scheduling
- **Structured logging** and audit trails

## 🚀 Getting Started

### Frontend Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```

3. **Open browser**
   - Navigate to `http://localhost:5173`

### Backend Setup

1. **Create virtual environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   export NVIDIA_API_KEY="your-nvidia-key"
   export POTION_NEMOTRON_MODEL="nemotron-4-340b-instruct"  # optional
   ```

4. **Run the agent**
   ```bash
   python -m potion_agent.main --run-once    # single cycle for testing
   python -m potion_agent.main               # continuous monitoring loop
   ```

## 📁 Project Structure

```
cauldronmind/
├── src/
│   ├── App.jsx              # Main React dashboard component
│   ├── main.jsx             # React entry point
│   ├── index.css            # Tailwind styles
│   └── potion_agent/        # Python backend
│       ├── agent.py         # LangChain + Nemotron agent
│       ├── orchestrator.py  # Main orchestration loop
│       ├── anomaly_detection.py
│       ├── forecasting.py
│       ├── routing.py
│       └── ...
├── config/
│   └── potion_network_map.json  # Network topology
├── package.json             # Frontend dependencies
├── requirements.txt         # Python dependencies
└── README.md               # This file
```

## 🎯 Key Features

### Frontend
- ✅ Real-time cauldron level visualization
- ✅ Interactive cauldron map with 12+ cauldrons
- ✅ Agent workflow status panel
- ✅ Ticket reconciliation display
- ✅ Overflow forecasting
- ✅ Witch route optimization visualization
- ✅ Time series charts

### Backend
- ✅ Real-time data ingestion (with API extension points)
- ✅ Anomaly detection (telemetry vs. transport logs)
- ✅ Predictive forecasting (overflow risk)
- ✅ Route optimization (greedy nearest-neighbor)
- ✅ Agentic orchestration (NVIDIA Nemotron)
- ✅ Structured JSON logging

## 🔧 Configuration

### Frontend
- Tailwind CSS v4 with custom theme
- Framer Motion for animations
- Recharts for data visualization
- Lucide React for icons

### Backend
Environment variables (all optional with defaults):
- `NVIDIA_API_KEY` - Required for Nemotron agent
- `POTION_CAULDRON_API_URL` - Cauldron data endpoint
- `POTION_TRANSPORT_API_URL` - Transport ticket endpoint
- `POTION_ANOMALY_THRESHOLD` - Anomaly sensitivity (default: 0.15)
- `POTION_POLL_INTERVAL_SECONDS` - Update frequency (default: 5.0)

## 🔌 API Integration

The backend includes simulated data generators for local development. To connect to real EOG APIs:

1. Update `CauldronAPIClient._fetch_from_source()` in `src/potion_agent/data_ingestion.py`
2. Update `TransportLogAPIClient._fetch_from_source()` in the same file
3. Set environment variables for API endpoints

## 📊 Data Models

- **CauldronStatus**: ID, fill level, capacity, location, timestamps
- **TransportTicket**: Ticket ID, cauldron ID, volume, direction, courier, timestamp
- **AnomalyFlag**: Cauldron ID, type, severity, description
- **ForecastResult**: Overflow projections with confidence scores
- **RoutePlan**: Optimized courier routes with stop sequences

## 🛠️ Development

### Frontend
```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```

### Backend
```bash
python -m potion_agent.main --run-once  # Test single cycle
python -m potion_agent.main             # Continuous monitoring
```

## 📝 Logging

Backend logs are written to `logs/potion_agent.log` in structured JSON format. The agent maintains an audit trail of all tool executions and decisions.

## 🤝 Contributing

This is a hackathon project for HackUTD 2025, combining:
- **EOG Challenge**: Real-time potion flow monitoring
- **NVIDIA Challenge**: Agentic AI with multi-step workflows

## 📄 License

Hackathon project - See challenge requirements for details.
