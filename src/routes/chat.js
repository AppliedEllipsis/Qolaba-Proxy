import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { streamRateLimit } from '../middleware/rateLimit.js'
import { requestTimer, requestBodyLogger } from '../middleware/requestLogger.js'
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js'
import { logger } from '../services/logger.js'
import { config } from '../config/index.js'
import { QolabaApiClient } from '../services/qolaba.js'
import { translateOpenAIToQolaba, translateQolabaToOpenAI } from '../utils/translator.js'
import { handleStreamingResponse, handleNonStreamingResponse } from '../utils/streaming.js'
import { createResponseManager } from '../utils/responseManager.js'

const router = express.Router()

// POST /v1/chat/completions
router.post('/', 
  authenticate,
  streamRateLimit,
  requestTimer,
  requestBodyLogger,
  async (req, res, next) => {
    const startTime = Date.now()
    const responseManager = createResponseManager(res, req.id)

    try {
      logger.info('Chat completion request received', {
        requestId: req.id,
        model: req.body.model,
        stream: req.body.stream,
        messagesCount: req.body.messages?.length || 0
      })

      // Validate request body
      const validation = validateChatRequest(req.body)
      if (!validation.valid) {
        throw new ValidationError(validation.error)
      }

      // Get model configuration
      const modelConfig = getModelConfig(req.body.model)
      
      // Translate OpenAI format to Qolaba format
      const qolabaPayload = translateOpenAIToQolaba(req.body, modelConfig)
      
      // Create Qolaba API client
      const qolabaClient = new QolabaApiClient(req.apiKey)
      
      logger.debug('Translated request to Qolaba format', {
        requestId: req.id,
        qolabaModel: qolabaPayload.llm_model,
        qolabaLLM: qolabaPayload.llm,
        stream: qolabaPayload.stream || false
      })

      // Handle streaming vs non-streaming requests
      if (req.body.stream === true) {
        await handleStreamingResponse(responseManager, res, req, qolabaClient, qolabaPayload, req.id)
      } else {
        await handleNonStreamingResponse(responseManager, res, qolabaClient, qolabaPayload, req.id)
      }

      const duration = Date.now() - startTime
      logger.info('Chat completion completed successfully', {
        requestId: req.id,
        model: req.body.model,
        stream: req.body.stream,
        duration: `${duration}ms`
      })

    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('Chat completion failed', {
        requestId: req.id,
        error: error.message,
        model: req.body.model,
        duration: `${duration}ms`
      })
      
      // Let the error handler middleware deal with the error
      next(error)
    }
  }
)

// Request validation
function validateChatRequest(body) {
  if (!body) {
    return { valid: false, error: 'Request body is required' }
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return { valid: false, error: 'messages field is required and must be an array' }
  }

  if (body.messages.length === 0) {
    return { valid: false, error: 'messages array cannot be empty' }
  }

  // Validate message format
  for (let i = 0; i < body.messages.length; i++) {
    const message = body.messages[i]
    if (!message.role || !message.content) {
      return { valid: false, error: `Message at index ${i} is missing required role or content field` }
    }
    
    if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
      return { valid: false, error: `Invalid role "${message.role}" in message at index ${i}` }
    }
  }

  // Validate temperature
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
      return { valid: false, error: 'temperature must be a number between 0 and 2' }
    }
  }

  // Validate max_tokens
  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== 'number' || body.max_tokens < 1 || body.max_tokens > 32768) {
      return { valid: false, error: 'max_tokens must be a number between 1 and 32768' }
    }
  }

  // Validate stream
  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return { valid: false, error: 'stream must be a boolean' }
  }

  return { valid: true }
}

// Get model configuration
function getModelConfig(modelName) {
  const mappedModel = config.modelMappings[modelName]
  
  if (!mappedModel) {
    logger.warn('Model not found in mappings, using default', {
      requestedModel: modelName,
      defaultModel: config.modelMappings.default.llm_model
    })
    return config.modelMappings.default
  }

  return mappedModel
}

// Tool calling support
router.post('/tools',
  authenticate,
  streamRateLimit,
  requestTimer,
  async (req, res) => {
    try {
      logger.info('Tool calling request received', {
        requestId: req.id,
        toolName: req.body.tool_name,
        parameters: req.body.parameters
      })

      if (!req.body.tool_name || !req.body.parameters) {
        throw new ValidationError('tool_name and parameters are required')
      }

      // Convert tool call to XML format for Qolaba
      const toolXml = convertToolCallToXml(req.body.tool_name, req.body.parameters)
      
      // Create a chat request with the tool call
      const chatPayload = {
        model: req.body.model || config.models.default,
        messages: [
          {
            role: 'user',
            content: toolXml
          }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 4000
      }

      // Process as normal chat request
      req.body = chatPayload
      
      // Reuse the main chat completion logic
      return router.post('/', req, res)
      
    } catch (error) {
      logger.error('Tool calling failed', {
        requestId: req.id,
        error: error.message,
        toolName: req.body.tool_name
      })
      throw error
    }
  }
)

// Convert tool call to XML format
function convertToolCallToXml(toolName, parameters) {
  let xml = `<tool name="${toolName}">\n`
  
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'object') {
      xml += `  <${key}>\n`
      for (const [subKey, subValue] of Object.entries(value)) {
        xml += `    <${subKey}>${escapeXml(String(subValue))}</${subKey}>\n`
      }
      xml += `  </${key}>\n`
    } else {
      xml += `  <${key}>${escapeXml(String(value))}</${key}>\n`
    }
  }
  
  xml += `</tool>`
  return xml
}

// Escape XML special characters
function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default router