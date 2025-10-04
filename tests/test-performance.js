import { TestUtils, TestResultCollector } from './test-utils.js'
import { createResponseManager } from '../src/utils/responseManager.js'
import { handleStreamingResponse } from '../src/utils/streaming.js'

/**
 * Performance tests to ensure fixes don't impact performance
 */
export class PerformanceTests {
  constructor() {
    this.collector = new TestResultCollector()
    this.testUtils = TestUtils
  }

  /**
   * Test 1: Concurrent streaming requests performance
   */
  async testConcurrentStreamingPerformance() {
    const testName = 'Concurrent Streaming Performance'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const concurrentCounts = [5, 10, 20, 50]
      const results = []
      
      for (const count of concurrentCounts) {
        const startTime = Date.now()
        const promises = []
        const errors = []
        
        for (let i = 0; i < count; i++) {
          const promise = this.createStreamingRequest(i, 10)
            .catch(error => errors.push(error))
          promises.push(promise)
        }
        
        await Promise.all(promises)
        
        const duration = Date.now() - startTime
        const avgDuration = duration / count
        
        results.push({
          concurrentCount: count,
          totalDuration: duration,
          avgDuration,
          errors: errors.length
        })
        
        // Check for header errors
        this.testUtils.assertNoHeaderErrors(errors.map(e => e.message))
      }
      
      // Verify performance doesn't degrade significantly
      const firstResult = results[0]
      const lastResult = results[results.length - 1]
      const performanceDegradation = lastResult.avgDuration / firstResult.avgDuration
      
      // Performance should not degrade more than 3x
      const performanceAcceptable = performanceDegradation < 3.0
      
      this.collector.addResult(testName, performanceAcceptable, null, {
        results,
        performanceDegradation,
        threshold: 3.0
      })
      
      console.log(`✅ ${testName}: ${performanceAcceptable ? 'PASSED' : 'FAILED'}`)
      console.log(`   Performance degradation: ${performanceDegradation.toFixed(2)}x`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 2: Memory usage doesn't increase significantly
   */
  async testMemoryUsageStability() {
    const testName = 'Memory Usage Stability'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const iterations = 100
      const memorySnapshots = []
      
      // Get initial memory
      if (global.gc) {
        global.gc() // Force garbage collection if available
      }
      const initialMemory = process.memoryUsage()
      memorySnapshots.push({ iteration: 0, ...initialMemory })
      
      // Perform multiple streaming requests
      for (let i = 0; i < iterations; i++) {
        await this.createStreamingRequest(i, 5)
        
        // Capture memory every 10 iterations
        if (i % 10 === 9) {
          if (global.gc) {
            global.gc() // Force garbage collection if available
          }
          const memory = process.memoryUsage()
          memorySnapshots.push({ iteration: i + 1, ...memory })
        }
      }
      
      // Final memory
      if (global.gc) {
        global.gc() // Force garbage collection if available
      }
      const finalMemory = process.memoryUsage()
      memorySnapshots.push({ iteration: iterations, ...finalMemory })
      
      // Calculate memory growth
      const heapUsedGrowth = finalMemory.heapUsed - initialMemory.heapUsed
      const heapTotalGrowth = finalMemory.heapTotal - initialMemory.heapTotal
      
      // Memory growth should be reasonable (less than 50MB)
      const memoryStable = 
        heapUsedGrowth < 50 * 1024 * 1024 && 
        heapTotalGrowth < 50 * 1024 * 1024
      
      this.collector.addResult(testName, memoryStable, null, {
        iterations,
        initialHeapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalHeapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024),
        heapUsedGrowthMB: Math.round(heapUsedGrowth / 1024 / 1024),
        heapTotalGrowthMB: Math.round(heapTotalGrowth / 1024 / 1024),
        memoryStable
      })
      
      console.log(`✅ ${testName}: ${memoryStable ? 'PASSED' : 'FAILED'}`)
      console.log(`   Heap used growth: ${Math.round(heapUsedGrowth / 1024 / 1024)}MB`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 3: Response manager performance overhead
   */
  async testResponseManagerPerformanceOverhead() {
    const testName = 'Response Manager Performance Overhead'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const iterations = 10000
      
      // Test without response manager
      const startTimeWithoutManager = Date.now()
      for (let i = 0; i < iterations; i++) {
        const res = this.testUtils.createMockResponse()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.write('{"test": "data"}')
        res.end()
      }
      const durationWithoutManager = Date.now() - startTimeWithoutManager
      
      // Test with response manager
      const startTimeWithManager = Date.now()
      for (let i = 0; i < iterations; i++) {
        const res = this.testUtils.createMockResponse()
        const responseManager = createResponseManager(res, `test-${i}`)
        
        responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
        responseManager.safeWrite('{"test": "data"}')
        responseManager.safeEnd()
      }
      const durationWithManager = Date.now() - startTimeWithManager
      
      // Calculate overhead
      const overhead = durationWithManager - durationWithoutManager
      const overheadPercentage = (overhead / durationWithoutManager) * 100
      
      // Overhead should be reasonable (less than 100%)
      const overheadAcceptable = overheadPercentage < 100
      
      this.collector.addResult(testName, overheadAcceptable, null, {
        iterations,
        durationWithoutManager,
        durationWithManager,
        overhead,
        overheadPercentage: overheadPercentage.toFixed(2),
        threshold: '100%'
      })
      
      console.log(`✅ ${testName}: ${overheadAcceptable ? 'PASSED' : 'FAILED'}`)
      console.log(`   Performance overhead: ${overheadPercentage.toFixed(2)}%`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 4: Coordinated termination performance
   */
  async testCoordinatedTerminationPerformance() {
    const testName = 'Coordinated Termination Performance'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const concurrentTerminations = [5, 10, 20, 50]
      const results = []
      
      for (const count of concurrentTerminations) {
        const responseManagers = []
        
        // Create response managers
        for (let i = 0; i < count; i++) {
          const res = this.testUtils.createMockResponse()
          const responseManager = createResponseManager(res, `term-test-${i}`)
          responseManagers.push(responseManager)
        }
        
        // Measure termination time
        const startTime = Date.now()
        
        // Trigger concurrent terminations
        const terminationPromises = responseManagers.map((manager, index) => 
          manager.coordinatedTermination(`test-${index}`)
        )
        
        await Promise.all(terminationPromises)
        
        const duration = Date.now() - startTime
        const avgDuration = duration / count
        
        results.push({
          concurrentTerminations: count,
          totalDuration: duration,
          avgDuration
        })
      }
      
      // Verify termination performance doesn't degrade significantly
      const firstResult = results[0]
      const lastResult = results[results.length - 1]
      const performanceDegradation = lastResult.avgDuration / firstResult.avgDuration
      
      // Performance should not degrade more than 2x for terminations
      const performanceAcceptable = performanceDegradation < 2.0
      
      this.collector.addResult(testName, performanceAcceptable, null, {
        results,
        performanceDegradation,
        threshold: 2.0
      })
      
      console.log(`✅ ${testName}: ${performanceAcceptable ? 'PASSED' : 'FAILED'}`)
      console.log(`   Termination performance degradation: ${performanceDegradation.toFixed(2)}x`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 5: High-frequency operations performance
   */
  async testHighFrequencyOperationsPerformance() {
    const testName = 'High-Frequency Operations Performance'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const operationsPerSecond = 1000
      const testDurationSeconds = 5
      const totalOperations = operationsPerSecond * testDurationSeconds
      
      const res = this.testUtils.createMockResponse()
      const responseManager = createResponseManager(res, 'freq-test')
      
      let operationCount = 0
      let errorCount = 0
      
      const startTime = Date.now()
      const endTime = startTime + (testDurationSeconds * 1000)
      
      // Perform high-frequency operations
      while (Date.now() < endTime && operationCount < totalOperations) {
        try {
          // Cycle through different operations
          const op = operationCount % 4
          
          switch (op) {
            case 0:
              responseManager.safeWrite('data')
              break
            case 1:
              responseManager.getState()
              break
            case 2:
              responseManager.hasEnded()
              break
            case 3:
              responseManager.areHeadersSent()
              break
          }
          
          operationCount++
        } catch (error) {
          errorCount++
        }
      }
      
      const actualDuration = Date.now() - startTime
      const actualOpsPerSecond = (operationCount / actualDuration) * 1000
      
      // Should achieve close to target operations per second
      const performanceAcceptable = actualOpsPerSecond > (operationsPerSecond * 0.8)
      
      this.collector.addResult(testName, performanceAcceptable, null, {
        targetOpsPerSecond: operationsPerSecond,
        actualOpsPerSecond: Math.round(actualOpsPerSecond),
        operationCount,
        errorCount,
        actualDuration
      })
      
      console.log(`✅ ${testName}: ${performanceAcceptable ? 'PASSED' : 'FAILED'}`)
      console.log(`   Operations per second: ${Math.round(actualOpsPerSecond)} (target: ${operationsPerSecond})`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 6: Stress test with mixed operations
   */
  async testMixedOperationsStressTest() {
    const testName = 'Mixed Operations Stress Test'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const durationSeconds = 10
      const concurrentOperations = 20
      
      const startTime = Date.now()
      const endTime = startTime + (durationSeconds * 1000)
      
      let totalOperations = 0
      let totalErrors = 0
      
      // Create concurrent workers
      const workers = Array.from({ length: concurrentOperations }, (_, index) => 
        this.createStressWorker(`stress-${index}`, endTime)
          .then(({ operations, errors }) => {
            totalOperations += operations
            totalErrors += errors
          })
      )
      
      await Promise.all(workers)
      
      const actualDuration = Date.now() - startTime
      const opsPerSecond = (totalOperations / actualDuration) * 1000
      
      // Should handle high load with minimal errors
      const stressTestPassed = 
        totalErrors < (totalOperations * 0.01) && // Less than 1% errors
        opsPerSecond > 100 // At least 100 ops per second
      
      this.collector.addResult(testName, stressTestPassed, null, {
        durationSeconds,
        concurrentOperations,
        totalOperations,
        totalErrors,
        errorRate: ((totalErrors / totalOperations) * 100).toFixed(2),
        opsPerSecond: Math.round(opsPerSecond)
      })
      
      console.log(`✅ ${testName}: ${stressTestPassed ? 'PASSED' : 'FAILED'}`)
      console.log(`   Total operations: ${totalOperations}`)
      console.log(`   Error rate: ${((totalErrors / totalOperations) * 100).toFixed(2)}%`)
      console.log(`   Operations per second: ${Math.round(opsPerSecond)}`)
      
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
   * Helper method to create a stress worker
   */
  async createStressWorker(workerId, endTime) {
    let operations = 0
    let errors = 0
    
    while (Date.now() < endTime) {
      try {
        const operationType = operations % 5
        
        switch (operationType) {
          case 0: {
            // Create and destroy response manager
            const res = this.testUtils.createMockResponse()
            const responseManager = createResponseManager(res, `${workerId}-${operations}`)
            responseManager.destroy()
            break
          }
          case 1: {
            // Create streaming request
            await this.createStreamingRequest(`${workerId}-${operations}`, 1)
            break
          }
          case 2: {
            // Create response with rapid operations
            const res = this.testUtils.createMockResponse()
            const responseManager = createResponseManager(res, `${workerId}-${operations}`)
            
            for (let i = 0; i < 10; i++) {
              responseManager.safeWrite(`data-${i}`)
            }
            responseManager.safeEnd()
            break
          }
          case 3: {
            // Create coordinated termination test
            const res = this.testUtils.createMockResponse()
            const responseManager = createResponseManager(res, `${workerId}-${operations}`)
            
            const promises = Array.from({ length: 5 }, (_, i) => 
              responseManager.coordinatedTermination(`term-${i}`)
            )
            
            await Promise.all(promises)
            break
          }
          case 4: {
            // Create error scenario
            const res = this.testUtils.createMockResponse()
            const responseManager = createResponseManager(res, `${workerId}-${operations}`)
            
            // Try operations that should fail gracefully
            responseManager.safeWriteHeaders(200, {})
            responseManager.safeWriteHeaders(201, {}) // Should fail
            responseManager.safeEnd()
            responseManager.safeWrite('after end') // Should fail
            break
          }
        }
        
        operations++
      } catch (error) {
        errors++
      }
    }
    
    return { operations, errors }
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
   * Run all performance tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Performance Tests')
    console.log('==============================')
    
    await this.testConcurrentStreamingPerformance()
    await this.testMemoryUsageStability()
    await this.testResponseManagerPerformanceOverhead()
    await this.testCoordinatedTerminationPerformance()
    await this.testHighFrequencyOperationsPerformance()
    await this.testMixedOperationsStressTest()
    
    const allPassed = this.collector.printSummary()
    return allPassed
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new PerformanceTests()
  tests.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}

export default PerformanceTests