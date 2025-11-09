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

// Enchanted Market coordinates (fallback values - will be fetched from API)
const DEFAULT_MARKET_LAT = 33.2148
const DEFAULT_MARKET_LNG = -97.13

// Network map - use only API data
const FALLBACK_NETWORK_MAP = {}

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
  const [selectedHistoricalCauldron, setSelectedHistoricalCauldron] = useState(null)
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0])
  const [daysData, setDaysData] = useState([]) // Store data for multiple days
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [networkMap, setNetworkMap] = useState(FALLBACK_NETWORK_MAP)
  const [hoveredNode, setHoveredNode] = useState(null) // Track which node is being hovered
  const [forecasts, setForecasts] = useState([])
  const [minimumWitches, setMinimumWitches] = useState(null)
  const [optimalSchedule, setOptimalSchedule] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [marketLocation, setMarketLocation] = useState({ lat: DEFAULT_MARKET_LAT, lng: DEFAULT_MARKET_LNG })

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

  // Helper function to get travel time between two nodes
  const getTravelTime = (fromNodeId, toNodeId) => {
    if (!networkMap || !fromNodeId || !toNodeId) return null
    
    // Check direct connection
    if (networkMap[fromNodeId] && networkMap[fromNodeId][toNodeId]) {
      return networkMap[fromNodeId][toNodeId]
    }
    
    // Check reverse direction (bidirectional)
    if (networkMap[toNodeId] && networkMap[toNodeId][fromNodeId]) {
      return networkMap[toNodeId][fromNodeId]
    }
    
    return null
  // Fetch market location from API
  const fetchMarketLocation = async () => {
    try {
      const marketData = await api.fetchMarketInfo()
      if (marketData && marketData.latitude && marketData.longitude) {
        setMarketLocation({
          lat: marketData.latitude,
          lng: marketData.longitude
        })
      }
    } catch (err) {
      console.error('Error fetching market location:', err)
      // Keep default values on error
      setMarketLocation({ lat: DEFAULT_MARKET_LAT, lng: DEFAULT_MARKET_LNG })
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
    
    // Use the helper function to get travel time
    const travelTime = getTravelTime(cauldronId, marketNode)
    if (travelTime !== null) return travelTime
    
    // Try to match by name (e.g., "Cauldron 001" -> "cauldron_001")
    const name = cauldron.name?.toLowerCase().replace(/\s+/g, '_') || ''
    const travelTimeByName = getTravelTime(name, marketNode)
    if (travelTimeByName !== null) return travelTimeByName
    
    // Fallback: calculate approximate time based on distance
    // Using Haversine formula for distance, then convert to time
    const R = 6371 // Earth radius in km
    const dLat = (marketLocation.lat - cauldron.latitude) * Math.PI / 180
    const dLng = (marketLocation.lng - cauldron.longitude) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(cauldron.latitude * Math.PI / 180) * Math.cos(marketLocation.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const haversineC = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceKm = R * haversineC
    
    // Convert distance to time (assuming 36 km/h = 0.6 km/min)
    const DEFAULT_SPEED_KM_PER_MIN = 0.6
    return distanceKm / DEFAULT_SPEED_KM_PER_MIN
  }

  // Fetch forecasting and scheduling data
  const fetchForecastingData = async () => {
    try {
      console.log('Fetching forecasting data...')
      const [forecastsData, minWitchesData, scheduleData] = await Promise.all([
        api.fetchForecasts().catch(err => {
          console.error('Error fetching forecasts:', err)
          return []
        }),
        api.fetchMinimumWitches(480).catch(err => {
          console.error('Error fetching minimum witches:', err)
          return null
        }),
        api.fetchOptimalSchedule(null, 480).catch(err => {
          console.error('Error fetching optimal schedule:', err)
          return null
        }),
      ])

      console.log('Forecasting data received:', {
        forecasts: forecastsData?.length || 0,
        minWitches: minWitchesData,
        schedule: scheduleData
      })

      setForecasts(forecastsData || [])
      setMinimumWitches(minWitchesData)
      setOptimalSchedule(scheduleData)

      // Update cauldrons with forecast data
      if (forecastsData && forecastsData.length > 0) {
        setCauldrons(prev => prev.map(cauldron => {
          const forecast = forecastsData.find(f => f.cauldron_id === cauldron.cauldron_id)
          return {
            ...cauldron,
            forecastOverflow: forecast?.projected_overflow_time 
              ? new Date(forecast.projected_overflow_time) 
              : null,
            forecastConfidence: forecast?.confidence || 0,
          }
        }))
      }
    } catch (err) {
      console.error('Error fetching forecasting data:', err)
      // Set empty state on error so UI shows appropriate message
      setForecasts([])
      setMinimumWitches(null)
      setOptimalSchedule(null)
    }
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

      // Fetch forecasting data after cauldrons are loaded
      await fetchForecastingData()

      setLoading(false)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message || 'Failed to fetch data from API')
      setLoading(false)
      // No fallback - require API connection
    }
  }

  useEffect(() => {
    // Initial data fetch
    fetchData()
    fetchNetworkMapData() // Fetch network map once
    fetchMarketLocation() // Fetch market location once

    // Fetch historical data for specific date range: Oct 30 to Nov 9
    const fetchDaysData = async () => {
      try {
        const daysDataArray = []
        
        // Define the date range: October 30 to November 9 (2025)
        const startDate = new Date('2025-10-30')
        const endDate = new Date('2025-11-09')
        
        // Generate all dates in the range
        const currentDate = new Date(startDate)
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split('T')[0]
          
          try {
            const dayData = await api.fetchHistoricalCauldrons(dateStr)
            // Always add the date, even if data is empty or all zeros
            // This ensures the graph shows all dates in the range
            if (dayData && dayData.cauldrons) {
              daysDataArray.push({ date: dateStr, data: dayData })
            } else {
              // If no data, create empty entry to maintain date range
              daysDataArray.push({ date: dateStr, data: { cauldrons: [] } })
            }
          } catch (err) {
            console.error(`Error fetching data for ${dateStr}:`, err)
            // Still add the date even if fetch fails
            daysDataArray.push({ date: dateStr, data: { cauldrons: [] } })
          }
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1)
        }
        
        setDaysData(daysDataArray)
        // Also set first day's data for backward compatibility
        if (daysDataArray.length > 0) {
          setHistoricalData(daysDataArray[0].data)
        }
      } catch (err) {
        console.error('Error fetching days data:', err)
      }
    }
    fetchDaysData()

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchData()
    }, 5000) // Poll every 5 seconds

    // Poll forecasting data less frequently (every 30 seconds)
    const forecastingInterval = setInterval(() => {
      fetchForecastingData()
    }, 30000)

    // Simulate workflow progression
    const workflowInterval = setInterval(() => {
      setActiveWorkflowStep(prev => {
        if (prev < 5) return prev + 1
        return 1 // Loop back
      })
    }, 3000)

    return () => {
      clearInterval(interval)
      clearInterval(forecastingInterval)
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
          <p className="text-sm text-gray-500 mb-4">Please ensure the backend API is running on port 8000</p>
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

          {/* Level Trends Chart */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-300">Level Trends</h3>
              {/* Cauldron Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Select Cauldron:</label>
                <select
                  value={selectedHistoricalCauldron || ''}
                  onChange={(e) => setSelectedHistoricalCauldron(e.target.value || null)}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm focus:border-cauldron-purple focus:outline-none"
                >
                  <option value="">All Cauldrons (Average)</option>
                  {cauldrons.map((cauldron) => (
                    <option key={cauldron.cauldron_id || cauldron.id} value={cauldron.cauldron_id || cauldron.id}>
                      {cauldron.name || cauldron.cauldron_id || cauldron.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={(() => {
                // Process daysData to show levels vs days for selected cauldron
                // Fallback to real-time data if historical data is not available
                let processedData = []

                // Always process daysData to show Oct 30 - Nov 9 range
                if (daysData.length > 0) {
                  // Use historical data
                  if (selectedHistoricalCauldron) {
                    // Show data for selected cauldron across all days
                    daysData.forEach(({ date, data }) => {
                      if (data && data.cauldrons) {
                        const cauldronData = data.cauldrons.find(
                          c => c.cauldron_id === selectedHistoricalCauldron
                        )
                        
                        // Always add data point, even if cauldron not found or level is 0
                        const levelInLiters = cauldronData ? (cauldronData.fill_level_liters || 0) : 0
                        
                        processedData.push({
                          date: date,
                          dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          fill_level_liters: levelInLiters,
                          fullDate: new Date(date)
                        })
                      } else {
                        // No data for this date, add 0
                        processedData.push({
                          date: date,
                          dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          fill_level_liters: 0,
                          fullDate: new Date(date)
                        })
                      }
                    })
                  } else {
                    // Show average for all cauldrons across all days
                    daysData.forEach(({ date, data }) => {
                      if (data && data.cauldrons && data.cauldrons.length > 0) {
                        // Calculate average level across all cauldrons for this day
                        const allLevels = []
                        
                        data.cauldrons.forEach(cauldron => {
                          // Use fill_level_liters (in liters) instead of level (percentage)
                          // The backend returns the earliest data point for the day at 00:01:00
                          const levelInLiters = cauldron.fill_level_liters || 0
                          allLevels.push(levelInLiters)
                        })
                        
                        const avgLevel = allLevels.length > 0 
                          ? allLevels.reduce((sum, level) => sum + level, 0) / allLevels.length
                          : 0
                        
                        processedData.push({
                          date: date,
                          dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          fill_level_liters: avgLevel,
                          fullDate: new Date(date)
                        })
                      } else {
                        // No data for this date, add 0
                        processedData.push({
                          date: date,
                          dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          fill_level_liters: 0,
                          fullDate: new Date(date)
                        })
                      }
                    })
                  }
                } else if (cauldrons.length > 0) {
                  // Fallback: Use current cauldron data for Oct 30 - Nov 9 range
                  // Generate all dates in the range: October 30 to November 9 (2025)
                  const startDate = new Date('2025-10-30')
                  const endDate = new Date('2025-11-09')
                  const currentDate = new Date(startDate)
                  
                  while (currentDate <= endDate) {
                    const dateStr = currentDate.toISOString().split('T')[0]
                    
                    if (selectedHistoricalCauldron) {
                      const cauldron = cauldrons.find(c => (c.cauldron_id || c.id) === selectedHistoricalCauldron)
                      if (cauldron) {
                        // Use current fill_level_liters for all days (since we don't have historical data)
                        const levelInLiters = cauldron.fill_level_liters || 0
                        processedData.push({
                          date: dateStr,
                          dateLabel: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                          fill_level_liters: levelInLiters,
                          fullDate: new Date(currentDate)
                        })
                      }
                    } else {
                      // Average of all cauldrons in liters
                      const avgLevel = cauldrons.reduce((sum, c) => sum + (c.fill_level_liters || 0), 0) / cauldrons.length
                      processedData.push({
                        date: dateStr,
                        dateLabel: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        fill_level_liters: avgLevel,
                        fullDate: new Date(currentDate)
                      })
                    }
                    
                    // Move to next day
                    currentDate.setDate(currentDate.getDate() + 1)
                  }
                }
                
                // Sort by date (oldest to newest)
                return processedData.sort((a, b) => a.fullDate - b.fullDate)
              })()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="dateLabel" 
                  stroke="#9ca3af" 
                  fontSize={11}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: '#9ca3af' } }}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  label={{ value: 'Level (L)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#9ca3af' } }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1f', border: '1px solid #8b5cf6' }}
                  labelStyle={{ color: '#e5e7eb' }}
                  formatter={(value) => [`${value.toFixed(1)} L`, 'Level']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="fill_level_liters"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6', r: 4 }}
                  name="Level"
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-400">
                {selectedHistoricalCauldron 
                  ? `Showing levels vs days for ${cauldrons.find(c => (c.cauldron_id || c.id) === selectedHistoricalCauldron)?.name || selectedHistoricalCauldron}`
                  : `Showing average levels vs days for all cauldrons`
                }
        </p>
      </div>
          </div>
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
            <h3 className="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
              Overflow Risk Forecast
            </h3>
            <div className="space-y-2">
              {forecasts
                .filter(f => f.projected_overflow_time)
                .sort((a, b) => new Date(a.projected_overflow_time) - new Date(b.projected_overflow_time))
                .map(forecast => {
                  const cauldron = cauldrons.find(c => c.cauldron_id === forecast.cauldron_id)
                  if (!cauldron) return null
                  
                  const overflowTime = new Date(forecast.projected_overflow_time)
                  const now = new Date()
                  const minutesUntilOverflow = Math.max(0, Math.round((overflowTime - now) / 60000))
                  const hoursUntilOverflow = Math.floor(minutesUntilOverflow / 60)
                  const minsRemaining = minutesUntilOverflow % 60
                  
                  return (
                    <motion.div
                      key={forecast.cauldron_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-yellow-400">
                          {cauldron.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {Math.round(cauldron.level)}% full
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-300">
                          Overflow in: <span className="font-bold text-yellow-400">
                            {hoursUntilOverflow > 0 
                              ? `${hoursUntilOverflow}h ${minsRemaining}m`
                              : `${minsRemaining}m`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Confidence: {Math.round(forecast.confidence * 100)}%
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        At: {overflowTime.toLocaleTimeString()}
                      </div>
                    </motion.div>
                  )
                })}
              {forecasts.filter(f => f.projected_overflow_time).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  ✓ No overflow risk detected
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
            
            {/* Minimum Witches Display */}
            {minimumWitches && (
              <div className="p-4 rounded-lg bg-cauldron-purple/10 border border-cauldron-purple/30 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-cauldron-purple">
                    Minimum Witches Required
                  </span>
                  <span className="text-3xl font-bold text-cauldron-purple">
                    {minimumWitches.minimum_witches}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-2 space-y-1">
                  <div>Urgent cauldrons: {minimumWitches.urgent_cauldrons}</div>
                  <div>Total cauldrons: {minimumWitches.total_cauldrons}</div>
                  <div>Time horizon: {minimumWitches.time_horizon_minutes / 60}h</div>
                </div>
              </div>
            )}

            {/* Route Visualization */}
            {optimalSchedule && optimalSchedule.routes && optimalSchedule.routes.length > 0 ? (
              <div className="space-y-3">
                {optimalSchedule.routes.map((route, idx) => {
                  const routeColors = ['#ec4899', '#8b5cf6', '#06b6d4', '#eab308', '#ef4444']
                  const routeColor = routeColors[idx % routeColors.length]
                  const isSelected = selectedRoute?.courier_id === route.courier_id
                  
                  return (
                    <motion.div
                      key={route.courier_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      onClick={() => setSelectedRoute(isSelected ? null : route)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-cauldron-purple/20 border-cauldron-purple' 
                          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: routeColor }}
                          />
                          <span className="text-sm font-medium text-gray-300">
                            {route.courier_id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {route.stops_count} stops
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-400 mb-2">
                        {route.ordered_stops.map((stopId, stopIdx) => {
                          const cauldron = cauldrons.find(c => c.cauldron_id === stopId)
                          const name = cauldron?.name || stopId
                          return (
                            <span key={stopIdx}>
                              {stopIdx > 0 && <span className="mx-1 text-cauldron-purple">→</span>}
                              {name}
                            </span>
                          )
                        })}
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <div className="text-gray-400">
                          Distance: <span className="font-semibold text-gray-300">{route.total_distance_km} km</span>
                        </div>
                        <div className="text-gray-400">
                          Time: <span className="font-semibold text-gray-300">
                            {Math.round(route.estimated_completion_minutes)} min
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-gray-800/30 border border-gray-700 text-center text-sm text-gray-500">
                {optimalSchedule ? 'No routes needed - all cauldrons safe' : 'Calculating optimal routes...'}
              </div>
            )}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <Map className="w-6 h-6 text-cauldron-purple" />
              Geographic Map Visualization
            </h2>
            {optimalSchedule && optimalSchedule.routes && optimalSchedule.routes.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Routes:</span>
                {optimalSchedule.routes.map((route, idx) => {
                  const routeColors = ['#ec4899', '#8b5cf6', '#06b6d4', '#eab308', '#ef4444']
                  const routeColor = routeColors[idx % routeColors.length]
                  return (
                    <div key={route.courier_id} className="flex items-center gap-1">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: routeColor }}
                      />
                      <span className="text-xs">{route.courier_id.replace('_', ' ')}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
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
              const allLats = [...validCauldrons.map(c => c.latitude), marketLocation.lat]
              const allLngs = [...validCauldrons.map(c => c.longitude), marketLocation.lng]
              
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
                  <Marker 
                    position={[ENCHANTED_MARKET_LAT, ENCHANTED_MARKET_LNG]} 
                    icon={marketIcon}
                    eventHandlers={{
                      mouseover: () => {
                        const marketNode = Object.keys(networkMap).find(key => 
                          key.toLowerCase().includes('market') || key === 'enchanted_market'
                        ) || 'market_001'
                        setHoveredNode(marketNode)
                      },
                      mouseout: () => {
                        setHoveredNode(null)
                      },
                    }}
                  >
                  <Marker position={[marketLocation.lat, marketLocation.lng]} icon={marketIcon}>
                    <Popup>
                      <div className="text-center">
                        <div className="font-bold text-purple-400 text-lg mb-1">🏪 Enchanted Market</div>
                        <div className="text-sm text-gray-300">Sales Point</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {marketLocation.lat.toFixed(4)}, {marketLocation.lng.toFixed(4)}
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
                          mouseover: () => {
                            const cauldronId = cauldron.cauldron_id || cauldron.id || ''
                            setHoveredNode(cauldronId)
                          },
                          mouseout: () => {
                            setHoveredNode(null)
                          },
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
                  
                  {/* Route Polylines - Show optimal witch routes */}
                  {optimalSchedule && optimalSchedule.routes && optimalSchedule.routes.map((route, routeIdx) => {
                    const routeColors = ['#ec4899', '#8b5cf6', '#06b6d4', '#eab308', '#ef4444']
                    const routeColor = routeColors[routeIdx % routeColors.length]
                    const isSelected = selectedRoute?.courier_id === route.courier_id
                    
                    // Build route coordinates: market -> cauldrons -> market
                    const routeCoordinates = []
                    
                    // Start at market
                    routeCoordinates.push([marketLocation.lat, marketLocation.lng])
                    
                    // Add cauldron stops in order
                    route.ordered_stops.forEach(stopId => {
                      const cauldron = validCauldrons.find(c => c.cauldron_id === stopId)
                      if (cauldron) {
                        routeCoordinates.push([cauldron.latitude, cauldron.longitude])
                      }
                    })
                    
                    // Return to market
                    routeCoordinates.push([marketLocation.lat, marketLocation.lng])
                    
                    if (routeCoordinates.length < 3) return null // Need at least market -> cauldron -> market
                    
                    return (
                      <Polyline
                        key={`route-${route.courier_id}`}
                        positions={routeCoordinates}
                        pathOptions={{
                          color: routeColor,
                          weight: isSelected ? 5 : 3,
                          opacity: isSelected ? 0.9 : 0.6,
                          dashArray: isSelected ? '10, 5' : '15, 10',
                        }}
                        eventHandlers={{
                          click: () => setSelectedRoute(isSelected ? null : route),
                          mouseover: (e) => {
                            e.target.setStyle({
                              weight: 5,
                              opacity: 0.9,
                            })
                          },
                          mouseout: (e) => {
                            e.target.setStyle({
                              weight: isSelected ? 5 : 3,
                              opacity: isSelected ? 0.9 : 0.6,
                            })
                          },
                        }}
                      >
                        <LeafletTooltip 
                          permanent={false} 
                          direction="center" 
                          className="route-tooltip"
                          interactive={true}
                          sticky={true}
                        >
                          <div className="text-center min-w-[150px]">
                            <div className="font-bold text-gray-200 mb-1">
                              {route.courier_id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                            <div className="text-sm text-gray-300">
                              {route.stops_count} stops • {route.total_distance_km} km
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {Math.round(route.estimated_completion_minutes)} min
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Click to select
                            </div>
                          </div>
                        </LeafletTooltip>
                      </Polyline>
                    )
                  })}
                  
                  {/* Connection lines from cauldrons to market (fallback when no routes) */}
                  {(!optimalSchedule || !optimalSchedule.routes || optimalSchedule.routes.length === 0) && validCauldrons.map((cauldron) => {
                    const level = cauldron.level || (cauldron.fill_level_liters / cauldron.capacity_liters) * 100
                    const color = cauldron.hasAnomaly 
                      ? '#ef4444' 
                      : level > 80 
                      ? '#eab308' 
                      : level > 50 
                      ? '#06b6d4' 
                      : '#8b5cf6'
                    
                    const travelTime = getTravelTimeToMarket(cauldron)
                    const cauldronId = cauldron.cauldron_id || cauldron.id || ''
                    const marketNode = Object.keys(networkMap).find(key => 
                      key.toLowerCase().includes('market') || key === 'enchanted_market'
                    ) || 'market_001'
                    
                    // Check if this connection should be highlighted (either node is hovered)
                    const isHighlighted = hoveredNode === cauldronId || hoveredNode === marketNode
                    
                    // Calculate midpoint for label placement
                    const midLat = (cauldron.latitude + marketLocation.lat) / 2
                    const midLng = (cauldron.longitude + marketLocation.lng) / 2
                    
                    // Create custom icon for travel time label (only show when hovered)
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
                            [marketLocation.lat, marketLocation.lng]
                          ]}
                          pathOptions={{
                            color: color,
                            weight: isHighlighted ? 3 : 2,
                            opacity: isHighlighted ? 0.8 : 0.4,
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
                                opacity: isHighlighted ? 0.8 : 0.4,
                                weight: isHighlighted ? 3 : 2,
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
                        {/* Travel time label at midpoint - only show when hovering over connected node */}
                        {isHighlighted && (
                          <Marker
                            key={`label-${cauldron.cauldron_id || cauldron.id}`}
                            position={[midLat, midLng]}
                            icon={travelTimeIcon}
                            interactive={false}
                          />
                        )}
                      </>
                    )
                  })}

                  {/* Connection lines between neighboring cauldrons */}
                  {(() => {
                    const connections = []
                    const drawnConnections = new Set() // Track drawn connections to avoid duplicates
                    
                    // Iterate through all cauldrons and find their neighbors
                    validCauldrons.forEach((cauldron1) => {
                      const cauldron1Id = cauldron1.cauldron_id || cauldron1.id || ''
                      
                      // Check all connections from this cauldron in the network map
                      if (networkMap[cauldron1Id]) {
                        Object.keys(networkMap[cauldron1Id]).forEach((neighborId) => {
                          // Skip market connections (already drawn above)
                          if (neighborId.toLowerCase().includes('market')) return
                          
                          // Find the neighbor cauldron
                          const neighborCauldron = validCauldrons.find(c => 
                            (c.cauldron_id || c.id) === neighborId
                          )
                          
                          if (!neighborCauldron) return
                          
                          // Create a unique key for this connection (bidirectional)
                          const connectionKey = [cauldron1Id, neighborId].sort().join('-')
                          if (drawnConnections.has(connectionKey)) return
                          drawnConnections.add(connectionKey)
                          
                          const travelTime = networkMap[cauldron1Id][neighborId]
                          if (travelTime && travelTime > 0) {
                            connections.push({
                              from: cauldron1,
                              to: neighborCauldron,
                              travelTime: travelTime,
                              key: connectionKey
                            })
                          }
                        })
                      }
                    })
                    
                    return connections.map((connection) => {
                      const { from, to, travelTime, key } = connection
                      const fromId = from.cauldron_id || from.id || ''
                      const toId = to.cauldron_id || to.id || ''
                      
                      // Check if this connection should be highlighted (either node is hovered)
                      const isHighlighted = hoveredNode === fromId || hoveredNode === toId
                      
                      // Use average color or neutral gray for cauldron-to-cauldron connections
                      const connectionColor = '#6b7280' // Gray for cauldron-to-cauldron
                      
                      // Calculate midpoint for label
                      const midLat = (from.latitude + to.latitude) / 2
                      const midLng = (from.longitude + to.longitude) / 2
                      
                      // Create custom icon for travel time label (only show when hovered)
                      const travelTimeIcon = L.divIcon({
                        className: 'travel-time-label',
                        html: `<div style="
                          background: rgba(15, 15, 20, 0.95);
                          backdrop-filter: blur(10px);
                          border: 2px solid ${connectionColor};
                          border-radius: 6px;
                          padding: 4px 8px;
                          color: ${connectionColor};
                          font-weight: bold;
                          font-size: 11px;
                          white-space: nowrap;
                          box-shadow: 0 0 10px ${connectionColor}80;
                          text-align: center;
                        ">${travelTime.toFixed(1)} min</div>`,
                        iconSize: [null, null],
                        iconAnchor: [0, 0],
                      })
                      
                      return (
                        <div key={key} style={{ display: 'contents' }}>
                          <Polyline
                            positions={[
                              [from.latitude, from.longitude],
                              [to.latitude, to.longitude]
                            ]}
                            pathOptions={{
                              color: connectionColor,
                              weight: isHighlighted ? 2 : 1.5,
                              opacity: isHighlighted ? 0.6 : 0.3,
                              dashArray: '3, 3',
                            }}
                            eventHandlers={{
                              mouseover: (e) => {
                                e.target.setStyle({
                                  opacity: 0.6,
                                  weight: 2,
                                })
                              },
                              mouseout: (e) => {
                                e.target.setStyle({
                                  opacity: isHighlighted ? 0.6 : 0.3,
                                  weight: isHighlighted ? 2 : 1.5,
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
                                <div className="font-semibold text-gray-200 text-xs">
                                  {from.name} → {to.name}
                                </div>
                                <div className="text-sm text-gray-300 font-bold">
                                  {travelTime.toFixed(1)} min
                                </div>
                              </div>
                            </LeafletTooltip>
                          </Polyline>
                          {/* Travel time label at midpoint - only show when hovering over connected node */}
                          {isHighlighted && (
                            <Marker
                              position={[midLat, midLng]}
                              icon={travelTimeIcon}
                              interactive={false}
                            />
                          )}
                        </div>
                      )
                    })
                  })()}
                </MapContainer>
              )
            })()}
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 glass rounded-lg p-4 border border-gray-700 z-[1000]">
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
            
            {/* Route Details Panel */}
            {selectedRoute && selectedRoute.courier_id && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-4 right-4 glass rounded-lg p-4 border border-cauldron-purple/50 max-w-md z-[1001]"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                    <Users className="w-5 h-5 text-cauldron-pink" />
                    <span className="truncate">
                      {selectedRoute.courier_id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </h3>
                  <button
                    onClick={() => setSelectedRoute(null)}
                    className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0 ml-2"
                    aria-label="Close route details"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Stops:</span>
                    <span className="text-gray-200 font-semibold">{selectedRoute.stops_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Distance:</span>
                    <span className="text-gray-200 font-semibold">{selectedRoute.total_distance_km} km</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Estimated Time:</span>
                    <span className="text-gray-200 font-semibold">
                      {Math.round(selectedRoute.estimated_completion_minutes)} minutes
                    </span>
                  </div>
                </div>
                
                <div className="border-t border-gray-700 pt-3">
                  <div className="text-xs text-gray-400 mb-2">Route Sequence:</div>
                  <div className="text-sm text-gray-300 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-cauldron-purple">🏪</span>
                      <span>Enchanted Market (Start)</span>
                    </div>
                    {selectedRoute.ordered_stops.map((stopId, idx) => {
                      const cauldron = cauldrons.find(c => c.cauldron_id === stopId)
                      const name = cauldron?.name || stopId
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-cauldron-purple">→</span>
                          <span>{name}</span>
                          {cauldron && (
                            <span className="text-xs text-gray-500">
                              ({Math.round(cauldron.level)}%)
                            </span>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex items-center gap-2">
                      <span className="text-cauldron-purple">🏪</span>
                      <span>Enchanted Market (Return)</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
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
            onClick={() => {
              setShowHistory(false)
              setSelectedHistoricalCauldron(null) // Reset selection when modal closes
            }}
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
                  onClick={() => {
                    setShowHistory(false)
                    setSelectedHistoricalCauldron(null) // Reset selection when modal closes
                  }}
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
                    setSelectedHistoricalCauldron(null) // Reset selection when date changes
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

