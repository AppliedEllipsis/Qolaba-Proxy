import { logger, logDetailedError, logResponseState, logHeaderOperation } from '../services/logger.js'

/**
 * Unified Response Manager - Single source of truth for response state
 * Consolidates functionality from both ResponseManager and ResponseState
 * Prevents race conditions and ensures proper coordination between systems
 */
export class ResponseManager {
  constructor(res, requestId) {
    this.res = res
    this.requestId = requestId
    this.isEnded = false
    this.endCallbacks = []
    this.originalEnd = res.end
    this.originalWrite = res.write
    this.originalWriteHead = res.writeHead
    this.headersSent = false
    this.isDestroyed = false
    
    // Streaming-specific state
    this.isStreaming = false
    this.streamingCompleted = false
    
    // CRITICAL FIX: Add termination coordination to prevent race conditions
    this.isTerminationInProgress = false
    this.terminationLock = Promise.resolve()
    this.terminationReason = null
    
    // ENHANCEMENT: Add timeout coordination for streaming requests
    this.timeoutCallbacks = new Set()
    this.isTimeoutCancelled = false
    this.requestTimeoutRef = null

    // Log response manager initialization
    logResponseState(requestId, 'response_manager_initialized', {
      headersSent: this.headersSent,
      responseEnded: this.isEnded,
      writable: res.writable
    })

    // Override response methods to centralize management
    this._overrideMethods()
  }

