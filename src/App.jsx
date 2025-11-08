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
  Gauge,
  Map,
  LayoutDashboard,
  History,
  Calendar,
  BarChart3
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

// Simulated data generator - matches backend CauldronStatus schema
const generateCauldronData = () => {
  const cauldrons = []
  // Sample coordinates (latitude, longitude) for different cauldrons
  const sampleCoords = [
    [40.7128, -74.0060], [40.7580, -73.9855], [40.7505, -73.9934], [40.7282, -74.0776],
    [40.7614, -73.9776], [40.7489, -74.0050], [40.7282, -73.9942], [40.7505, -73.9855],
    [40.7128, -73.9855], [40.7580, -74.0060], [40.7505, -74.0050], [40.7282, -73.9776],
  ]
  
  for (let i = 1; i <= 12; i++) {
    const capacityLiters = 500 + Math.random() * 200 // 500-700L capacity
    const fillLevelLiters = Math.random() * capacityLiters
    const levelPercent = (fillLevelLiters / capacityLiters) * 100
    const isDraining = Math.random() > 0.85
    const hasAnomaly = Math.random() > 0.9
    const coord = sampleCoords[i - 1] || [40.7128, -74.0060]
    
    cauldrons.push({
      cauldron_id: `cauldron_${i}`,
      id: i, // Keep for UI compatibility
      name: `Cauldron ${i}`,
      fill_level_liters: Math.round(fillLevelLiters * 10) / 10,
      capacity_liters: Math.round(capacityLiters),
      level: Math.round(levelPercent), // Keep for UI compatibility
      latitude: coord[0] + (Math.random() - 0.5) * 0.02,
      longitude: coord[1] + (Math.random() - 0.5) * 0.02,
      fill_rate_liters_per_min: Math.random() * 5 + 1, // 1-6 L/min
      drain_rate_liters_per_min: Math.random() * 20 + 10, // 10-30 L/min
      fillRate: Math.random() * 5 + 1, // Keep for UI compatibility
      isDraining,
      hasAnomaly,
      last_updated: new Date(),
      lastDrain: new Date(Date.now() - Math.random() * 3600000),
      forecastOverflow: levelPercent > 80 ? new Date(Date.now() + (100 - levelPercent) * 60000) : null,
    })
  }
  return cauldrons
}

