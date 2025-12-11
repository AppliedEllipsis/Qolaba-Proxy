import { logger } from '../services/logger.js'
import { config } from '../config/index.js'

// Translate OpenAI chat completion request to Qolaba format
export function translateOpenAIToQolaba(openaiRequest, modelConfig) {
  try {
    logger.debug('Translating OpenAI request to Qolaba format', {
      requestId: openaiRequest.requestId,
      model: openaiRequest.model,
      messagesCount: openaiRequest.messages?.length || 0
    })

    const qolabaRequest = {
      llm: modelConfig.llm,
      llm_model: modelConfig.llm_model,
      history: translateMessages(openaiRequest.messages),
      temperature: openaiRequest.temperature ?? config.models.temperature,
      image_analyze: hasImages(openaiRequest.messages),
      enable_tool: hasTools(openaiRequest),
      system_msg: getSystemMessage(openaiRequest.messages),
      tools: configureTools(openaiRequest),
      // Qolaba API specific parameters
      token: openaiRequest.token || '123', // Default from curl example
      orgID: openaiRequest.orgID || 'string',
      function_call_list: openaiRequest.function_call_list || [],
      systemId: openaiRequest.systemId || 'string',
      last_user_query: getLastUserMessage(openaiRequest.messages)
    }

    // Handle streaming preference
    if (openaiRequest.stream === true) {
      qolabaRequest.stream = true
    }

    logger.debug('Translation completed', {
      requestId: openaiRequest.requestId,
      qolabaLLM: qolabaRequest.llm,
      qolabaModel: qolabaRequest.llm_model,
      historyLength: qolabaRequest.history.length
    })

    return qolabaRequest
  } catch (error) {
    logger.error('Failed to translate OpenAI request to Qolaba format', {
      requestId: openaiRequest.requestId,
      error: error.message
    })
    throw error
  }
}

// Translate Qolaba response to OpenAI format
export function translateQolabaToOpenAI(qolabaResponse, originalRequest, isStreaming = false) {
  try {
    logger.debug('Translating Qolaba response to OpenAI format', {
      requestId: originalRequest.requestId,
      isStreaming,
      hasOutput: !!qolabaResponse.output
    })

    if (isStreaming) {
      return translateStreamingResponse(qolabaResponse, originalRequest)
    } else {
      return translateNonStreamingResponse(qolabaResponse, originalRequest)
    }
  } catch (error) {
    logger.error('Failed to translate Qolaba response to OpenAI format', {
      requestId: originalRequest.requestId,
      error: error.message
    })
    throw error
  }
}

// Translate OpenAI messages to Qolaba history format
// NOTE: System messages are extracted separately to system_msg field,
// so we filter them out from the history to avoid duplication
function translateMessages(messages) {
  const history = []

  for (const message of messages) {
    // Skip system messages - they are handled separately via system_msg field
    if (message.role === 'system') {
      continue
    }

    const qolabaMessage = {
      role: message.role,
      content: {
        text: '',
        image_data: []
      }
    }

    // Handle different content types
    if (typeof message.content === 'string') {
      qolabaMessage.content.text = message.content
    } else if (Array.isArray(message.content)) {
      // Handle multi-modal content (text + images)
      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          qolabaMessage.content.text = contentItem.text
        } else if (contentItem.type === 'image_url') {
          qolabaMessage.content.image_data.push({
            url: contentItem.image_url.url,
            details: contentItem.image_url.detail || 'low'
          })
        }
      }
    }

    history.push(qolabaMessage)
  }

  return history
}

// Check if messages contain images
function hasImages(messages) {
  return messages.some(message => {
    if (Array.isArray(message.content)) {
      return message.content.some(item => item.type === 'image_url')
    }
    return false
  })
}

// Check if request has tools
function hasTools(request) {
  return !!(request.tools && request.tools.length > 0) ||
         !!(request.functions && request.functions.length > 0)
}

// Extract system message from messages
function getSystemMessage(messages) {
  const systemMessage = messages.find(msg => msg.role === 'system')
  return systemMessage ? (typeof systemMessage.content === 'string' ? systemMessage.content : '') : ''
}

// Get last user message
function getLastUserMessage(messages) {
  const userMessages = messages.filter(msg => msg.role === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]
  
  if (!lastUserMessage) return ''
  
  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content
  } else if (Array.isArray(lastUserMessage.content)) {
    return lastUserMessage.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join(' ')
  }
  
  return ''
}

// Configure tools for Qolaba
function configureTools(request) {
  const defaultTools = {
    tool_list: {
      image_generation: false,
      image_generation1: false,
      image_editing: false,
      search_doc: false,
      internet_search: false,
      python_code_execution_tool: false,
      csv_analysis: false
    },
    number_of_context: 3,
    pdf_references: [''], // Empty string as in curl example
    embedding_model: ['text-embedding-3-large'],
    image_generation_parameters: {}
  }

  // Enable tools based on request
  if (request.tools && request.tools.length > 0) {
    defaultTools.tool_list.internet_search = true // Enable internet search for tools
    defaultTools.tool_list.search_doc = true      // Enable document search
  }

  if (request.functions && request.functions.length > 0) {
    defaultTools.tool_list.python_code_execution_tool = true
  }

  return defaultTools
}

// Translate streaming response
function translateStreamingResponse(qolabaResponse, originalRequest) {
  return {
    id: generateId(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.model,
    choices: [
      {
        index: 0,
        delta: {
          content: qolabaResponse.output || ''
        },
        finish_reason: qolabaResponse.output === null ? 'stop' : null
      }
    ]
  }
}

// Translate non-streaming response
function translateNonStreamingResponse(qolabaResponse, originalRequest) {
  return {
    id: generateId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: originalRequest.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: qolabaResponse.output || ''
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: qolabaResponse.usage?.promptTokens || 0,
      completion_tokens: qolabaResponse.usage?.completionTokens || 0,
      total_tokens: qolabaResponse.usage?.totalTokens || 0
    }
  }
}

// Generate random ID for responses
function generateId() {
  return 'chatcmpl-' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

// Extract tool calls from response
export function extractToolCalls(content) {
  const toolCalls = []
  
  // Simple regex to find XML tool calls
  const toolRegex = /<tool name="([^"]+)">([\s\S]*?)<\/tool>/g
  let match
  
  while ((match = toolRegex.exec(content)) !== null) {
    const toolName = match[1]
    const toolContent = match[2]
    
    try {
      // Parse XML content to extract parameters
      const parameters = parseXmlToParameters(toolContent)
      
      toolCalls.push({
        id: generateId(),
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(parameters)
        }
      })
    } catch (error) {
      logger.warn('Failed to parse tool call', { toolName, error: error.message })
    }
  }
  
  return toolCalls
}

// Parse XML content to parameters object
function parseXmlToParameters(xmlContent) {
  const parameters = {}
  
  // Simple XML parsing - this could be enhanced with a proper XML parser
  const tagRegex = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g
  let match
  
  while ((match = tagRegex.exec(xmlContent)) !== null) {
    const tagName = match[1]
    const tagContent = match[2].trim()
    
    // Try to parse as JSON, otherwise use as string
    try {
      parameters[tagName] = JSON.parse(tagContent)
    } catch {
      parameters[tagName] = tagContent
    }
  }
  
  return parameters
}

export default {
  translateOpenAIToQolaba,
  translateQolabaToOpenAI,
  extractToolCalls
}