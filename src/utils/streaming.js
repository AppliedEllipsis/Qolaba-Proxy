import { logger, logDetailedError, logResponseState, logHeaderOperation } from '../services/logger.js'
import { translateQolabaToOpenAI, extractToolCalls } from './translator.js'
import { config } from '../config/index.js'
import { concurrencyMonitor } from './concurrencyMonitor.js'
import { createResponseManager } from './responseManager.js'

/**
 * Unified timeout manager for streaming requests to prevent race conditions
 */
class StreamingTimeoutManager {
  constructor(requestId, responseState, abortController) {
    this.requestId = requestId
    this.responseState = responseState
    this.abortController = abortController
    this.timeouts = new Map()
    this.isTerminated = false
    this.terminationReason = null
  }

  /**
   * Set a timeout with proper coordination
   */
  setTimeout(callback, delayMs, name = 'default') {
    if (this.isTerminated) {
      return null
    }

    // Clear existing timeout with same name
    this.clearTimeout(name)

    const timeoutId = setTimeout(async () => {
      if (!this.isTerminated) {
        try {
          await callback()
        } catch (error) {
          logDetailedError(error, {
            requestId: this.requestId,
            method: 'timeout_callback',
            url: 'streaming_timeout_manager',
            responseState: {
              headersSent: false,
              ended: this.isTerminated,
              writable: false
            },
            additionalInfo: {
              timeoutName: name,
              isTerminated: this.isTerminated,
              terminationReason: this.terminationReason,
              activeTimeouts: Array.from(this.timeouts.keys())
            }
          })
          
          logger.error('Timeout callback failed', {
            requestId: this.requestId,
            timeoutName: name,
            error: error.message
          })
        }
      }
    }, delayMs)

    this.timeouts.set(name, timeoutId)
    return timeoutId
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(name) {
    const timeoutId = this.timeouts.get(name)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.timeouts.delete(name)
      return true
    }
    return false
  }

  /**
   * Clear all timeouts
   */
  clearTimeouts() {
    for (const [name, timeoutId] of this.timeouts.entries()) {
      clearTimeout(timeoutId)
    }
    this.timeouts.clear()
  }

  /**
   * Mark as terminated and prevent future timeouts
   */
  terminate(reason) {
    if (this.isTerminated) {
      return
    }

    this.isTerminated = true
    this.terminationReason = reason
    this.clearTimeouts()

    logger.debug('Timeout manager terminated', {
      requestId: this.requestId,
      reason
    })
  }

  /**
   * Check if terminated
   */
  isTerminatedManager() {
    return this.isTerminated
  }
}

/**
 * Safe SSE (Server-Sent Events) writer for ResponseManager
 */
class SafeSSEWriter {
  constructor(responseManager) {
    this.responseManager = responseManager
  }

  writeEvent(data, eventType = null) {
    if (!this.responseManager.res.canWrite()) {
      return false
    }

    try {
      let sseData = `data: ${JSON.stringify(data)}\n\n`
      
      if (eventType) {
        sseData = `event: ${eventType}\n${sseData}`
      }

      return this.responseManager.safeWrite(sseData)
    } catch (error) {
      logger.error('Failed to write SSE event', {
        requestId: this.responseManager.requestId,
        error: error.message
      })
      return false
    }
  }

  writeDone() {
    if (!this.responseManager.res.canWrite()) {
      return false
    }

    try {
      // Write the DONE marker
      const success = this.responseManager.safeWrite('data: [DONE]\n\n')
      
      // CRITICAL FIX: Don't end the response here - let coordinatedTermination handle it
      // This prevents "Cannot set headers after they are sent to the client" error
      
      return success
    } catch (error) {
      logger.error('Failed to write SSE DONE', {
        requestId: this.responseManager.requestId,
        error: error.message
      })
      return false
    }
  }
}

/**
 * Enhanced error boundary with coordinated termination for ResponseManager
 */
