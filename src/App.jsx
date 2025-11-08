import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Users,
  Zap,
  Eye,
  Search,
  FileCheck,
  Lightbulb,
  FileText,
  MapPin,
  Gauge
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

// Simulated data generator
const generateCauldronData = () => {
  const cauldrons = []
  for (let i = 1; i <= 12; i++) {
    const level = Math.random() * 100
    const capacity = 100
    const isDraining = Math.random() > 0.85
    const hasAnomaly = Math.random() > 0.9
    
    cauldrons.push({
      id: i,
      name: `Cauldron ${i}`,
      level: Math.round(level),
      capacity,
      fillRate: Math.random() * 5 + 1,
      isDraining,
      hasAnomaly,
      lastDrain: new Date(Date.now() - Math.random() * 3600000),
      forecastOverflow: level > 80 ? new Date(Date.now() + (100 - level) * 60000) : null,
    })
  }
  return cauldrons
}

const generateTickets = () => {
  return [
    { id: 1, cauldronId: 3, volume: 45, timestamp: new Date(Date.now() - 1800000), status: 'matched' },
    { id: 2, cauldronId: 7, volume: 32, timestamp: new Date(Date.now() - 1200000), status: 'matched' },
    { id: 3, cauldronId: 2, volume: 28, timestamp: new Date(Date.now() - 900000), status: 'mismatch' },
    { id: 4, cauldronId: 5, volume: 0, timestamp: new Date(Date.now() - 600000), status: 'missing' },
  ]
}

const agentWorkflowSteps = [
  { id: 1, name: 'Monitor', icon: Eye, status: 'active', description: 'Tracking all cauldron levels in real-time' },
  { id: 2, name: 'Detect', icon: Search, status: 'active', description: 'Identifying drain events and anomalies' },
  { id: 3, name: 'Reconcile', icon: FileCheck, status: 'active', description: 'Matching tickets with actual drains' },
  { id: 4, name: 'Plan', icon: Lightbulb, status: 'pending', description: 'Optimizing witch routes and schedules' },
  { id: 5, name: 'Report', icon: FileText, status: 'pending', description: 'Generating insights and alerts' },
]

