import winston from 'winston'
import { config } from '../config/index.js'
import { safeStringify, safePayloadSize, sanitizeForLogging } from '../utils/serialization.js'
import fs from 'fs'
import path from 'path'

// Rate limiting for log messages to prevent console flooding
const logRateLimiter = new Map()

/**
 * Check if a log message should be rate limited
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Log metadata
 * @returns {boolean} - True if message should be logged, false if rate limited
 */
function shouldLog(level, message, meta) {
  const requestId = meta?.requestId || 'global'
  const key = `${level}:${message}:${requestId}`
  const now = Date.now()
  
  // Get existing rate limit entry
  const entry = logRateLimiter.get(key)
  
  if (!entry) {
    // First occurrence - log and set rate limit
    logRateLimiter.set(key, {
      count: 1,
      firstLog: now,
      lastLog: now
    })
    return true
  }
  
  // Check if we should log this occurrence
  const timeSinceFirstLog = now - entry.firstLog
  const timeSinceLastLog = now - entry.lastLog
  
  // Log first occurrence immediately
  if (entry.count === 1) {
    entry.count++
    entry.lastLog = now
    return true
  }
  
  // Rate limit rules based on error severity
  let logInterval = 5000 // Default 5 seconds
  let maxLogsPerMinute = 12 // Default max 12 logs per minute
  
  if (level === 'error') {
    logInterval = 2000 // 2 seconds for errors
    maxLogsPerMinute = 30 // Max 30 errors per minute
  } else if (level === 'warn') {
    logInterval = 3000 // 3 seconds for warnings
    maxLogsPerMinute = 20 // Max 20 warnings per minute
  }
  
  // Check time-based rate limiting
  if (timeSinceLastLog < logInterval) {
    return false // Rate limited
  }
  
  // Check count-based rate limiting
  const logsInLastMinute = Math.floor((now - entry.firstLog) / 60000) * maxLogsPerMinute +
                           Math.min(entry.count % maxLogsPerMinute, maxLogsPerMinute - 1)
  
  if (entry.count >= maxLogsPerMinute && timeSinceFirstLog < 60000) {
    return false // Exceeded max logs per minute
  }
  
  // Update rate limit entry
  entry.count++
  entry.lastLog = now
  
  // Clean up old entries (older than 10 minutes)
  if (now - entry.firstLog > 600000) {
    logRateLimiter.delete(key)
  }
  
  return true
}

/**
 * Get rate limit summary for aggregated logging
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Log metadata
 * @returns {object|null} - Rate limit summary or null if no aggregation needed
 */
function getRateLimitSummary(level, message, meta) {
  const requestId = meta?.requestId || 'global'
  const key = `${level}:${message}:${requestId}`
  const entry = logRateLimiter.get(key)
  
  if (entry && entry.count > 1) {
    return {
      suppressedCount: entry.count - 1,
      timeWindow: Math.floor((Date.now() - entry.firstLog) / 1000)
    }
  }
  
  return null
}

// Cleanup function for rate limiter (called periodically)
export const cleanupRateLimiter = () => {
  const now = Date.now()
  const cutoff = now - 600000 // 10 minutes ago
  
  for (const [key, entry] of logRateLimiter.entries()) {
    if (entry.firstLog < cutoff) {
      logRateLimiter.delete(key)
    }
  }
}

// Schedule periodic cleanup
setInterval(cleanupRateLimiter, 300000) // Every 5 minutes

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true })
  } catch (error) {
    console.error('Failed to create logs directory:', error.message)
  }
}

