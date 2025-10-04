import { EventEmitter } from 'events'
import { createServer } from 'http'
import { randomBytes } from 'crypto'

/**
 * Test utilities for comprehensive header error testing
 */
export class TestUtils {
  /**
   * Generate a unique test ID
   */
  static generateTestId() {
    return `test-${randomBytes(8).toString('hex')}`
  }

  /**
   * Create a mock request object
   */
  static createMockRequest(options = {}) {
    const req = new EventEmitter()
    
    req.id = options.id || this.generateTestId()
    req.method = options.method || 'POST'
    req.url = options.url || '/v1/chat/completions'
    req.headers = options.headers || {
      'content-type': 'application/json',
      'user-agent': 'test-client'
    }
    req.ip = options.ip || '127.0.0.1'
    req.aborted = false
    req.unifiedTimeoutManager = options.unifiedTimeoutManager || null
    
    // Mock methods
    req.on = function(event, callback) {
      EventEmitter.prototype.on.call(this, event, callback)
      return this
    }
    
    req.abort = function() {
      this.aborted = true
      this.emit('aborted')
    }
    
    return req
  }

  /**
   * Create a mock response object
   */
  static createMockResponse(options = {}) {
    const res = new EventEmitter()
    
    res.statusCode = 200
    res.headers = {}
    res.headersSent = false
    res.writableEnded = false
    res.writable = true
    res.socket = options.socket || null
    
    // Mock methods
    res.writeHead = function(statusCode, headers) {
      if (this.headersSent) {
        const error = new Error('Cannot set headers after they are sent to the client')
        throw error
      }
      
      this.statusCode = statusCode
      this.headers = { ...this.headers, ...headers }
      this.headersSent = true
      
      // Track header operations for testing
      if (options.onHeaderWrite) {
        options.onHeaderWrite(statusCode, headers)
      }
      
      return this
    }
    
    res.write = function(chunk) {
      if (this.writableEnded) {
        return false
      }
      
      if (options.onWrite) {
        options.onWrite(chunk)
      }
      
      return true
    }
    
    res.end = function(chunk, encoding) {
      if (this.writableEnded) {
        return this
      }
      
      if (chunk && options.onWrite) {
        options.onWrite(chunk, encoding)
      }
      
      this.writableEnded = true
      
      if (options.onEnd) {
        options.onEnd(chunk, encoding)
      }
      
      // Emit finish event
      setImmediate(() => this.emit('finish'))
      
      return this
    }
    
    res.json = function(obj) {
      if (this.headersSent) {
        const error = new Error('Cannot set headers after they are sent to the client')
        throw error
      }
      
      this.setHeader('Content-Type', 'application/json')
      this.end(JSON.stringify(obj))
    }
    
    res.status = function(code) {
      this.statusCode = code
      return this
    }
    
    res.setHeader = function(name, value) {
      if (this.headersSent) {
        const error = new Error('Cannot set headers after they are sent to the client')
        throw error
      }
      this.headers[name] = value
      return this
    }
    
    // Safe methods that should not throw
    res.safeWriteHead = function(statusCode, headers) {
      if (!this.headersSent && !this.writableEnded) {
        return this.writeHead(statusCode, headers)
      }
      return false
    }
    
    res.safeWrite = function(chunk) {
      if (!this.writableEnded) {
        return this.write(chunk)
      }
      return false
    }
    
    res.safeEnd = function(chunk) {
      if (!this.writableEnded) {
        return this.end(chunk)
      }
      return false
    }
    
    res.canWrite = function() {
      return !this.writableEnded
    }
    
    res.canWriteHeaders = function() {
      return !this.headersSent && !this.writableEnded
    }
    
    return res
  }

