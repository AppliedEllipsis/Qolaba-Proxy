import { logger } from '../services/logger.js'
import { defaultCircuitBreaker } from '../utils/retryHelper.js'

/**
 * Health monitoring middleware for tracking system performance and issues
 */
export const healthMonitor = (options = {}) => {
  const healthData = {
    startTime: Date.now(),
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      timeouts: 0,
      streaming: {
        total: 0,
        successful: 0,
        clientDisconnects: 0,
        errors: 0
      }
    },
    responseTimes: [],
    errors: [],
    circuitBreakerState: defaultCircuitBreaker.getState(),
    lastUpdate: Date.now()
  }

  const maxHistorySize = options.maxHistorySize || 1000
  const alertThresholds = {
    errorRate: options.errorRate || 0.1, // 10%
    avgResponseTime: options.avgResponseTime || 30000, // 30 seconds
    circuitBreakerOpen: true
  }

  return (req, res, next) => {
    const startTime = Date.now()
    const requestId = req.id || 'unknown'
    
    healthData.requests.total++
    if (req.body?.stream === true) {
      healthData.requests.streaming.total++
    }

    // Use ResponseManager to track response completion instead of overriding res.end
    if (req.responseManager) {
      req.responseManager.onEnd((chunk, encoding) => {
        const duration = Date.now() - startTime
        
        // Update health data
        healthData.responseTimes.push(duration)
        if (healthData.responseTimes.length > maxHistorySize) {
          healthData.responseTimes.shift()
        }

        // Check for successful vs failed requests
        if (res.statusCode >= 200 && res.statusCode < 400) {
          healthData.requests.successful++
          if (req.body?.stream === true) {
            healthData.requests.streaming.successful++
          }
        } else {
          healthData.requests.failed++
          if (req.body?.stream === true) {
            healthData.requests.streaming.errors++
          }
          
          // Log error for monitoring
          healthData.errors.push({
            timestamp: Date.now(),
            requestId,
            statusCode: res.statusCode,
            duration,
            method: req.method,
            url: req.url
          })
          
          if (healthData.errors.length > maxHistorySize) {
            healthData.errors.shift()
          }
        }

        // Check for timeouts
        if (duration > 30000) {
          healthData.requests.timeouts++
          logger.warn('Slow request detected', {
            requestId,
            method: req.method,
            url: req.url,
            duration: `${duration}ms`,
            statusCode: res.statusCode
          })
        }

        healthData.lastUpdate = Date.now()
        healthData.circuitBreakerState = defaultCircuitBreaker.getState()

        // Check for alerts
        checkAlerts(healthData, alertThresholds, requestId)
      })
    } else {
      // Fallback to override res.end if ResponseManager not available
      const originalEnd = res.end
      res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime
        
        // Update health data
        healthData.responseTimes.push(duration)
        if (healthData.responseTimes.length > maxHistorySize) {
          healthData.responseTimes.shift()
        }

        // Check for successful vs failed requests
        if (res.statusCode >= 200 && res.statusCode < 400) {
          healthData.requests.successful++
          if (req.body?.stream === true) {
            healthData.requests.streaming.successful++
          }
        } else {
          healthData.requests.failed++
          if (req.body?.stream === true) {
            healthData.requests.streaming.errors++
          }
          
          // Log error for monitoring
          healthData.errors.push({
            timestamp: Date.now(),
            requestId,
            statusCode: res.statusCode,
            duration,
            method: req.method,
            url: req.url
          })
          
          if (healthData.errors.length > maxHistorySize) {
            healthData.errors.shift()
          }
        }

        // Check for timeouts
        if (duration > 30000) {
          healthData.requests.timeouts++
          logger.warn('Slow request detected', {
            requestId,
            method: req.method,
            url: req.url,
            duration: `${duration}ms`,
            statusCode: res.statusCode
          })
        }

        healthData.lastUpdate = Date.now()
        healthData.circuitBreakerState = defaultCircuitBreaker.getState()

        // Check for alerts
        checkAlerts(healthData, alertThresholds, requestId)

        // CRITICAL FIX: For streaming responses, don't pass parameters to end() if headers already sent
        if (res.headersSent) {
          originalEnd.call(this)
        } else {
          originalEnd.call(this, chunk, encoding)
        }
      }
    }

    // Track client disconnects for streaming
    if (req.body?.stream === true) {
      const originalClose = res.close
      res.close = function() {
        healthData.requests.streaming.clientDisconnects++
        logger.info('Streaming client disconnect recorded', {
          requestId,
          method: req.method,
          url: req.url
        })
        
        if (originalClose) {
          originalClose.call(this)
        }
      }
    }

    // Attach health data to request for debugging
    req.healthData = healthData

    next()
  }
}

