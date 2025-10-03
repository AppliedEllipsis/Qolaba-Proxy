import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../services/logger.js'
import { concurrencyMonitor } from '../utils/concurrencyMonitor.js'

const router = express.Router()

// GET /concurrency/metrics - Get comprehensive concurrency metrics
router.get('/metrics', authenticate, (req, res) => {
  try {
    const metrics = concurrencyMonitor.getMetrics()
    
    res.json({
      status: 'success',
      data: {
        metrics,
        timestamp: new Date().toISOString(),
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    })
  } catch (error) {
    logger.error('Failed to get concurrency metrics', {
      requestId: req.id,
      error: error.message
    })
    
    res.status(500).json({
      status: 'error',
      error: {
        message: 'Failed to retrieve concurrency metrics',
        type: 'internal_error'
      }
    })
  }
})

// GET /concurrency/requests - Get active requests details
router.get('/requests', authenticate, (req, res) => {
  try {
    const activeRequests = []
    
    // Get details for all active requests from concurrency monitor
    for (const requestId of concurrencyMonitor.activeRequests.keys()) {
      const details = concurrencyMonitor.getRequestDetails(requestId)
      if (details) {
        activeRequests.push(details)
      }
    }
    
    res.json({
      status: 'success',
      data: {
        activeRequests,
        count: activeRequests.length,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Failed to get active requests', {
      requestId: req.id,
      error: error.message
    })
    
    res.status(500).json({
      status: 'error',
      error: {
        message: 'Failed to retrieve active requests',
        type: 'internal_error'
      }
    })
  }
})

// GET /concurrency/hanging - Detect and report hanging requests
router.get('/hanging', authenticate, (req, res) => {
  try {
    const hangingRequests = concurrencyMonitor.detectHangingRequests()
    const resourceLeaks = concurrencyMonitor.detectResourceLeaks()
    
    const diagnostics = {
      hangingRequests,
      resourceLeaks,
      metrics: concurrencyMonitor.getMetrics(),
      timestamp: new Date().toISOString()
    }
    
    // Set appropriate status code based on findings
    const statusCode = (hangingRequests.length > 0 || resourceLeaks.length > 0) ? 200 : 200
    
    res.status(statusCode).json({
      status: hangingRequests.length > 0 || resourceLeaks.length > 0 ? 'warning' : 'healthy',
      data: diagnostics
    })
  } catch (error) {
    logger.error('Failed to run concurrency diagnostics', {
      requestId: req.id,
      error: error.message
    })
    
    res.status(500).json({
      status: 'error',
      error: {
        message: 'Failed to run concurrency diagnostics',
        type: 'internal_error'
      }
    })
  }
})

// POST /convergence/cleanup - Force cleanup of monitoring data (admin only)
router.post('/cleanup', authenticate, (req, res) => {
  try {
    const { force = false } = req.body
    
    if (!force) {
      return res.status(400).json({
        status: 'error',
        error: {
          message: 'This endpoint requires force=true parameter',
          type: 'invalid_request'
        }
      })
    }
    
    logger.warn('Force cleanup requested via API', {
      requestId: req.id,
      admin: true
    })
    
    // Force cleanup all monitoring data
    concurrencyMonitor.forceCleanup()
    
    res.json({
      status: 'success',
      message: 'Concurrency monitoring data force cleaned up',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to force cleanup monitoring data', {
      requestId: req.id,
      error: error.message
    })
    
    res.status(500).json({
      status: 'error',
      error: {
        message: 'Failed to cleanup monitoring data',
        type: 'internal_error'
      }
    })
  }
})

// GET /convergence/health - Overall concurrency health check
router.get('/health', (req, res) => {
  try {
    const metrics = concurrencyMonitor.getMetrics()
    const hangingRequests = concurrencyMonitor.detectHangingRequests()
    const resourceLeaks = concurrencyMonitor.detectResourceLeaks()
    
    // Determine overall health status
    let status = 'healthy'
    let issues = []
    
    if (metrics.hangingRequestRate > 5) {
      status = 'critical'
      issues.push(`High hanging request rate: ${metrics.hangingRequestRate.toFixed(2)}%`)
    } else if (metrics.hangingRequestRate > 2) {
      status = 'warning'
      issues.push(`Elevated hanging request rate: ${metrics.hangingRequestRate.toFixed(2)}%`)
    }
    
    if (metrics.resourceLeakRate > 2) {
      status = status === 'healthy' ? 'warning' : 'critical'
      issues.push(`Resource leak rate: ${metrics.resourceLeakRate.toFixed(2)}%`)
    }
    
    if (metrics.raceConditionRate > 1) {
      status = status === 'healthy' ? 'warning' : 'critical'
      issues.push(`Race condition rate: ${metrics.raceConditionRate.toFixed(2)}%`)
    }
    
    if (hangingRequests.length > 0) {
      status = 'critical'
      issues.push(`${hangingRequests.length} currently hanging requests`)
    }
    
    if (resourceLeaks.length > 0) {
      status = status === 'healthy' ? 'warning' : 'critical'
      issues.push(`${resourceLeaks.length} resource leaks detected`)
    }
    
    const healthData = {
      status,
      metrics,
      issues,
      hangingRequests: hangingRequests.length,
      resourceLeaks: resourceLeaks.length,
      timestamp: new Date().toISOString()
    }
    
    // Set appropriate HTTP status code
    const statusCode = status === 'healthy' ? 200 : 
                      status === 'warning' ? 200 : 503
    
    res.status(statusCode).json({
      status: 'success',
      data: healthData
    })
    
  } catch (error) {
    logger.error('Failed to get concurrency health', {
      requestId: req.id,
      error: error.message
    })
    
    res.status(500).json({
      status: 'error',
      error: {
        message: 'Failed to assess concurrency health',
        type: 'internal_error'
      }
    })
  }
})

export default router