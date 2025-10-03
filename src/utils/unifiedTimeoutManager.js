import { logger } from '../services/logger.js'
import { concurrencyMonitor } from './concurrencyMonitor.js'

/**
 * Unified Timeout Manager - Single source of truth for all timeout operations
 * Prevents race conditions and ensures proper coordination between different timeout layers
 */
export class UnifiedTimeoutManager {
  constructor(requestId, options = {}) {
    this.requestId = requestId
    this.options = {
      defaultTimeout: options.defaultTimeout || 30000,
      streamingTimeout: options.streamingTimeout || 120000,
      maxTimeout: options.maxTimeout || 300000,
      inactivityTimeout: options.inactivityTimeout || 60000,
      ...options
    }
    
    this.timeouts = new Map()
    this.isTerminated = false
    this.terminationReason = null
    this.terminationPromise = null
    this.activityCallbacks = new Set()
    this.lastActivity = Date.now()
    
    // Track with concurrency monitor
    concurrencyMonitor.registerRequest(requestId, {
      type: 'timeout_manager',
      options: this.options
    })
  }

  /**
   * Register an activity callback to track request progress
   */
  registerActivityCallback(callback) {
    if (this.isTerminated) return false
    
    this.activityCallbacks.add(callback)
    return true
  }

  /**
   * Update activity timestamp (called during request processing)
   */
  updateActivity() {
    if (this.isTerminated) return
    
    this.lastActivity = Date.now()
    
    // Notify all activity callbacks
    for (const callback of this.activityCallbacks) {
      try {
        callback(this.lastActivity)
      } catch (error) {
        logger.warn('Activity callback failed', {
          requestId: this.requestId,
          error: error.message
        })
      }
    }
  }

  /**
   * Register streaming error handler for timeout scenarios
   */
  registerStreamingErrorHandler(handler) {
    if (this.isTerminated) return false
    
    this._streamingErrorHandler = handler
    logger.debug('Streaming error handler registered', {
      requestId: this.requestId
    })
    return true
  }

  /**
   * Handle streaming timeout with proper error message delivery
   */
  async handleStreamingTimeout(reason = 'timeout', responseState = null, model = null) {
    logger.warn('Handling streaming timeout', {
      requestId: this.requestId,
      reason,
      hasResponseState: !!responseState,
      model
    })

    if (this._streamingErrorHandler && responseState) {
      try {
        await this._streamingErrorHandler(reason)
      } catch (error) {
        logger.error('Streaming error handler failed', {
          requestId: this.requestId,
          reason,
          error: error.message
        })
      }
    }

    // Terminate the timeout manager
    await this.terminate(reason)
  }

  /**
   * Set a timeout with proper coordination and race condition prevention
   */
  setTimeout(callback, delayMs, name = 'default', options = {}) {
    if (this.isTerminated) {
      logger.debug('Timeout set on terminated manager, ignoring', {
        requestId: this.requestId,
        timeoutName: name
      })
      return null
    }

    // Clear existing timeout with same name
    this.clearTimeout(name)

    // Ensure delay doesn't exceed maximum
    const actualDelay = Math.min(delayMs, this.options.maxTimeout)
    
    const timeoutId = setTimeout(async () => {
      if (this.isTerminated) {
        logger.debug('Timeout fired but manager already terminated', {
          requestId: this.requestId,
          timeoutName: name
        })
        return
      }

      logger.debug('Timeout triggered', {
        requestId: this.requestId,
        timeoutName: name,
        delay: actualDelay
      })

      // Track timeout event with concurrency monitor
      concurrencyMonitor.trackTimeoutEvent(this.requestId, name, timeoutId)

      try {
        if (options.isAsync) {
          await callback()
        } else {
          callback()
        }
      } catch (error) {
        logger.error('Timeout callback failed', {
          requestId: this.requestId,
          timeoutName: name,
          error: error.message
        })
        
        // Don't let callback errors break the timeout system
        if (options.fatalOnError) {
          await this.terminate('timeout_callback_error')
        }
      }
    }, actualDelay)

    this.timeouts.set(name, {
      id: timeoutId,
      delay: actualDelay,
      createdAt: Date.now(),
      callback,
      options
    })

    logger.debug('Timeout registered', {
      requestId: this.requestId,
      timeoutName: name,
      delay: actualDelay,
      totalTimeouts: this.timeouts.size
    })

    return timeoutId
  }

  /**
   * Clear a specific timeout by name
   */
  clearTimeout(name) {
    const timeoutInfo = this.timeouts.get(name)
    if (timeoutInfo) {
      clearTimeout(timeoutInfo.id)
      this.timeouts.delete(name)
      
      logger.debug('Timeout cleared', {
        requestId: this.requestId,
        timeoutName: name,
        remainingTimeouts: this.timeouts.size
      })
      return true
    }
    return false
  }