async function withStreamingErrorBoundary(fn, responseManager, errorHandler) {
  try {
    return await fn(responseManager)
  } catch (error) {
    logger.error('Streaming error boundary triggered', {
      requestId: responseManager.requestId,
      error: error.message,
      stack: error.stack
    })

    // CRITICAL FIX: Use coordinated termination to prevent race conditions
    try {
      await responseManager.coordinatedTermination('error_boundary')
    } catch (terminationError) {
      logger.warn('Coordinated termination failed in error boundary', {
        requestId: responseManager.requestId,
        error: terminationError.message
      })
    }

    // Only attempt to send error response if response hasn't been terminated
    if (!responseManager.hasEnded() && !responseManager.isDestroyed) {
      // Try to send error response only if headers haven't been sent
      if (responseManager.res.canWriteHeaders()) {
        try {
          responseManager.safeWriteHeaders(500, {
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

          responseManager.safeWrite(JSON.stringify(errorResponse))
          responseManager.safeEnd()
        } catch (writeError) {
          logger.error('Failed to send error response in stream', {
            requestId: responseManager.requestId,
            error: writeError.message
          })
        }
      } else {
        logger.debug('Skipping error response - headers already sent', {
          requestId: responseManager.requestId,
          headersSent: responseManager.areHeadersSent()
        })
      }
    } else {
      logger.debug('Skipping error response - response already terminated', {
        requestId: responseManager.requestId,
        isEnded: responseManager.hasEnded(),
        isDestroyed: responseManager.isDestroyed
      })
    }

    // Call custom error handler if provided, but don't let it throw
    if (errorHandler) {
      try {
        await errorHandler(error, responseManager)
      } catch (handlerError) {
        logger.error('Error handler failed', {
          requestId: responseManager.requestId,
          error: handlerError.message
        })
        // Don't re-throw handler errors to prevent cascading failures
      }
    }

    // Force destroy as last resort only if not already destroyed
    if (!responseManager.isDestroyed) {
      responseManager.destroy()
    }

    // Re-throw the original error to maintain error propagation
    throw error
  }
}

// CRITICAL FIX: Improved streaming response handler with unified timeout management
export async function handleStreamingResponse(responseManager, res, req, qolabaClient, qolabaPayload, requestId) {
  // Register with concurrency monitor
  concurrencyMonitor.registerRequest(requestId, {
    type: 'streaming',
    model: qolabaPayload.model,
    stream: true
  })

  // Use the consolidated response manager instead of separate response state
  const responseState = responseManager

  // ENHANCEMENT: Use unified timeout manager instead of multiple competing systems
  const unifiedTimeoutManager = req.unifiedTimeoutManager || res.unifiedTimeoutManager
  if (unifiedTimeoutManager) {
    logger.debug('Using unified timeout manager for streaming', { requestId })
    
    // ENHANCEMENT: Register streaming error handler for timeout scenarios
    const streamingErrorHandler = async (reason) => {
      await handleTimeoutError(responseState, qolabaPayload.model, reason)
    }
    
    unifiedTimeoutManager.registerStreamingErrorHandler(streamingErrorHandler)
    
    // Update activity to prevent premature timeouts
    unifiedTimeoutManager.updateActivity()
  } else {
    logger.warn('No unified timeout manager available, using fallback', { requestId })
  }

  // Add abort controller for request cancellation
  const abortController = new AbortController()
  concurrencyMonitor.trackResourceAllocation(requestId, 'abort_controller', requestId)

  // CRITICAL FIX: Safe termination handler with proper Promise handling
  const safeHandleTermination = async (reason) => {
    try {
      logger.debug('Starting safe termination', { requestId, reason })
      
      // Update activity to show we're handling termination
      if (unifiedTimeoutManager) {
        unifiedTimeoutManager.updateActivity()
      }
      
      // Use coordinated termination from response state
      await responseState.coordinatedTermination(reason)
      
      // Track cleanup event
      concurrencyMonitor.trackCleanupEvent(requestId, 'streaming_termination', { reason })
      
      logger.debug('Safe termination completed', { requestId, reason })
    } catch (error) {
      logDetailedError(error, {
        requestId,
        method: 'safe_termination',
        url: 'streaming_handler',
        responseState: {
          headersSent: responseState.isHeadersSent,
          ended: responseState.isEnded,
          writable: responseState.res.writable
        },
        additionalInfo: {
          terminationReason: reason,
          unifiedTimeoutManagerAvailable: !!unifiedTimeoutManager,
          canOperate: unifiedTimeoutManager ? unifiedTimeoutManager.canOperate() : 'N/A'
        }
      })
      
      logger.error('Safe termination failed', {
        requestId,
        reason,
        error: error.message
      })
      
      // Track failure but don't re-throw to prevent hanging
      concurrencyMonitor.trackRaceCondition(requestId, 'termination_failure', {
        reason,
        error: error.message
      })
    }
  }

  // Use unified timeout manager if available, otherwise use minimal fallback
  if (unifiedTimeoutManager) {
    // The unified manager already handles automatic timeouts
    logger.debug('Unified timeout manager will handle streaming timeouts', { requestId })
  } else {
    // Fallback timeout handling (should not happen with unified manager)
    logger.warn('Using fallback timeout handling - unified manager not available', { requestId })
    setTimeout(() => {
      if (!responseState.isEnded) {
        safeHandleTermination('fallback_timeout')
      }
    }, 120000) // 2 minutes fallback
  }

  // Enhanced disconnect detection
  let isClientDisconnected = false
  
  // CRITICAL FIX: Coordinated termination handler with proper async safety
  const handleTermination = async (reason) => {
    // Check if unified timeout manager is available and not terminated
    if (unifiedTimeoutManager && !unifiedTimeoutManager.canOperate()) {
      logger.debug('Termination already in progress via unified manager', {
        requestId,
        reason,
        existingReason: unifiedTimeoutManager.terminationReason
      })
      return
    }

    logger.debug('Initiating coordinated termination', { requestId, reason })
    
    // Use the safe termination handler
    await safeHandleTermination(reason)
    
    // Terminate unified timeout manager if available
    if (unifiedTimeoutManager) {
      try {
        await unifiedTimeoutManager.terminate(reason)
      } catch (error) {
        logger.warn('Failed to terminate unified timeout manager', {
          requestId,
          reason,
          error: error.message
        })
      }
    }
  }
  
  // Handle response errors with better coordination and Promise safety
  const handleResponseError = async (error) => {
    logDetailedError(error, {
      requestId,
      method: 'response_error_handler',
      url: 'streaming_handler',
      responseState: {
        headersSent: responseState.isHeadersSent,
        ended: responseState.isEnded,
        writable: responseState.res.writable
      },
      additionalInfo: {
        isClientDisconnected,
        unifiedTimeoutManagerAvailable: !!unifiedTimeoutManager,
        canOperate: unifiedTimeoutManager ? unifiedTimeoutManager.canOperate() : true,
        errorCode: error.code
      }
    })
    
    logger.error('Response error during streaming', {
      requestId,
      error: error.message,
      code: error.code
    })
    
    if (!isClientDisconnected) {
      const canTerminate = unifiedTimeoutManager ?
        unifiedTimeoutManager.canOperate() : true
      
      if (canTerminate) {
        abortController.abort()
        
        // CRITICAL FIX: Properly handle async termination without .catch() on non-promise
        try {
          await handleTermination('response_error')
        } catch (terminationError) {
          logDetailedError(terminationError, {
            requestId,
            method: 'response_error_termination',
            url: 'streaming_handler',
            responseState: {
              headersSent: responseState.isHeadersSent,
              ended: responseState.isEnded,
              writable: responseState.res.writable
            },
            additionalInfo: {
              originalError: error.message,
              terminationError: terminationError.message
            }
          })
          
          logger.warn('Response error termination failed', {
            requestId,
            error: terminationError.message
          })
        }
      }
    }
  }

  // Handle request abort (client cancelled)
  req.on('aborted', () => {
    logger.info('Request aborted by client', { requestId })
    handleClientDisconnect()
  })
  
  // Listen for response errors
  res.on('error', handleResponseError)

  // Handle client disconnect with proper coordination and Promise safety
  const handleClientDisconnect = async () => {
    if (isClientDisconnected) {
      return // Already handled
    }
    
    logResponseState(requestId, 'client_disconnect_initiated', {
      headersSent: responseState.isHeadersSent,
      responseEnded: responseState.isEnded,
      writable: responseState.res.writable
    })
    
    logger.info('Client disconnected during streaming', { requestId })
    isClientDisconnected = true
    abortController.abort()
    
    // CRITICAL FIX: Properly handle async termination without .catch() on non-promise
    try {
      await handleTermination('client_disconnect')
    } catch (error) {
      logDetailedError(error, {
        requestId,
        method: 'client_disconnect_termination',
        url: 'streaming_handler',
        responseState: {
          headersSent: responseState.isHeadersSent,
          ended: responseState.isEnded,
          writable: responseState.res.writable
        },
        additionalInfo: {
          disconnectType: 'client_disconnect',
          isClientDisconnected: true
        }
      })
      
      logger.warn('Client disconnect termination failed', {
        requestId,
        error: error.message
      })
    }
  }

  // Listen for client disconnect
  res.on('close', handleClientDisconnect)
  res.on('finish', async () => {
    logger.debug('Stream finished, starting cleanup', { requestId })
    
    // Update activity before cleanup
    if (unifiedTimeoutManager) {
      unifiedTimeoutManager.updateActivity()
    }
    
    // Terminate unified timeout manager
    if (unifiedTimeoutManager) {
      try {
        await unifiedTimeoutManager.terminate('streaming_complete')
      } catch (error) {
        logger.warn('Failed to terminate unified timeout manager on finish', {
          requestId,
          error: error.message
        })
      }
    }
    
    // Track final cleanup
    concurrencyMonitor.trackCleanupEvent(requestId, 'streaming_finish', {})
  })
  
  return withStreamingErrorBoundary(async (responseState) => {
    // Set SSE headers safely
    const headersSet = responseState.safeWriteHeaders(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    })

    if (!headersSet) {
      throw new Error('Failed to set streaming headers')
    }

    let fullResponse = ''
    let isFirstChunk = true
    const sseWriter = new SafeSSEWriter(responseState)

    // Start streaming with proper error handling
    await qolabaClient.streamChat(qolabaPayload, (chunk) => {
      // Update activity to show streaming progress
      if (unifiedTimeoutManager) {
        unifiedTimeoutManager.updateActivity()
      }

      if (chunk.output) {
        fullResponse += chunk.output

        // Create OpenAI-compatible streaming chunk
        const openaiChunk = {
          id: generateChunkId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: qolabaPayload.model || config.models.default,
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.output
              },
              finish_reason: null
            }
          ]
        }

        // Send SSE formatted data safely
        const success = sseWriter.writeEvent(openaiChunk)
        if (!success) {
          logger.warn('Failed to write streaming chunk', {
            requestId,
            model: qolabaPayload.model
          })
          return
        }

        // Log first chunk and progress
        if (isFirstChunk) {
          logger.info('Streaming started', {
            requestId,
            model: qolabaPayload.model
          })
          isFirstChunk = false
        }
      }
    })

    // Send final chunk safely
    const finalChunk = {
      id: generateChunkId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: qolabaPayload.model || config.models.default,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }
      ]
    }

    sseWriter.writeEvent(finalChunk)
    sseWriter.writeDone()

    logger.info('Streaming completed successfully', {
      requestId,
      responseLength: fullResponse.length,
      model: qolabaPayload.model
    })

    // CRITICAL FIX: Use coordinated termination to prevent race conditions
    try {
      // Update activity before completion
      if (unifiedTimeoutManager) {
        unifiedTimeoutManager.updateActivity()
      }

      await handleTermination('streaming_complete')

      // Complete request in concurrency monitor
      concurrencyMonitor.completeRequest(requestId, 'completed', {
        responseLength: fullResponse.length,
        model: qolabaPayload.model
      })

      // CRITICAL FIX: Use coordinated termination instead of direct res.end() call
      // This prevents "Cannot set headers after they are sent to the client" error
      if (responseManager && !responseManager.hasEnded()) {
        await responseManager.coordinatedTermination('streaming_complete')
      }

    } catch (error) {
      logDetailedError(error, {
        requestId,
        method: 'streaming_completion_termination',
        url: 'streaming_handler',
        responseState: {
          headersSent: responseState.areHeadersSent(),
          ended: responseState.hasEnded(),
          writable: responseState.res.writable
        },
        additionalInfo: {
          responseLength: fullResponse.length,
          model: qolabaPayload.model,
          completionType: 'streaming_complete'
        }
      })
      
      logger.warn('Streaming completion termination failed', {
        requestId,
        error: error.message
      })

      // Still mark as completed even if termination failed
      concurrencyMonitor.completeRequest(requestId, 'completed_with_errors', {
        error: error.message,
        responseLength: fullResponse.length
      })

      // CRITICAL FIX: Use coordinated termination instead of direct res.end() call
      // This prevents "Cannot set headers after they are sent to the client" error
      if (responseManager && !responseManager.hasEnded()) {
        try {
          logHeaderOperation(requestId, 'coordinated_termination_completion_error', true)
          await responseManager.coordinatedTermination('streaming_completion_error')
        } catch (endError) {
          logDetailedError(endError, {
            requestId,
            method: 'coordinated_termination_completion_error',
            url: 'streaming_handler',
            responseState: {
              headersSent: responseState.areHeadersSent(),
              ended: responseState.hasEnded(),
              writable: responseState.res.writable
            },
            additionalInfo: {
              originalError: error.message,
              endError: endError.message,
              responseLength: fullResponse.length
            }
          })
        }
      }
    }

    // ENHANCEMENT: Cancel unified timeout manager if available
    if (unifiedTimeoutManager) {
      try {
        await unifiedTimeoutManager.terminate('streaming_completed')
      } catch (error) {
        logger.warn('Failed to terminate unified timeout manager on completion', {
          requestId,
          error: error.message
        })
      }
    }

  }, responseManager, async (error, responseManager) => {
    // Custom error handler for streaming
    logger.error('Streaming error handler called', {
      requestId,
      error: error.message
    })

    // CRITICAL FIX: Use coordinated termination for error handling
    try {
      await safeHandleTermination('streaming_error')

      // Mark as failed in concurrency monitor
      concurrencyMonitor.completeRequest(requestId, 'error', {
        error: error.message
      })

      // CRITICAL FIX: Use coordinated termination instead of direct res.end() call
      // This prevents "Cannot set headers after they are sent to the client" error
      if (responseManager && !responseManager.hasEnded()) {
        await responseManager.coordinatedTermination('streaming_error')
      }

    } catch (terminationError) {
      logDetailedError(terminationError, {
        requestId,
        method: 'streaming_error_termination',
        url: 'streaming_handler',
        responseState: {
          headersSent: responseState.isHeadersSent,
          ended: responseState.isEnded,
          writable: responseState.res.writable
        },
        additionalInfo: {
          originalError: error.message,
          terminationError: terminationError.message,
          errorType: 'streaming_error_boundary'
        }
      })
      
      logger.warn('Error termination failed', {
        requestId,
        error: terminationError.message
      })

      // Still mark as failed even if termination failed
      concurrencyMonitor.completeRequest(requestId, 'error_termination_failed', {
        error: error.message,
        terminationError: terminationError.message
      })

      // Ensure ResponseManager is properly ended through its coordination even on termination error
      if (responseManager && !responseManager.hasEnded()) {
        try {
          logHeaderOperation(requestId, 'coordinated_termination_error', true)
          await responseManager.coordinatedTermination('streaming_termination_error')
        } catch (endError) {
          logDetailedError(endError, {
            requestId,
            method: 'res.end_termination_error',
            url: 'streaming_handler',
            responseState: {
              headersSent: responseState.isHeadersSent,
              ended: responseState.isEnded,
              writable: responseState.res.writable
            },
            additionalInfo: {
              originalError: error.message,
              terminationError: terminationError.message,
              endError: endError.message
            }
          })
        }
      }
    }

    // ENHANCEMENT: Terminate unified timeout manager on error
    if (unifiedTimeoutManager) {
      try {
        await unifiedTimeoutManager.terminate('streaming_error')
      } catch (error) {
        logger.warn('Failed to terminate unified timeout manager on error', {
          requestId,
          error: error.message
        })
      }
    }

    // Try to send error response only if headers haven't been sent and response hasn't ended
    if (responseManager.res.canWriteHeaders()) {
      const errorChunk = {
        id: generateChunkId(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: qolabaPayload.model || config.models.default,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'error'
          }
        ],
        error: {
          message: 'Streaming error occurred',
          type: 'api_error'
        }
      }

      const sseWriter = new SafeSSEWriter(responseManager)
      sseWriter.writeEvent(errorChunk)
      sseWriter.writeDone()
      
      logger.debug('Sent error streaming response', { requestId })
    } else {
      logger.debug('Skipping error response - headers already sent or response ended', { requestId })
    }
  })
}

