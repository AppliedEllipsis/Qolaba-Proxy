import { logger } from '../services/logger.js'
import { translateQolabaToOpenAI, extractToolCalls } from './translator.js'
import { config } from '../config/index.js'
import { createResponseState, withStreamingErrorBoundary, SafeSSEWriter } from './responseState.js'
import { concurrencyMonitor } from './concurrencyMonitor.js'

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

// CRITICAL FIX: Improved streaming response handler with unified timeout management
export async function handleStreamingResponse(res, req, qolabaClient, qolabaPayload, requestId) {
  // Register with concurrency monitor
  concurrencyMonitor.registerRequest(requestId, {
    type: 'streaming',
    model: qolabaPayload.model,
    stream: true
  })

  // Create response state tracker
  const responseState = createResponseState(res, requestId)

  // ENHANCEMENT: Use unified timeout manager instead of multiple competing systems
  const unifiedTimeoutManager = req.unifiedTimeoutManager || res.unifiedTimeoutManager
  if (unifiedTimeoutManager) {
    logger.debug('Using unified timeout manager for streaming', { requestId })
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
    
    logger.info('Client disconnected during streaming', { requestId })
    isClientDisconnected = true
    abortController.abort()
    
    // CRITICAL FIX: Properly handle async termination without .catch() on non-promise
    try {
      await handleTermination('client_disconnect')
    } catch (error) {
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
      
    } catch (error) {
      logger.warn('Streaming completion termination failed', {
        requestId,
        error: error.message
      })
      
      // Still mark as completed even if termination failed
      concurrencyMonitor.completeRequest(requestId, 'completed_with_errors', {
        error: error.message,
        responseLength: fullResponse.length
      })
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

  }, responseState, async (error, responseState) => {
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
      
    } catch (terminationError) {
      logger.warn('Error termination failed', {
        requestId,
        error: terminationError.message
      })
      
      // Still mark as failed even if termination failed
      concurrencyMonitor.completeRequest(requestId, 'error_termination_failed', {
        error: error.message,
        terminationError: terminationError.message
      })
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
    if (responseState.res.canWriteHeaders()) {
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

      const sseWriter = new SafeSSEWriter(responseState)
      sseWriter.writeEvent(errorChunk)
      sseWriter.writeDone()
      
      logger.debug('Sent error streaming response', { requestId })
    } else {
      logger.debug('Skipping error response - headers already sent or response ended', { requestId })
    }
  })
}

// Handle non-streaming response
export async function handleNonStreamingResponse(res, qolabaClient, qolabaPayload, requestId) {
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

    res.json(openaiResponse)

  } catch (error) {
    logger.error('Non-streaming request failed', {
      requestId,
      error: error.message
    })

    res.status(500).json({
      error: {
        message: error.message,
        type: 'api_error',
        code: 'chat_completion_error'
      }
    })
  }
}

// Generate chunk ID for streaming responses
function generateChunkId() {
  return 'chatcmpl-' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
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
  createToolCallChunk
}