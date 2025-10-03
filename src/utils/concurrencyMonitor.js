import { logger } from '../services/logger.js'

/**
 * Comprehensive concurrency monitoring to detect hanging requests
 * and track resource usage patterns
 */
export class ConcurrencyMonitor {
  constructor() {
    this.activeRequests = new Map()
    this.resourceUsage = new Map()
    this.timeoutEvents = new Map()
    this.cleanupEvents = new Map()
    this.raceConditions = new Map()
    
    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      hangingRequests: 0,
      timeoutConflicts: 0,
      resourceLeaks: 0,
      raceConditions: 0
    }
    
    // Start periodic monitoring
    this.startPeriodicMonitoring()
  }

  /**
   * Register a new request for monitoring
   */
  registerRequest(requestId, metadata = {}) {
    const requestInfo = {
      id: requestId,
      startTime: Date.now(),
      status: 'active',
      timeoutCount: 0,
      resourceAllocations: new Set(),
      eventListeners: new Set(),
      lastActivity: Date.now(),
      metadata
    }

    this.activeRequests.set(requestId, requestInfo)
    this.metrics.totalRequests++

    logger.debug('Request registered for concurrency monitoring', {
      requestId,
      totalActive: this.activeRequests.size
    })

    return requestInfo
  }

  /**
   * Track timeout event for a request
   */
  trackTimeoutEvent(requestId, timeoutType, timeoutId) {
    if (!this.timeoutEvents.has(requestId)) {
      this.timeoutEvents.set(requestId, [])
    }

    const timeoutInfo = {
      type: timeoutType,
      id: timeoutId,
      timestamp: Date.now(),
      requestId
    }

    this.timeoutEvents.get(requestId).push(timeoutInfo)

    // Check for potential timeout conflicts
    const timeoutCount = this.timeoutEvents.get(requestId).length
    const requestInfo = this.activeRequests.get(requestId)
    
    if (requestInfo && timeoutCount > 1) {
      this.metrics.timeoutConflicts++
      this.trackRaceCondition(requestId, 'timeout_conflict', {
        timeoutCount,
        timeoutTypes: this.timeoutEvents.get(requestId).map(t => t.type)
      })
    }

    logger.debug('Timeout event tracked', {
      requestId,
      timeoutType,
      timeoutCount
    })
  }

  /**
   * Track resource allocation
   */
  trackResourceAllocation(requestId, resourceType, resourceId) {
    const requestInfo = this.activeRequests.get(requestId)
    if (!requestInfo) return

    const resourceKey = `${resourceType}:${resourceId}`
    requestInfo.resourceAllocations.add(resourceKey)

    if (!this.resourceUsage.has(resourceKey)) {
      this.resourceUsage.set(resourceKey, new Set())
    }
    this.resourceUsage.get(resourceKey).add(requestId)

    logger.debug('Resource allocation tracked', {
      requestId,
      resourceType,
      resourceId,
      totalResources: requestInfo.resourceAllocations.size
    })
  }

  /**
   * Track event listener registration
   */
  trackEventListener(requestId, eventType, target) {
    const requestInfo = this.activeRequests.get(requestId)
    if (!requestInfo) return

    const listenerKey = `${eventType}:${target}`
    requestInfo.eventListeners.add(listenerKey)

    logger.debug('Event listener tracked', {
      requestId,
      eventType,
      target,
      totalListeners: requestInfo.eventListeners.size
    })
  }

  /**
   * Track cleanup event
   */
  trackCleanupEvent(requestId, cleanupType, details = {}) {
    if (!this.cleanupEvents.has(requestId)) {
      this.cleanupEvents.set(requestId, [])
    }

    const cleanupInfo = {
      type: cleanupType,
      timestamp: Date.now(),
      details,
      requestId
    }

    this.cleanupEvents.get(requestId).push(cleanupInfo)

    logger.debug('Cleanup event tracked', {
      requestId,
      cleanupType,
      details
    })
  }

  /**
   * Track race conditions
   */
  trackRaceCondition(requestId, raceType, details = {}) {
    if (!this.raceConditions.has(requestId)) {
      this.raceConditions.set(requestId, [])
    }

    const raceInfo = {
      type: raceType,
      timestamp: Date.now(),
      details,
      requestId
    }

    this.raceConditions.get(requestId).push(raceInfo)
    this.metrics.raceConditions++

    logger.warn('Race condition detected', {
      requestId,
      raceType,
      details,
      totalRaceConditions: this.metrics.raceConditions
    })
  }

  /**
   * Mark request as completed
   */
  completeRequest(requestId, status = 'completed', details = {}) {
    const requestInfo = this.activeRequests.get(requestId)
    if (!requestInfo) return

    requestInfo.status = status
    requestInfo.endTime = Date.now()
    requestInfo.duration = requestInfo.endTime - requestInfo.startTime
    requestInfo.completionDetails = details

    // Check for potential hanging patterns
    if (requestInfo.duration > 60000) { // Over 1 minute
      this.metrics.hangingRequests++
      logger.warn('Potential hanging request detected', {
        requestId,
        duration: requestInfo.duration,
        timeoutCount: requestInfo.timeoutCount,
        resourceCount: requestInfo.resourceAllocations.size,
        listenerCount: requestInfo.eventListeners.size,
        details
      })
    }

    // Schedule cleanup after completion
    setTimeout(() => {
      this.cleanupRequest(requestId)
    }, 5000) // Cleanup after 5 seconds

    logger.debug('Request marked as completed', {
      requestId,
      status,
      duration: requestInfo.duration
    })
  }

  /**
   * Cleanup request data
   */
  cleanupRequest(requestId) {
    const requestInfo = this.activeRequests.get(requestId)
    if (!requestInfo) return

    // Clean up resource allocations
    for (const resourceKey of requestInfo.resourceAllocations) {
      const users = this.resourceUsage.get(resourceKey)
      if (users) {
        users.delete(requestId)
        if (users.size === 0) {
          this.resourceUsage.delete(resourceKey)
        }
      }
    }

    // Remove from active requests
    this.activeRequests.delete(requestId)

    logger.debug('Request cleanup completed', {
      requestId,
      remainingActive: this.activeRequests.size
    })
  }

  /**
   * Detect hanging requests
   */
  detectHangingRequests() {
    const now = Date.now()
    const hangingRequests = []

    for (const [requestId, requestInfo] of this.activeRequests.entries()) {
      const age = now - requestInfo.startTime
      const inactivity = now - requestInfo.lastActivity

      // Request is hanging if:
      // 1. Older than 2 minutes
      // 2. Inactive for more than 1 minute
      // 3. Has multiple timeout events
      // 4. Has unresolved resources

      const isHanging = age > 120000 || // 2 minutes
                       inactivity > 60000 || // 1 minute inactive
                       this.timeoutEvents.get(requestId)?.length > 2 || // Multiple timeouts
                       requestInfo.resourceAllocations.size > 10 // Too many resources

      if (isHanging) {
        hangingRequests.push({
          requestId,
          age,
          inactivity,
          timeoutCount: this.timeoutEvents.get(requestId)?.length || 0,
          resourceCount: requestInfo.resourceAllocations.size,
          listenerCount: requestInfo.eventListeners.size,
          raceConditionCount: this.raceConditions.get(requestId)?.length || 0
        })
      }
    }

    if (hangingRequests.length > 0) {
      logger.error('Hanging requests detected', {
        count: hangingRequests.length,
        requests: hangingRequests
      })
    }

    return hangingRequests
  }

  /**
   * Detect resource leaks
   */
  detectResourceLeaks() {
    const leaks = []

    for (const [resourceKey, users] of this.resourceUsage.entries()) {
      // Resource is potentially leaked if:
      // 1. Used by requests that are no longer active
      // 2. Used by too many requests
      
      const activeUsers = Array.from(users).filter(requestId => 
        this.activeRequests.has(requestId)
      )

      if (users.size > activeUsers.length) {
        leaks.push({
          resourceKey,
          totalUsers: users.size,
          activeUsers: activeUsers.length,
          staleUsers: users.size - activeUsers.length
        })
      }
    }

    if (leaks.length > 0) {
      logger.error('Resource leaks detected', {
        count: leaks.length,
        leaks
      })
      this.metrics.resourceLeaks += leaks.length
    }

    return leaks
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeRequests: this.activeRequests.size,
      resourceUsage: this.resourceUsage.size,
      averageRequestDuration: this.calculateAverageDuration(),
      hangingRequestRate: this.metrics.hangingRequests / Math.max(this.metrics.totalRequests, 1) * 100,
      timeoutConflictRate: this.metrics.timeoutConflicts / Math.max(this.metrics.totalRequests, 1) * 100,
      resourceLeakRate: this.metrics.resourceLeaks / Math.max(this.metrics.totalRequests, 1) * 100,
      raceConditionRate: this.metrics.raceConditions / Math.max(this.metrics.totalRequests, 1) * 100
    }
  }

  /**
   * Calculate average request duration
   */
  calculateAverageDuration() {
    const completedRequests = Array.from(this.activeRequests.values())
      .filter(req => req.endTime)
    
    if (completedRequests.length === 0) return 0

    const totalDuration = completedRequests.reduce((sum, req) => sum + req.duration, 0)
    return Math.round(totalDuration / completedRequests.length)
  }

  /**
   * Start periodic monitoring
   */
  startPeriodicMonitoring() {
    setInterval(() => {
      try {
        this.detectHangingRequests()
        this.detectResourceLeaks()
        
        const metrics = this.getMetrics()
        logger.debug('Concurrency monitoring metrics', metrics)
        
        // Alert on critical issues
        if (metrics.hangingRequestRate > 5) { // More than 5% hanging requests
          logger.error('High hanging request rate detected', {
            rate: metrics.hangingRequestRate,
            hangingRequests: metrics.hangingRequests,
            totalRequests: metrics.totalRequests
          })
        }
        
        if (metrics.resourceLeakRate > 2) { // More than 2% resource leaks
          logger.error('High resource leak rate detected', {
            rate: metrics.resourceLeakRate,
            resourceLeaks: metrics.resourceLeaks,
            totalRequests: metrics.totalRequests
          })
        }
        
      } catch (error) {
        logger.error('Error in concurrency monitoring', {
          error: error.message
        })
      }
    }, 30000) // Check every 30 seconds
  }

  /**
   * Get detailed request information
   */
  getRequestDetails(requestId) {
    const requestInfo = this.activeRequests.get(requestId)
    if (!requestInfo) return null

    return {
      ...requestInfo,
      timeoutEvents: this.timeoutEvents.get(requestId) || [],
      cleanupEvents: this.cleanupEvents.get(requestId) || [],
      raceConditions: this.raceConditions.get(requestId) || [],
      resourceAllocations: Array.from(requestInfo.resourceAllocations),
      eventListeners: Array.from(requestInfo.eventListeners)
    }
  }

  /**
   * Force cleanup of all monitoring data (for testing/shutdown)
   */
  forceCleanup() {
    logger.info('Force cleaning up concurrency monitor')
    
    // Complete all active requests as failed
    for (const requestId of this.activeRequests.keys()) {
      this.completeRequest(requestId, 'force_cleanup', {
        reason: 'monitor_shutdown'
      })
    }
    
    // Clear all tracking maps
    this.activeRequests.clear()
    this.resourceUsage.clear()
    this.timeoutEvents.clear()
    this.cleanupEvents.clear()
    this.raceConditions.clear()
  }
}

// Global singleton instance
export const concurrencyMonitor = new ConcurrencyMonitor()

export default concurrencyMonitor