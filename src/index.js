import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { createServer } from 'http'

// Import middleware
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { rateLimit } from './middleware/rateLimit.js'
import { createUnifiedRequestTimeout } from './utils/unifiedTimeoutManager.js'
import { concurrencyMonitor } from './utils/concurrencyMonitor.js'
import { handleJsonParsingError } from './middleware/jsonValidator.js'
import { healthMonitor } from './middleware/healthMonitor.js'

// Import routes
import chatRoutes from './routes/chat.js'
import modelsRoutes from './routes/models.js'
import healthRoutes from './routes/health.js'
import connectionHealthRoutes from './routes/connectionHealth.js'
import concurrencyRoutes from './routes/concurrency.js'

// Import services
import { logger } from './services/logger.js'
import { config } from './config/index.js'

// Load environment variables
dotenv.config()

const app = express()
const server = createServer(app)

// Basic middleware
app.use(helmet())
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials
}))

// Enhanced error handling for JSON parsing
app.use(handleJsonParsingError)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health monitoring
app.use(healthMonitor())

// Logging middleware
if (config.logging.enabled) {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }))
}
app.use(requestLogger)

// Request timeout middleware using unified timeout manager (prevents hanging requests)
app.use(createUnifiedRequestTimeout({
  defaultTimeout: 30000,     // 30 seconds for non-streaming
  streamingTimeout: 120000,  // 2 minutes for streaming
  maxTimeout: 300000,        // 5 minutes absolute maximum
  inactivityTimeout: 60000   // 1 minute inactivity timeout
}))

// Rate limiting
app.use(rateLimit)

// Health check endpoints (before other routes)
app.use('/health', healthRoutes)
app.use('/v1/health', connectionHealthRoutes)
app.use('/concurrency', concurrencyRoutes)

// API routes
app.use('/v1/chat/completions', chatRoutes)
app.use('/v1/models', modelsRoutes)

// OpenAI-compatible root routes
app.get('/v1', (req, res) => {
  res.json({
    object: 'api',
    version: '1.0.0',
    provider: 'qoloba-proxy',
    status: 'operational'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Not Found',
      type: 'invalid_request_error',
      code: 'not_found'
    }
  })
})

// Error handling middleware
app.use(errorHandler)

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`)
  
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down')
    process.exit(1)
  }, 30000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start server
const startServer = async () => {
  try {
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`🚀 Qoloba Proxy Server started successfully`)
      logger.info(`📍 Server running on http://${config.server.host}:${config.server.port}`)
      logger.info(`🔗 OpenAI-compatible endpoints available at:`)
      logger.info(`   • POST /v1/chat/completions`)
      logger.info(`   • GET  /v1/models`)
      logger.info(`   • GET  /health`)
      logger.info(`🔧 Environment: ${config.server.nodeEnv}`)
      logger.info(`📊 Logging level: ${config.logging.level}`)
      logger.info(`🌐 Qolaba API: ${config.qolaba.baseUrl}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Handle unhandled rejections first
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise.toString(),
    reason: reason?.message || reason,
    stack: reason?.stack,
    timestamp: new Date().toISOString()
  })
  
  // Don't exit immediately in production, just log and continue
  if (config.server.nodeEnv === 'production') {
    logger.warn('Unhandled promise rejection caught - continuing in production mode')
  } else {
    // In development, exit after a short delay to allow logging
    setTimeout(() => {
      logger.error('Exiting due to unhandled promise rejection in development')
      process.exit(1)
    }, 1000)
  }
})

// Handle uncaught exceptions with comprehensive logging (REMOVED DUPLICATE)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })
  
  // Always exit on uncaught exceptions as they can leave the app in unstable state
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

// Add warning for multiple listeners (helps catch memory leaks)
process.on('warning', (warning) => {
  logger.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
    timestamp: new Date().toISOString()
  })
})

// Start the server
startServer()

export default app