  /**
   * Override all response methods to centralize management
   */
  _overrideMethods() {
    const self = this
    
    // Override writeHead
    this.res.writeHead = function(...args) {
      // CRITICAL FIX: Add header state guard to prevent setting headers after they're sent
      if (self.headersSent) {
        logger.warn('Attempted to write headers after they were already sent', {
          requestId: self.requestId,
          args: args.slice(0, 2) // Log only status and headers for security
        })
        return false
      }
      
      if (self.isEnded || self.isDestroyed) {
        logger.warn('Attempted to write headers on ended or destroyed response', {
          requestId: self.requestId,
          isEnded: self.isEnded,
          isDestroyed: self.isDestroyed
        })
        return false
      }

      // Log header write attempt
      logResponseState(self.requestId, 'write_head_attempt', {
        headersSent: self.headersSent,
        responseEnded: self.isEnded,
        writable: self.res.writable,
        statusCode: args[0],
        headers: args[1]
      })

      try {
        self.headersSent = true
        const result = self.originalWriteHead.apply(this, args)
        
        logHeaderOperation(self.requestId, 'writeHead', true)
        logResponseState(self.requestId, 'headers_sent_successfully', {
          headersSent: true,
          responseEnded: self.isEnded,
          writable: self.res.writable,
          statusCode: args[0]
        })
        
        return result
      } catch (error) {
        logDetailedError(error, {
          requestId: self.requestId,
          method: 'writeHead',
          url: 'response_manager',
          responseState: {
            headersSent: self.headersSent,
            ended: self.isEnded,
            writable: self.res.writable
          },
          additionalInfo: {
            statusCode: args[0],
            headers: args[1],
            writeHeadArgs: args
          }
        })
        
        logHeaderOperation(self.requestId, 'writeHead', false, error)
        throw error
      }
    }

    // Override write
    this.res.write = function(...args) {
      if (self.isEnded) {
        logger.warn('Attempted to write to ended response', {
          requestId: self.requestId
        })
        return false
      }
      
      if (self.isDestroyed) {
        logger.warn('Attempted to write to destroyed response', {
          requestId: self.requestId
        })
        return false
      }
      
      return self.originalWrite.apply(this, args)
    }

    // Override end
    this.res.end = function(chunk, encoding) {
      if (self.isEnded) {
        logger.debug('Response already ended, skipping', {
          requestId: self.requestId,
          headersSent: self.areHeadersSent(),
          writable: self.res.writable
        })
        return
      }

      // Log response ending attempt
      logResponseState(self.requestId, 'response_ending_attempt', {
        headersSent: self.areHeadersSent(),
        responseEnded: self.isEnded,
        writable: self.res.writable,
        hasChunk: !!chunk,
        encoding: encoding || 'none'
      })

      // Mark as ended before calling original end
      self.isEnded = true
      
      // If streaming, mark streaming as completed when end is called
      if (self.isStreaming && !self.streamingCompleted) {
        self.streamingCompleted = true
      }

      // Execute all end callbacks AFTER marking as ended to prevent race conditions
      for (const callback of self.endCallbacks) {
        try {
          logResponseState(self.requestId, 'executing_end_callback', {
            headersSent: self.areHeadersSent(),
            responseEnded: self.isEnded,
            writable: self.res.writable
          })
          callback()
        } catch (error) {
          // ENHANCEMENT: Prevent header setting in end callbacks after headers are already sent
          if (!self.areHeadersSent()) {
            // Enhanced error logging with detailed context
            logDetailedError(error, {
              requestId: self.requestId,
              method: 'end_callback',
              url: 'response_manager',
              responseState: {
                headersSent: self.areHeadersSent(),
                ended: self.isEnded,
                writable: self.res.writable
              },
              additionalInfo: {
                callbackIndex: self.endCallbacks.indexOf(callback),
                totalCallbacks: self.endCallbacks.length,
                callbackType: 'end_callback'
              }
            })
            
            logger.error('End callback failed', {
              requestId: self.requestId,
              error: error.message,
              headersSent: self.areHeadersSent()
            })
            
            // If headers are already sent, we can't send a new error response.
            // The response is already being written, so we just log the callback failure.
            if (!self.areHeadersSent()) {
              // Re-throw to be caught by the global error handler if response hasn't started
              throw error
            }
          } else {
            // Just log the error but don't re-throw if headers are already sent
            logger.warn('End callback failed after headers sent, suppressing', {
              requestId: self.requestId,
              error: error.message
            })
          }
        }
      }

      // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
      try {
        logHeaderOperation(self.requestId, 'res.end_call', true)
        
        if (self.headersSent) {
          logResponseState(self.requestId, 'calling_original_end_no_params', {
            headersSent: true,
            responseEnded: self.isEnded
          })
          self.originalEnd.call(this)
        } else {
          logResponseState(self.requestId, 'calling_original_end_with_params', {
            headersSent: false,
            responseEnded: self.isEnded,
            hasChunk: !!chunk,
            encoding: encoding || 'none'
          })
          self.originalEnd.call(this, chunk, encoding)
        }
        
        logResponseState(self.requestId, 'response_ended_successfully', {
          headersSent: self.areHeadersSent(),
          responseEnded: self.isEnded,
          writable: self.res.writable
        })
      } catch (error) {
        logDetailedError(error, {
          requestId: self.requestId,
          method: 'res.end',
          url: 'response_manager',
          responseState: {
            headersSent: self.areHeadersSent(),
            ended: self.isEnded,
            writable: self.res.writable
          },
          additionalInfo: {
            headersSent: self.headersSent,
            hasChunk: !!chunk,
            encoding: encoding || 'none',
            endCallType: self.headersSent ? 'no_params' : 'with_params'
          }
        })
        
        logHeaderOperation(self.requestId, 'res.end_call', false, error)
        throw error
      }
    }
    
    // Add safe methods for external use
    this.res.safeWriteHead = function(...args) {
      if (!self.headersSent && !self.isEnded && !self.isDestroyed) {
        return self.originalWriteHead.apply(this, args)
      }
      return false
    }

    this.res.safeWrite = function(...args) {
      if (!self.isEnded && !self.isDestroyed) {
        return self.originalWrite.apply(this, args)
      }
      return false
    }

    this.res.safeEnd = function(...args) {
      if (!self.isEnded && !self.isDestroyed) {
        self.isEnded = true
        // If streaming, mark as completed when end is called
        if (self.isStreaming && !self.streamingCompleted) {
          self.streamingCompleted = true
        }
        // CRITICAL FIX: For streaming responses, don't pass args to end() if headers already sent
        if (self.headersSent) {
          return self.originalEnd.call(this)
        } else {
          return self.originalEnd.apply(this, args)
        }
      }
      return false
    }

    // Add method to check if response can still be written to
    this.res.canWrite = function() {
      return !self.isEnded && !self.isDestroyed
    }

    // Add method to check if headers can still be sent
    this.res.canWriteHeaders = function() {
      return !self.headersSent && !self.isEnded && !self.isDestroyed
    }

    // Convenience: mark streaming started/completed
    this.res.markStreamingStarted = function() {
      self.isStreaming = true
    }
    this.res.markStreamingCompleted = function() {
      self.streamingCompleted = true
    }
    
    // Add method to register timeout callbacks
    this.res.registerTimeoutCallback = function(callback) {
      if (!self.isTimeoutCancelled && !self.isEnded && !self.isDestroyed) {
        self.timeoutCallbacks.add(callback)
        return true
      }
      return false
    }
    
    // Add method to cancel all registered timeouts
    this.res.cancelAllTimeouts = function(reason = 'response_complete') {
      if (self.isTimeoutCancelled) {
        return false // Already cancelled
      }
      
      self.isTimeoutCancelled = true
      logger.debug('Cancelling all registered timeouts', {
        requestId: self.requestId,
        reason,
        callbackCount: self.timeoutCallbacks.size
      })
      
      // Execute all timeout callbacks
      for (const callback of self.timeoutCallbacks) {
        try {
          callback(reason)
        } catch (error) {
          logger.warn('Timeout callback failed', {
            requestId: self.requestId,
            error: error.message
          })
        }
      }
      
      self.timeoutCallbacks.clear()
      return true
    }
    
    // Add method to check if timeouts can be cancelled
    this.res.canCancelTimeouts = function() {
      return !self.isTimeoutCancelled && !self.isDestroyed
    }
    
    // Add method to set request timeout reference
    this.res.setRequestTimeoutRef = function(timeoutRef) {
      self.requestTimeoutRef = timeoutRef
    }
    
    // Add method to get request timeout reference
    this.res.getRequestTimeoutRef = function() {
      return self.requestTimeoutRef
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

  /**
   * CRITICAL FIX: Coordinated termination to prevent race conditions
   */
  async coordinatedTermination(reason = 'unknown') {
    // Use a more robust locking mechanism to prevent race conditions
    if (this.isTerminationInProgress) {
      logger.debug('Termination already in progress, waiting', {
        requestId: this.requestId,
        currentReason: this.terminationReason,
        newReason: reason
      })
      // Wait for the current termination to complete
      await this.terminationLock
      return
    }

    // Mark termination as in progress and create a new lock
    this.isTerminationInProgress = true
    this.terminationReason = reason

    logger.debug('Starting coordinated termination', {
      requestId: this.requestId,
      reason
    })

    // Create a new termination promise that resolves when termination is complete
    let resolveTermination
    this.terminationLock = new Promise(resolve => {
      resolveTermination = resolve
    })

    try {
      await this._performTermination(reason)
      // Signal that termination is complete
      resolveTermination()
    } catch (error) {
      logger.warn('Error during coordinated termination', {
        requestId: this.requestId,
        reason,
        error: error.message
      })
      // Still resolve the lock even on error to prevent hanging
      resolveTermination()
      throw error
    } finally {
      this.isTerminationInProgress = false
    }
  }

  /**
   * CRITICAL FIX: Prevent duplicate operations
   */
  isOperationInProgress(operationType) {
    // Check if operation is already in progress
    if (this.isTerminationInProgress && operationType === 'termination') {
      return true
    }
    
    if (this.isEnded && operationType === 'response') {
      return true
    }
    
    if (this.isDestroyed && operationType === 'any') {
      return true
    }
    
    return false
  }

  /**
   * CRITICAL FIX: Safe operation wrapper with duplicate prevention
   */
  async safeOperation(operationType, operation, reason = '') {
    if (this.isOperationInProgress(operationType)) {
      logger.debug('Operation already in progress, skipping', {
        requestId: this.requestId,
        operationType,
        reason
      })
      return false
    }

    try {
      await operation()
      return true
    } catch (error) {
      logger.warn('Operation failed', {
        requestId: this.requestId,
        operationType,
        reason,
        error: error.message
      })
      return false
    }
  }

  /**
   * Internal method to perform the actual termination
   */
  async _performTermination(reason) {
    try {
      // Only try to end response if it hasn't been ended yet
      if (!this.isEnded && this.res.canWrite()) {
        logger.debug('Ending response during coordinated termination', {
          requestId: this.requestId,
          reason
        })
        // CRITICAL FIX: For streaming responses, don't pass data to end() if headers already sent
        if (this.headersSent) {
          this.safeEnd()
        } else {
          this.safeEnd()
        }
      } else {
        logger.debug('Skipping response end - already ended or cannot write', {
          requestId: this.requestId,
          isEnded: this.isEnded,
          canWrite: this.res.canWrite()
        })
      }

      // Mark streaming as completed if it was streaming
      if (this.isStreaming && !this.streamingCompleted) {
        this.streamingCompleted = true
        logger.debug('Marked streaming as completed during termination', {
          requestId: this.requestId,
          reason
        })
      }

    } catch (error) {
      logger.error('Error during termination execution', {
        requestId: this.requestId,
        reason,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Force destroy the response state
   */
  destroy() {
    this.isDestroyed = true
    this.isEnded = true
    
    // CRITICAL FIX: Cancel all registered timeouts when destroying
    this.res.cancelAllTimeouts('response_destroyed')
    
    // Try to destroy the underlying socket if available
    if (this.res.socket && typeof this.res.socket.destroy === 'function') {
      try {
        this.res.socket.destroy()
      } catch (error) {
        logger.warn('Failed to destroy response socket', {
          requestId: this.requestId,
          error: error.message
        })
      }
    }
  }

  /**
   * Check if termination can proceed
   */
  canTerminate() {
    return !this.isTerminationInProgress && !this.isDestroyed
  }

  /**
   * Get termination state information
   */
  getTerminationState() {
    return {
      isTerminationInProgress: this.isTerminationInProgress,
      terminationReason: this.terminationReason,
      canTerminate: this.canTerminate()
    }
  }

  /**
   * Get current state information
   */
  getState() {
    return {
      isHeadersSent: this.headersSent,
      isEnded: this.isEnded,
      isDestroyed: this.isDestroyed,
      isStreaming: this.isStreaming,
      streamingCompleted: this.streamingCompleted,
      requestId: this.requestId
    }
  }

  /**
   * Log the current state for debugging
   */
  logState(context = '') {
    logger.debug('Response state', {
      requestId: this.requestId,
      context,
      ...this.getState()
    })
  }

  /**
   * Safely write headers with error handling
   */
  safeWriteHeaders(statusCode, headers = {}) {
    try {
      if (this.res.canWriteHeaders()) {
        this.res.writeHead(statusCode, headers)
        return true
      }
      return false
    } catch (error) {
      logger.error('Failed to write headers', {
        requestId: this.requestId,
        error: error.message,
        statusCode
      })
      return false
    }
  }

  /**
   * Safely write data with error handling
   */
  safeWrite(data) {
    try {
      if (this.res.canWrite()) {
        return this.res.write(data)
      }
      return false
    } catch (error) {
      logger.error('Failed to write response data', {
        requestId: this.requestId,
        error: error.message
      })
      return false
    }
  }

  /**
   * Safely end response with error handling
   */
  safeEnd(data) {
    try {
      if (this.res.canWrite()) {
        // CRITICAL FIX: For streaming responses, don't pass data to end() if headers already sent
        if (this.headersSent) {
          this.res.end()
        } else {
          this.res.end(data)
        }
        return true
      }
      return false
    } catch (error) {
      logger.error('Failed to end response', {
        requestId: this.requestId,
        error: error.message
      })
      return false
    }
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