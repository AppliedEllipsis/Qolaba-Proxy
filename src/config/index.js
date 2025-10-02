import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

export const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  qolaba: {
    baseUrl: process.env.QOLABA_BASE_URL || 'https://qolaba-server-b2b.up.railway.app/api/v1/studio',
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 300000,
    testApiKey: process.env.TEST_API_KEY || 'your-test-api-key-here'
  },

  models: {
    default: process.env.DEFAULT_MODEL || 'gpt-4.1-mini-2025-04-14',
    enableStreaming: process.env.ENABLE_STREAMING === 'true',
    maxTokens: parseInt(process.env.MAX_TOKENS) || 4096,
    temperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7
  },

  auth: {
    mode: process.env.API_KEY_MODE || 'passthrough', // 'passthrough' or 'override'
    overrideKey: process.env.OVERRIDE_API_KEY || null
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enabled: process.env.ENABLE_VERBOSE_LOGGING === 'true',
    format: process.env.LOG_FORMAT || 'json'
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },

  performance: {
    maxResponseSize: parseInt(process.env.MAX_RESPONSE_SIZE) || 10485760, // 10MB
    concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS_LIMIT) || 100,
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 30000
  },

  monitoring: {
    enabled: process.env.ENABLE_METRICS === 'true',
    port: parseInt(process.env.METRICS_PORT) || 9090,
    debugEndpoints: process.env.ENABLE_DEBUG_ENDPOINTS === 'true'
  },

  // OpenAI to Qolaba model mappings (based on actual Qolaba API)
  modelMappings: {
    // OpenAI models -> Qolaba models
    'gpt-4.1-mini-2025-04-14': {
      llm: 'OpenAI',
      llm_model: 'gpt-4.1-mini-2025-04-14',
      provider: 'OpenAI'
    },
    'gpt-4.1-2025-04-14': {
      llm: 'OpenAI',
      llm_model: 'gpt-4.1-2025-04-14',
      provider: 'OpenAI'
    },
    'gpt-4o-mini': {
      llm: 'OpenAI',
      llm_model: 'gpt-4o-mini',
      provider: 'OpenAI'
    },
    'gpt-4o': {
      llm: 'OpenAI',
      llm_model: 'gpt-4.1-2025-04-14', // Map to available model
      provider: 'OpenAI'
    },
    'gpt-3.5-turbo': {
      llm: 'OpenAI',
      llm_model: 'gpt-4.1-mini-2025-04-14', // Map to available model
      provider: 'OpenAI'
    },
    
    // Claude models
    'claude-3-5-sonnet-20241022': {
      llm: 'ClaudeAI',
      llm_model: 'claude-3-7-sonnet-latest',
      provider: 'ClaudeAI'
    },
    'claude-3-opus-20240229': {
      llm: 'ClaudeAI',
      llm_model: 'claude-opus-4-20250514',
      provider: 'ClaudeAI'
    },
    'claude-sonnet-4-20250514': {
      llm: 'ClaudeAI',
      llm_model: 'claude-sonnet-4-20250514',
      provider: 'ClaudeAI'
    },
    
    // Gemini models
    'gemini-1.5-pro': {
      llm: 'GeminiAI',
      llm_model: 'gemini-2.5-pro',
      provider: 'GeminiAI'
    },
    'gemini-1.5-flash': {
      llm: 'GeminiAI',
      llm_model: 'gemini-2.5-flash',
      provider: 'GeminiAI'
    },
    
    // OpenRouterAI models
    'grok-3-beta': {
      llm: 'OpenRouterAI',
      llm_model: 'x-ai/grok-3-beta',
      provider: 'OpenRouterAI'
    },
    'grok-3-mini-beta': {
      llm: 'OpenRouterAI',
      llm_model: 'x-ai/grok-3-mini-beta',
      provider: 'OpenRouterAI'
    },
    'perplexity-sonar-pro': {
      llm: 'OpenRouterAI',
      llm_model: 'perplexity/sonar-pro',
      provider: 'OpenRouterAI'
    },
    'deepseek-chat': {
      llm: 'OpenRouterAI',
      llm_model: 'deepseek/deepseek-chat',
      provider: 'OpenRouterAI'
    },
    'deepseek-r1': {
      llm: 'OpenRouterAI',
      llm_model: 'deepseek/deepseek-r1',
      provider: 'OpenRouterAI'
    },
    
    // Default fallback
    'default': {
      llm: 'OpenAI',
      llm_model: 'gpt-4.1-mini-2025-04-14',
      provider: 'OpenAI'
    }
  }
}

// Validate critical configuration
export const validateConfig = () => {
  const errors = []
  
  if (!config.qolaba.baseUrl) {
    errors.push('QOLABA_BASE_URL is required')
  }
  
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535')
  }
  
  if (!['passthrough', 'override'].includes(config.auth.mode)) {
    errors.push('API_KEY_MODE must be either "passthrough" or "override"')
  }
  
  if (config.auth.mode === 'override' && !config.auth.overrideKey) {
    errors.push('OVERRIDE_API_KEY is required when API_KEY_MODE is "override"')
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`)
  }
  
  return true
}

export default config