// Enhanced error log format with detailed stack traces and line numbers
const errorLogFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add detailed error information
    if (meta.error) {
      log += `\nERROR DETAILS:`
      log += `\n  Message: ${meta.error.message || meta.error}`
      log += `\n  Stack: ${meta.error.stack || 'No stack trace available'}`
      
      if (meta.error.code) {
        log += `\n  Code: ${meta.error.code}`
      }
      
      if (meta.error.statusCode) {
        log += `\n  Status Code: ${meta.error.statusCode}`
      }
    }
    
    // Add request context
    if (meta.requestId) {
      log += `\nREQUEST CONTEXT:`
      log += `\n  Request ID: ${meta.requestId}`
      log += `\n  Method: ${meta.method || 'Unknown'}`
      log += `\n  URL: ${meta.url || 'Unknown'}`
      log += `\n  IP: ${meta.ip || 'Unknown'}`
    }
    
    // Add response state information
    if (meta.responseState) {
      log += `\nRESPONSE STATE:`
      log += `\n  Headers Sent: ${meta.responseState.headersSent || meta.responseState.isHeadersSent || 'Unknown'}`
      log += `\n  Response Ended: ${meta.responseState.ended || meta.responseState.isEnded || 'Unknown'}`
      log += `\n  Writable: ${meta.responseState.writable || 'Unknown'}`
    }
    
    // Add call stack information for debugging
    if (meta.callStack) {
      log += `\nCALL STACK:`
      log += `\n${meta.callStack}`
    }
    
    // Add execution context
    if (meta.context) {
      log += `\nEXECUTION CONTEXT:`
      log += `\n  File: ${meta.context.file || 'Unknown'}`
      log += `\n  Function: ${meta.context.function || 'Unknown'}`
      log += `\n  Line: ${meta.context.line || 'Unknown'}`
      log += `\n  Column: ${meta.context.column || 'Unknown'}`
    }
    
    // Add additional metadata
    const otherMeta = { ...meta }
    delete otherMeta.error
    delete otherMeta.requestId
    delete otherMeta.method
    delete otherMeta.url
    delete otherMeta.ip
    delete otherMeta.responseState
    delete otherMeta.callStack
    delete otherMeta.context
    
    if (Object.keys(otherMeta).length > 0) {
      const sanitizedOther = sanitizeForLogging(otherMeta, { maxDepth: 3, maxStringLength: 200 })
      log += `\nADDITIONAL CONTEXT: ${JSON.stringify(sanitizedOther, null, 2)}`
    }
    
    return log
  })
)

// Custom log format with rate limiting
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Check rate limiting
    if (!shouldLog(level, message, meta)) {
      return null // Skip this log entry
    }
    
    // Check for rate limit summary
    const rateLimitSummary = getRateLimitSummary(level, message, meta)
    
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add rate limit information if applicable
    if (rateLimitSummary) {
      log += ` (rate limited: ${rateLimitSummary.suppressedCount} similar messages suppressed in ${rateLimitSummary.timeWindow}s)`
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      const sanitizedMeta = sanitizeForLogging(meta, { maxDepth: 2, maxStringLength: 100 })
      log += ` ${JSON.stringify(sanitizedMeta)}`
    }
    
    return log
  })
)

// Verbose log format for debugging requests/responses
const verboseLogFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Check rate limiting
    if (!shouldLog(level, message, meta)) {
      return null // Skip this log entry
    }
    
    // Check for rate limit summary
    const rateLimitSummary = getRateLimitSummary(level, message, meta)
    
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add rate limit information if applicable
    if (rateLimitSummary) {
      log += ` (rate limited: ${rateLimitSummary.suppressedCount} suppressed in ${rateLimitSummary.timeWindow}s)`
    }
    
    // Add detailed metadata for verbose logging
    if (Object.keys(meta).length > 0) {
      if (meta.requestBody || meta.responseBody) {
        // Add request/response data in verbose mode with safe serialization
        const sanitizedMeta = sanitizeForLogging(meta, { maxDepth: 3, maxStringLength: 500 })
        log += ` ${JSON.stringify(sanitizedMeta, null, 2)}`
      } else {
        const sanitizedMeta = sanitizeForLogging(meta, { maxDepth: 2, maxStringLength: 200 })
        log += ` ${JSON.stringify(sanitizedMeta)}`
      }
    }
    
    return log
  })
)

