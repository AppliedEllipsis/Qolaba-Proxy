import { TestUtils, TestResultCollector } from './test-utils.js'
import { createResponseManager } from '../src/utils/responseManager.js'
import { handleStreamingResponse } from '../src/utils/streaming.js'
import fs from 'fs'
import path from 'path'

/**
 * Test logging functionality and error tracking
 */
export class LoggingFunctionalityTests {
  constructor() {
    this.collector = new TestResultCollector()
    this.testUtils = TestUtils
    this.logDir = path.join(process.cwd(), 'logs')
    this.testLogFile = path.join(this.logDir, 'test-errors.log')
  }

  /**
   * Test 1: Enhanced error logging creates detailed error entries
   */
  async testEnhancedErrorLogging() {
    const testName = 'Enhanced Error Logging'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      
      // Clear test log file
      if (fs.existsSync(this.testLogFile)) {
        fs.unlinkSync(this.testLogFile)
      }
      
      // Create a scenario that will generate errors
      const { req, res, cleanup } = this.createStreamingSetup('enhanced_logging')
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      
      // Mock logger to capture log entries
      const logEntries = []
      const originalConsoleError = console.error
      const originalConsoleWarn = console.warn
      const originalConsoleInfo = console.info
      
      console.error = (...args) => {
        logEntries.push({ level: 'error', args: args.join(' ') })
        originalConsoleError(...args)
      }
      
      console.warn = (...args) => {
        logEntries.push({ level: 'warn', args: args.join(' ') })
        originalConsoleWarn(...args)
      }
      
      console.info = (...args) => {
        logEntries.push({ level: 'info', args: args.join(' ') })
        originalConsoleInfo(...args)
      }
      
      // Create a client that will error
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 50,
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ],
        shouldError: true,
        errorCode: 'API_ERROR',
        errorMessage: 'Test API error for enhanced logging'
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      // Start streaming (should fail with error)
      await handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Restore console methods
      console.error = originalConsoleError
      console.warn = originalConsoleWarn
      console.info = originalConsoleInfo
      
      // Check for detailed error logging
      const errorEntries = logEntries.filter(entry => entry.level === 'error')
      const hasDetailedErrorInfo = errorEntries.some(entry => 
        entry.args.includes('requestId') && 
        entry.args.includes('method') && 
        entry.args.includes('responseState')
      )
      
      this.collector.addResult(testName, hasDetailedErrorInfo, null, {
        totalLogEntries: logEntries.length,
        errorEntries: errorEntries.length,
        hasDetailedErrorInfo
      })
      