function App() {
  const [cauldrons, setCauldrons] = useState(generateCauldronData())
  const [tickets, setTickets] = useState(generateTickets())
  const [selectedCauldron, setSelectedCauldron] = useState(null)
  const [timeSeriesData, setTimeSeriesData] = useState([])
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(1)

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      setCauldrons(generateCauldronData())
      setTickets(generateTickets())
      
      // Update time series data
      const now = new Date()
      setTimeSeriesData(prev => {
        const newData = [...prev, {
          time: now.toLocaleTimeString(),
          avgLevel: Math.round(cauldrons.reduce((sum, c) => sum + c.level, 0) / cauldrons.length),
          anomalies: cauldrons.filter(c => c.hasAnomaly).length,
        }]
        return newData.slice(-20) // Keep last 20 data points
      })
    }, 2000)

    // Simulate workflow progression
    const workflowInterval = setInterval(() => {
      setActiveWorkflowStep(prev => {
        if (prev < 5) return prev + 1
        return 1 // Loop back
      })
    }, 3000)

    return () => {
      clearInterval(interval)
      clearInterval(workflowInterval)
    }
  }, [])

  const totalPotion = cauldrons.reduce((sum, c) => sum + c.level, 0)
  const avgLevel = Math.round(totalPotion / cauldrons.length)
  const anomalies = cauldrons.filter(c => c.hasAnomaly).length
  const mismatches = tickets.filter(t => t.status === 'mismatch' || t.status === 'missing').length
  const activeDrains = cauldrons.filter(c => c.isDraining).length
  const overflowRisk = cauldrons.filter(c => c.level > 80).length

  const getCauldronColor = (level, hasAnomaly) => {
    if (hasAnomaly) return 'bg-red-500'
    if (level > 80) return 'bg-yellow-500'
    if (level > 50) return 'bg-cauldron-cyan'
    return 'bg-cauldron-purple'
  }

  const getCauldronGlow = (level, hasAnomaly) => {
    if (hasAnomaly) return 'glow-pink'
    if (level > 80) return 'glow-cyan'
    return 'glow-purple'
  }

  return (
    <div className="min-h-screen bg-cauldron-darker p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cauldron-purple via-cauldron-cyan to-cauldron-pink bg-clip-text text-transparent">
            CauldronMind
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
        </div>
        <p className="text-gray-400 text-sm md:text-base">
          The Potion Flow Monitoring Dashboard • EOG × NVIDIA Agentic AI
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-lg p-4 glow-purple"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Total Potion</p>
              <p className="text-2xl font-bold text-cauldron-purple">{totalPotion.toFixed(0)}L</p>
            </div>
            <Gauge className="w-8 h-8 text-cauldron-purple" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-lg p-4 glow-cyan"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Avg Level</p>
              <p className="text-2xl font-bold text-cauldron-cyan">{avgLevel}%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-cauldron-cyan" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-lg p-4 glow-pink"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Anomalies</p>
              <p className="text-2xl font-bold text-cauldron-pink">{anomalies}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-cauldron-pink" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-lg p-4 glow-cyan"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Mismatches</p>
              <p className="text-2xl font-bold text-yellow-400">{mismatches}</p>
            </div>
            <FileCheck className="w-8 h-8 text-yellow-400" />
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cauldron Map */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 glass rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-cauldron-purple" />
              Cauldron Network Map
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cauldron-purple rounded-full"></div>
                <span className="text-gray-400">Normal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-gray-400">High</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-gray-400">Anomaly</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
            {cauldrons.map((cauldron) => (
              <motion.div
                key={cauldron.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCauldron(cauldron)}
                className={`relative rounded-lg p-4 cursor-pointer transition-all ${
                  selectedCauldron?.id === cauldron.id ? 'ring-2 ring-cauldron-purple' : ''
                } ${getCauldronGlow(cauldron.level, cauldron.hasAnomaly)}`}
                style={{
                  background: `linear-gradient(135deg, ${getCauldronColor(cauldron.level, cauldron.hasAnomaly)} 0%, ${getCauldronColor(cauldron.level, cauldron.hasAnomaly)} ${cauldron.level}%, rgba(15, 15, 20, 0.8) ${cauldron.level}%)`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white">{cauldron.name}</span>
                  {cauldron.isDraining && (
                    <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />
                  )}
                  {cauldron.hasAnomaly && (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="text-2xl font-bold text-white mb-1">{cauldron.level}%</div>
                <div className="text-xs text-gray-300">
                  {cauldron.fillRate.toFixed(1)}L/min
                </div>
                {cauldron.level > 80 && (
                  <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Overflow risk
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Time Series Chart */}
          {timeSeriesData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-300">Level Trends</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1f', border: '1px solid #8b5cf6' }}
                    labelStyle={{ color: '#e5e7eb' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgLevel"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* Agent Workflow Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass rounded-xl p-6"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="w-6 h-6 text-cauldron-cyan" />
            Agent Workflow
          </h2>

          <div className="space-y-3">
            {agentWorkflowSteps.map((step, index) => {
              const Icon = step.icon
              const isActive = activeWorkflowStep === step.id
              const isCompleted = activeWorkflowStep > step.id

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-lg border transition-all ${
                    isActive
                      ? 'border-cauldron-cyan bg-cauldron-cyan/10 glow-cyan'
                      : isCompleted
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-700 bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isActive
                          ? 'bg-cauldron-cyan text-white'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-gray-100">{step.name}</h3>
                        {isActive && (
                          <div className="w-2 h-2 bg-cauldron-cyan rounded-full animate-pulse"></div>
                        )}
                        {isCompleted && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{step.description}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Active Drains */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Active Drains
            </h3>
            <div className="space-y-2">
              {cauldrons
                .filter(c => c.isDraining)
                .map(cauldron => (
                  <div
                    key={cauldron.id}
                    className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-yellow-400">
                        {cauldron.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {cauldron.level}L
                      </span>
                    </div>
                  </div>
                ))}
              {activeDrains === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No active drains
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Ticket Reconciliation & Forecasting */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Ticket Reconciliation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-cauldron-purple" />
            Ticket Reconciliation
          </h2>

          <div className="space-y-3">
            {tickets.map((ticket) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-4 rounded-lg border ${
                  ticket.status === 'matched'
                    ? 'border-green-500/30 bg-green-500/10'
                    : ticket.status === 'mismatch'
                    ? 'border-yellow-500/30 bg-yellow-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-200">
                      Ticket #{ticket.id}
                    </span>
                    {ticket.status === 'matched' && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    {ticket.status === 'mismatch' && (
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    )}
                    {ticket.status === 'missing' && (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {ticket.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm text-gray-300">
                  Cauldron {ticket.cauldronId} • {ticket.volume}L
                </div>
                <div className="mt-2 text-xs">
                  <span
                    className={`px-2 py-1 rounded ${
                      ticket.status === 'matched'
                        ? 'bg-green-500/20 text-green-400'
                        : ticket.status === 'mismatch'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {ticket.status === 'matched'
                      ? 'Matched'
                      : ticket.status === 'mismatch'
                      ? 'Volume Mismatch'
                      : 'Missing Ticket'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Forecasting & Scheduling */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl p-6"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-cauldron-cyan" />
            Forecasting & Scheduling
          </h2>

          {/* Overflow Forecast */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-300">
              Overflow Risk
            </h3>
            <div className="space-y-2">
              {cauldrons
                .filter(c => c.level > 80)
                .map(cauldron => (
                  <div
                    key={cauldron.id}
                    className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-yellow-400">
                        {cauldron.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {cauldron.level}% full
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Estimated overflow: {cauldron.forecastOverflow?.toLocaleTimeString() || 'Calculating...'}
                    </div>
                  </div>
                ))}
              {overflowRisk === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No overflow risk detected
                </p>
              )}
            </div>
          </div>

          {/* Witch Scheduling */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <Users className="w-5 h-5 text-cauldron-pink" />
              Optimal Witch Routes
            </h3>
            <div className="p-4 rounded-lg bg-cauldron-purple/10 border border-cauldron-purple/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-cauldron-purple">
                  Minimum Witches Required
                </span>
                <span className="text-2xl font-bold text-cauldron-purple">
                  {Math.ceil(activeDrains / 3)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Based on active drains and route optimization
              </div>
            </div>

            {/* Route Visualization */}
            <div className="mt-4 space-y-2">
              {Array.from({ length: Math.ceil(activeDrains / 3) }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-cauldron-pink" />
                    <span className="text-sm font-medium text-gray-300">
                      Witch Route {idx + 1}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {cauldrons
                      .filter(c => c.isDraining)
                      .slice(idx * 3, (idx + 1) * 3)
                      .map(c => c.name)
                      .join(' → ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Selected Cauldron Details Modal */}
      <AnimatePresence>
        {selectedCauldron && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCauldron(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-xl p-6 max-w-md w-full glow-purple"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-100">
                  {selectedCauldron.name}
                </h3>
                <button
                  onClick={() => setSelectedCauldron(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">Current Level</span>
                    <span className="text-2xl font-bold text-cauldron-purple">
                      {selectedCauldron.level}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-3">
                    <div
                      className="bg-cauldron-purple h-3 rounded-full transition-all"
                      style={{ width: `${selectedCauldron.level}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Fill Rate</div>
                    <div className="text-lg font-semibold text-cauldron-cyan">
                      {selectedCauldron.fillRate.toFixed(1)}L/min
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Capacity</div>
                    <div className="text-lg font-semibold text-gray-300">
                      {selectedCauldron.capacity}L
                    </div>
                  </div>
                </div>

                {selectedCauldron.hasAnomaly && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-semibold">Anomaly Detected</span>
                    </div>
                  </div>
                )}

                {selectedCauldron.isDraining && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-400">
                      <Zap className="w-5 h-5" />
                      <span className="font-semibold">Currently Draining</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
