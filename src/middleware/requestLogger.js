import { v4 as uuidv4 } from 'uuid'
import { logger } from '../services/logger.js'
import { config } from '../config/index.js'

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
  
  // Override res.end to log response completion
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
    
    // Call original end
    originalEnd.call(this, chunk, encoding)
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
  
  // Log slow requests
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
    
    originalEnd.call(this, chunk, encoding)
  }
  
  next()
}

// Request body logger (for debugging)
export const requestBodyLogger = (req, res, next) => {
  if (config.logging.enabled && config.logging.level === 'debug') {
    const originalJson = req.body
    if (originalJson && Object.keys(originalJson).length > 0) {
      // Sanitize sensitive data
      const sanitizedBody = { ...originalJson }
      if (sanitizedBody.api_key) {
        sanitizedBody.api_key = '[REDACTED]'
      }
      if (sanitizedBody.messages) {
        sanitizedBody.messages = sanitizedBody.messages.map(msg => ({
          ...msg,
          content: typeof msg.content === 'string' 
            ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
            : msg.content
        }))
      }
      
      logger.debug('Request body', {
        requestId: req.id,
        body: sanitizedBody,
        bodySize: JSON.stringify(originalJson).length
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
  
  // Override res.end to log final size
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
    
    originalEnd.call(this, chunk, encoding)
  }
  
  next()
}

export default {
  requestLogger,
  requestTimer,
  requestBodyLogger,
  responseSizeLogger
}