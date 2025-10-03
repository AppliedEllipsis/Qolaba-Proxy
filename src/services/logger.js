import winston from 'winston'
import { config } from '../config/index.js'
import { safeStringify, safePayloadSize, sanitizeForLogging } from '../utils/serialization.js'

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
    
    originalEnd.call(this, chunk, encoding)
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

export default logger