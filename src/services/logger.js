import winston from 'winston'
import { config } from '../config/index.js'

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
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
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add detailed metadata for verbose logging
    if (Object.keys(meta).length > 0) {
      if (meta.requestBody || meta.responseBody) {
        // Add request/response data in verbose mode
        log += ` ${JSON.stringify(meta, null, 2)}`
      } else {
        log += ` ${JSON.stringify(meta)}`
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
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`
    
    // Add metadata with special handling for debug level
    if (Object.keys(meta).length > 0) {
      if (meta.requestBody) {
        log += `\n  Request Body: ${JSON.stringify(meta.requestBody, null, 2)}`
      }
      if (meta.responseBody) {
        log += `\n  Response Body: ${JSON.stringify(meta.responseBody, null, 2)}`
      }
      if (meta.headers) {
        log += `\n  Headers: ${JSON.stringify(meta.headers, null, 2)}`
      }
      // Add other metadata
      const otherMeta = { ...meta }
      delete otherMeta.requestBody
      delete otherMeta.responseBody
      delete otherMeta.headers
      if (Object.keys(otherMeta).length > 0) {
        log += `\n  Other: ${JSON.stringify(otherMeta, null, 2)}`
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
    payloadSize: JSON.stringify(payload).length
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
      const bodyStr = JSON.stringify(req.body)
      logData.requestBody = bodyStr.length > maxBodySize 
        ? bodyStr.substring(0, maxBodySize) + '...[truncated]' 
        : req.body
    }
  }
  
  logger.info('Request/Response details', logData)
}

export default logger