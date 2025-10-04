import { TestUtils, TestResultCollector } from './test-utils.js'
import { createResponseManager } from '../src/utils/responseManager.js'
import { handleStreamingResponse } from '../src/utils/streaming.js'

/**
 * Test edge cases to ensure robustness of the header error fix
 */
export class EdgeCaseTests {
  constructor() {
    this.collector = new TestResultCollector()
    this.testUtils = TestUtils
  }

  /**
   * Test 1: Rapid successive requests with immediate disconnections
   */
  async testRapidRequestsWithImmediateDisconnections() {
    const testName = 'Rapid Requests with Immediate Disconnections'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const requestCount = 20
      const promises = []
      const errors = []
      
      for (let i = 0; i < requestCount; i++) {
        const promise = this.createRequestWithImmediateDisconnection(i)
          .catch(error => errors.push(error))
        promises.push(promise)
      }
      
      await Promise.allSettled(promises)
      
      // Check for header errors
      this.testUtils.assertNoHeaderErrors(errors.map(e => e.message))
      
      this.collector.addResult(testName, errors.length === 0, null, {
        requestCount,
        errors: errors.length
      })
      
      console.log(`✅ ${testName}: ${errors.length === 0 ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 2: Client disconnections at different stages
   */
  async testDisconnectionsAtDifferentStages() {
    const testName = 'Disconnections at Different Stages'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const stages = [
        { name: 'before_headers', delay: 0 },
        { name: 'after_headers', delay: 25 },
        { name: 'during_streaming', delay: 75 },
        { name: 'near_completion', delay: 120 }
      ]
      
      const results = []
      
      for (const stage of stages) {
        try {
          await this.createDisconnectionAtStage(stage.name, stage.delay)
          results.push({ stage: stage.name, success: true, error: null })
        } catch (error) {
          results.push({ stage: stage.name, success: false, error: error.message })
        }
      }
      
      // Check for header errors in all results
      const headerErrors = results
        .filter(r => !r.success)
        .map(r => r.error)
        .filter(error => 
          error.includes('Cannot set headers') || 
          error.includes('headers after they are sent')
        )
      
      const allStagesHandled = headerErrors.length === 0
      
      this.collector.addResult(testName, allStagesHandled, null, {
        results,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${allStagesHandled ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 3: Multiple timeout scenarios
   */
  async testMultipleTimeoutScenarios() {
    const testName = 'Multiple Timeout Scenarios'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const timeoutScenarios = [
        { name: 'immediate_timeout', delay: 0 },
        { name: 'early_timeout', delay: 50 },
        { name: 'late_timeout', delay: 200 },
        { name: 'multiple_timeouts', delay: 25, multiple: true }
      ]
      
      const results = []
      
      for (const scenario of timeoutScenarios) {
        try {
          await this.createTimeoutScenario(scenario)
          results.push({ scenario: scenario.name, success: true, error: null })
        } catch (error) {
          results.push({ scenario: scenario.name, success: false, error: error.message })
        }
      }
      
      // Check for header errors in all results
      const headerErrors = results
        .filter(r => !r.success)
        .map(r => r.error)
        .filter(error => 
          error.includes('Cannot set headers') || 
          error.includes('headers after they are sent')
        )
      
      const allScenariosHandled = headerErrors.length === 0
      
      this.collector.addResult(testName, allScenariosHandled, null, {
        results,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${allScenariosHandled ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 4: Error conditions during streaming
   */
  async testErrorConditionsDuringStreaming() {
    const testName = 'Error Conditions During Streaming'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const errorConditions = [
        { name: 'api_error', type: 'API_ERROR' },
        { name: 'network_error', type: 'ECONNRESET' },
        { name: 'timeout_error', type: 'ETIMEDOUT' },
        { name: 'unknown_error', type: 'UNKNOWN_ERROR' }
      ]
      
      const results = []
      
      for (const condition of errorConditions) {
        try {
          await this.createErrorDuringStreaming(condition.type)
          results.push({ condition: condition.name, success: true, error: null })
        } catch (error) {
          results.push({ condition: condition.name, success: false, error: error.message })
        }
      }
      
      // Check for header errors in all results
      const headerErrors = results
        .filter(r => !r.success)
        .map(r => r.error)
        .filter(error => 
          error.includes('Cannot set headers') || 
          error.includes('headers after they are sent')
        )
      
      const allConditionsHandled = headerErrors.length === 0
      
      this.collector.addResult(testName, allConditionsHandled, null, {
        results,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${allConditionsHandled ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 5: Concurrent operations on same response
   */
  async testConcurrentOperationsOnSameResponse() {
    const testName = 'Concurrent Operations on Same Response'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      let headerErrors = []
      let operationLog = []
      
      // Track header write attempts
      const originalWriteHead = res.writeHead
      res.writeHead = function(...args) {
        try {
          operationLog.push({ operation: 'writeHead', timestamp: Date.now() })
          return originalWriteHead.apply(this, args)
        } catch (error) {
          headerErrors.push(error)
          throw error
        }
      }
      
      // Launch concurrent operations
      const concurrentOperations = [
        () => responseManager.safeWriteHeaders(200, { 'Content-Type': 'json' }),
        () => responseManager.safeWrite('data1'),
        () => responseManager.safeWrite('data2'),
        () => responseManager.safeWrite('data3'),
        () => responseManager.safeEnd(),
        () => responseManager.safeWriteHeaders(201, { 'Content-Type': 'text' }), // Should fail
        () => responseManager.safeWrite('data4'), // Should fail
        () => responseManager.coordinatedTermination('concurrent_test'),
        () => responseManager.coordinatedTermination('concurrent_test2'),
        () => responseManager.coordinatedTermination('concurrent_test3')
      ]
      
      // Execute all operations concurrently
      const promises = concurrentOperations.map(op => {
        return new Promise(resolve => {
          setTimeout(() => {
            try {
              const result = op()
              resolve({ success: true, result })
            } catch (error) {
              resolve({ success: false, error: error.message })
            }
          }, Math.random() * 10) // Random delay up to 10ms
        })
      })
      
      const results = await Promise.all(promises)
      
      // Verify no header errors occurred
      this.testUtils.assertNoHeaderErrors(headerErrors.map(e => e.message))
      
      // Verify only one header write succeeded
      const successfulHeaderWrites = results.filter(r => 
        r.success && r.result === true && operationLog.length === 1
      )
      
      const concurrentOperationsHandled = 
        headerErrors.length === 0 &&
        operationLog.length === 1 &&
        responseManager.hasEnded()
      
      this.collector.addResult(testName, concurrentOperationsHandled, null, {
        headerErrors: headerErrors.length,
        headerWriteOperations: operationLog.length,
        responseEnded: responseManager.hasEnded(),
        operationResults: results.map(r => r.success)
      })
      
      console.log(`✅ ${testName}: ${concurrentOperationsHandled ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 6: Resource cleanup under stress
   */
  async testResourceCleanupUnderStress() {
    const testName = 'Resource Cleanup Under Stress'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const iterations = 50
      const cleanupResults = []
      
      for (let i = 0; i < iterations; i++) {
        try {
          const result = await this.createAndCleanupResponse(i)
          cleanupResults.push({ iteration: i, success: true, result })
        } catch (error) {
          cleanupResults.push({ iteration: i, success: false, error: error.message })
        }
      }
      
      // Check for header errors in all results
      const headerErrors = cleanupResults
        .filter(r => !r.success)
        .map(r => r.error)
        .filter(error => 
          error.includes('Cannot set headers') || 
          error.includes('headers after they are sent')
        )
      
      const allCleanupsSuccessful = headerErrors.length === 0
      
      this.collector.addResult(testName, allCleanupsSuccessful, null, {
        iterations,
        successfulCleanups: cleanupResults.filter(r => r.success).length,
        headerErrors: headerErrors.length
      })
      
      console.log(`✅ ${testName}: ${allCleanupsSuccessful ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Helper method to create request with immediate disconnection
   */
  async createRequestWithImmediateDisconnection(index) {
    const { req, res, cleanup } = this.createStreamingSetup(index)
    const requestId = req.id
    const responseManager = createResponseManager(res, requestId)
    
    const qolabaClient = this.testUtils.createMockQolabaClient({
      delay: 50,
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
    
    // Start streaming
    const streamingPromise = handleStreamingResponse(
      responseManager, res, req, qolabaClient, qolabaPayload, requestId
    )
    
    // Immediately disconnect
    setTimeout(() => {
      req.emit('aborted')
      res.emit('close')
    }, Math.random() * 10) // Random delay up to 10ms
    
    await streamingPromise
    cleanup()
  }

  /**
   * Helper method to create disconnection at specific stage
   */
  async createDisconnectionAtStage(stage, delay) {
    const { req, res, cleanup } = this.createStreamingSetup(stage)
    const requestId = req.id
    const responseManager = createResponseManager(res, requestId)
    
    const qolabaClient = this.testUtils.createMockQolabaClient({
      delay: 25,
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
    
    // Start streaming
    const streamingPromise = handleStreamingResponse(
      responseManager, res, req, qolabaClient, qolabaPayload, requestId
    )
    
    // Disconnect at specified stage
    setTimeout(() => {
      req.emit('aborted')
      res.emit('close')
    }, delay)
    
    await streamingPromise
    cleanup()
  }

  /**
   * Helper method to create timeout scenario
   */
  async createTimeoutScenario(scenario) {
    const { req, res, cleanup } = this.createStreamingSetup(scenario.name)
    const requestId = req.id
    const responseManager = createResponseManager(res, requestId)
    
    const qolabaClient = this.testUtils.createMockQolabaClient({
      delay: 100,
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
    
    // Create mock timeout manager
    const timeoutManager = this.testUtils.createMockUnifiedTimeoutManager()
    req.unifiedTimeoutManager = timeoutManager
    
    // Start streaming
    const streamingPromise = handleStreamingResponse(
      responseManager, res, req, qolabaClient, qolabaPayload, requestId
    )
    
    // Trigger timeout(s)
    setTimeout(() => {
      timeoutManager.terminate('timeout')
    }, scenario.delay)
    
    if (scenario.multiple) {
      setTimeout(() => {
        timeoutManager.terminate('timeout2')
      }, scenario.delay + 25)
    }
    
    await streamingPromise
    cleanup()
  }

  /**
   * Helper method to create error during streaming
   */
  async createErrorDuringStreaming(errorType) {
    const { req, res, cleanup } = this.createStreamingSetup(errorType)
    const requestId = req.id
    const responseManager = createResponseManager(res, requestId)
    
    const qolabaClient = this.testUtils.createMockQolabaClient({
      delay: 50,
      chunks: [
        { output: 'Start' },
        { output: ' Middle' },
        { output: ' End' }
      ],
      shouldError: true,
      errorCode: errorType,
      errorMessage: `Mock ${errorType} error`
    })
    
    const qolabaPayload = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      stream: true
    }
    
    // Start streaming (should fail with error)
    const streamingPromise = handleStreamingResponse(
      responseManager, res, req, qolabaClient, qolabaPayload, requestId
    )
    
    await streamingPromise
    cleanup()
  }

  /**
   * Helper method to create and cleanup response
   */
  async createAndCleanupResponse(index) {
    const res = this.testUtils.createMockResponse()
    const requestId = this.testUtils.generateTestId()
    const responseManager = createResponseManager(res, requestId)
    
    // Perform operations
    responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
    responseManager.safeWrite(`{"index": ${index}}`)
    responseManager.safeEnd()
    
    // Force cleanup
    responseManager.destroy()
    
    return {
      ended: responseManager.hasEnded(),
      destroyed: responseManager.isDestroyed
    }
  }

  /**
   * Helper method to create streaming setup
   */
  createStreamingSetup(identifier) {
    const req = this.testUtils.createMockRequest({
      id: this.testUtils.generateTestId(),
      url: `/v1/chat/completions-${identifier}`
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
   * Run all edge case tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Edge Case Tests')
    console.log('===============================')
    
    await this.testRapidRequestsWithImmediateDisconnections()
    await this.testDisconnectionsAtDifferentStages()
    await this.testMultipleTimeoutScenarios()
    await this.testErrorConditionsDuringStreaming()
    await this.testConcurrentOperationsOnSameResponse()
    await this.testResourceCleanupUnderStress()
    
    const allPassed = this.collector.printSummary()
    return allPassed
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new EdgeCaseTests()
  tests.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}

export default EdgeCaseTests