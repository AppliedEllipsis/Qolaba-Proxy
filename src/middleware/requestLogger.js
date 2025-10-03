import { v4 as uuidv4 } from 'uuid'
import { logger } from '../services/logger.js'
import { config } from '../config/index.js'
import { sanitizeForLogging, safePayloadSize } from '../utils/serialization.js'

export const requestLogger = (req, res, next) => {
  // Generate unique request ID
  req.id = uuidv4()
  
  // Add request ID to response headers
  res.set('X-Request-ID', req.id)
  
  // Log request start
  const startTime = Date.now()
  
  logger.info('Request started', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length')
  })
  
  // Use ResponseManager to log response completion instead of overriding res.end
  if (req.responseManager) {
    req.responseManager.onEnd((chunk, encoding) => {
      const duration = Date.now() - startTime
      const contentLength = res.get('Content-Length') || 0
      
      logger.info('Request completed', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: parseInt(contentLength),
        contentType: res.get('Content-Type')
      })
    })
  } else {
    // Fallback to override res.end if ResponseManager not available
    const originalEnd = res.end
    res.end = function(chunk, encoding) {
      const duration = Date.now() - startTime
      const contentLength = res.get('Content-Length') || 0
      
      logger.info('Request completed', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: parseInt(contentLength),
        contentType: res.get('Content-Type')
      })
      
      // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
      if (res.headersSent) {
        originalEnd.call(this)
      } else {
        originalEnd.call(this, chunk, encoding)
      }
    }
  }
  
  // Override res.json to log JSON responses
  const originalJson = res.json
  res.json = function(data) {
    if (config.logging.enabled && config.logging.level === 'debug') {
      logger.debug('JSON response', {
        requestId: req.id,
        dataSize: JSON.stringify(data).length,
        preview: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) + '...' : data
      })
    }
    return originalJson.call(this, data)
  }
  
  next()
}

// Request timing middleware
export const requestTimer = (req, res, next) => {
  req.startTime = Date.now()
  
  // Use ResponseManager to log slow requests instead of overriding res.end
  if (req.responseManager) {
    req.responseManager.onEnd((chunk, encoding) => {
      const duration = Date.now() - req.startTime
      
      // Log requests that take longer than 5 seconds
      if (duration > 5000) {
        logger.warn('Slow request detected', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          statusCode: res.statusCode
        })
      }
    })
  } else {
    // Fallback to override res.end if ResponseManager not available
    const originalEnd = res.end
    res.end = function(chunk, encoding) {
      const duration = Date.now() - req.startTime
      
      // Log requests that take longer than 5 seconds
      if (duration > 5000) {
        logger.warn('Slow request detected', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          statusCode: res.statusCode
        })
      }
      
      // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
      if (res.headersSent) {
        originalEnd.call(this)
      } else {
        originalEnd.call(this, chunk, encoding)
      }
    }
  }
  
  next()
}

// Request body logger (for debugging)
export const requestBodyLogger = (req, res, next) => {
  if (config.logging.enabled && config.logging.level === 'debug') {
    const originalJson = req.body
    if (originalJson && Object.keys(originalJson).length > 0) {
      // Sanitize sensitive data and use safe serialization
      const sanitizedBody = sanitizeForLogging(originalJson, {
        maxDepth: 2,
        maxStringLength: 100,
        maxArrayLength: 3
      })
      
      // Redact API keys if present
      if (sanitizedBody.api_key) {
        sanitizedBody.api_key = '[REDACTED]'
      }
      
      logger.debug('Request body', {
        requestId: req.id,
        body: sanitizedBody,
        bodySize: safePayloadSize(originalJson)
      })
    }
  }
  
  next()
}

// Response size logger
export const responseSizeLogger = (req, res, next) => {
  let responseSize = 0
  
  // Override res.write to track response size
  const originalWrite = res.write
  res.write = function(chunk, encoding) {
    responseSize += chunk.length
    return originalWrite.call(this, chunk, encoding)
  }
  
  // Use ResponseManager to log response size instead of overriding res.end
  if (req.responseManager) {
    req.responseManager.onEnd((chunk, encoding) => {
      if (chunk) {
        responseSize += chunk.length
      }
      
      if (responseSize > 1024 * 1024) { // Log responses larger than 1MB
        logger.info('Large response', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          responseSize: `${(responseSize / 1024 / 1024).toFixed(2)}MB`,
          statusCode: res.statusCode
        })
      }
    })
  } else {
    // Fallback to override res.end if ResponseManager not available
    const originalEnd = res.end
    res.end = function(chunk, encoding) {
      if (chunk) {
        responseSize += chunk.length
      }
      
      if (responseSize > 1024 * 1024) { // Log responses larger than 1MB
        logger.info('Large response', {
          requestId: req.id,
          method: req.method,
          url: req.url,
          responseSize: `${(responseSize / 1024 / 1024).toFixed(2)}MB`,
          statusCode: res.statusCode
        })
      }
      
      // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
      if (res.headersSent) {
        originalEnd.call(this)
      } else {
        originalEnd.call(this, chunk, encoding)
      }
    }
  }
  
  next()
}

export default {
  requestLogger,
  requestTimer,
  requestBodyLogger,
  responseSizeLogger
}