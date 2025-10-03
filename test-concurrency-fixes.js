
import { spawn } from 'child_process'

// Test script to validate concurrency fixes for hanging requests
console.log('🧪 Testing Concurrency Fixes for Hanging Requests...\n')

// Test configuration
const TEST_TIMEOUT = 30000 // 30 seconds
const SERVER_URL = 'http://localhost:3000'
const TEST_API_KEY = 'your-test-api-key-here'

// Test scenarios
const testScenarios = [
  {
    name: 'Standard streaming request',
    payload: {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Say "Hello, this is a streaming test." and count to 5 slowly.' }
      ],
      stream: true,
      max_tokens: 100
    },
    expectedDuration: 15000 // 15 seconds max
  },
  {
    name: 'Longer streaming request',
    payload: {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Write a brief explanation of how streaming works.' }
      ],
      stream: true,
      max_tokens: 200
    },
    expectedDuration: 25000 // 25 seconds max
  }
]

// Utility function to make HTTP request
function makeRequest(payload, requestId) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let chunks = []
    let isCompleted = false
    let receivedDone = false
    
    const curl = spawn('curl', [
      '-X', 'POST',
      `${SERVER_URL}/v1/chat/completions`,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${TEST_API_KEY}`,
      '-d', JSON.stringify(payload),
      '--no-buffer',
      '--max-time', '60', // 1 minute max for curl
      '--silent'
    ])
    
    let stdout = ''
    let stderr = ''
    
    curl.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      chunks.push(chunk)
      
      // Check for DONE marker
      if
      if (chunk.includes('[DONE]')) {
        console.log(`✅ Request ${requestId}: Streaming completed - DONE marker received`)
        receivedDone = true
        const endTime = Date.now()
        const duration = endTime - startTime
        
        // Analyze results
        console.log(`📊 Request ${requestId} Results:`)
        console.log(`  Duration: ${duration}ms`)
        console.log(`  Chunks received: ${chunks.length}`)
        console.log(`  Total response length: ${stdout.length} characters`)
      
        if (duration < TEST_TIMEOUT) {
          console.log(`✅ Request ${requestId}: SUCCESS - Stream terminated properly within timeout`)
          resolve({ success: true, duration, chunks: chunks.length, receivedDone, requestId })
        } else {
          console.log(`❌ Request ${requestId}: FAILED - Stream took too long to terminate`)
          resolve({ success: false, duration, chunks: chunks.length, error: 'timeout', requestId })
        }
      }
    })
    
    curl.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    curl.on('close', (code) => {
      const endTime = Date.now()
      const duration = endTime - startTime
      
      console.log(`🏁 Request ${requestId} Process ended with code: ${code}`)
      console.log(`⏱️ Request ${requestId} Total duration: ${duration}ms`)
      
      if (!receivedDone) {
        console.log(`❌ Request ${requestId}: FAILED - Stream did not complete properly`)
        resolve({ success: false, duration, chunks: chunks.length, error: 'incomplete', stderr, requestId })
      }
    })
    
    // Set overall test timeout
    setTimeout(() => {
      if (!receivedDone) {
        console.log(`⏰ Request ${requestId} TEST TIMEOUT: Killing curl process`)
        curl.kill('SIGTERM')
        resolve({ success: false, duration: TEST_TIMEOUT, chunks: chunks.length, error: 'test_timeout', requestId })
      }
    }, TEST_TIMEOUT)
  })
}

// Test single request
async function testSingleRequest(scenario) {
  console.log(`\n🧪 Running test: ${scenario.name}`)
  
  try {
    const result = await makeRequest(scenario.payload, Date.now().toString())
    
    if (result.success) {
      console.log(`✅ ${scenario.name} PASSED`)
      return { name: scenario.name, success: true, ...result }
    } else {
      console.log(`❌ ${scenario.name} FAILED: ${result.error}`)
      return { name: scenario.name, success: false, error: result.error, ...result }
    }
  } catch (error) {
    console.error(`💥 ${scenario.name} ERROR:`, error.message)
    return { name: scenario.name, success: false, error: error.message }
  }
}

// Test multiple concurrent requests
async function testConcurrentRequests(scenario, concurrency = 3) {
  console.log(`\n🚀 Running concurrent test: ${scenario.name} (${concurrency} requests)`)
  
  const promises = []
  const startTime = Date.now()
  
  // Launch multiple requests simultaneously
  for (let i = 0; i < concurrency; i++) {
    const requestId = `${Date.now()}-${i}`
    promises.push(makeRequest(scenario.payload, requestId))
    
    // Small delay between requests to simulate real usage
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  try {
    const results = await Promise.all(promises)
    const endTime = Date.now()
    const totalDuration = endTime - startTime
    
    const successCount = results.filter(r => r.success).length
    
    console.log(`📈 Concurrent test results:`)
    console.log(`  Total requests: ${concurrency}`)
    console.log(`  Successful: ${successCount}`)
    console.log(`  Failed: ${concurrency - successCount}`)
    console.log(`  Total duration: ${totalDuration}ms`)
    
    if (successCount === concurrency) {
      console.log(`✅ ${scenario.name} CONCURRENT PASSED`)
      return { 
        name: `${scenario.name} (concurrent)`, 
        success: true, 
        totalDuration, 
        successCount, 
        totalRequests: concurrency 
      }
    } else {
      console.log(`❌ ${scenario.name} CONCURRENT FAILED`)
      return { 
        name: `${scenario.name} (concurrent)`, 
        success: false, 
        totalDuration, 
        successCount, 
        totalRequests: concurrency 
      }
    }
  } catch (error) {
    console.error(`💥 ${scenario.name} CONCURRENT ERROR:`, error.message)
    return { 
      name: `${scenario.name} (concurrent)`, 
      success: false, 
      error: error.message 
    }
  }
}

// Test server health and concurrency metrics
async function testServerHealth() {
  console.log(`\n🏥 Testing server health and concurrency metrics...`)
  
  try {
    // Test basic health
    const healthResponse = await fetch(`${SERVER_URL}/health`)
    const healthData = await healthResponse.json()
    
    console.log(`✅ Basic health check: ${healthResponse.status}`)
    
    // Test concurrency health
    const concurrencyHealthResponse = await fetch(`${SERVER_URL}/concurrency/health`)
    const concurrencyHealth = await concurrencyHealthResponse.json()
    
    console.log(`✅ Concurrency health check: ${concurrencyHealthResponse.status}`)
    console.log(`📊 Concurrency status: ${concurrencyHealth.data.status}`)
    console.log(`📈 Active requests: ${concurrencyHealth.data.metrics.activeRequests}`)
    console.log(`⏱️ Average duration: ${concurrencyHealth.data.metrics.averageRequestDuration}ms`)
    
    if (concurrencyHealth.data.issues.length > 0) {
      console.log(`⚠️ Issues detected: ${concurrencyHealth.data.issues.join(', ')}`)
    }
    
    return { 
      name: 'Server Health', 
      success: true, 
      health: healthData, 
      concurrency: concurrencyHealth.data 
    }
  } catch (error) {
    console.error(`❌ Health check failed:`, error.message)
    return { name: 'Server Health', success: false, error: error.message }
  }
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting comprehensive concurrency tests...\\n')
  
  // First check server health
  const healthResult = await testServerHealth()
  if (!healthResult.success) {
    console.error('💥 Server is not healthy. Aborting tests.')
    process.exit(1)
  }
  
  const results = []
  
  // Test individual scenarios
  for (const scenario of testScenarios) {
    console.log(`\\n=== Testing ${scenario.name} ===`)
    
    // Test single request
    const singleResult = await testSingleRequest(scenario)
    results.push(singleResult)
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Test concurrent requests for this scenario
    const concurrentResult = await testConcurrentRequests(scenario, 2)
    results.push(concurrentResult)
    
    // Wait between test groups
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  // Final health check after tests
  console.log(`\\n=== Final Health Check ===`)
  const finalHealthResult = await testServerHealth()
  
  // Summary
  console.log(`\\n📈 FINAL TEST RESULTS SUMMARY:`)
  console.log(`================================`)
  
  const successCount = results.filter(r => r.success).length
  const totalTests = results.length
  
  console.log(`Total tests: ${totalTests}`)
  console.log(`Successful: ${successCount}`)
  console.log(`Failed: ${totalTests - successCount}`)
  console.log(`Success rate: ${((successCount / totalTests) * 100).toFixed(1)}%`)
  
  console.log(`\\n📋 Detailed Results:`)
  results.forEach(result => {
    const status = result.success ? '✅' : '❌'
    const duration = result.duration ? ` (${result.duration}ms)` : ''
    const error = result.error ? ` - ${result.error}` : ''
    console.log(`${status} ${result.name}${duration}${error}`)
  })
  
  console.log(`\\n🏥 Health Status:`)
  console.log(`Initial: ${healthResult.success ? '✅ Healthy' : '❌ Unhealthy'}`)
  console.log(`Final: ${finalHealthResult.success ? '✅ Healthy' : '❌ Unhealthy'}`)
  
  if (finalHealthResult.concurrency) {
    console.log(`Final concurrency status: ${finalHealthResult.concurrency.status}`)
    console.log(`Final active requests: ${finalHealthResult.concurrency.metrics.activeRequests}`)
  }
  
  if (successCount === totalTests && finalHealthResult.success) {
    console.log(`\\n🎉 ALL TESTS PASSED! Concurrency fixes are working correctly.`)
    console.log(`✅ Hanging request issues have been resolved!`)
    process.exit(0)
  } else {
    console.log(`\\n💥 SOME TESTS FAILED! There may still be concurrency issues.`)
    
    const failedTests = results.filter(r => !r.success)
    console.log(`Failed tests: ${failedTests.map(t => t.name).join(', ')}`)
    
    process.exit(1)
  }
}

// Check if server is running
async function checkServerAvailability() {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { timeout: 5000 })
    return response.ok
  } catch (error) {
    return false
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if server is available...')
  
  const serverAvailable = await checkServerAvailability()
  if (!serverAvailable) {
    console.error(`❌ Server is not available at ${SERVER_URL}`)
    console.error('Please start the server first with: npm start')
    process.exit(1)
  }
  
  console.log('✅ Server is available, starting tests...')
  await runAllTests()
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in tests:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in tests:', error)
  process.exit(1)
})

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { testSingleRequest, testConcurrentRequests, testServerHealth, runAllTests }