// Handle non-streaming response
export async function handleNonStreamingResponse(responseManager, res, qolabaClient, qolabaPayload, requestId) {
  try {
    logger.info('Non-streaming request started', {
      requestId,
      model: qolabaPayload.model
    })

    const response = await qolabaClient.chat(qolabaPayload)

    // Translate to OpenAI format
    const openaiResponse = {
      id: generateChunkId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: qolabaPayload.model || config.models.default,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.output || ''
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: response.usage?.promptTokens || 0,
        completion_tokens: response.usage?.completionTokens || 0,
        total_tokens: response.usage?.totalTokens || 0
      }
    }

    logger.info('Non-streaming request completed', {
      requestId,
      responseLength: response.output?.length || 0,
      model: qolabaPayload.model,
      usage: response.usage
    })

    if (!responseManager.hasEnded()) {
      res.json(openaiResponse)
    }

  } catch (error) {
    logger.error('Non-streaming request failed', {
      requestId,
      error: error.message
    })

    if (!responseManager.hasEnded()) {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'api_error',
          code: 'chat_completion_error'
        }
      })
    }
  }
}

// Generate chunk ID for streaming responses
function generateChunkId() {
  return 'chatcmpl-' + Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}

/**
 * Create OpenAI-compliant timeout error chunk for streaming responses
 */
