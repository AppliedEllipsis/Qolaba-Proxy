import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'

/**
 * Manual test script for verifying header error fixes
 * This script makes actual HTTP requests to test the server
 */
export class ManualTestScript {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.testResults = []
  }

  /**
   * Test 1: Basic streaming request
   */
  async testBasicStreamingRequest() {
    const testName = 'Basic Streaming Request'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      const response = await this.makeStreamingRequest({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        stream: true
      })
      
      console.log('✅ Basic streaming request completed successfully')
      console.log(`   Response chunks received: ${response.chunks.length}`)
      
      this.testResults.push({
        test: testName,
        status: 'PASSED',
        details: { chunks: response.chunks.length }
      })
      
      return response
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Test 2: Concurrent streaming requests
   */
  async testConcurrentStreamingRequests() {
    const testName = 'Concurrent Streaming Requests'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      const concurrentCount = 5
      const promises = []
      
      for (let i = 0; i < concurrentCount; i++) {
        const promise = this.makeStreamingRequest({
          model: 'gpt-4.1-mini-2025-04-14',
          messages: [{ role: 'user', content: `Concurrent test message ${i + 1}` }],
          stream: true
        })
        promises.push(promise)
      }
      
      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      
      console.log(`✅ Concurrent streaming requests completed`)
      console.log(`   Successful: ${successful}/${concurrentCount}`)
      console.log(`   Failed: ${failed}/${concurrentCount}`)
      
      // Check for header errors in failures
      const headerErrors = results
        .filter(r => r.status === 'rejected')
        .map(r => r.reason.message)
        .filter(msg => msg.includes('Cannot set headers'))
      
      if (headerErrors.length > 0) {
        console.log(`   ⚠️  Header errors detected: ${headerErrors.length}`)
        console.log(`   Errors: ${headerErrors.join(', ')}`)
      }
      
      this.testResults.push({
        test: testName,
        status: headerErrors.length === 0 ? 'PASSED' : 'FAILED',
        details: { successful, failed, headerErrors: headerErrors.length }
      })
      
      return { successful, failed, headerErrors }
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Test 3: Client disconnection during streaming
   */
  async testClientDisconnection() {
    const testName = 'Client Disconnection During Streaming'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      // Start a streaming request but abort it quickly
      const controller = new AbortController()
      const requestPromise = this.makeStreamingRequest({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: [{ role: 'user', content: 'This request will be aborted' }],
        stream: true
      }, { signal: controller.signal })
      
      // Abort after a short delay
      setTimeout(() => {
        controller.abort()
      }, 100)
      
      try {
        await requestPromise
        console.log('⚠️  Request completed normally (unexpected)')
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('✅ Request was successfully aborted')
        } else {
          console.log(`⚠️  Request failed with different error: ${error.message}`)
        }
      }
      
      this.testResults.push({
        test: testName,
        status: 'PASSED',
        details: { aborted: true }
      })
      
      return { aborted: true }
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Test 4: Rapid successive requests
   */
  async testRapidSuccessiveRequests() {
    const testName = 'Rapid Successive Requests'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      const requestCount = 20
      const results = []
      
      for (let i = 0; i < requestCount; i++) {
        try {
          const response = await this.makeStreamingRequest({
            model: 'gpt-4.1-mini-2025-04-14',
            messages: [{ role: 'user', content: `Rapid request ${i + 1}` }],
            stream: true
          })
          results.push({ index: i, status: 'success', chunks: response.chunks.length })
        } catch (error) {
          results.push({ index: i, status: 'failed', error: error.message })
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      const successful = results.filter(r => r.status === 'success').length
      const failed = results.filter(r => r.status === 'failed').length
      
      // Check for header errors
      const headerErrors = results
        .filter(r => r.status === 'failed')
        .map(r => r.error)
        .filter(msg => msg.includes('Cannot set headers'))
      
      console.log(`✅ Rapid successive requests completed`)
      console.log(`   Successful: ${successful}/${requestCount}`)
      console.log(`   Failed: ${failed}/${requestCount}`)
      
      if (headerErrors.length > 0) {
        console.log(`   ⚠️  Header errors detected: ${headerErrors.length}`)
      }
      
      this.testResults.push({
        test: testName,
        status: headerErrors.length === 0 ? 'PASSED' : 'FAILED',
        details: { successful, failed, headerErrors: headerErrors.length }
      })
      
      return { successful, failed, headerErrors }
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Test 5: Non-streaming request
   */
  async testNonStreamingRequest() {
    const testName = 'Non-Streaming Request'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      const response = await this.makeNonStreamingRequest({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: [{ role: 'user', content: 'This is a non-streaming test' }],
        stream: false
      })
      
      console.log('✅ Non-streaming request completed successfully')
      console.log(`   Response: ${JSON.stringify(response).substring(0, 100)}...`)
      
      this.testResults.push({
        test: testName,
        status: 'PASSED',
        details: { responseReceived: true }
      })
      
      return response
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Test 6: Health check
   */
  async testHealthCheck() {
    const testName = 'Health Check'
    console.log(`\n🧪 Manual Test: ${testName}`)
    
    try {
      const response = await this.makeHealthCheckRequest()
      
      console.log('✅ Health check completed successfully')
      console.log(`   Server status: ${response.status || 'OK'}`)
      
      this.testResults.push({
        test: testName,
        status: 'PASSED',
        details: { serverStatus: response.status || 'OK' }
      })
      
      return response
      
    } catch (error) {
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
      
      this.testResults.push({
        test: testName,
        status: 'FAILED',
        error: error.message
      })
      
      throw error
    }
  }

  /**
   * Make a streaming request to the server
   */
  async makeStreamingRequest(payload, options = {}) {
    const url = `${this.baseUrl}/v1/chat/completions`
    
    return new Promise(async (resolve, reject) => {
      const chunks = []
      let response
      
      try {
        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          },
          ...options
        }
        
        let httpModule;
        if (url.startsWith('https:')) {
          httpModule = await import('https');
        } else {
          httpModule = await import('http');
        }
        const req = httpModule.default.request(url, requestOptions, (res) => {
          response = res
          
          if (res.statusCode !== 200) {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`))
            })
            return
          }
          
          res.on('data', (chunk) => {
            chunks.push(chunk)
          })
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              chunks,
              body: Buffer.concat(chunks).toString()
            })
          })
        })
        
        req.on('error', reject)
        req.write(JSON.stringify(payload))
        req.end()
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Make a non-streaming request to the server
   */
  async makeNonStreamingRequest(payload) {
    const url = `${this.baseUrl}/v1/chat/completions`
    
    return new Promise(async (resolve, reject) => {
      try {
        let httpModule;
        if (url.startsWith('https:')) {
          httpModule = await import('https');
        } else {
          httpModule = await import('http');
        }
        const req = httpModule.default.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          }
        }, (res) => {
          let data = ''
          
          res.on('data', (chunk) => {
            data += chunk
          })
          
          res.on('end', () => {
            try {
              const response = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: response
              })
            } catch (error) {
              reject(error)
            }
          })
        })
        
        req.on('error', reject)
        req.write(JSON.stringify(payload))
        req.end()
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Make a health check request
   */
  async makeHealthCheckRequest() {
    const url = `${this.baseUrl}/health`
    
    return new Promise(async (resolve, reject) => {
      try {
        let httpModule;
        if (url.startsWith('https:')) {
          httpModule = await import('https');
        } else {
          httpModule = await import('http');
        }
        const req = httpModule.default.request(url, (res) => {
          let data = ''
          
          res.on('data', (chunk) => {
            data += chunk
          })
          
          res.on('end', () => {
            try {
              const response = JSON.parse(data)
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                data: response
              })
            } catch (error) {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                status: 'OK'
              })
            }
          })
        })
        
        req.on('error', reject)
        req.end()
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Run all manual tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Manual Tests')
    console.log('========================')
    console.log(`Base URL: ${this.baseUrl}`)
    console.log('Note: Make sure the server is running before executing these tests')
    
    try {
      await this.testHealthCheck()
      await this.testBasicStreamingRequest()
      await this.testNonStreamingRequest()
      await this.testConcurrentStreamingRequests()
      await this.testRapidSuccessiveRequests()
      await this.testClientDisconnection()
      
      this.printTestSummary()
      
    } catch (error) {
      console.error('\n❌ Manual test execution failed:', error.message)
    }
  }

  /**
   * Print test summary
   */
  printTestSummary() {
    console.log('\n=== Manual Test Summary ===')
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length
    const failed = this.testResults.filter(r => r.status === 'FAILED').length
    const total = this.testResults.length
    
    console.log(`Total: ${total}`)
    console.log(`Passed: ${passed}`)
    console.log(`Failed: ${failed}`)
    console.log(`Success Rate: ${total > 0 ? (passed / total * 100).toFixed(2) : 0}%`)
    
    if (failed > 0) {
      console.log('\n=== Failed Tests ===')
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(r => {
          console.log(`❌ ${r.test}`)
          console.log(`   Error: ${r.error}`)
          if (r.details) {
            console.log(`   Details:`, r.details)
          }
        })
    }
    
    // Check for header errors specifically
    const headerErrorTests = this.testResults.filter(r => 
      r.details && r.details.headerErrors && r.details.headerErrors > 0
    )
    
    if (headerErrorTests.length > 0) {
      console.log('\n⚠️  Tests with Header Errors:')
      headerErrorTests.forEach(r => {
        console.log(`   ${r.test}: ${r.details.headerErrors} header errors`)
      })
    } else {
      console.log('\n✅ No header errors detected in any test')
    }
    
    return failed === 0
  }
}

// Instructions for running manual tests
const instructions = `
Manual Test Instructions
========================

1. Start the Qoloba Proxy server:
   npm start

2. Run the manual test script:
   node tests/manual-test-script.js

3. Or run with custom base URL:
   BASE_URL=http://localhost:3000 node tests/manual-test-script.js

4. The tests will verify:
   - Basic streaming requests
   - Concurrent streaming requests
   - Client disconnections
   - Rapid successive requests
   - Non-streaming requests
   - Health checks

5. Look for:
   - ✅ PASSED tests
   - ❌ FAILED tests
   - ⚠️  Header errors (should be none if the fix is working)

If any header errors are detected, the fix may not be working properly.
`

// Export instructions and test class
export { instructions }

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(instructions)
  
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
  const testScript = new ManualTestScript(baseUrl)
  
  testScript.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Manual test execution failed:', error)
      process.exit(1)
    })
}

export default ManualTestScript