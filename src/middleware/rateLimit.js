import { config } from '../config/index.js'
import { logger } from '../services/logger.js'
import { RateLimitError } from './errorHandler.js'

// Simple in-memory rate limiting store
const rateLimitStore = new Map()

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

export const rateLimit = (req, res, next) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress
    const apiKey = req.originalApiKey || 'anonymous'
    
    // Create rate limit key based on IP and API key
    const rateLimitKey = `${clientIp}:${apiKey}`
    
    const now = Date.now()
    const windowStart = now - (60 * 1000) // 1 minute window
    
    // Get or create rate limit data
    let rateLimitData = rateLimitStore.get(rateLimitKey)
    
    if (!rateLimitData || rateLimitData.resetTime < now) {
      rateLimitData = {
        count: 0,
        resetTime: now + (60 * 1000), // Reset in 1 minute
        windowStart: now
      }
      rateLimitStore.set(rateLimitKey, rateLimitData)
    }
    
    // Check if limit exceeded
    const maxRequests = config.performance.concurrentRequests || 100
    if (rateLimitData.count >= maxRequests) {
      const resetTime = new Date(rateLimitData.resetTime).toISOString()
      
      logger.warn('Rate limit exceeded', {
        clientIp,
        apiKey: apiKey.substring(0, 8) + '...',
        count: rateLimitData.count,
        limit: maxRequests,
        resetTime,
        requestId: req.id
      })
      
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': Math.ceil(rateLimitData.resetTime / 1000),
        'Retry-After': Math.ceil((rateLimitData.resetTime - now) / 1000)
      })
      
      throw new RateLimitError('Rate limit exceeded. Please try again later.')
    }
    
    // Increment counter
    rateLimitData.count++
    
    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - rateLimitData.count)
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': Math.ceil(rateLimitData.resetTime / 1000)
    })
    
    logger.debug('Rate limit check passed', {
      clientIp,
      apiKey: apiKey.substring(0, 8) + '...',
      count: rateLimitData.count,
      remaining,
      requestId: req.id
    })
    
    next()
  } catch (error) {
    if (error instanceof RateLimitError) {
      return res.status(429).json({
        error: {
          message: error.message,
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      })
    }
    
    // Log other errors and proceed
    logger.error('Rate limiting error:', error, { requestId: req.id })
    next()
  }
}

// Custom rate limit middleware with configurable limits
export const createRateLimit = (options = {}) => {
  const {
    windowMs = 60 * 1000, // 1 minute
    maxRequests = 100,
    keyGenerator = (req) => req.ip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options
  
  const store = new Map()
  
  // Cleanup expired entries
  setInterval(() => {
    const now = Date.now()
    for (const [key, data] of store.entries()) {
      if (data.resetTime < now) {
        store.delete(key)
      }
    }
  }, 60000)
  
  return (req, res, next) => {
    try {
      const key = keyGenerator(req)
      const now = Date.now()
      
      let data = store.get(key)
      
      if (!data || data.resetTime < now) {
        data = {
          count: 0,
          resetTime: now + windowMs,
          windowStart: now
        }
        store.set(key, data)
      }
      
      if (data.count >= maxRequests) {
        const resetTime = new Date(data.resetTime).toISOString()
        
        res.set({
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': Math.ceil(data.resetTime / 1000),
          'Retry-After': Math.ceil((data.resetTime - now) / 1000)
        })
        
        throw new RateLimitError('Rate limit exceeded')
      }
      
      // Use ResponseManager to increment counter based on response
      if (req.responseManager) {
        req.responseManager.onEnd((chunk, encoding) => {
          if ((skipSuccessfulRequests && res.statusCode < 400) ||
              (skipFailedRequests && res.statusCode >= 400)) {
            // Don't count this request
          } else {
            data.count++
          }
          
          // Update remaining count
          const remaining = Math.max(0, maxRequests - data.count)
          res.set('X-RateLimit-Remaining', remaining)
        })
      } else {
        // Fallback to override res.end if ResponseManager not available
        const originalEnd = res.end
        res.end = function(chunk, encoding) {
          if ((skipSuccessfulRequests && res.statusCode < 400) ||
              (skipFailedRequests && res.statusCode >= 400)) {
            // Don't count this request
          } else {
            data.count++
          }
          
          // Update remaining count
          const remaining = Math.max(0, maxRequests - data.count)
          res.set('X-RateLimit-Remaining', remaining)
          
          // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
          if (res.headersSent) {
            originalEnd.call(this)
          } else {
            originalEnd.call(this, chunk, encoding)
          }
        }
      }
      
      const remaining = Math.max(0, maxRequests - data.count)
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': remaining,
        'X-RateLimit-Reset': Math.ceil(data.resetTime / 1000)
      })
      
      next()
    } catch (error) {
      if (error instanceof RateLimitError) {
        return res.status(429).json({
          error: {
            message: error.message,
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded'
          }
        })
      }
      
      next(error)
    }
  }
}

// Stream-specific rate limiting (more restrictive)
export const streamRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50, // Lower limit for streaming requests
  keyGenerator: (req) => `${req.ip}:${req.originalApiKey || 'anonymous'}:stream`
})

export default { rateLimit, createRateLimit, streamRateLimit }