  import { logger } from '../services/logger.js'
  
  /**
   * Response state tracker to prevent multiple sends and header errors
   */
  export class ResponseState {
    constructor(res, requestId) {
      this.res = res
      this.requestId = requestId
      this.isHeadersSent = false
      this.isEnded = false
      this.isDestroyed = false
      
      // Streaming-specific state
      this.isStreaming = false
      this.streamingCompleted = false
      
      // CRITICAL FIX: Add termination coordination to prevent race conditions
      this.isTerminationInProgress = false
      this.terminationLock = Promise.resolve()
      this.terminationReason = null
      
      // Store original methods
      this.originalWrite = res.write
      this.originalEnd = res.end
      this.originalWriteHead = res.writeHead
      
      // Override methods with state tracking
      this._overrideMethods()
    }
  
    _overrideMethods() {
      const self = this
  
      // Override writeHead
      this.res.writeHead = function(...args) {
        if (self.isHeadersSent) {
          logger.warn('Attempted to write headers after they were already sent', {
            requestId: self.requestId,
            args: args.slice(0, 2) // Log only status and headers for security
          })
          return false
        }
        
        self.isHeadersSent = true
        return self.originalWriteHead.apply(this, args)
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
      this.res.end = function(...args) {
        if (self.isEnded) {
          logger.warn('Attempted to end already ended response', {
            requestId: self.requestId
          })
          return false
        }
        
        self.isEnded = true
        // If streaming, mark streaming as completed when end is called
        if (self.isStreaming && !self.streamingCompleted) {
          self.streamingCompleted = true
        }
        return self.originalEnd.apply(this, args)
      }
  
      // Add method to safely write headers
      this.res.safeWriteHead = function(...args) {
        if (!self.isHeadersSent && !self.isEnded) {
          return self.originalWriteHead.apply(this, args)
        }
        return false
      }
  
      // Add method to safely write data
      this.res.safeWrite = function(...args) {
        if (!self.isEnded && !self.isDestroyed) {
          return self.originalWrite.apply(this, args)
        }
        return false
      }
  
      // Add method to safely end response
      this.res.safeEnd = function(...args) {
        if (!self.isEnded && !self.isDestroyed) {
          self.isEnded = true
          // If streaming, mark as completed when end is called
          if (self.isStreaming && !self.streamingCompleted) {
            self.streamingCompleted = true
          }
          return self.originalEnd.apply(this, args)
        }
        return false
      }
  
      // Add method to check if response can still be written to
      this.res.canWrite = function() {
        return !self.isEnded && !self.isDestroyed
      }
  
      // Add method to check if headers can still be sent
      this.res.canWriteHeaders = function() {
        return !self.isHeadersSent && !self.isEnded && !self.isDestroyed
      }

      // Convenience: mark streaming started/completed
      this.res.markStreamingStarted = function() {
        self.isStreaming = true
      }
      this.res.markStreamingCompleted = function() {
        self.streamingCompleted = true
      }
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
          this.res.end(data)
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
          this.safeEnd()
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
        isHeadersSent: this.isHeadersSent,
        isEnded: this.isEnded,
        isDestroyed: this.isDestroyed,
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
  }
  
  /**
   * Create a wrapped response with state tracking
   */
  export function createResponseState(res, requestId) {
    return new ResponseState(res, requestId)
  }
  
  /**
   * CRITICAL FIX: Improved error boundary with coordinated termination
   */
  export async function withStreamingErrorBoundary(fn, responseState, errorHandler) {
    try {
      return await fn(responseState)
    } catch (error) {
      logger.error('Streaming error boundary triggered', {
        requestId: responseState.requestId,
        error: error.message,
        stack: error.stack
      })

      // CRITICAL FIX: Use coordinated termination to prevent race conditions
      try {
        await responseState.coordinatedTermination('error_boundary')
      } catch (terminationError) {
        logger.warn('Coordinated termination failed in error boundary', {
          requestId: responseState.requestId,
          error: terminationError.message
        })
      }

      // Only attempt to send error response if response hasn't been terminated
      if (!responseState.isEnded && !responseState.isDestroyed) {
        // Try to send error response only if headers haven't been sent
        if (responseState.res.canWriteHeaders()) {
          try {
            responseState.safeWriteHeaders(500, {
              'Content-Type': 'application/json',
              'Connection': 'close'
            })

            const errorResponse = {
              error: {
                message: 'Internal streaming error',
                type: 'api_error',
                code: 'streaming_error'
              }
            }

            responseState.safeWrite(JSON.stringify(errorResponse))
            responseState.safeEnd()
          } catch (writeError) {
            logger.error('Failed to send error response in stream', {
              requestId: responseState.requestId,
              error: writeError.message
            })
          }
        } else {
          logger.debug('Skipping error response - headers already sent', {
            requestId: responseState.requestId,
            headersSent: responseState.isHeadersSent
          })
        }
      } else {
        logger.debug('Skipping error response - response already terminated', {
          requestId: responseState.requestId,
          isEnded: responseState.isEnded,
          isDestroyed: responseState.isDestroyed
        })
      }

      // Call custom error handler if provided, but don't let it throw
      if (errorHandler) {
        try {
          await errorHandler(error, responseState)
        } catch (handlerError) {
          logger.error('Error handler failed', {
            requestId: responseState.requestId,
            error: handlerError.message
          })
          // Don't re-throw handler errors to prevent cascading failures
        }
      }

      // Force destroy as last resort only if not already destroyed
      if (!responseState.isDestroyed) {
        responseState.destroy()
      }

      // Re-throw the original error to maintain error propagation
      throw error
    }
  }
  
  /**
   * Safe SSE (Server-Sent Events) writer
   */
  export class SafeSSEWriter {
    constructor(responseState) {
      this.responseState = responseState
    }
  
    writeEvent(data, eventType = null) {
      if (!this.responseState.res.canWrite()) {
        return false
      }
  
      try {
        let sseData = `data: ${JSON.stringify(data)}\n\n`
        
        if (eventType) {
          sseData = `event: ${eventType}\n${sseData}`
        }
  
        return this.responseState.safeWrite(sseData)
      } catch (error) {
        logger.error('Failed to write SSE event', {
          requestId: this.responseState.requestId,
          error: error.message
        })
        return false
      }
    }
  
    writeDone() {
      if (!this.responseState.res.canWrite()) {
        return false
      }
  
      try {
        return this.responseState.safeWrite('data: [DONE]\n\n')
      } catch (error) {
        logger.error('Failed to write SSE DONE', {
          requestId: this.responseState.requestId,
          error: error.message
        })
        return false
      }
    }
  }
  
  export default {
    ResponseState,
    createResponseState,
    withStreamingErrorBoundary,
    SafeSSEWriter
  }