// Debug-specific log format
const debugLogFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    // Check rate limiting (less strict for debug)
    const requestId = meta?.requestId || 'global'
    const key = `${level}:${message}:${requestId}`
    const entry = logRateLimiter.get(key)
    
    if (entry && entry.count > 5 && level === 'debug') {
      return null // Skip excessive debug logs
    }
    
    // Update rate limit for debug
    if (entry) {
      entry.count++
      entry.lastLog = Date.now()
    } else {
      logRateLimiter.set(key, {
        count: 1,
        firstLog: Date.now(),
        lastLog: Date.now()
      })
    }
    
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add metadata with special handling for debug level
    if (Object.keys(meta).length > 0) {
      if (meta.requestBody) {
        const sanitizedBody = sanitizeForLogging(meta.requestBody, { maxDepth: 3, maxStringLength: 300 })
        log += `\n  Request Body: ${JSON.stringify(sanitizedBody, null, 2)}`
      }
      if (meta.responseBody) {
        const sanitizedBody = sanitizeForLogging(meta.responseBody, { maxDepth: 3, maxStringLength: 300 })
        log += `\n  Response Body: ${JSON.stringify(sanitizedBody, null, 2)}`
      }
      if (meta.headers) {
        const sanitizedHeaders = sanitizeForLogging(meta.headers, { maxDepth: 1, maxStringLength: 100 })
        log += `\n  Headers: ${JSON.stringify(sanitizedHeaders, null, 2)}`
      }
      // Add other metadata
      const otherMeta = { ...meta }
      delete otherMeta.requestBody
      delete otherMeta.responseBody
      delete otherMeta.headers
      if (Object.keys(otherMeta).length > 0) {
        const sanitizedOther = sanitizeForLogging(otherMeta, { maxDepth: 2, maxStringLength: 150 })
        log += `\n  Other: ${JSON.stringify(sanitizedOther, null, 2)}`
      }
    }
    
    return log
  })
)

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: config.logging.level === 'debug' ? debugLogFormat : 
           config.logging.enabled === true && config.logging.level === 'debug' ? verboseLogFormat :
           config.logging.format === 'json' ? logFormat : winston.format.simple(),
  defaultMeta: { 
    service: 'qoloba-proxy',
    version: '1.0.0',
    environment: config.server.nodeEnv
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.logging.level === 'debug' ? debugLogFormat :
              winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
    }),
    
    // File transports (only in production or when verbose logging is enabled)
    ...(config.server.nodeEnv === 'production' || config.logging.enabled === true ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: logFormat
      }),
      // Enhanced error log with detailed stack traces
      new winston.transports.File({
        filename: 'errors.log',
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 10,
        format: errorLogFormat
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: config.logging.enabled === true && config.logging.level === 'debug' ? verboseLogFormat : logFormat
      }),
      // Separate debug log file when debug mode is enabled
      ...(config.logging.level === 'debug' ? [
        new winston.transports.File({
          filename: 'logs/debug.log',
          maxsize: 10485760, // 10MB
          maxFiles: 3,
          format: verboseLogFormat
        })
      ] : [])
    ] : [])
  ]
})

// Request-specific logger
export const requestLogger = (req, res, next) => {
  const start = Date.now()
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id
  })
  
  // Override res.end to log response
  const originalEnd = res.end
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.id
    })
    
    // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
    // Also don't call end() if the response has already ended
    if (res.headersSent || res.writableEnded) {
      if (!res.writableEnded) {
        originalEnd.call(this)
      }
    } else {
      originalEnd.call(this, chunk, encoding)
    }
  }
  
  next()
}

// Error-specific logger
export const logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    ...context
  })
}

// Performance logger
export const logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  })
}

// Qolaba API logger
export const logQolabaRequest = (endpoint, method, payload, responseTime, statusCode) => {
  logger.info('Qolaba API request', {
    endpoint,
    method,
    responseTime: `${responseTime}ms`,
    statusCode,
    payloadSize: safePayloadSize(payload)
  })
}

// Usage tracker logger
export const logUsage = (model, inputTokens, outputTokens, cost, userId) => {
  logger.info('Usage metrics', {
    model,
    inputTokens,
    outputTokens,
    cost,
    userId,
    timestamp: new Date().toISOString()
  })
}

