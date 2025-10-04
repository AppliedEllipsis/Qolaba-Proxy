import { logger, logDetailedError, logResponseState, logHeaderOperation } from '../services/logger.js'
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

    // ENHANCEMENT: Stream-aware timeout with coordinated cancellation
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

      // ENHANCEMENT: Check for ResponseManager coordination first
      if (res.cancelAllTimeouts && typeof res.cancelAllTimeouts === 'function') {
        try {
          const cancelled = res.cancelAllTimeouts('request_timeout')
          if (cancelled) {
            logger.debug('Timeout cancelled by ResponseManager coordination', {
              requestId,
              duration: `${duration}ms`
            })
            return // Don't proceed with timeout response
          }
        } catch (error) {
          logDetailedError(error, {
            requestId,
            method: 'cancel_timeouts_responsemanager',
            url: 'request_timeout_middleware',
            responseState: {
              headersSent: res.headersSent,
              ended: res.writableEnded,
              writable: res.writable
            },
            additionalInfo: {
              timeoutDuration: `${duration}ms`,
              timeoutMs,
              isStreamingRequest,
              operation: 'cancel_all_timeouts'
            }
          })
          
          logger.warn('Failed to cancel timeouts via ResponseManager', {
            requestId,
            error: error.message
          })
        }
      }

      // ENHANCEMENT: Only send timeout response if headers haven't been sent AND response isn't already terminated
      if (!res.headersSent && !res.writableEnded) {
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
          logDetailedError(error, {
            requestId,
            method: 'send_timeout_response',
            url: 'request_timeout_middleware',
            responseState: {
              headersSent: res.headersSent,
              ended: res.writableEnded,
              writable: res.writable
            },
            additionalInfo: {
              timeoutDuration: `${duration}ms`,
              timeoutMs,
              isStreamingRequest,
              statusCode: 408,
              errorType: 'timeout_response'
            }
          })
          
          logger.warn('Failed to send timeout response', {
            requestId,
            error: error.message
          })
        }
      } else {
        // For streaming requests where headers are already sent or response ended, just log
        logger.debug('Timeout reached but response already sent or ended, skipping timeout response', {
          requestId,
          isStreaming: isStreamingRequest,
          duration: `${duration}ms`,
          headersSent: res.headersSent,
          writableEnded: res.writableEnded
        })
      }

      // Force close the connection only if it's not a healthy streaming request
      if (!isStreamingRequest || res.headersSent) {
        try {
          if (res.socket && !res.socket.destroyed) {
            res.socket.destroy()
          }
        } catch (error) {
          logDetailedError(error, {
            requestId,
            method: 'destroy_socket_timeout',
            url: 'request_timeout_middleware',
            responseState: {
              headersSent: res.headersSent,
              ended: res.writableEnded,
              writable: res.writable
            },
            additionalInfo: {
              timeoutDuration: `${duration}ms`,
              timeoutMs,
              isStreamingRequest,
              socketDestroyed: res.socket ? !res.socket.destroyed : 'N/A',
              operation: 'socket_destruction'
            }
          })
          
          logger.warn('Failed to destroy socket on timeout', {
            requestId,
            error: error.message
          })
        }
      }
    }, timeoutMs)

    // ENHANCEMENT: Register timeout with ResponseManager for coordinated cancellation
    if (res.registerTimeoutCallback && typeof res.registerTimeoutCallback === 'function') {
      try {
        const registered = res.registerTimeoutCallback((reason) => {
          clearTimeout(timeout)
          logger.debug('Request timeout cancelled via ResponseManager', {
            requestId,
            reason,
            duration: `${Date.now() - startTime}ms`
          })
        })
        
        if (registered) {
          logger.debug('Request timeout registered with ResponseManager', {
            requestId,
            timeoutMs,
            isStreaming: isStreamingRequest
          })
        }
      } catch (error) {
        logDetailedError(error, {
          requestId,
          method: 'register_timeout_responsemanager',
          url: 'request_timeout_middleware',
          responseState: {
            headersSent: res.headersSent,
            ended: res.writableEnded,
            writable: res.writable
          },
          additionalInfo: {
            timeoutMs,
            isStreamingRequest,
            operation: 'register_timeout_callback'
          }
        })
        
        logger.warn('Failed to register timeout with ResponseManager', {
          requestId,
          error: error.message
        })
      }
    }

    // Store timeout reference for potential manual cleanup and ResponseManager coordination
    req.timeoutRef = timeout
    if (res.setRequestTimeoutRef && typeof res.setRequestTimeoutRef === 'function') {
      try {
        res.setRequestTimeoutRef(timeout)
      } catch (error) {
        logDetailedError(error, {
          requestId,
          method: 'set_timeout_reference',
          url: 'request_timeout_middleware',
          responseState: {
            headersSent: res.headersSent,
            ended: res.writableEnded,
            writable: res.writable
          },
          additionalInfo: {
            timeoutMs,
            isStreamingRequest,
            operation: 'set_timeout_ref'
          }
        })
        
        logger.warn('Failed to set timeout reference in ResponseManager', {
          requestId,
          error: error.message
        })
      }
    }

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

      // ENHANCEMENT: Cancel all registered timeouts on cleanup
      if (res.cancelAllTimeouts && typeof res.cancelAllTimeouts === 'function') {
        try {
          res.cancelAllTimeouts('request_completed')
        } catch (error) {
          logDetailedError(error, {
            requestId,
            method: 'cleanup_cancel_timeouts',
            url: 'request_timeout_middleware',
            responseState: {
              headersSent: res.headersSent,
              ended: res.writableEnded,
              writable: res.writable
            },
            additionalInfo: {
              duration: `${duration}ms`,
              timeoutMs,
              isStreamingRequest,
              operation: 'cleanup_cancel_timeouts'
            }
          })
          
          logger.warn('Failed to cancel timeouts during cleanup', {
            requestId,
            error: error.message
          })
        }
      }
    }

    // Listen for response finish or close events
    res.on('finish', cleanup)
    res.on('close', cleanup)

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