  /**
   * Clear all timeouts
   */
  clearTimeouts() {
    let clearedCount = 0
    
    for (const [name, timeoutInfo] of this.timeouts.entries()) {
      clearTimeout(timeoutInfo.id)
      clearedCount++
    }
    
    this.timeouts.clear()
    
    logger.debug('All timeouts cleared', {
      requestId: this.requestId,
      clearedCount
    })
    
    return clearedCount
  }

  /**
   * Setup automatic timeouts based on request type
   */
  setupAutomaticTimeouts(requestType = 'standard') {
    if (this.isTerminated) return

    const timeouts = []

    // Base timeout for all requests
    timeouts.push({
      name: 'base_timeout',
      delay: this.options.defaultTimeout,
      callback: async () => {
        logger.warn('Base timeout reached', {
          requestId: this.requestId,
          requestType
        })
        
        // ENHANCEMENT: Handle streaming timeout errors with proper error messages
        if (requestType === 'streaming' && this._streamingErrorHandler) {
          await this._streamingErrorHandler('base_timeout')
        }
        
        await this.terminate('base_timeout')
      }
    })

    // Streaming-specific timeouts
    if (requestType === 'streaming') {
      timeouts.push({
        name: 'streaming_timeout',
        delay: this.options.streamingTimeout,
        callback: async () => {
          logger.warn('Streaming timeout reached', {
            requestId: this.requestId
          })
          
          // ENHANCEMENT: Handle streaming timeout errors with proper error messages
          if (this._streamingErrorHandler) {
            await this._streamingErrorHandler('streaming_timeout')
          }
          
          await this.terminate('streaming_timeout')
        }
      })

      // Inactivity timeout for streaming
      timeouts.push({
        name: 'inactivity_timeout',
        delay: this.options.inactivityTimeout,
        callback: async () => {
          const inactivity = Date.now() - this.lastActivity
          if (inactivity > this.options.inactivityTimeout) {
            logger.warn('Streaming inactivity timeout', {
              requestId: this.requestId,
              inactivity
            })
            
            // ENHANCEMENT: Handle inactivity timeout errors with proper error messages
            if (this._streamingErrorHandler) {
              await this._streamingErrorHandler('inactivity_timeout')
            }
            
            await this.terminate('inactivity_timeout')
          } else {
            // Reschedule if there was recent activity
            this.setTimeout(callback, this.options.inactivityTimeout, 'inactivity_timeout', {
              isAsync: true
            })
          }
        },
        isAsync: true
      })
    }

    // Register all timeouts
    for (const timeout of timeouts) {
      this.setTimeout(timeout.callback, timeout.delay, timeout.name, {
        isAsync: timeout.isAsync || false,
        fatalOnError: true
      })
    }

    logger.debug('Automatic timeouts setup', {
      requestId: this.requestId,
      requestType,
      timeoutCount: timeouts.length
    })
  }

  /**
   * Extend a specific timeout
   */
  extendTimeout(name, additionalDelay, newCallback = null) {
    if (this.isTerminated) return false

    const timeoutInfo = this.timeouts.get(name)
    if (!timeoutInfo) {
      logger.warn('Attempted to extend non-existent timeout', {
        requestId: this.requestId,
        timeoutName: name
      })
      return false
    }

    // Clear existing timeout
    this.clearTimeout(name)

    // Set new timeout with extended delay
    const newDelay = timeoutInfo.delay + additionalDelay
    const callback = newCallback || timeoutInfo.callback

    this.setTimeout(callback, newDelay, name, timeoutInfo.options)

    logger.debug('Timeout extended', {
      requestId: this.requestId,
      timeoutName: name,
      originalDelay: timeoutInfo.delay,
      newDelay,
      additionalDelay
    })

    return true
  }

  /**
   * Get timeout status information
   */
  getTimeoutStatus() {
    const now = Date.now()
    const activeTimeouts = []

    for (const [name, timeoutInfo] of this.timeouts.entries()) {
      const elapsed = now - timeoutInfo.createdAt
      const remaining = Math.max(0, timeoutInfo.delay - elapsed)

      activeTimeouts.push({
        name,
        delay: timeoutInfo.delay,
        elapsed,
        remaining,
        createdAt: timeoutInfo.createdAt
      })
    }

    return {
      requestId: this.requestId,
      isTerminated: this.isTerminated,
      terminationReason: this.terminationReason,
      activeTimeouts: activeTimeouts.length,
      timeouts: activeTimeouts,
      lastActivity: this.lastActivity,
      inactivityTime: now - this.lastActivity
    }
  }