  /**
   * Create a mock qolaba client
   */
  static createMockQolabaClient(options = {}) {
    const mockClient = {
      streamChat: async function(payload, callback) {
        const chunks = options.chunks || [
          { output: 'Hello' },
          { output: ' there' },
          { output: '!' }
        ]
        
        const delay = options.delay || 10
        
        for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, delay))
          callback(chunk)
        }
      },
      
      chat: async function(payload) {
        const delay = options.delay || 100
        await new Promise(resolve => setTimeout(resolve, delay))
        
        return {
          output: options.response || 'Hello there!',
          usage: {
            promptTokens: 10,
            completionTokens: 3,
            totalTokens: 13
          }
        }
      }
    }
    
    if (options.shouldError) {
      const error = new Error(options.errorMessage || 'Mock API error')
      error.code = options.errorCode || 'API_ERROR'
      
      mockClient.streamChat = async function(payload, callback) {
        throw error
      }
      
      mockClient.chat = async function(payload) {
        throw error
      }
    }
    
    return mockClient
  }

  /**
   * Create a mock unified timeout manager
   */
  static createMockUnifiedTimeoutManager(options = {}) {
    const manager = {
      isTerminated: false,
      terminationReason: null,
      errorHandlers: new Set(),
      
      updateActivity: function() {
        // Mock activity update
      },
      
      canOperate: function() {
        return !this.isTerminated
      },
      
      registerStreamingErrorHandler: function(handler) {
        this.errorHandlers.add(handler)
      },
      
      terminate: async function(reason) {
        this.isTerminated = true
        this.terminationReason = reason
        
        // Call all error handlers
        for (const handler of this.errorHandlers) {
          try {
            await handler(reason)
          } catch (error) {
            console.error('Mock timeout manager error handler failed:', error)
          }
        }
      }
    }
    
    return manager
  }

  /**
   * Track async operations for testing
   */
  static createAsyncTracker() {
    const operations = new Set()
    
    return {
      track: (operation) => {
        const promise = Promise.resolve(operation)
        operations.add(promise)
        
        promise.finally(() => {
          operations.delete(promise)
        })
        
        return promise
      },
      
      waitForAll: () => {
        return Promise.all(Array.from(operations))
      },
      
      count: () => operations.size,
      
      clear: () => operations.clear()
    }
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(condition, timeout = 5000, interval = 100) {
    const start = Date.now()
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    
    throw new Error(`Condition not met within ${timeout}ms`)
  }

  /**
   * Assert that no header errors occur
   */
  static assertNoHeaderErrors(assertions) {
    const headerErrorMessages = [
      'Cannot set headers after they are sent to the client',
      'Cannot write headers after they are sent'
    ]
    
    for (const assertion of assertions) {
      if (typeof assertion === 'string') {
        for (const errorMsg of headerErrorMessages) {
          if (assertion.includes(errorMsg)) {
            throw new Error(`Header error detected: ${assertion}`)
          }
        }
      }
    }
  }

  /**
   * Create a test server for integration testing
   */
  static createTestServer(app) {
    const server = createServer(app)
    
    return {
      server,
      start: (port = 0) => {
        return new Promise((resolve, reject) => {
          server.listen(port, (err) => {
            if (err) reject(err)
            else resolve(server.address().port)
          })
        })
      },
      
      stop: () => {
        return new Promise((resolve) => {
          server.close(resolve)
        })
      }
    }
  }
}

/**
 * Test result collector
 */
export class TestResultCollector {
  constructor() {
    this.results = []
    this.startTime = Date.now()
  }
  
  addResult(testName, passed, error = null, details = {}) {
    this.results.push({
      testName,
      passed,
      error: error ? error.message : null,
      stack: error ? error.stack : null,
      details,
      timestamp: Date.now() - this.startTime
    })
  }
  
  getSummary() {
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    const total = this.results.length
    
    return {
      total,
      passed,
      failed,
      successRate: total > 0 ? (passed / total * 100).toFixed(2) + '%' : '0%',
      duration: Date.now() - this.startTime,
      results: this.results
    }
  }
  
  printSummary() {
    const summary = this.getSummary()
    
    console.log('\n=== Test Summary ===')
    console.log(`Total: ${summary.total}`)
    console.log(`Passed: ${summary.passed}`)
    console.log(`Failed: ${summary.failed}`)
    console.log(`Success Rate: ${summary.successRate}`)
    console.log(`Duration: ${summary.duration}ms`)
    
    if (summary.failed > 0) {
      console.log('\n=== Failed Tests ===')
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`❌ ${r.testName}`)
          console.log(`   Error: ${r.error}`)
          if (r.details) {
            console.log(`   Details:`, r.details)
          }
        })
    }
    
    return summary.failed === 0
  }
}

export default TestUtils