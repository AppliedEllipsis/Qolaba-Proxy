import { logger } from '../services/logger.js'
import { TimeoutError } from './errorHandler.js'

/**
 * Smart request timeout middleware that distinguishes between streaming and non-streaming requests
 * Prevents hanging requests by enforcing appropriate timeouts
 */
export const requestTimeout = (defaultTimeoutMs = 30000) => {
  return (req, res, next) => {
    const startTime = Date.now()
    const requestId = req.id || 'unknown'
    
    // Determine if this is a streaming request
    const isStreamingRequest = detectStreamingRequest(req)
    
    // Set appropriate timeout based on request type
    const timeoutMs = isStreamingRequest ?
      Math.max(defaultTimeoutMs * 4, 120000) : // 4x default or 2 minutes minimum for streaming
      defaultTimeoutMs

    // Mark the request as streaming for other middleware
    req.isStreaming = isStreamingRequest
    req.timeoutMs = timeoutMs

    // CRITICAL FIX: Stream-aware timeout handling
    const timeout = setTimeout(() => {
      const duration = Date.now() - startTime

      logger.warn('Request timeout reached', {
        requestId,
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        timeout: `${timeoutMs}ms`,
        isStreaming: isStreamingRequest
      })

      // CRITICAL FIX: Only send timeout response if headers haven't been sent
      // This prevents "Cannot set headers after they are sent to the client" errors
      if (!res.headersSent) {
        try {
          res.status(408).json({
            error: {
              message: `Request timeout after ${timeoutMs}ms`,
              type: 'api_error',
              code: 'timeout',
              request_id: requestId,
              streaming: isStreamingRequest
            }
          })
        } catch (error) {
          logger.warn('Failed to send timeout response', {
            requestId,
            error: error.message
          })
        }
      } else {
        // For streaming requests where headers are already sent, just log and let the stream handle it
        logger.debug('Timeout reached but headers already sent, allowing stream to continue', {
          requestId,
          isStreaming: isStreamingRequest,
          duration: `${duration}ms`
        })
      }

      // Force close the connection only if it's not a healthy streaming request
      if (!isStreamingRequest || res.headersSent) {
        try {
          if (res.socket && !res.socket.destroyed) {
            res.socket.destroy()
          }
        } catch (error) {
          logger.warn('Failed to destroy socket on timeout', {
            requestId,
            error: error.message
          })
        }
      }
    }, timeoutMs)

    // Clear timeout when request completes
    const cleanup = () => {
      clearTimeout(timeout)
      const duration = Date.now() - startTime

      if (duration > timeoutMs * 0.8) { // Log if request took more than 80% of timeout
        logger.warn('Request completed near timeout', {
          requestId,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          timeout: `${timeoutMs}ms`,
          isStreaming: isStreamingRequest
        })
      }
    }

    // Listen for response finish or close events
    res.on('finish', cleanup)
    res.on('close', cleanup)

    // Store timeout reference for potential manual cleanup
    req.timeoutRef = timeout

    next()
  }
}

/**
 * Detect if a request is likely to be a streaming request
 */
function detectStreamingRequest(req) {
  // Check URL path
  if (req.path === '/v1/chat/completions' && req.method === 'POST') {
    return true
  }
  
  // Check if request body has stream: true
  if (req.body && req.body.stream === true) {
    return true
  }
  
  // Check for streaming-related headers
  const streamingHeaders = [
    'text/event-stream',
    'application/x-ndjson'
  ]
  
  const acceptHeader = req.get('Accept') || req.get('accept')
  if (acceptHeader && streamingHeaders.some(header => acceptHeader.includes(header))) {
    return true
  }
  
  return false
}

/**
 * Manual timeout cleanup for long-running requests
 */
export const clearRequestTimeout = (req) => {
  if (req.timeoutRef) {
    clearTimeout(req.timeoutRef)
    req.timeoutRef = null
  }
}

/**
 * Extend timeout for specific long-running operations
 */
export const extendTimeout = (req, additionalMs = 30000) => {
  if (req.timeoutRef) {
    clearTimeout(req.timeoutRef)

    const newTimeout = setTimeout(() => {
      logger.warn('Extended request timeout reached', {
        requestId: req.id || 'unknown',
        method: req.method,
        url: req.url
      })

      if (!req.res.headersSent) {
        req.res.status(408).json({
          error: {
            message: 'Request timeout (extended)',
            type: 'api_error',
            code: 'timeout'
          }
        })
      }
    }, additionalMs)

    req.timeoutRef = newTimeout
  }
}

export default requestTimeout