/**
 * Check for health alerts
 */
function checkAlerts(healthData, thresholds, requestId) {
  const errorRate = healthData.requests.total > 0 ? 
    healthData.requests.failed / healthData.requests.total : 0

  const avgResponseTime = healthData.responseTimes.length > 0 ?
    healthData.responseTimes.reduce((a, b) => a + b, 0) / healthData.responseTimes.length : 0

  // High error rate alert
  if (errorRate > thresholds.errorRate) {
    logger.error('High error rate detected', {
      requestId,
      errorRate: `${(errorRate * 100).toFixed(2)}%`,
      threshold: `${(thresholds.errorRate * 100).toFixed(2)}%`,
      failedRequests: healthData.requests.failed,
      totalRequests: healthData.requests.total,
      recentErrors: healthData.errors.slice(-5)
    })
  }

  // Slow response time alert
  if (avgResponseTime > thresholds.avgResponseTime) {
    logger.error('High average response time detected', {
      requestId,
      avgResponseTime: `${avgResponseTime.toFixed(0)}ms`,
      threshold: `${thresholds.avgResponseTime}ms`,
      totalRequests: healthData.requests.total
    })
  }

  // Circuit breaker alert
  if (healthData.circuitBreakerState.state === 'OPEN' && thresholds.circuitBreakerOpen) {
    logger.error('Circuit breaker is OPEN', {
      requestId,
      circuitBreakerState: healthData.circuitBreakerState,
      failureCount: healthData.circuitBreakerState.failureCount
    })
  }

  // Streaming issues alert
  const streamingErrorRate = healthData.requests.streaming.total > 0 ?
    healthData.requests.streaming.errors / healthData.requests.streaming.total : 0

  const streamingDisconnectRate = healthData.requests.streaming.total > 0 ?
    healthData.requests.streaming.clientDisconnects / healthData.requests.streaming.total : 0

  if (streamingErrorRate > 0.2) { // 20% error rate for streaming
    logger.warn('High streaming error rate', {
      requestId,
      errorRate: `${(streamingErrorRate * 100).toFixed(2)}%`,
      streamingErrors: healthData.requests.streaming.errors,
      totalStreaming: healthData.requests.streaming.total
    })
  }

  if (streamingDisconnectRate > 0.3) { // 30% disconnect rate
    logger.warn('High streaming disconnect rate', {
      requestId,
      disconnectRate: `${(streamingDisconnectRate * 100).toFixed(2)}%`,
      disconnects: healthData.requests.streaming.clientDisconnects,
      totalStreaming: healthData.requests.streaming.total
    })
  }
}

/**
 * Get current health status
 */
export const getHealthStatus = () => {
  const healthData = global.healthData || {
    startTime: Date.now(),
    requests: { total: 0, successful: 0, failed: 0, timeouts: 0 },
    responseTimes: [],
    errors: [],
    circuitBreakerState: defaultCircuitBreaker.getState(),
    lastUpdate: Date.now()
  }

  const uptime = Date.now() - healthData.startTime
  const errorRate = healthData.requests.total > 0 ? 
    healthData.requests.failed / healthData.requests.total : 0
  const avgResponseTime = healthData.responseTimes.length > 0 ?
    healthData.responseTimes.reduce((a, b) => a + b, 0) / healthData.responseTimes.length : 0

  return {
    status: 'operational',
    uptime: uptime,
    requests: {
      total: healthData.requests.total,
      successful: healthData.requests.successful,
      failed: healthData.requests.failed,
      timeouts: healthData.requests.timeouts,
      errorRate: errorRate,
      avgResponseTime: avgResponseTime
    },
    streaming: {
      total: healthData.requests.streaming?.total || 0,
      successful: healthData.requests.streaming?.successful || 0,
      errors: healthData.requests.streaming?.errors || 0,
      clientDisconnects: healthData.requests.streaming?.clientDisconnects || 0
    },
    circuitBreaker: healthData.circuitBreakerState,
    lastUpdate: healthData.lastUpdate,
    memory: process.memoryUsage(),
    pid: process.pid
  }
}

/**
 * Reset health monitoring data
 */
export const resetHealthData = () => {
  global.healthData = {
    startTime: Date.now(),
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      timeouts: 0,
      streaming: {
        total: 0,
        successful: 0,
        clientDisconnects: 0,
        errors: 0
      }
    },
    responseTimes: [],
    errors: [],
    circuitBreakerState: defaultCircuitBreaker.getState(),
    lastUpdate: Date.now()
  }
  
  logger.info('Health monitoring data reset')
}

// Initialize global health data
resetHealthData()

export default {
  healthMonitor,
  getHealthStatus,
  resetHealthData
}