// Ticket generator - matches backend TransportTicket schema
const generateTickets = () => {
  const now = new Date()
  const today = now.toISOString().split('T')[0] // YYYY-MM-DD format
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  return [
    { 
      ticket_id: 'T-001', 
      id: 1, // Keep for UI compatibility
      cauldron_id: 'cauldron_3',
      cauldronId: 3, // Keep for UI compatibility
      volume_liters: 45,
      volume: 45, // Keep for UI compatibility
      direction: 'pickup',
      courier_id: 'wyvern_01',
      date: today, // EOG requirement: date only
      timestamp: new Date(Date.now() - 1800000), // Optional internal timestamp
      status: 'matched' 
    },
    { 
      ticket_id: 'T-002', 
      id: 2,
      cauldron_id: 'cauldron_7',
      cauldronId: 7,
      volume_liters: 32,
      volume: 32,
      direction: 'pickup',
      courier_id: 'griffin_03',
      date: today,
      timestamp: new Date(Date.now() - 1200000),
      status: 'matched' 
    },
    { 
      ticket_id: 'T-003', 
      id: 3,
      cauldron_id: 'cauldron_2',
      cauldronId: 2,
      volume_liters: 28,
      volume: 28,
      direction: 'pickup',
      courier_id: 'banshee_07',
      date: yesterday,
      timestamp: new Date(Date.now() - 900000),
      status: 'mismatch' 
    },
    { 
      ticket_id: 'T-004', 
      id: 4,
      cauldron_id: 'cauldron_5',
      cauldronId: 5,
      volume_liters: 0,
      volume: 0,
      direction: 'pickup',
      courier_id: 'wyvern_02',
      date: yesterday,
      timestamp: new Date(Date.now() - 600000),
      status: 'missing' 
    },
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
  const [viewMode, setViewMode] = useState('dashboard') // 'dashboard' or 'map'
  const [showHistory, setShowHistory] = useState(false)
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0])
  const [historicalData, setHistoricalData] = useState([])

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

  const totalPotion = cauldrons.reduce((sum, c) => sum + (c.fill_level_liters || c.level * (c.capacity_liters || 100) / 100), 0)
  const avgLevel = Math.round(cauldrons.reduce((sum, c) => sum + (c.level || (c.fill_level_liters / (c.capacity_liters || 100)) * 100), 0) / cauldrons.length)
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
            PotionMaster
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode(viewMode === 'dashboard' ? 'map' : 'dashboard')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg glass border border-cauldron-purple/30 hover:border-cauldron-purple/50 transition-all glow-purple"
            >
              {viewMode === 'dashboard' ? (
                <>
                  <Map className="w-5 h-5 text-cauldron-purple" />
                  <span className="text-sm font-medium text-gray-200">Map View</span>
                </>
              ) : (
                <>
                  <LayoutDashboard className="w-5 h-5 text-cauldron-purple" />
                  <span className="text-sm font-medium text-gray-200">Dashboard</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
        <p className="text-gray-400 text-sm md:text-base">
          The Potion Flow Monitoring Dashboard • EOG × NVIDIA Agentic AI
        </p>
      </motion.div>

      {/* Conditional Rendering: Dashboard or Map View */}
      {viewMode === 'dashboard' ? (
        <>
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
                  Fill: {cauldron.fill_rate_liters_per_min?.toFixed(1) || cauldron.fillRate?.toFixed(1) || '0.0'}L/min
                </div>
                {cauldron.latitude && cauldron.longitude && (
                  <div className="text-xs text-gray-400 mt-1">
                    📍 {cauldron.latitude.toFixed(4)}, {cauldron.longitude.toFixed(4)}
                  </div>
                )}
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
        {/* Ticket Reconciliation with Discrepancy Detection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-cauldron-purple" />
              Ticket Reconciliation
            </h2>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass border border-cauldron-cyan/30 hover:border-cauldron-cyan/50 text-sm"
            >
              <History className="w-4 h-4 text-cauldron-cyan" />
              <span className="text-gray-200">History</span>
            </motion.button>
          </div>

          {/* EOG Requirement: Date-based matching info */}
          <div className="mb-4 p-3 rounded-lg bg-cauldron-purple/10 border border-cauldron-purple/30">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-cauldron-purple" />
              <span className="text-xs font-semibold text-cauldron-purple">Date-Based Matching</span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Tickets arrive with dates only (no timestamps). Matching algorithm compares ticket volumes to actual drain events, accounting for continuous potion flow during drainage.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-gray-300">Dynamic matching active - algorithm adapts to changing ticket data</span>
            </div>
          </div>

          <div className="space-y-3">
            {tickets.map((ticket) => {
              // Simulate drain event matching for demonstration
              const matchedCauldron = cauldrons.find(c => 
                (c.cauldron_id || `cauldron_${c.id}`) === (ticket.cauldron_id || `cauldron_${ticket.cauldronId}`)
              )
              const fillRate = matchedCauldron?.fill_rate_liters_per_min || matchedCauldron?.fillRate || 2.5
              const drainDuration = 15 // minutes (simulated)
              const continuousFill = fillRate * drainDuration
              const levelDrop = (ticket.volume_liters || ticket.volume) - continuousFill
              const expectedVolume = levelDrop + continuousFill
              const volumeDiff = Math.abs((ticket.volume_liters || ticket.volume) - expectedVolume)
              const isDiscrepancy = volumeDiff > 5 // 5L tolerance

              return (
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
                        {ticket.ticket_id || `Ticket #${ticket.id}`}
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
                    <span className="text-xs text-gray-400 font-semibold">
                      Date: {ticket.date || ticket.timestamp?.toLocaleDateString() || 'N/A'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-300 mb-2">
                    {ticket.cauldron_id || `Cauldron ${ticket.cauldronId}`} • {ticket.volume_liters || ticket.volume}L
                    {ticket.direction && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({ticket.direction})
                      </span>
                    )}
                  </div>

                  {/* EOG Requirement: Discrepancy Detection Details */}
                  {ticket.status === 'mismatch' && (
                    <div className="mt-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                      <div className="text-xs text-yellow-400 font-semibold mb-1">Discrepancy Detected:</div>
                      <div className="text-xs text-gray-300 space-y-1">
                        <div>Ticket Volume: <span className="font-semibold">{ticket.volume_liters || ticket.volume}L</span></div>
                        <div>Expected Volume: <span className="font-semibold">{expectedVolume.toFixed(1)}L</span></div>
                        <div className="flex items-center gap-2">
                          <span>• Level Drop: {levelDrop > 0 ? levelDrop.toFixed(1) : '0.0'}L</span>
                          <span>• Continuous Fill: {continuousFill.toFixed(1)}L</span>
                        </div>
                        <div className="text-yellow-400 font-semibold">
                          Difference: {volumeDiff.toFixed(1)}L
                        </div>
                      </div>
                    </div>
                  )}

                  {ticket.status === 'matched' && (
                    <div className="mt-2 text-xs text-gray-400">
                      ✓ Matched to drain event on {ticket.date}
                    </div>
                  )}

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
              )
            })}
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
        </>
      ) : (
        /* Geographic Map View */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-xl p-6 min-h-[600px]"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <Map className="w-6 h-6 text-cauldron-purple" />
            Geographic Map Visualization
          </h2>
          
          <div className="relative w-full h-[600px] bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
            {/* Map Container */}
            <svg
              viewBox="0 0 1000 600"
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {/* Enchanted Market marker - EOG Requirement: Sales Point */}
              <g>
                <circle
                  cx={500}
                  cy={300}
                  r={18}
                  fill="#8b5cf6"
                  className="animate-pulse"
                  opacity="0.9"
                  stroke="#ec4899"
                  strokeWidth="2"
                />
                <circle
                  cx={500}
                  cy={300}
                  r={12}
                  fill="#ec4899"
                  opacity="0.6"
                  className="animate-pulse"
                />
                <text
                  x={500}
                  y={335}
                  textAnchor="middle"
                  className="text-xs fill-cauldron-purple font-bold"
                  fontSize="13"
                >
                  🏪 Enchanted Market
                </text>
                <text
                  x={500}
                  y={350}
                  textAnchor="middle"
                  className="text-xs fill-gray-400"
                  fontSize="10"
                >
                  (Sales Point)
                </text>
              </g>
              
              {/* Cauldron markers */}
              {cauldrons.map((cauldron) => {
                if (!cauldron.latitude || !cauldron.longitude) return null
                
                // Normalize coordinates to map bounds (assuming coordinates are in NYC area)
                // Adjust these bounds based on your actual coordinate range
                const minLat = 40.70
                const maxLat = 40.77
                const minLng = -74.08
                const maxLng = -73.97
                
                const x = ((cauldron.longitude - minLng) / (maxLng - minLng)) * 1000
                const y = ((maxLat - cauldron.latitude) / (maxLat - minLat)) * 600
                
                const level = cauldron.level || (cauldron.fill_level_liters / cauldron.capacity_liters) * 100
                const color = cauldron.hasAnomaly 
                  ? '#ef4444' 
                  : level > 80 
                  ? '#eab308' 
                  : level > 50 
                  ? '#06b6d4' 
                  : '#8b5cf6'
                
                return (
                  <g
                    key={cauldron.cauldron_id || cauldron.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedCauldron(cauldron)}
                  >
                    {/* Connection line to market */}
                    <line
                      x1={x}
                      y1={y}
                      x2={500}
                      y2={300}
                      stroke={color}
                      strokeWidth="1"
                      strokeDasharray="5,5"
                      opacity="0.3"
                    />
                    
                    {/* Cauldron marker */}
                    <circle
                      cx={x}
                      cy={y}
                      r={level > 80 ? 12 : 8}
                      fill={color}
                      className="hover:scale-125 transition-transform"
                      opacity="0.9"
                    >
                      <animate
                        attributeName="r"
                        values={level > 80 ? "12;14;12" : "8;10;8"}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    
                    {/* Cauldron label */}
                    <text
                      x={x}
                      y={y - 20}
                      textAnchor="middle"
                      className="text-xs fill-gray-200 font-semibold"
                      fontSize="11"
                    >
                      {cauldron.name}
                    </text>
                    
                    {/* Level indicator */}
                    <text
                      x={x}
                      y={y + 5}
                      textAnchor="middle"
                      className="text-xs fill-gray-300 font-bold"
                      fontSize="10"
                    >
                      {Math.round(level)}%
                    </text>
                    
                    {/* Anomaly indicator */}
                    {cauldron.hasAnomaly && (
                      <g>
                        <circle
                          cx={x + 10}
                          cy={y - 10}
                          r={6}
                          fill="#ef4444"
                          className="animate-pulse"
                          opacity="0.8"
                        />
                        <text
                          x={x + 10}
                          y={y - 7}
                          textAnchor="middle"
                          className="text-xs fill-white font-bold"
                          fontSize="8"
                        >
                          ⚠
                        </text>
                      </g>
                    )}
                    
                    {/* Draining indicator */}
                    {cauldron.isDraining && (
                      <g>
                        <circle
                          cx={x - 10}
                          cy={y - 10}
                          r={6}
                          fill="#eab308"
                          className="animate-pulse"
                          opacity="0.8"
                        />
                        <text
                          x={x - 10}
                          y={y - 7}
                          textAnchor="middle"
                          className="text-xs fill-white font-bold"
                          fontSize="8"
                        >
                          ⚡
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 glass rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-200 mb-2">Legend</h3>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cauldron-purple"></div>
                  <span className="text-gray-300">Normal (&lt;50%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cauldron-cyan"></div>
                  <span className="text-gray-300">Medium (50-80%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-gray-300">High (&gt;80%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-gray-300">Anomaly</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  <span className="text-gray-300">Draining</span>
                </div>
              </div>
            </div>
            
            {/* Stats overlay */}
            <div className="absolute top-4 right-4 glass rounded-lg p-4 border border-gray-700">
              <div className="text-xs text-gray-400 space-y-1">
                <div>Total Cauldrons: <span className="text-gray-200 font-semibold">{cauldrons.length}</span></div>
                <div>Active Drains: <span className="text-yellow-400 font-semibold">{activeDrains}</span></div>
                <div>Anomalies: <span className="text-red-400 font-semibold">{anomalies}</span></div>
                <div>Overflow Risk: <span className="text-yellow-400 font-semibold">{overflowRisk}</span></div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Historical Data Playback Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowHistory(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto glow-purple"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                  <History className="w-6 h-6 text-cauldron-purple" />
                  Historical Data Playback
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Date Selector */}
              <div className="mb-6 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cauldron-cyan" />
                  Select Date
                </label>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 focus:border-cauldron-purple focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Review historical potion levels and transport ticket activity for the selected date
                </p>
              </div>

              {/* Historical Cauldron Levels */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-cauldron-cyan" />
                  Historical Cauldron Levels - {historyDate}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {cauldrons.map((cauldron) => {
                    // Simulate historical data for the selected date
                    const historicalLevel = Math.random() * 100
                    return (
                      <div
                        key={cauldron.id}
                        className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                      >
                        <div className="text-xs font-semibold text-gray-300 mb-1">
                          {cauldron.name}
                        </div>
                        <div className="text-lg font-bold text-cauldron-purple">
                          {Math.round(historicalLevel)}%
                        </div>
                        <div className="text-xs text-gray-400">
                          {((cauldron.capacity_liters || cauldron.capacity) * historicalLevel / 100).toFixed(1)}L
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Historical Transport Tickets */}
              <div>
                <h3 className="text-lg font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-cauldron-purple" />
                  Transport Tickets - {historyDate}
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tickets
                    .filter(t => (t.date || t.timestamp?.toLocaleDateString()) === historyDate)
                    .map((ticket) => (
                      <div
                        key={ticket.id}
                        className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-gray-200">
                              {ticket.ticket_id || `Ticket #${ticket.id}`}
                            </span>
                            <span className="text-xs text-gray-400 ml-2">
                              {ticket.cauldron_id || `Cauldron ${ticket.cauldronId}`}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-cauldron-cyan">
                            {ticket.volume_liters || ticket.volume}L
                          </div>
                        </div>
                        {ticket.status && (
                          <div className="mt-1">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                ticket.status === 'matched'
                                  ? 'bg-green-500/20 text-green-400'
                                  : ticket.status === 'mismatch'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  {tickets.filter(t => (t.date || t.timestamp?.toLocaleDateString()) === historyDate).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No tickets found for {historyDate}
                    </p>
                  )}
                </div>
              </div>

              {/* Historical Chart */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-200 mb-3">Level Trends Over Time</h3>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                      {selectedCauldron.fill_rate_liters_per_min?.toFixed(1) || selectedCauldron.fillRate?.toFixed(1) || '0.0'}L/min
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Drain Rate</div>
                    <div className="text-lg font-semibold text-cauldron-pink">
                      {selectedCauldron.drain_rate_liters_per_min?.toFixed(1) || '0.0'}L/min
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Capacity</div>
                    <div className="text-lg font-semibold text-gray-300">
                      {selectedCauldron.capacity_liters || selectedCauldron.capacity}L
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Fill Level</div>
                    <div className="text-lg font-semibold text-cauldron-purple">
                      {selectedCauldron.fill_level_liters?.toFixed(1) || (selectedCauldron.level * (selectedCauldron.capacity_liters || selectedCauldron.capacity) / 100).toFixed(1)}L
                    </div>
                  </div>
                </div>

                {selectedCauldron.latitude && selectedCauldron.longitude && (
                  <div className="p-3 rounded-lg bg-gray-800/50">
                    <div className="text-xs text-gray-400 mb-1">Location</div>
                    <div className="text-sm font-semibold text-gray-300">
                      📍 {selectedCauldron.latitude.toFixed(4)}, {selectedCauldron.longitude.toFixed(4)}
                    </div>
                  </div>
                )}

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
