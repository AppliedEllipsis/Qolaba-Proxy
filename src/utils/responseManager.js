import { logger } from '../services/logger.js'

/**
 * Centralized response manager to prevent multiple res.end() calls
 * and coordinate between different middleware
 */
export class ResponseManager {
  constructor(res, requestId) {
    this.res = res
    this.requestId = requestId
    this.isEnded = false
    this.endCallbacks = []
    this.originalEnd = res.end
    this.headersSent = false

    // Override res.end to centralize response ending
    this._overrideEnd()

    // Track when headers are sent
    this._trackHeaders()
  }

  /**
   * Override res.end to centralize response ending
   */
  _overrideEnd() {
    const self = this
    this.res.end = function(chunk, encoding) {
      if (self.isEnded) {
        logger.debug('Response already ended, skipping', {
          requestId: self.requestId
        })
        return
      }

      // Mark as ended before calling original end
      self.isEnded = true

      // Execute all end callbacks
      for (const callback of self.endCallbacks) {
        try {
          callback(chunk, encoding)
        } catch (error) {
          logger.error('End callback failed', {
            requestId: self.requestId,
            error: error.message
          })
        }
      }

      // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
      if (self.headersSent) {
        self.originalEnd.call(this)
      } else {
        self.originalEnd.call(this, chunk, encoding)
      }
    }
  }

  /**
   * Track when headers are sent
   */
  _trackHeaders() {
    const self = this
    const originalWriteHead = this.res.writeHead

    this.res.writeHead = function(...args) {
      self.headersSent = true
      return originalWriteHead.apply(this, args)
    }
  }

  /**
   * Register a callback to be called when response ends
   */
  onEnd(callback) {
    this.endCallbacks.push(callback)
  }

  /**
   * Check if response has ended
   */
  hasEnded() {
    return this.isEnded
  }

  /**
   * Check if headers have been sent
   */
  areHeadersSent() {
    return this.headersSent || this.res.headersSent
  }

  /**
   * Get the original end function
   */
  getOriginalEnd() {
    return this.originalEnd
  }
}

/**
 * Create a response manager for a request
 */
export function createResponseManager(res, requestId) {
  return new ResponseManager(res, requestId)
}

export default {
  ResponseManager,
  createResponseManager
}