export function createTimeoutErrorChunk(requestId, model, message = 'Request timeout') {
  return {
    id: generateChunkId(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4.1-mini-2025-04-14',
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'error'
      }
    ],
    error: {
      message,
      type: 'api_error',
      code: 'timeout'
    }
  }
}

/**
 * Create OpenAI-compliant timeout error response for HTTP responses
 */
export function createTimeoutErrorResponse(requestId, message = 'Request timeout') {
  return {
    error: {
      message,
      type: 'api_error',
      code: 'timeout',
      request_id: requestId
    }
  }
}

/**
 * Send timeout error as streaming chunk (if streaming headers already sent)
 */
export function sendTimeoutErrorStreaming(responseManager, model, message = 'Request timeout') {
  if (!responseManager.res.canWrite()) {
    logger.debug('Cannot send timeout error streaming chunk - response cannot write', {
      requestId: responseManager.requestId
    })
    return false
  }

  try {
    const errorChunk = createTimeoutErrorChunk(responseManager.requestId, model, message)
    const sseWriter = new SafeSSEWriter(responseManager)
    
    const success = sseWriter.writeEvent(errorChunk)
    if (success) {
      sseWriter.writeDone()
      logger.info('Sent timeout error as streaming chunk', {
        requestId: responseManager.requestId,
        model
      })
      return true
    } else {
      logger.warn('Failed to write timeout error streaming chunk', {
        requestId: responseManager.requestId
      })
      return false
    }
  } catch (error) {
    logDetailedError(error, {
      requestId: responseManager.requestId,
      method: 'send_timeout_error_streaming',
      url: 'streaming_timeout_handler',
      responseState: {
        headersSent: responseManager.areHeadersSent(),
        ended: responseManager.hasEnded(),
        writable: responseManager.res.writable
      },
      additionalInfo: {
        timeoutMessage: message,
        model: model,
        errorType: 'timeout_error_streaming'
      }
    })
    
    logger.error('Error sending timeout error streaming chunk', {
      requestId: responseManager.requestId,
      error: error.message
    })
    return false
  }
}

