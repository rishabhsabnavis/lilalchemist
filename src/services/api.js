/**
 * API service for PotionMaster frontend.
 * Connects to FastAPI backend at http://localhost:8000
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Fetch current cauldron levels
 */
export async function fetchCauldrons() {
  return fetchAPI('/api/cauldrons');
}

/**
 * Fetch transport tickets
 * @param {number} limit - Optional limit on number of tickets
 */
export async function fetchTickets(limit = null) {
  const params = limit ? `?limit=${limit}` : '';
  return fetchAPI(`/api/tickets${params}`);
}

/**
 * Fetch historical cauldron data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
export async function fetchHistoricalCauldrons(date) {
  const params = date ? `?date=${date}` : '';
  return fetchAPI(`/api/historical/cauldrons${params}`);
}

/**
 * Fetch current anomalies
 */
export async function fetchAnomalies() {
  return fetchAPI('/api/anomalies');
}

/**
 * Fetch overflow forecasts
 */
export async function fetchForecasts() {
  return fetchAPI('/api/forecasts');
}

/**
 * Fetch optimal courier routes
 */
export async function fetchRoutes() {
  return fetchAPI('/api/routes');
}

/**
 * Fetch network map with travel times
 */
export async function fetchNetworkMap() {
  return fetchAPI('/api/network-map');
}

/**
 * WebSocket connection for real-time updates
 */
export function createWebSocketConnection(onMessage, onError) {
  const wsUrl = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');
  const ws = new WebSocket(`${wsUrl}/ws`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };

  return ws;
}

