
import axios from 'axios'
import { config } from '../config/index.js'
import { logger, logQolabaRequest } from './logger.js'
import { safeStringify } from '../utils/serialization.js'

export class QolabaApiClient {
  constructor(apiKey) {
    this.client = axios.create({
      baseURL: config.qolaba.baseUrl,
      timeout: config.qolaba.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      // Connection pool configuration
      maxSockets: config.connectionPool.maxSockets,
      maxFreeSockets: config.connectionPool.maxFreeSockets,
      keepAlive: config.connectionPool.keepAlive,
      keepAliveMsecs: config.connectionPool.keepAliveMsecs,
      maxCachedSessions: config.connectionPool.maxCachedSessions,
      // Additional connection settings
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      // Socket timeout settings
      socketTimeout: config.performance.socketTimeout,
      connectionTimeout: config.performance.connectionTimeout
    })

    // Add connection health tracking
    this.connectionHealth = {
      totalRequests: 0,
      failedRequests: 0,
      lastError: null,
      lastErrorTime: null,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 5
    }

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Qolaba API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: this.sanitizeHeaders(config.headers)
        })
        return config
      },
      (error) => {
        logger.error('Qolaba API request error', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Qolaba API response', {
          status: response.status,
          statusText: response.statusText,
          dataSize: safeStringify(response.data).length
        })
        return response
      },
      (error) => {
        logger.error('Qolaba API response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        })
        return Promise.reject(error)
      }
    )
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers }
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer [REDACTED]'
    }
    return sanitized
  }

  async streamChat(payload, onChunk) {
    const startTime = Date.now()
    
    // DIAGNOSTIC: Log timeout configuration for debugging
    logger.debug('Qolaba API streamChat started', {
      timeout: 90000,
      inactivityTimeout: 60000,
      absoluteTimeout: 85000,
      payloadSize: JSON.stringify(payload).length
    })
    
    try {
      const response = await this.client.post('/streamChat', payload, {
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        timeout: 90000 // CRITICAL FIX: Extended to 90 seconds to handle provider latency
      })

      let buffer = ''
      let totalOutput = ''
      let isStreamEnded = false
      let lastChunkTime = Date.now()
      
      return new Promise((resolve, reject) => {
        // CRITICAL FIX: Improved stream data handling with provider latency accommodation
        const handleData = (chunk) => {
          try {
            if (isStreamEnded) {
              logger.warn('Received data after stream ended')
              return
            }
            
            lastChunkTime = Date.now()
            buffer += chunk.toString()
            
            // Process complete SSE messages
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (line.trim() === '') continue
              
              try {
                // Parse JSON response from Qolaba
                const data = JSON.parse(line.trim())
                
                if (data.output !== null && data.output !== undefined) {
                  totalOutput += data.output
                  
                  try {
                    onChunk({
                      output: data.output,
                      done: false
                    })
                  } catch (chunkError) {
                    logger.error('Error in chunk callback', {
                      error: chunkError.message,
                      chunk: data.output?.substring(0, 100)
                    })
                    // Don't reject the promise, just continue
                  }
                }
                
                // Check if stream is complete
                if (data.output === null) {
                  isStreamEnded = true
                  const responseTime = Date.now() - startTime
                  logQolabaRequest('/streamChat', 'POST', payload, responseTime, 200)
                  
                  // CRITICAL FIX: Ensure proper stream cleanup on completion
                  cleanupStream(response, 'completion')
                  
                  resolve({
                    output: totalOutput,
                    usage: {
                      promptTokens: data.promptTokens || 0,
                      completionTokens: data.completionTokens || 0,
                      totalTokens: (data.promptTokens || 0) + (data.completionTokens || 0)
                    }
                  })
                  return
                }
              } catch (parseError) {
                logger.warn('Failed to parse streaming response', {
                  line: line.substring(0, 100),
                  error: parseError.message
                })
              }
            }
          } catch (dataError) {
            logger.error('Error processing stream data', {
              error: dataError.message
            })
            // Don't reject immediately, let the stream continue
          }
        }

        // CRITICAL FIX: Enhanced error handling with better cleanup
        const handleError = (error) => {
          if (isStreamEnded) return
          
          isStreamEnded = true
          const responseTime = Date.now() - startTime
          logQolabaRequest('/streamChat', 'POST', payload, responseTime, 'ERROR')
          
          logger.error('Stream error occurred', {
            error: error.message,
            code: error.code,
            responseTime: `${responseTime}ms`
          })
          
          cleanupStream(response, 'error')
          reject(new Error(`Streaming error: ${error.message}`))
        }

        // CRITICAL FIX: Enhanced end handling with proper cleanup
        const handleEnd = () => {
          if (isStreamEnded) return
          
          isStreamEnded = true
          const responseTime = Date.now() - startTime
          
          cleanupStream(response, 'end')
          
          // If we didn't get a proper completion signal, resolve with what we have
          if (totalOutput.length > 0) {
            logQolabaRequest('/streamChat', 'POST', payload, responseTime, 200)
            resolve({
              output: totalOutput,
              usage: {
                promptTokens: 0,
                completionTokens: totalOutput.length / 4, // Rough estimate
                totalTokens: totalOutput.length / 4
              }
            })
          } else {
            logQolabaRequest('/streamChat', 'POST', payload, responseTime, 'ERROR')
            reject(new Error('Stream ended without completing'))
          }
        }

        // CRITICAL FIX: Centralized stream cleanup function
        const cleanupStream = (response, reason) => {
          try {
            if (response.data && typeof response.data.destroy === 'function') {
              response.data.destroy()
              logger.debug('Stream destroyed successfully', {
                requestId: 'unknown', // We don't have requestId here
                reason
              })
            }
            
            // Clean up axios request if possible
            if (response.request && typeof response.request.destroy === 'function') {
              response.request.destroy()
            }
          } catch (destroyError) {
            logger.warn('Failed to destroy stream during cleanup', {
              error: destroyError.message,
              reason
            })
          }
        }

        // Set up event listeners with proper error handling
        response.data.on('data', handleData)
        response.data.on('error', handleError)
        response.data.on('end', handleEnd)
        
        // CRITICAL FIX: Adaptive timeout based on data activity
        const checkStreamActivity = () => {
          if (!isStreamEnded) {
            const timeSinceLastChunk = Date.now() - lastChunkTime
            const totalElapsed = Date.now() - startTime
            
            // CRITICAL FIX: Coordinate timeouts with axios timeout to prevent race conditions
            // Allow more time for provider latency but don't wait indefinitely
            if (timeSinceLastChunk > 75000) { // 75 seconds of inactivity (less than 90s axios timeout)
              isStreamEnded = true
              logger.warn('Stream inactive for too long, cleaning up', {
                requestId: 'unknown',
                inactivityTime: `${timeSinceLastChunk}ms`,
                totalElapsed: `${totalElapsed}ms`,
                timeoutType: 'inactivity_timeout'
              })

              cleanupStream(response, 'inactivity_timeout')
              reject(new Error('Stream inactive timeout'))
              return
            }
            
            if (totalElapsed > 80000) { // 80 seconds absolute maximum (less than 90s axios timeout)
              isStreamEnded = true
              logger.warn('Stream absolute timeout reached, cleaning up', {
                requestId: 'unknown',
                totalElapsed: `${totalElapsed}ms`,
                timeoutType: 'absolute_timeout'
              })

              cleanupStream(response, 'absolute_timeout')
              reject(new Error('Stream absolute timeout'))
              return
            }
            
            // Continue checking
            activityCheckTimeout = setTimeout(checkStreamActivity, 10000) // Check every 10 seconds
          }
        }
        
        let activityCheckTimeout = setTimeout(checkStreamActivity, 10000)

        // Clean up timeouts when promise resolves/rejects
        const cleanup = () => {
          if (activityCheckTimeout) {
            clearTimeout(activityCheckTimeout)
          }
        }

        Promise.resolve().finally(cleanup)
      })
    } catch (error) {
      const responseTime = Date.now() - startTime
      logQolabaRequest('/streamChat', 'POST', payload, responseTime, error.response?.status || 'ERROR')
      
      // Add more specific error handling with enhanced logging
      if (error.code === 'ECONNABORTED') {
        logger.error('Qolaba API timeout detected', {
          timeout: config.qolaba.timeout,
          errorMessage: error.message,
          errorCode: error.code,
          stack: error.stack
        })
        throw new Error('Streaming request timeout')
      } else if (error.code === 'ECONNRESET') {
        logger.error('Qolaba API connection reset', {
          errorMessage: error.message,
          errorCode: error.code,
          stack: error.stack
        })
        throw new Error('Connection reset during streaming')
      } else {
        logger.error('Qolaba API unexpected error', {
          errorMessage: error.message,
          errorCode: error.code,
          stack: error.stack
        })
        throw error
      }
    }
  }

  async chat(payload) {
    const startTime = Date.now()
    
    try {
      const response = await this.client.post('/chat', payload)
      const responseTime = Date.now() - startTime
      
      logQolabaRequest('/chat', 'POST', payload, responseTime, response.status)
      
      return {
        output: response.data.output,
        usage: {
          promptTokens: response.data.promptTokens || 0,
          completionTokens: response.data.completionTokens || 0,
          totalTokens: (response.data.promptTokens || 0) + (response.data.completionTokens || 0)
        }
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      logQolabaRequest('/chat', 'POST', payload, responseTime, error.response?.status || 'ERROR')
      throw error
    }
  }
  
  // Get status endpoint for health checks
  async getStatus() {
    try {
      const response = await this.client.get('/get-status')
      return response.data
    } catch (error) {
      logger.error('Failed to get status:', error)
      throw error
    }
  }

  async getModels() {
    try {
      // Since Qolaba doesn't have a models endpoint, return available models from config
      const availableModels = [
        {
          id: 'gpt-4.1-mini-2025-04-14',
          object: 'model',
          created: Date.now(),
          owned_by: 'openai'
        },
        {
          id: 'gpt-4.1-2025-04-14',
          object: 'model',
          created: Date.now(),
          owned_by: 'openai'
        },
        {
          id: 'gpt-4o-mini',
          object: 'model',
          created: Date.now(),
          owned_by: 'openai'
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          object: 'model',
          created: Date.now(),
          owned_by: 'anthropic'
        },
        {
          id: 'gemini-1.5-pro',
          object: 'model',
          created: Date.now(),
          owned_by: 'google'
        },
        {
          id: 'gemini-1.5-flash',
          object: 'model',
          created: Date.now(),
          owned_by: 'google'
        }
      ]
      
      return {
        object: 'list',
        data: availableModels
      }
    } catch (error) {
      logger.error('Failed to get models:', error)
      throw error
    }
  }

  async getUsageInfo() {
    try {
      // This would need to be implemented based on Qolaba's actual usage API
      // For now, return a mock response
      return {
        credits_available: 1000,
        credits_used: 100,
        requests_today: 25,
        requests_this_month: 500
      }
    } catch (error) {
      logger.error('Failed to get usage info:', error)
      throw error
    }
  }

  /**
   * Get connection health status
   */
  getConnectionHealth() {
    return {
      ...this.connectionHealth,
      successRate: this.connectionHealth.totalRequests > 0
        ? ((this.connectionHealth.totalRequests - this.connectionHealth.failedRequests) / this.connectionHealth.totalRequests * 100).toFixed(2)
        : 100,
      isHealthy: this.connectionHealth.consecutiveFailures < this.connectionHealth.maxConsecutiveFailures
    }
  }

  /**
   * Reset connection health tracking
   */
  resetConnectionHealth() {
    this.connectionHealth = {
      totalRequests: 0,
      failedRequests: 0,
      lastError: null,
      lastErrorTime: null,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 5
    }
  }

  /**
   * Check if client should attempt request based on health
   */
  shouldAttemptRequest() {
    return this.connectionHealth.consecutiveFailures < this.connectionHealth.maxConsecutiveFailures
  }

  /**
   * Record successful request
   */
  recordSuccess() {
    this.connectionHealth.totalRequests++
    this.connectionHealth.consecutiveFailures = 0
  }

  /**
   * Record failed request
   */
  recordFailure(error) {
    this.connectionHealth.totalRequests++
    this.connectionHealth.failedRequests++
    this.connectionHealth.consecutiveFailures++
    this.connectionHealth.lastError = error.message
    this.connectionHealth.lastErrorTime = new Date().toISOString()
  }
}

export default QolabaApiClient