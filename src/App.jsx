import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as api from './services/api'
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
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip as LeafletTooltip } from 'react-leaflet'
import L from 'leaflet'
import './App.css'

// Fix for default marker icons in Leaflet with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Enchanted Market coordinates (hardcoded)
const ENCHANTED_MARKET_LAT = 33.2148
const ENCHANTED_MARKET_LNG = -97.13

// Fallback network map (empty - use only API data)
const FALLBACK_NETWORK_MAP = {}

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
  const [cauldrons, setCauldrons] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedCauldron, setSelectedCauldron] = useState(null)
  const [timeSeriesData, setTimeSeriesData] = useState([])
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(1)
  const [viewMode, setViewMode] = useState('dashboard') // 'dashboard' or 'map'
  const [showHistory, setShowHistory] = useState(false)
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0])
  const [historicalData, setHistoricalData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [networkMap, setNetworkMap] = useState(FALLBACK_NETWORK_MAP)

  // Transform API cauldron data to match frontend format
  const transformCauldron = (apiCauldron) => {
    const level = apiCauldron.level || (apiCauldron.fill_level_liters / apiCauldron.capacity_liters) * 100
    return {
      ...apiCauldron,
      level: Math.round(level),
      isDraining: false, // Will be determined by ticket matching
      hasAnomaly: false, // Will be determined by anomaly detection
      fillRate: apiCauldron.fill_rate_liters_per_min || apiCauldron.fillRate || 2.5,
      capacity: apiCauldron.capacity_liters,
      forecastOverflow: null, // Will be set by forecasts
    }
  }

  // Transform API ticket data to match frontend format
  const transformTicket = (apiTicket) => {
    return {
      ...apiTicket,
      id: apiTicket.ticket_id || apiTicket.id,
      cauldronId: apiTicket.cauldron_id,
      volume: apiTicket.volume_liters || apiTicket.volume,
      status: apiTicket.status || 'matched', // Default to matched, will be updated by matching logic
    }
  }

  // Fetch network map from API
  const fetchNetworkMapData = async () => {
    try {
      const networkData = await api.fetchNetworkMap()
      if (networkData && Object.keys(networkData).length > 0) {
        setNetworkMap(networkData)
      }
    } catch (err) {
      console.error('Error fetching network map:', err)
      // Keep fallback network map on error
    }
  }

  // Helper function to get travel time between a cauldron and the market
  const getTravelTimeToMarket = (cauldron) => {
    // Try to find market node (could be "market_001", "enchanted_market", etc.)
    const marketNode = Object.keys(networkMap).find(key => 
      key.toLowerCase().includes('market') || key === 'enchanted_market'
    ) || 'market_001'
    
    // Try to match by cauldron_id first (e.g., "cauldron_001")
    const cauldronId = cauldron.cauldron_id || cauldron.id || ''
    
    // Debug logging
    console.log('Getting travel time for:', {
      cauldronId,
      cauldronName: cauldron.name,
      marketNode,
      networkMapKeys: Object.keys(networkMap),
      hasMarketNode: !!networkMap[marketNode],
      marketConnections: networkMap[marketNode] ? Object.keys(networkMap[marketNode]) : []
    })
    
    // Check if cauldron_id matches a network map key
    if (networkMap[marketNode] && networkMap[marketNode][cauldronId]) {
      console.log('Found travel time (market->cauldron):', networkMap[marketNode][cauldronId])
      return networkMap[marketNode][cauldronId]
    }
    
    // Also check reverse direction (cauldron -> market)
    if (networkMap[cauldronId] && networkMap[cauldronId][marketNode]) {
      console.log('Found travel time (cauldron->market):', networkMap[cauldronId][marketNode])
      return networkMap[cauldronId][marketNode]
    }
    
    // Try to match by name (e.g., "Cauldron 001" -> "cauldron_001")
    const name = cauldron.name?.toLowerCase().replace(/\s+/g, '_') || ''
    if (networkMap[marketNode] && networkMap[marketNode][name]) {
      console.log('Found travel time (by name):', networkMap[marketNode][name])
      return networkMap[marketNode][name]
    }
    
    // Fallback: calculate approximate time based on distance
    console.log('Using fallback distance calculation')
    // Using Haversine formula for distance, then convert to time
    const R = 6371 // Earth radius in km
    const dLat = (ENCHANTED_MARKET_LAT - cauldron.latitude) * Math.PI / 180
    const dLng = (ENCHANTED_MARKET_LNG - cauldron.longitude) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(cauldron.latitude * Math.PI / 180) * Math.cos(ENCHANTED_MARKET_LAT * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const haversineC = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceKm = R * haversineC
    
    // Convert distance to time (assuming 36 km/h = 0.6 km/min)
    const DEFAULT_SPEED_KM_PER_MIN = 0.6
    return distanceKm / DEFAULT_SPEED_KM_PER_MIN
  }

  // Fetch data from API
  const fetchData = async () => {
    try {
      setError(null)
      const [cauldronsData, ticketsData] = await Promise.all([
        api.fetchCauldrons(),
        api.fetchTickets(20), // Fetch last 20 tickets
      ])

      // Transform and set cauldrons
      const transformedCauldrons = cauldronsData.map(transformCauldron)
      setCauldrons(transformedCauldrons)

      // Transform and set tickets
      const transformedTickets = ticketsData.map(transformTicket)
      setTickets(transformedTickets)

      // Update time series data
      const now = new Date()
      const avgLevel = transformedCauldrons.length > 0
        ? Math.round(transformedCauldrons.reduce((sum, c) => sum + c.level, 0) / transformedCauldrons.length)
        : 0
      
      setTimeSeriesData(prev => {
        const newData = [...prev, {
          time: now.toLocaleTimeString(),
          avgLevel,
          anomalies: transformedCauldrons.filter(c => c.hasAnomaly).length,
        }]
        return newData.slice(-20) // Keep last 20 data points
      })

      setLoading(false)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message || 'Failed to fetch data from API')
      setLoading(false)
      
      // Fallback to simulated data on error
      setCauldrons(generateCauldronData())
      setTickets(generateTickets())
    }
  }

  useEffect(() => {
    // Initial data fetch
    fetchData()
    fetchNetworkMapData() // Fetch network map once

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchData()
    }, 5000) // Poll every 5 seconds

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

  // Show loading state
  if (loading && cauldrons.length === 0) {
    return (
      <div className="min-h-screen bg-cauldron-darker p-4 md:p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cauldron-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading PotionMaster Dashboard...</p>
        </div>
      </div>
    )
  }

  // Show error state (only if no data loaded)
  if (error && cauldrons.length === 0) {
    return (
      <div className="min-h-screen bg-cauldron-darker p-4 md:p-6 flex items-center justify-center">
        <div className="text-center glass rounded-xl p-6 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-100 mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <p className="text-sm text-gray-500 mb-4">Using simulated data as fallback</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-cauldron-purple text-white rounded-lg hover:bg-cauldron-purple/80 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  const totalPotion = cauldrons.reduce((sum, c) => sum + (c.fill_level_liters || c.level * (c.capacity_liters || 100) / 100), 0)
  const avgLevel = cauldrons.length > 0 
    ? Math.round(cauldrons.reduce((sum, c) => sum + (c.level || (c.fill_level_liters / (c.capacity_liters || 100)) * 100), 0) / cauldrons.length)
    : 0
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
      {/* Overview Requirement: "Real-time Potion Flow Monitoring Dashboard" */}
      <div className="mb-4 p-4 rounded-lg bg-cauldron-purple/10 border border-cauldron-purple/30">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-cauldron-purple" />
          <span className="text-lg font-semibold text-cauldron-purple">Real-Time Potion Flow Monitoring Dashboard</span>
        </div>
        <p className="text-sm text-gray-300 mb-2">
          Tracks potion levels across all cauldrons, identifies collection events, checks Potion Transport Tickets, and detects any missing or unlogged potion.
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-gray-400">
          <span>✓ Real-time monitoring</span>
          <span>•</span>
          <span>✓ Collection event identification</span>
          <span>•</span>
          <span>✓ Transport ticket checking</span>
          <span>•</span>
          <span>✓ Unlogged potion detection</span>
          <span>•</span>
          <span>✓ Inconsistency flagging</span>
          <span>•</span>
          <span>✓ Suspicious activity identification</span>
        </div>
      </div>

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

        {/* Overview Requirement: "Identifies suspicious activity" */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass rounded-xl p-6"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            Suspicious Activity
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Overview Requirement: "Identifies suspicious activity and helps ensure every drop of potion is properly accounted for"
          </p>

          {/* Anomalies Section */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Anomalies Detected
            </h3>
            <div className="space-y-2">
              {cauldrons
                .filter(c => c.hasAnomaly)
                .map(cauldron => (
                  <div
                    key={cauldron.id}
                    className="p-3 rounded-lg bg-red-500/10 border border-red-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-red-400">
                          {cauldron.name}
                        </span>
                        <div className="text-xs text-gray-400 mt-1">
                          Suspicious activity detected • Level: {cauldron.level}%
                        </div>
                      </div>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                  </div>
                ))}
              {anomalies === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No suspicious activity detected
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cauldron-cyan" />
              Agent Workflow
            </h3>

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
          </div>

          {/* Collection Events - Overview Requirement: "Identifies collection events" */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Collection Events
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Courier witches collecting potion from cauldrons (Active Drains)
            </p>
            <div className="space-y-2">
              {cauldrons
                .filter(c => c.isDraining)
                .map(cauldron => (
                  <div
                    key={cauldron.id}
                    className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-yellow-400">
                          {cauldron.name}
                        </span>
                        <div className="text-xs text-gray-400 mt-1">
                          Collection in progress • Level: {cauldron.level}%
                        </div>
                      </div>
                      <Zap className="w-4 h-4 text-yellow-400" />
                    </div>
                  </div>
                ))}
              {activeDrains === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No active collection events
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
              // Use real matching data from API (EOG Requirement: Dynamic Ticket Matching)
              const matchedDrain = ticket.matched_drain
              const volumeDifference = ticket.volume_difference || 0
              const expectedVolume = matchedDrain?.expected_total_volume || (ticket.volume_liters || ticket.volume)
              const levelDrop = matchedDrain?.level_drop || 0
              const continuousFill = matchedDrain?.potion_generated_during_drain || 0
              const drainDuration = matchedDrain?.duration_minutes || 0
              
              // Determine status (from API matching algorithm)
              const status = ticket.status || 'unknown'
              const isMismatch = status === 'mismatch'
              const isMissing = status === 'missing_drain' || status === 'missing'
              const isMatched = status === 'matched'

              return (
                <motion.div
                  key={ticket.id || ticket.ticket_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`p-4 rounded-lg border ${
                    isMatched
                      ? 'border-green-500/30 bg-green-500/10'
                      : isMismatch
                      ? 'border-yellow-500/30 bg-yellow-500/10'
                      : 'border-red-500/30 bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-200">
                        {ticket.ticket_id || `Ticket #${ticket.id}`}
                      </span>
                      {isMatched && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {isMismatch && (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      )}
                      {(isMissing || status === 'missing_drain') && (
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

                  {/* EOG Requirement: Discrepancy Detection - Match tickets to drain events, verify volumes */}
                  {isMismatch && matchedDrain && (
                    <div className="mt-3 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <div className="text-xs text-yellow-400 font-semibold">Inconsistency Detected - Unlogged Potion Possible</div>
                      </div>
                      <div className="text-xs text-gray-300 space-y-1">
                        <div>Ticket Volume: <span className="font-semibold">{ticket.volume_liters || ticket.volume}L</span></div>
                        <div>Expected Volume: <span className="font-semibold">{expectedVolume.toFixed(1)}L</span></div>
                        <div className="flex items-center gap-2">
                          <span>• Level Drop: {levelDrop > 0 ? levelDrop.toFixed(1) : '0.0'}L</span>
                          <span>• Continuous Fill: {continuousFill.toFixed(1)}L</span>
                        </div>
                        {drainDuration > 0 && (
                          <div className="text-gray-400">
                            • Drain Duration: {drainDuration.toFixed(1)} min
                          </div>
                        )}
                        <div className="text-yellow-400 font-semibold">
                          Difference: {volumeDifference.toFixed(1)}L - Potential unlogged potion drain
                        </div>
                      </div>
                    </div>
                  )}

                  {(isMissing || status === 'missing_drain') && (
                    <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <div className="text-xs text-red-400 font-semibold">Missing Ticket - Unlogged Potion Drain Detected</div>
                      </div>
                      <div className="text-xs text-gray-300">
                        A drain event was detected but no corresponding transport ticket was found. This indicates unlogged potion collection.
                      </div>
                    </div>
                  )}

                  {isMatched && matchedDrain && (
                    <div className="mt-2 text-xs text-gray-400 space-y-1">
                      <div>✓ Matched to drain event on {ticket.date}</div>
                      <div className="text-gray-500">
                        Drain: {new Date(matchedDrain.start_time).toLocaleTimeString()} - {new Date(matchedDrain.end_time).toLocaleTimeString()}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 text-xs">
                    <span
                      className={`px-2 py-1 rounded ${
                        isMatched
                          ? 'bg-green-500/20 text-green-400'
                          : isMismatch
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {isMatched
                        ? 'Matched'
                        : isMismatch
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
            {/* Leaflet Map Container */}
            {(() => {
              const validCauldrons = cauldrons.filter(c => c.latitude && c.longitude)
              if (validCauldrons.length === 0) {
                return (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    No cauldron data available
                  </div>
                )
              }
              
              // Calculate bounds including all cauldrons and the market
              const allLats = [...validCauldrons.map(c => c.latitude), ENCHANTED_MARKET_LAT]
              const allLngs = [...validCauldrons.map(c => c.longitude), ENCHANTED_MARKET_LNG]
              
              const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2
              const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2
              
              // Create custom icons
              const createCauldronIcon = (color, size = 20) => {
                return L.divIcon({
                  className: 'custom-cauldron-icon',
                  html: `<div style="
                    width: ${size}px;
                    height: ${size}px;
                    border-radius: 50%;
                    background-color: ${color};
                    border: 3px solid #1a1a1f;
                    box-shadow: 0 0 10px ${color}80;
                  "></div>`,
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                })
              }
              
              const marketIcon = L.divIcon({
                className: 'custom-market-icon',
                html: `<div style="
                  width: 30px;
                  height: 30px;
                  border-radius: 50%;
                  background-color: #8b5cf6;
                  border: 3px solid #ec4899;
                  box-shadow: 0 0 15px #8b5cf680, 0 0 25px #ec489980;
                  animation: pulse 2s infinite;
                "></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
              })
              
              return (
                <MapContainer
                  center={[centerLat, centerLng]}
                  zoom={11}
                  style={{ height: '100%', width: '100%', zIndex: 0 }}
                  className="rounded-lg"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  {/* Enchanted Market marker */}
                  <Marker position={[ENCHANTED_MARKET_LAT, ENCHANTED_MARKET_LNG]} icon={marketIcon}>
                    <Popup>
                      <div className="text-center">
                        <div className="font-bold text-purple-400 text-lg mb-1">🏪 Enchanted Market</div>
                        <div className="text-sm text-gray-300">Sales Point</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {ENCHANTED_MARKET_LAT.toFixed(4)}, {ENCHANTED_MARKET_LNG.toFixed(4)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  
                  {/* Cauldron markers */}
                  {validCauldrons.map((cauldron) => {
                    const level = cauldron.level || (cauldron.fill_level_liters / cauldron.capacity_liters) * 100
                    const color = cauldron.hasAnomaly 
                      ? '#ef4444' 
                      : level > 80 
                      ? '#eab308' 
                      : level > 50 
                      ? '#06b6d4' 
                      : '#8b5cf6'
                    
                    const iconSize = level > 80 ? 24 : 20
                    const icon = createCauldronIcon(color, iconSize)
                    
                    return (
                      <Marker
                        key={cauldron.cauldron_id || cauldron.id}
                        position={[cauldron.latitude, cauldron.longitude]}
                        icon={icon}
                        eventHandlers={{
                          click: () => setSelectedCauldron(cauldron),
                        }}
                      >
                        <Popup>
                          <div className="text-center min-w-[150px]">
                            <div className="font-bold text-gray-200 mb-1">{cauldron.name}</div>
                            <div className="text-sm text-gray-300">
                              Level: <span className="font-semibold">{Math.round(level)}%</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {cauldron.fill_level_liters?.toFixed(1) || 'N/A'} / {cauldron.capacity_liters?.toFixed(1) || 'N/A'} L
                            </div>
                            {cauldron.hasAnomaly && (
                              <div className="text-xs text-red-400 font-semibold mt-1">⚠ Anomaly Detected</div>
                            )}
                            {cauldron.isDraining && (
                              <div className="text-xs text-yellow-400 font-semibold mt-1">⚡ Draining</div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {cauldron.latitude.toFixed(4)}, {cauldron.longitude.toFixed(4)}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  })}
                  
                  {/* Connection lines from cauldrons to market */}
                  {validCauldrons.map((cauldron) => {
                    const level = cauldron.level || (cauldron.fill_level_liters / cauldron.capacity_liters) * 100
                    const color = cauldron.hasAnomaly 
                      ? '#ef4444' 
                      : level > 80 
                      ? '#eab308' 
                      : level > 50 
                      ? '#06b6d4' 
                      : '#8b5cf6'
                    
                    const travelTime = getTravelTimeToMarket(cauldron)
                    
                    // Calculate midpoint for label placement
                    const midLat = (cauldron.latitude + ENCHANTED_MARKET_LAT) / 2
                    const midLng = (cauldron.longitude + ENCHANTED_MARKET_LNG) / 2
                    
                    // Create custom icon for travel time label
                    const travelTimeIcon = L.divIcon({
                      className: 'travel-time-label',
                      html: `<div style="
                        background: rgba(15, 15, 20, 0.95);
                        backdrop-filter: blur(10px);
                        border: 2px solid ${color};
                        border-radius: 6px;
                        padding: 4px 8px;
                        color: ${color};
                        font-weight: bold;
                        font-size: 12px;
                        white-space: nowrap;
                        box-shadow: 0 0 10px ${color}80;
                        text-align: center;
                      ">${travelTime.toFixed(1)} min</div>`,
                      iconSize: [null, null],
                      iconAnchor: [0, 0],
                    })
                    
                    return (
                      <>
                        <Polyline
                          key={`line-${cauldron.cauldron_id || cauldron.id}`}
                          positions={[
                            [cauldron.latitude, cauldron.longitude],
                            [ENCHANTED_MARKET_LAT, ENCHANTED_MARKET_LNG]
                          ]}
                          pathOptions={{
                            color: color,
                            weight: 2,
                            opacity: 0.4,
                            dashArray: '5, 5',
                          }}
                          eventHandlers={{
                            mouseover: (e) => {
                              e.target.setStyle({
                                opacity: 0.8,
                                weight: 3,
                              })
                            },
                            mouseout: (e) => {
                              e.target.setStyle({
                                opacity: 0.4,
                                weight: 2,
                              })
                            },
                          }}
                        >
                          <LeafletTooltip 
                            permanent={false} 
                            direction="center" 
                            className="travel-time-tooltip"
                            interactive={true}
                            sticky={true}
                          >
                            <div className="text-center">
                              <div className="font-semibold text-gray-200">
                                {cauldron.name} → Market
                              </div>
                              <div className="text-sm text-purple-300 font-bold">
                                {travelTime.toFixed(1)} min
                              </div>
                            </div>
                          </LeafletTooltip>
                        </Polyline>
                        {/* Travel time label at midpoint */}
                        <Marker
                          key={`label-${cauldron.cauldron_id || cauldron.id}`}
                          position={[midLat, midLng]}
                          icon={travelTimeIcon}
                          interactive={false}
                        />
                      </>
                    )
                  })}
                </MapContainer>
              )
            })()}
            
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
                  onChange={async (e) => {
                    const newDate = e.target.value
                    setHistoryDate(newDate)
                    // Fetch historical data for the selected date
                    try {
                      const historicalData = await api.fetchHistoricalCauldrons(newDate)
                      setHistoricalData(historicalData)
                    } catch (err) {
                      console.error('Error fetching historical data:', err)
                    }
                  }}
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
                  {historicalData.cauldrons && historicalData.cauldrons.length > 0 ? (
                    historicalData.cauldrons.map((cauldron) => (
                      <div
                        key={cauldron.cauldron_id}
                        className="p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                      >
                        <div className="text-xs font-semibold text-gray-300 mb-1">
                          {cauldron.name}
                        </div>
                        <div className="text-lg font-bold text-cauldron-purple">
                          {cauldron.level}%
                        </div>
                        <div className="text-xs text-gray-400">
                          {cauldron.fill_level_liters.toFixed(1)}L / {cauldron.capacity_liters.toFixed(1)}L
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      {cauldrons.length > 0 ? 'Loading historical data...' : 'No historical data available'}
                    </div>
                  )}
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

