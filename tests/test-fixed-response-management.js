import { TestUtils, TestResultCollector } from './test-utils.js'
import { createResponseManager } from '../src/utils/responseManager.js'

/**
 * Test fixed response management to verify header handling and coordinated termination
 */
export class FixedResponseManagementTests {
  constructor() {
    this.collector = new TestResultCollector()
    this.testUtils = TestUtils
  }

  /**
   * Test 1: Headers are only set once
   */
  async testHeadersSetOnlyOnce() {
    const testName = 'Headers Set Only Once'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      let headerWriteCount = 0
      const originalWriteHead = res.writeHead
      
      // Track header writes
      res.writeHead = function(...args) {
        headerWriteCount++
        return originalWriteHead.apply(this, args)
      }
      
      // Try to write headers multiple times
      const firstWrite = responseManager.safeWriteHeaders(200, {
        'Content-Type': 'application/json'
      })
      
      const secondWrite = responseManager.safeWriteHeaders(201, {
        'Content-Type': 'text/plain'
      })
      
      const thirdWrite = responseManager.safeWriteHeaders(202, {
        'Content-Type': 'application/xml'
      })
      
      // Verify only first write succeeded
      const headersSetCorrectly = 
        firstWrite === true && 
        secondWrite === false && 
        thirdWrite === false &&
        headerWriteCount === 1 &&
        res.statusCode === 200 &&
        res.headers['Content-Type'] === 'application/json'
      
      this.collector.addResult(testName, headersSetCorrectly, null, {
        firstWrite,
        secondWrite,
        thirdWrite,
        headerWriteCount,
        finalStatusCode: res.statusCode,
        finalContentType: res.headers['Content-Type']
      })
      
      console.log(`✅ ${testName}: ${headersSetCorrectly ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 2: Multiple response operations don't conflict
   */
  async testMultipleResponseOperations() {
    const testName = 'Multiple Response Operations'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      let operationLog = []
      
      // Track all operations
      const originalWriteHead = res.writeHead
      const originalWrite = res.write
      const originalEnd = res.end
      
      res.writeHead = function(...args) {
        operationLog.push({ operation: 'writeHead', args })
        return originalWriteHead.apply(this, args)
      }
      
      res.write = function(...args) {
        operationLog.push({ operation: 'write', args })
        return originalWrite.apply(this, args)
      }
      
      res.end = function(...args) {
        operationLog.push({ operation: 'end', args })
        return originalEnd.apply(this, args)
      }
      
      // Perform multiple operations in sequence
      responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
      responseManager.safeWrite('{"message": "hello"}')
      responseManager.safeWrite('{"message": "world"}')
      responseManager.safeEnd()
      
      // Try to write after end
      const writeAfterEnd = responseManager.safeWrite('{"should": "fail"}')
      const endAfterEnd = responseManager.safeEnd('{"should": "fail"}')
      const headersAfterEnd = responseManager.safeWriteHeaders(500, { 'Content-Type': 'error' })
      
      // Verify operations occurred in correct order and post-end operations failed
      const operationsCorrect = 
        operationLog.length === 4 &&
        operationLog[0].operation === 'writeHead' &&
        operationLog[1].operation === 'write' &&
        operationLog[2].operation === 'write' &&
        operationLog[3].operation === 'end' &&
        writeAfterEnd === false &&
        endAfterEnd === false &&
        headersAfterEnd === false
      
      this.collector.addResult(testName, operationsCorrect, null, {
        operationLog,
        writeAfterEnd,
        endAfterEnd,
        headersAfterEnd
      })
      
      console.log(`✅ ${testName}: ${operationsCorrect ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 3: End callbacks don't try to set headers after they're sent
   */
  async testEndCallbacksHeaderSafety() {
    const testName = 'End Callbacks Header Safety'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      let headerErrors = []
      let callbackExecutionLog = []
      
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
      
      // Register multiple end callbacks that might try to set headers
      responseManager.onEnd(() => {
        callbackExecutionLog.push('callback1')
        // This should not cause header errors
        responseManager.safeWrite('final data 1')
      })
      
      responseManager.onEnd(() => {
        callbackExecutionLog.push('callback2')
        // This should not cause header errors
        responseManager.safeWrite('final data 2')
      })
      
      responseManager.onEnd(() => {
        callbackExecutionLog.push('callback3')
        // This should not cause header errors even if it tries to write headers
        responseManager.safeWriteHeaders(500, { 'Content-Type': 'error' })
      })
      
      // End the response
      responseManager.safeEnd('{"message": "completed"}')
      
      // Verify no header errors occurred and all callbacks executed
      const callbacksSafe = 
        headerErrors.length === 0 &&
        callbackExecutionLog.length === 3 &&
        callbackExecutionLog.includes('callback1') &&
        callbackExecutionLog.includes('callback2') &&
        callbackExecutionLog.includes('callback3')
      
      this.collector.addResult(testName, callbacksSafe, null, {
        headerErrors: headerErrors.length,
        callbackExecutionLog,
        callbacksExecuted: callbackExecutionLog.length
      })
      
      console.log(`✅ ${testName}: ${callbacksSafe ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 4: Coordinated termination system
   */
  async testCoordinatedTermination() {
    const testName = 'Coordinated Termination System'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      let terminationLog = []
      let operationLog = []
      
      // Track operations
      const originalWriteHead = res.writeHead
      const originalWrite = res.write
      const originalEnd = res.end
      
      res.writeHead = function(...args) {
        operationLog.push({ operation: 'writeHead', args })
        return originalWriteHead.apply(this, args)
      }
      
      res.write = function(...args) {
        operationLog.push({ operation: 'write', args })
        return originalWrite.apply(this, args)
      }
      
      res.end = function(...args) {
        operationLog.push({ operation: 'end', args })
        return originalEnd.apply(this, args)
      }
      
      // Start coordinated termination
      const terminationPromise1 = responseManager.coordinatedTermination('test1')
      const terminationPromise2 = responseManager.coordinatedTermination('test2')
      const terminationPromise3 = responseManager.coordinatedTermination('test3')
      
      // Wait for all terminations to complete
      await Promise.all([terminationPromise1, terminationPromise2, terminationPromise3])
      
      // Verify only one termination actually occurred
      const terminationCoordinated = 
        responseManager.hasEnded() === true &&
        operationLog.filter(op => op.operation === 'end').length === 1
      
      this.collector.addResult(testName, terminationCoordinated, null, {
        hasEnded: responseManager.hasEnded(),
        endOperations: operationLog.filter(op => op.operation === 'end').length,
        totalOperations: operationLog.length
      })
      
      console.log(`✅ ${testName}: ${terminationCoordinated ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 5: Response state consistency
   */
  async testResponseStateConsistency() {
    const testName = 'Response State Consistency'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      // Track state changes
      const stateLog = []
      
      const logState = (action) => {
        stateLog.push({
          action,
          state: responseManager.getState()
        })
      }
      
      logState('initial')
      
      // Write headers
      responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
      logState('after_headers')
      
      // Write data
      responseManager.safeWrite('{"message": "test"}')
      logState('after_write')
      
      // End response
      responseManager.safeEnd()
      logState('after_end')
      
      // Verify state consistency
      const stateConsistent = 
        stateLog[0].state.isHeadersSent === false &&
        stateLog[0].state.isEnded === false &&
        stateLog[1].state.isHeadersSent === true &&
        stateLog[1].state.isEnded === false &&
        stateLog[2].state.isHeadersSent === true &&
        stateLog[2].state.isEnded === false &&
        stateLog[3].state.isHeadersSent === true &&
        stateLog[3].state.isEnded === true
      
      this.collector.addResult(testName, stateConsistent, null, {
        stateLog,
        finalState: responseManager.getState()
      })
      
      console.log(`✅ ${testName}: ${stateConsistent ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 6: Safe methods prevent header errors
   */
  async testSafeMethodsPreventHeaderErrors() {
    const testName = 'Safe Methods Prevent Header Errors'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
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
      
      // Test all safe methods
      const safeWriteHeaders1 = responseManager.safeWriteHeaders(200, { 'Content-Type': 'json' })
      const safeWriteHeaders2 = responseManager.safeWriteHeaders(201, { 'Content-Type': 'text' }) // Should fail
      const safeWrite1 = responseManager.safeWrite('data1')
      const safeWrite2 = responseManager.safeWrite('data2')
      const safeEnd1 = responseManager.safeEnd()
      const safeEnd2 = responseManager.safeEnd() // Should fail
      const safeWriteAfterEnd = responseManager.safeWrite('data3') // Should fail
      const safeWriteHeadersAfterEnd = responseManager.safeWriteHeaders(500, {}) // Should fail
      
      // Verify no header errors occurred
      const noHeaderErrors = headerErrors.length === 0
      
      // Verify correct return values
      const correctReturnValues = 
        safeWriteHeaders1 === true &&
        safeWriteHeaders2 === false &&
        safeWrite1 === true &&
        safeWrite2 === true &&
        safeEnd1 === true &&
        safeEnd2 === false &&
        safeWriteAfterEnd === false &&
        safeWriteHeadersAfterEnd === false
      
      const allCorrect = noHeaderErrors && correctReturnValues
      
      this.collector.addResult(testName, allCorrect, null, {
        headerErrors: headerErrors.length,
        safeWriteHeaders1,
        safeWriteHeaders2,
        safeWrite1,
        safeWrite2,
        safeEnd1,
        safeEnd2,
        safeWriteAfterEnd,
        safeWriteHeadersAfterEnd
      })
      
      console.log(`✅ ${testName}: ${allCorrect ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Run all fixed response management tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Fixed Response Management Tests')
    console.log('============================================')
    
    await this.testHeadersSetOnlyOnce()
    await this.testMultipleResponseOperations()
    await this.testEndCallbacksHeaderSafety()
    await this.testCoordinatedTermination()
    await this.testResponseStateConsistency()
    await this.testSafeMethodsPreventHeaderErrors()
    
    const allPassed = this.collector.printSummary()
    return allPassed
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new FixedResponseManagementTests()
  tests.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}

export default FixedResponseManagementTests