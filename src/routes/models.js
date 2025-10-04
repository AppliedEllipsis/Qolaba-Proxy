import express from 'express'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { requestTimer } from '../middleware/requestLogger.js'
import { logger } from '../services/logger.js'
import { config } from '../config/index.js'
import { QolabaApiClient } from '../services/qolaba.js'

const router = express.Router()

// GET /v1/models - List available models
router.get('/',
  optionalAuth,
  requestTimer,
  async (req, res) => {
    try {
      logger.info('Models list request received', {
        requestId: req.id,
        authenticated: !!req.apiKey,
        responseState: {
          headersSent: res.headersSent,
          writable: res.writable,
          responseManagerExists: !!req.responseManager,
          responseManagerState: req.responseManager ? req.responseManager.getState() : null
        }
      })

      // Get available models from configuration
      let availableModels = Object.entries(config.modelMappings)
        .filter(([key]) => key !== 'default')
        .map(([modelId, modelConfig]) => ({
          id: modelId,
          object: 'model',
          created: Date.now(),
          owned_by: modelConfig.provider.toLowerCase(),
          permission: [],
          root: modelId,
          parent: null
        }))

      // Fallback: if no models are configured (edge-case), populate with default model
      if (availableModels.length === 0) {
        const defaultModelId = config.models.default
        const defaultModelConfig = config.modelMappings[defaultModelId] || {
          provider: 'OpenAI',
          llm: 'OpenAI',
          llm_model: defaultModelId
        }
        availableModels = [{
          id: defaultModelId,
          object: 'model',
          created: Date.now(),
          owned_by: (defaultModelConfig.provider || 'OpenAI').toLowerCase(),
          permission: [],
          root: defaultModelId,
          parent: null
        }]
      }

      const response = {
        object: 'list',
        data: availableModels
      }

      logger.debug('Models list response', {
        requestId: req.id,
        modelCount: availableModels.length,
        responseState: {
          headersSent: res.headersSent,
          writable: res.writable,
          responseManagerState: req.responseManager ? req.responseManager.getState() : null
        },
        responseData: {
          object: response.object,
          dataLength: response.data.length,
          firstModelId: response.data[0]?.id || 'none'
        }
      })

      res.json(response)

    } catch (error) {
      logger.error('Models list failed', {
        requestId: req.id,
        error: error.message
      })

      res.status(500).json({
        error: {
          message: 'Failed to retrieve models',
          type: 'api_error',
          code: 'models_error'
        }
      })
    }
  }
)

// GET /v1/models/:model - Get model details
router.get('/:model',
  optionalAuth,
  requestTimer,
  async (req, res) => {
    try {
      const { model } = req.params
      
      logger.info('Model details request received', {
        requestId: req.id,
        model,
        authenticated: !!req.apiKey
      })

      // Check if model exists in our mappings
      const modelConfig = config.modelMappings[model]
      
      if (!modelConfig || model === 'default') {
        return res.status(404).json({
          error: {
            message: `Model '${model}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        })
      }

      const modelDetails = {
        id: model,
        object: 'model',
        created: Date.now(),
        owned_by: modelConfig.provider.toLowerCase(),
        permission: [],
        root: model,
        parent: null,
        // Additional model metadata
        capabilities: {
          text: true,
          images: false, // Could be enabled based on model
          tools: true,
          streaming: true
        },
        provider: modelConfig.provider,
        llm: modelConfig.llm,
        llm_model: modelConfig.llm_model
      }

      logger.debug('Model details response', {
        requestId: req.id,
        model,
        provider: modelConfig.provider
      })

      res.json(modelDetails)

    } catch (error) {
      logger.error('Model details failed', {
        requestId: req.id,
        model: req.params.model,
        error: error.message
      })

      res.status(500).json({
        error: {
          message: 'Failed to retrieve model details',
          type: 'api_error',
          code: 'model_error'
        }
      })
    }
  }
)

// GET /v1/models/usage - Get usage information (authenticated only)
router.get('/usage',
  authenticate,
  requestTimer,
  async (req, res) => {
    try {
      logger.info('Usage information request received', {
        requestId: req.id,
        apiKey: req.originalApiKey?.substring(0, 8) + '...'
      })

      const qolabaClient = new QolabaApiClient(req.apiKey)
      const usageInfo = await qolabaClient.getUsageInfo()

      const response = {
        object: 'usage',
        data: {
          credits_available: usageInfo.credits_available,
          credits_used: usageInfo.credits_used,
          requests_today: usageInfo.requests_today,
          requests_this_month: usageInfo.requests_this_month,
          last_updated: new Date().toISOString()
        }
      }

      logger.debug('Usage information response', {
        requestId: req.id,
        creditsAvailable: usageInfo.credits_available,
        creditsUsed: usageInfo.credits_used
      })

      res.json(response)

    } catch (error) {
      logger.error('Usage information failed', {
        requestId: req.id,
        error: error.message
      })

      res.status(500).json({
        error: {
          message: 'Failed to retrieve usage information',
          type: 'api_error',
          code: 'usage_error'
        }
      })
    }
  }
)

// GET /v1/models/pricing - Get pricing information
router.get('/pricing',
  optionalAuth,
  requestTimer,
  async (req, res) => {
    try {
      logger.info('Pricing information request received', {
        requestId: req.id
      })

      // Pricing information based on Qolaba documentation
      const pricing = {
        object: 'pricing',
        data: {
          text_models: {
            'gpt-4.1-mini-2025-04-14': {
              input_tokens: 0.0001,  // Example pricing
              output_tokens: 0.0002,
              currency: 'USD'
            },
            'gpt-4.1-2025-04-14': {
              input_tokens: 0.0003,
              output_tokens: 0.0006,
              currency: 'USD'
            },
            'gpt-4o-mini': {
              input_tokens: 0.00015,
              output_tokens: 0.0003,
              currency: 'USD'
            }
          },
          image_models: {
            'dall-e-3': {
              credits_per_image: 11,
              currency: 'credits'
            },
            'flux-schnell': {
              credits_per_image: 3,
              currency: 'credits'
            },
            'flux-pro': {
              credits_per_image: 14,
              currency: 'credits'
            }
          },
          voice_models: {
            'text-to-speech': {
              credits_per_request: 2,
              currency: 'credits'
            }
          }
        },
        last_updated: new Date().toISOString()
      }

      res.json(pricing)

    } catch (error) {
      logger.error('Pricing information failed', {
        requestId: req.id,
        error: error.message
      })

      res.status(500).json({
        error: {
          message: 'Failed to retrieve pricing information',
          type: 'api_error',
          code: 'pricing_error'
        }
      })
    }
  }
)

export default router