      console.log(`✅ ${testName}: ${hasDetailedErrorInfo ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 2: Request ID tracking works throughout the flow
   */
  async testRequestIdTracking() {
    const testName = 'Request ID Tracking'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const testRequestId = 'test-request-id-12345'
      const { req, res, cleanup } = this.createStreamingSetup('request_id_tracking')
      req.id = testRequestId // Override with known ID
      
      const responseManager = createResponseManager(res, testRequestId)
      
      // Mock logger to capture log entries
      const logEntries = []
      const originalConsoleError = console.error
      const originalConsoleWarn = console.warn
      const originalConsoleInfo = console.info
      
      const captureLog = (level) => (...args) => {
        logEntries.push({ level, args: args.join(' '), timestamp: Date.now() })
        if (level === 'error') originalConsoleError(...args)
        else if (level === 'warn') originalConsoleWarn(...args)
        else originalConsoleInfo(...args)
      }
      
      console.error = captureLog('error')
      console.warn = captureLog('warn')
      console.info = captureLog('info')
      
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 30,
        chunks: [
          { output: 'Chunk 1' },
          { output: 'Chunk 2' },
          { output: 'Chunk 3' }
        ]
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      // Start streaming
      await handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, testRequestId
      )
      
      // Restore console methods
      console.error = originalConsoleError
      console.warn = originalConsoleWarn
      console.info = originalConsoleInfo
      
      // Check that request ID appears in log entries
      const entriesWithRequestId = logEntries.filter(entry => 
        entry.args.includes(testRequestId)
      )
      
      const requestIdTracked = entriesWithRequestId.length > 0
      
      this.collector.addResult(testName, requestIdTracked, null, {
        totalLogEntries: logEntries.length,
        entriesWithRequestId: entriesWithRequestId.length,
        requestIdTracked
      })
      
      console.log(`✅ ${testName}: ${requestIdTracked ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 3: Errors log file is created and populated
   */
  async testErrorLogFileCreation() {
    const testName = 'Error Log File Creation'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      
      // Clear test log file
      if (fs.existsSync(this.testLogFile)) {
        fs.unlinkSync(this.testLogFile)
      }
      
      // Create a scenario that will generate errors
      const { req, res, cleanup } = this.createStreamingSetup('log_file_creation')
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      
      // Mock logger to write to test file
      const logToFile = (level, message) => {
        const logEntry = `${new Date().toISOString()} [${level}] ${message}\n`
        fs.appendFileSync(this.testLogFile, logEntry)
      }
      
      const originalConsoleError = console.error
      console.error = (...args) => {
        logToFile('ERROR', args.join(' '))
        originalConsoleError(...args)
      }
      
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 50,
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ],
        shouldError: true,
        errorCode: 'API_ERROR',
        errorMessage: 'Test error for log file creation'
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      // Start streaming (should fail with error)
      await handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Restore console method
      console.error = originalConsoleError
      
      // Check if log file was created and has content
      const logFileExists = fs.existsSync(this.testLogFile)
      let logFileContent = ''
      let logFileHasContent = false
      
      if (logFileExists) {
        logFileContent = fs.readFileSync(this.testLogFile, 'utf8')
        logFileHasContent = logFileContent.length > 0
      }
      
      this.collector.addResult(testName, logFileExists && logFileHasContent, null, {
        logFileExists,
        logFileHasContent,
        logFileSize: logFileContent.length
      })
      
      console.log(`✅ ${testName}: ${logFileExists && logFileHasContent ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 4: Header operation logging
   */
  async testHeaderOperationLogging() {
    const testName = 'Header Operation Logging'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      // Mock logger to capture log entries
      const logEntries = []
      const originalConsoleInfo = console.info
      const originalConsoleWarn = console.warn
      
      console.info = (...args) => {
        logEntries.push({ level: 'info', args: args.join(' ') })
        originalConsoleInfo(...args)
      }
      
      console.warn = (...args) => {
        logEntries.push({ level: 'warn', args: args.join(' ') })
        originalConsoleWarn(...args)
      }
      
      // Perform header operations
      responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
      responseManager.safeWriteHeaders(201, { 'Content-Type': 'text/plain' }) // Should fail
      responseManager.safeWrite('{"test": "data"}')
      responseManager.safeEnd()
      
      // Restore console methods
      console.info = originalConsoleInfo
      console.warn = originalConsoleWarn
      
      // Check for header operation logs
      const headerOperationLogs = logEntries.filter(entry => 
        entry.args.includes('writeHead') || 
        entry.args.includes('header')
      )
      
      const hasHeaderLogging = headerOperationLogs.length > 0
      
      this.collector.addResult(testName, hasHeaderLogging, null, {
        totalLogEntries: logEntries.length,
        headerOperationLogs: headerOperationLogs.length,
        hasHeaderLogging
      })
      
      console.log(`✅ ${testName}: ${hasHeaderLogging ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 5: Response state logging
   */
  async testResponseStateLogging() {
    const testName = 'Response State Logging'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const res = this.testUtils.createMockResponse()
      const requestId = this.testUtils.generateTestId()
      const responseManager = createResponseManager(res, requestId)
      
      // Mock logger to capture log entries
      const logEntries = []
      const originalConsoleDebug = console.debug
      
      console.debug = (...args) => {
        logEntries.push({ level: 'debug', args: args.join(' ') })
        originalConsoleDebug(...args)
      }
      
      // Perform operations that should log state changes
      responseManager.safeWriteHeaders(200, { 'Content-Type': 'application/json' })
      responseManager.safeWrite('{"test": "data"}')
      responseManager.safeEnd()
      
      // Restore console method
      console.debug = originalConsoleDebug
      
      // Check for response state logs
      const stateLogs = logEntries.filter(entry => 
        entry.args.includes('response_state') || 
        entry.args.includes('headersSent') ||
        entry.args.includes('responseEnded')
      )
      
      const hasStateLogging = stateLogs.length > 0
      
      this.collector.addResult(testName, hasStateLogging, null, {
        totalLogEntries: logEntries.length,
        stateLogs: stateLogs.length,
        hasStateLogging
      })
      
      console.log(`✅ ${testName}: ${hasStateLogging ? 'PASSED' : 'FAILED'}`)
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
    }
  }

  /**
   * Test 6: Error context preservation in logs
   */
  async testErrorContextPreservation() {
    const testName = 'Error Context Preservation'
    console.log(`\n🧪 Testing: ${testName}`)
    
    try {
      const { req, res, cleanup } = this.createStreamingSetup('error_context')
      const requestId = req.id
      const responseManager = createResponseManager(res, requestId)
      
      // Mock logger to capture log entries
      const logEntries = []
      const originalConsoleError = console.error
      
      console.error = (...args) => {
        logEntries.push({ level: 'error', args: args.join(' ') })
        originalConsoleError(...args)
      }
      
      const qolabaClient = this.testUtils.createMockQolabaClient({
        delay: 50,
        chunks: [
          { output: 'Start' },
          { output: ' Middle' },
          { output: ' End' }
        ],
        shouldError: true,
        errorCode: 'CONTEXT_TEST_ERROR',
        errorMessage: 'Test error with context preservation'
      })
      
      const qolabaPayload = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
      }
      
      // Start streaming (should fail with error)
      await handleStreamingResponse(
        responseManager, res, req, qolabaClient, qolabaPayload, requestId
      )
      
      // Restore console method
      console.error = originalConsoleError
      
      // Check for error context in logs
      const errorEntries = logEntries.filter(entry => entry.level === 'error')
      const hasContextInfo = errorEntries.some(entry => 
        entry.args.includes('requestId') && 
        entry.args.includes('method') && 
        entry.args.includes('url') &&
        entry.args.includes('responseState')
      )
      
      this.collector.addResult(testName, hasContextInfo, null, {
        totalErrorEntries: errorEntries.length,
        hasContextInfo
      })
      
      console.log(`✅ ${testName}: ${hasContextInfo ? 'PASSED' : 'FAILED'}`)
      cleanup()
      
    } catch (error) {
      this.collector.addResult(testName, false, error)
      console.log(`❌ ${testName}: FAILED - ${error.message}`)
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
   * Cleanup test files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.testLogFile)) {
        fs.unlinkSync(this.testLogFile)
      }
    } catch (error) {
      console.warn('Failed to cleanup test log file:', error.message)
    }
  }

  /**
   * Run all logging functionality tests
   */
  async runAllTests() {
    console.log('\n🚀 Starting Logging Functionality Tests')
    console.log('========================================')
    
    try {
      await this.testEnhancedErrorLogging()
      await this.testRequestIdTracking()
      await this.testErrorLogFileCreation()
      await this.testHeaderOperationLogging()
      await this.testResponseStateLogging()
      await this.testErrorContextPreservation()
      
      const allPassed = this.collector.printSummary()
      return allPassed
    } finally {
      this.cleanup()
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new LoggingFunctionalityTests()
  tests.runAllTests()
    .then(allPassed => {
      process.exit(allPassed ? 0 : 1)
    })
    .catch(error => {
      console.error('Test execution failed:', error)
      process.exit(1)
    })
}

export default LoggingFunctionalityTests