  /**
   * Terminate the timeout manager and coordinate cleanup
   */
  async terminate(reason = 'unknown') {
    if (this.isTerminated) {
      // Return existing termination promise if already terminating
      if (this.terminationPromise) {
        return this.terminationPromise
      }
      return Promise.resolve()
    }

    this.isTerminated = true
    this.terminationReason = reason

    logger.debug('Starting timeout manager termination', {
      requestId: this.requestId,
      reason
    })

    // Create termination promise to coordinate async cleanup
    this.terminationPromise = new Promise((resolve) => {
      const performTermination = async () => {
        try {
          // Clear all timeouts
          const clearedCount = this.clearTimeouts()

          // Clear activity callbacks
          this.activityCallbacks.clear()

          // Track cleanup event
          concurrencyMonitor.trackCleanupEvent(this.requestId, 'timeout_manager_termination', {
            reason,
            clearedTimeouts: clearedCount
          })

          logger.debug('Timeout manager termination completed', {
            requestId: this.requestId,
            reason,
            clearedTimeouts: clearedCount
          })

        } catch (error) {
          logger.error('Error during timeout manager termination', {
            requestId: this.requestId,
            reason,
            error: error.message
          })
        } finally {
          resolve()
        }
      }

      // Perform termination asynchronously
      performTermination()
    })

    return this.terminationPromise
  }

  /**
   * Check if manager can safely perform operations
   */
  canOperate() {
    return !this.isTerminated
  }

  /**
   * Force immediate termination (for emergency cleanup)
   */
  forceTerminate(reason = 'emergency') {
    logger.warn('Force terminating timeout manager', {
      requestId: this.requestId,
      reason
    })

    this.isTerminated = true
    this.terminationReason = reason
    
    // Clear all timeouts synchronously
    this.clearTimeouts()
    this.activityCallbacks.clear()

    // Track emergency cleanup
    concurrencyMonitor.trackCleanupEvent(this.requestId, 'emergency_termination', {
      reason
    })
  }

  /**
   * Get diagnostic information for debugging
   */
  getDiagnostics() {
    return {
      requestId: this.requestId,
      isTerminated: this.isTerminated,
      terminationReason: this.terminationReason,
      options: this.options,
      timeoutCount: this.timeouts.size,
      activityCallbackCount: this.activityCallbacks.size,
      lastActivity: this.lastActivity,
      uptime: Date.now() - (this.createdAt || Date.now()),
      currentStatus: this.getTimeoutStatus()
    }
  }
}

/**
 * Factory function to create unified timeout managers
 */
export function createUnifiedTimeoutManager(requestId, options = {}) {
  return new UnifiedTimeoutManager(requestId, options)
}

/**
 * Enhanced request timeout middleware using unified timeout manager
 */
export function createUnifiedRequestTimeout(options = {}) {
  const defaultOptions = {
    defaultTimeout: 30000,
    streamingTimeout: 120000,
    maxTimeout: 300000,
    inactivityTimeout: 60000,
    ...options
  }

  return (req, res, next) => {
    const requestId = req.id || 'unknown'
    
    // Create unified timeout manager for this request
    const timeoutManager = new UnifiedTimeoutManager(requestId, defaultOptions)
    
    // Store reference for other middleware
    req.unifiedTimeoutManager = timeoutManager
    res.unifiedTimeoutManager = timeoutManager

    // Detect request type
    const isStreamingRequest = req.path === '/v1/chat/completions' && 
                             req.method === 'POST' && 
                             req.body?.stream === true

    // Setup automatic timeouts
    timeoutManager.setupAutomaticTimeouts(isStreamingRequest ? 'streaming' : 'standard')

    // Register activity callbacks
    timeoutManager.registerActivityCallback(() => {
      // Update activity in concurrency monitor
      const requestInfo = concurrencyMonitor.activeRequests.get(requestId)
      if (requestInfo) {
        requestInfo.lastActivity = Date.now()
      }
    })

    // Setup cleanup on response completion
    const cleanup = async () => {
      const duration = Date.now() - (req.startTime || Date.now())
      
      try {
        await timeoutManager.terminate('response_completed')
        
        concurrencyMonitor.completeRequest(requestId, 'completed', {
          duration,
          requestType: isStreamingRequest ? 'streaming' : 'standard'
        })
      } catch (error) {
        logger.error('Error in timeout cleanup', {
          requestId,
          error: error.message
        })
      }
    }

    // Handle request errors
    res.on('error', async (error) => {
      logger.error('Response error in unified timeout', {
        requestId,
        error: error.message
      })
      
      try {
        await timeoutManager.terminate('response_error')
        concurrencyMonitor.completeRequest(requestId, 'error', { 
          error: error.message 
        })
      } catch (cleanupError) {
        logger.error('Error in error cleanup', {
          requestId,
          error: cleanupError.message
        })
      }
    })

    // Handle client disconnect
    res.on('close', async () => {
      try {
        await timeoutManager.terminate('client_disconnect')
        concurrencyMonitor.completeRequest(requestId, 'disconnected')
      } catch (error) {
        logger.error('Error in disconnect cleanup', {
          requestId,
          error: error.message
        })
      }
    })

    res.on('finish', cleanup)

    next()
  }
}

export default {
  UnifiedTimeoutManager,
  createUnifiedTimeoutManager,
  createUnifiedRequestTimeout
}