// Enhanced request/response logger for debugging
export const logRequestResponse = (req, res, options = {}) => {
  const { includeBody = false, includeHeaders = false, maxBodySize = 1000 } = options
  
  const logData = {
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    statusCode: res.statusCode,
    duration: Date.now() - req.startTime
  }
  
  if (includeHeaders) {
    logData.headers = {
      request: req.headers,
      response: res.getHeaders()
    }
  }
  
  if (includeBody) {
    if (req.body && Object.keys(req.body).length > 0) {
      const sanitizedBody = sanitizeForLogging(req.body, {
        maxDepth: 2,
        maxStringLength: maxBodySize / 2,
        maxArrayLength: 5
      })
      logData.requestBody = sanitizedBody
    }
  }
  
  logger.info('Request/Response details', logData)
}

// Enhanced error logging with detailed stack traces and line numbers
export const logDetailedError = (error, context = {}) => {
  // Capture call stack at the point of logging
  const callStack = new Error().stack
  
  // Extract file and line information from the stack
  const stackLines = callStack.split('\n')
  const callerLine = stackLines[3] || 'Unknown location' // Skip this function and the logger call
  
  // Extract file, function, and line number information
  const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/)
  let fileContext = {}
  if (match) {
    fileContext = {
      function: match[1],
      file: match[2],
      line: match[3],
      column: match[4]
    }
  } else {
    // Fallback for different stack trace formats
    const fallbackMatch = callerLine.match(/(.+?):(\d+):(\d+)/)
    if (fallbackMatch) {
      fileContext = {
        function: 'Unknown',
        file: fallbackMatch[1],
        line: fallbackMatch[2],
        column: fallbackMatch[3]
      }
    } else {
      fileContext = {
        function: 'Unknown',
        file: callerLine.trim(),
        line: 'Unknown',
        column: 'Unknown'
      }
    }
  }
  
  // Prepare response state information
  const responseState = context.responseState || {}
  const responseStateInfo = {
    headersSent: responseState.headersSent || responseState.isHeadersSent,
    ended: responseState.ended || responseState.isEnded,
    writable: responseState.writable
  }
  
  // Log to both the main logger and the detailed error logger
  logger.error('Detailed error occurred', {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    },
    requestId: context.requestId,
    method: context.method,
    url: context.url,
    ip: context.ip,
    responseState: responseStateInfo,
    callStack: callStack,
    context: fileContext,
    ...context.additionalInfo
  })
  
  // Also write to errors.log file directly for immediate access
  const errorLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message: error.message,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    },
    requestContext: {
      requestId: context.requestId,
      method: context.method,
      url: context.url,
      ip: context.ip
    },
    responseState: responseStateInfo,
    executionContext: fileContext,
    callStack: callStack,
    additionalContext: context.additionalInfo || {}
  }
  
  // Write to errors.log file
  try {
    const errorLogPath = path.join(process.cwd(), 'errors.log')
    const logLine = JSON.stringify(errorLogEntry) + '\n'
    fs.appendFileSync(errorLogPath, logLine)
  } catch (fileError) {
    console.error('Failed to write to errors.log:', fileError.message)
  }
}

// Log response state changes for debugging
export const logResponseState = (requestId, action, state = {}) => {
  logger.debug(`Response state change: ${action}`, {
    requestId,
    action,
    headersSent: state.headersSent,
    responseEnded: state.responseEnded,
    writable: state.writable,
    timestamp: new Date().toISOString()
  })
}

// Log header-related operations for debugging "Cannot set headers after sent" errors
export const logHeaderOperation = (requestId, operation, success, error = null) => {
  const level = success ? 'debug' : 'error'
  logger[level](`Header operation: ${operation}`, {
    requestId,
    operation,
    success,
    error: error ? error.message : null,
    timestamp: new Date().toISOString()
  })
  
  // If this is an error, also log it with detailed error logging
  if (!success && error) {
    logDetailedError(error, {
      requestId,
      method: operation,
      url: 'header_operation',
      additionalInfo: {
        operationType: operation,
        headerError: true
      }
    })
  }
}

export default logger