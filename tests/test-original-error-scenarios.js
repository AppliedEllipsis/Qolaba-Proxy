import { TestUtils, TestResultCollector } from './test-utils.js'
import { createResponseManager } from '../src/utils/responseManager.js'
import { handleStreamingResponse } from '../src/utils/streaming.js'

/**
 * Test original error scenarios that were causing header errors
 */
export class OriginalErrorScenarioTests {
  constructor() {
    this.collector = new TestResultCollector()
    this.testUtils = TestUtils
  }

  /**
   * Test 1: Streaming requests with multiple concurrent requests
   */
  async testConcurrentStreamingRequests() {
    const testName = 'Concurrent Streaming Requests'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const concurrentRequests = 5
      const promises = []
      const errors = []
      
      for (let i = 0; i < concurrentRequests; i++) {
        const promise = this.createStreamingRequest(i)
          .catch(error => errors.push(error))
        promises.push(promise)
      }
      
      await Promise.all(promises)
      
      // Check for header errors
      this.testUtils.assertNoHeaderErrors(errors.map(e => e.message))
      
      this.collector.addResult(testName, errors.length === 0, null, {
        concurrentRequests,
        errors: errors.length
      })
      
      console.log(`✅ ${testName}: ${errors.length === 0 ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 2: Client disconnections during streaming
   */
  async testClientDisconnectionDuringStreaming() {
    const testName = 'Client Disconnection During Streaming'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const { req, res, cleanup } = this.createStreamingSetup()
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 50,
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ]
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      let disconnectTriggered = false
      let headerErrors = []
      
      // Track header write attempts
      const originalWriteHead = res.writeHead
      res.writeHead = function(...args) {
        try {
          return originalWriteHead.apply(this, args)
        } catch (error) {
          headerErrors.push(error)
          throw error
        }
      }
      
      // Start streaming
      const streamingPromise = handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Disconnect after first chunk
      setTimeout(() => {
        disconnectTriggered = true
        req.emit('aborted')
        res.emit('close')
      }, 75)
      
      await streamingPromise
      
      // Verify no header errors occurred
      this.testUtils.assertNoHeaderErrors(headerErrors.map(e => e.message))
      
      this.collector.addResult(testName, headerErrors.length === 0, null, {
        disconnectTriggered,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${headerErrors.length === 0 ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 3: Timeout scenarios during streaming
   */
  async testTimeoutDuringStreaming() {
    const testName = 'Timeout During Streaming'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const { req, res, cleanup } = this.createStreamingSetup()
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      
      // Create a slow client that will trigger timeout
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 2000, // Very slow
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ]
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      // Create mock timeout manager that will trigger timeout
      const timeoutManager = this.testUtils.createMockUnifiedTimeoutManager()
      req.unifiedTimeoutManager = timeoutManager
      
      let timeoutTriggered = false
      let headerErrors = []
      
      // Track header write attempts
      const originalWriteHead = res.writeHead
      res.writeHead = function(...args) {
        try {
          return originalWriteHead.apply(this, args)
        } catch (error) {
          headerErrors.push(error)
          throw error
        }
      }
      
      // Start streaming
      const streamingPromise = handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Trigger timeout after short delay
      setTimeout(() => {
        timeoutTriggered = true
        timeoutManager.terminate('timeout')
      }, 100)
      
      await streamingPromise
      
      // Verify no header errors occurred
      this.testUtils.assertNoHeaderErrors(headerErrors.map(e => e.message))
      
      this.collector.addResult(testName, headerErrors.length === 0, null, {
        timeoutTriggered,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${headerErrors.length === 0 ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 4: Rapid successive requests
   */
  async testRapidSuccessiveRequests() {
    const testName = 'Rapid Successive Requests'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const rapidRequestCount = 10
      const promises = []
      const errors = []
      
      for (let i = 0; i < rapidRequestCount; i++) {
        const promise = this.createStreamingRequest(i, 0) // No delay
          .catch(error => errors.push(error))
        promises.push(promise)
      }
      
      await Promise.all(promises)
      
      // Check for header errors
      this.testUtils.assertNoHeaderErrors(errors.map(e => e.message))
      
      this.collector.addResult(testName, errors.length === 0, null, {
        rapidRequestCount,
        errors: errors.length
      })
      
      console.log(`✅ ${testName}: ${errors.length === 0 ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 5: Response errors during streaming
   */
  async testResponseErrorsDuringStreaming() {
    const testName = 'Response Errors During Streaming'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const { req, res, cleanup } = this.createStreamingSetup()
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 50,
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ]
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      let headerErrors = []
      
      // Track header write attempts
      const originalWriteHead = res.writeHead
      res.writeHead = function(...args) {
        try {
          return originalWriteHead.apply(this, args)
        } catch (error) {
          headerErrors.push(error)
          throw error
        }
      }
      
      // Start streaming
      const streamingPromise = handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Trigger response error
      setTimeout(() => {
        res.emit('error', new Error('Connection reset by peer'))
      }, 75)
      
      await streamingPromise
      
      // Verify no header errors occurred
      this.testUtils.assertNoHeaderErrors(headerErrors.map(e => e.message))
      
      this.collector.addResult(testName, headerErrors.length === 0, null, {
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${headerErrors.length === 0 ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Helper method to create a streaming request
   */
  async createStreamingRequest(index, delay = 10) {
    const { req, res, cleanup } = this.createStreamingSetup(index)
    const requestId = req.id
    const responseManager = createResponseManager(res, requestId)
    
    const qolabaClient = this.testUtils.createMockQolabaClient({
      delay,
      chunks: [
        { output: `Chunk 1-${index}` },
        { output: `Chunk 2-${index}` },
        { output: `Chunk 3-${index}` }
      ]
    })
    
    const qolabaPayload = {
      model: 'test-model',
      messages: [{ role: 'user', content: `test-${index}` }],
      stream: true
    }
    
    await handleStreamingResponse(
      responseManager, res, req, qolabaClient, qolabaPayload, requestId
    )
    
    cleanup()
  }

  /**
   * Helper method to create streaming setup
   */
  createStreamingSetup(index = 0) {
    const req = this.testUtils.createMockRequest({
      id: this.testUtils.generateTestId(),
      url: `/v1/chat/completions-${index}`
    })
    
    const res = this.testUtils.createMockResponse({
      onWrite: (chunk) => {
        // Mock writing to response
      },
      onEnd: () => {
        // Mock response end
      }
    })
    
    const cleanup = () => {
      // Cleanup resources
    }
    
    return { req, res, cleanup }
  }

  /**
   * Run all original error scenario tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Original Error Scenario Tests')
    console.log('==========================================')
    
    await this.testConcurrentStreamingRequests()
    await this.testClientDisconnectionDuringStreaming()
    await this.testTimeoutDuringStreaming()
    await this.testRapidSuccessiveRequests()
    await this.testResponseErrorsDuringStreaming()
    
    const allPassed = this.collector.printSummary()
    return allPassed
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new OriginalErrorScenarioTests()
  tests.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}

export default OriginalErrorScenarioTests