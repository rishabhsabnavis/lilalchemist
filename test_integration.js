/**
 * Integration test script for PotionMaster
 * Tests the full flow: Frontend → FastAPI → EOG API
 */

const API_BASE_URL = 'http://localhost:8000';

async function testIntegration() {
  console.log('='.repeat(60));
  console.log('🧪 Testing Full Integration: Frontend → FastAPI → EOG API');
  console.log('='.repeat(60));
  console.log();

  const tests = [];

  // Test 1: FastAPI Health Check
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    const data = await response.json();
    tests.push({
      name: 'FastAPI Health Check',
      status: response.ok ? '✅ PASS' : '❌ FAIL',
      details: data
    });
  } catch (error) {
    tests.push({
      name: 'FastAPI Health Check',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 2: Cauldrons Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/cauldrons`);
    const data = await response.json();
    tests.push({
      name: 'Cauldrons Endpoint',
      status: response.ok && data.length > 0 ? '✅ PASS' : '❌ FAIL',
      details: `Fetched ${data.length} cauldrons from EOG API`
    });
  } catch (error) {
    tests.push({
      name: 'Cauldrons Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 3: Tickets Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets?limit=5`);
    const data = await response.json();
    tests.push({
      name: 'Tickets Endpoint',
      status: response.ok ? '✅ PASS' : '❌ FAIL',
      details: `Fetched ${data.length} tickets from EOG API`
    });
  } catch (error) {
    tests.push({
      name: 'Tickets Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 4: Historical Data Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/historical/cauldrons`);
    const data = await response.json();
    tests.push({
      name: 'Historical Data Endpoint',
      status: response.ok && data.cauldrons ? '✅ PASS' : '❌ FAIL',
      details: `Fetched historical data for ${data.date}`
    });
  } catch (error) {
    tests.push({
      name: 'Historical Data Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 5: Anomalies Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/anomalies`);
    const data = await response.json();
    tests.push({
      name: 'Anomalies Endpoint',
      status: response.ok ? '✅ PASS' : '❌ FAIL',
      details: `Found ${data.length} anomalies`
    });
  } catch (error) {
    tests.push({
      name: 'Anomalies Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 6: Forecasts Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/forecasts`);
    const data = await response.json();
    tests.push({
      name: 'Forecasts Endpoint',
      status: response.ok ? '✅ PASS' : '❌ FAIL',
      details: `Generated ${data.length} forecasts`
    });
  } catch (error) {
    tests.push({
      name: 'Forecasts Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Test 7: Routes Endpoint
  try {
    const response = await fetch(`${API_BASE_URL}/api/routes`);
    const data = await response.json();
    tests.push({
      name: 'Routes Endpoint',
      status: response.ok ? '✅ PASS' : '❌ FAIL',
      details: `Generated ${data.length} routes`
    });
  } catch (error) {
    tests.push({
      name: 'Routes Endpoint',
      status: '❌ FAIL',
      details: error.message
    });
  }

  // Print results
  console.log('Test Results:');
  console.log('-'.repeat(60));
  tests.forEach(test => {
    console.log(`${test.status} ${test.name}`);
    console.log(`   ${test.details}`);
    console.log();
  });

  const passed = tests.filter(t => t.status.includes('✅')).length;
  const total = tests.length;

  console.log('='.repeat(60));
  console.log(`Summary: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));
  console.log();

  if (passed === total) {
    console.log('🎉 All integration tests passed!');
    console.log('✅ Frontend → FastAPI → EOG API integration is working correctly');
    console.log();
    console.log('📝 Next steps:');
    console.log('   1. Open http://localhost:5173 in your browser');
    console.log('   2. Verify the dashboard loads with real EOG data');
    console.log('   3. Check that data updates every 5 seconds');
  } else {
    console.log('⚠️  Some tests failed. Check the details above.');
  }
}

// Run tests
testIntegration().catch(console.error);