/**
 * Send timeout error as HTTP response (if headers not sent)
 */
export function sendTimeoutErrorHttp(res, requestId, message = 'Request timeout') {
  try {
    if (res.headersSent || res.writableEnded) {
      logger.debug('Cannot send timeout error HTTP response - headers already sent', {
        requestId
      })
      return false
    }

    const errorResponse = createTimeoutErrorResponse(requestId, message)
    res.status(408).json(errorResponse)
    
    logger.info('Sent timeout error as HTTP response', {
      requestId
    })
    return true
  } catch (error) {
    logDetailedError(error, {
      requestId,
      method: 'send_timeout_error_http',
      url: 'streaming_timeout_handler',
      responseState: {
        headersSent: res.headersSent,
        ended: res.writableEnded,
        writable: res.writable
      },
      additionalInfo: {
        timeoutMessage: message,
        errorType: 'timeout_error_http'
      }
    })
    
    logger.error('Error sending timeout error HTTP response', {
      requestId,
      error: error.message
    })
    return false
  }
}

/**
 * Handle timeout error with hybrid approach - try streaming first, fallback to HTTP
 */
export async function handleTimeoutError(responseManager, model, reason = 'timeout') {
  const message = reason === 'base_timeout' ? 'Request timeout' :
                  reason === 'streaming_timeout' ? 'Streaming timeout' :
                  reason === 'inactivity_timeout' ? 'Request timeout due to inactivity' :
                  'Request timeout'

  logger.warn('Handling timeout error with hybrid approach', {
    requestId: responseManager.requestId,
    reason,
    headersSent: responseManager.areHeadersSent(),
    canWriteHeaders: responseManager.res.canWriteHeaders(),
    canWrite: responseManager.res.canWrite()
  })

  // Try streaming error first if headers already sent
  if (responseManager.areHeadersSent() && responseManager.res.canWrite()) {
    const streamingSuccess = sendTimeoutErrorStreaming(responseManager, model, message)
    if (streamingSuccess) {
      return true
    }
  }

  // Fallback to HTTP error if streaming failed or headers not sent
  if (responseManager.res.canWriteHeaders()) {
    const httpSuccess = sendTimeoutErrorHttp(responseManager.res, responseManager.requestId, message)
    if (httpSuccess) {
      return true
    }
  }

  // If both methods failed, log and proceed with termination
  logger.warn('Both streaming and HTTP timeout error delivery failed, proceeding with termination', {
    requestId: responseManager.requestId,
    reason
  })
  return false
}

// Extract and handle tool calls from streaming response
export function extractToolCallsFromStream(content) {
  const toolCalls = extractToolCalls(content)
  
  if (toolCalls.length > 0) {
    logger.debug('Tool calls detected in response', {
      toolCallCount: toolCalls.length,
      toolNames: toolCalls.map(call => call.function.name)
    })
  }
  
  return toolCalls
}

// Create tool call chunk for streaming
export function createToolCallChunk(toolCall, requestId) {
  return {
    id: generateChunkId(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [toolCall]
        },
        finish_reason: null
      }
    ]
  }
}

export default {
  handleStreamingResponse,
  handleNonStreamingResponse,
  extractToolCallsFromStream,
  createToolCallChunk,
  createTimeoutErrorChunk,
  createTimeoutErrorResponse,
  sendTimeoutErrorStreaming,
  sendTimeoutErrorHttp,
  handleTimeoutError
}