import { logger, logDetailedError, logResponseState, logHeaderOperation } from '../services/logger.js'

export const errorHandler = (error, req, res, next) => {
  // DIAGNOSTIC: Enhanced logging for error handler invocation
  logger.debug('Error handler invoked', {
    requestId: req.id,
    error: error.message,
    headersSent: res.headersSent,
    writableEnded: res.writableEnded,
    writable: res.writable,
    finished: res.finished,
    stackTrace: error.stack?.substring(0, 200) + '...'
  })
  
  // If the response has already been sent, do not attempt to modify headers
  if (res.headersSent || res.writableEnded) {
    logDetailedError(error, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      responseState: {
        headersSent: res.headersSent,
        ended: res.writableEnded,
        writable: res.writable,
        finished: res.finished
      },
      additionalInfo: {
        errorType: 'headers_already_sent',
        errorHandlerType: 'post_response_error',
        callerStack: new Error().stack
      }
    })
    
    logger.warn('Error handler invoked after response already sent', {
      requestId: req.id,
      error: error.message,
      headersSent: res.headersSent,
      writableEnded: res.writableEnded,
      writable: res.writable,
      finished: res.finished
    })
    return
  }
  
  // Enhanced detailed error logging
  logDetailedError(error, {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    responseState: {
      headersSent: res.headersSent,
      ended: res.writableEnded,
      writable: res.writable
    },
    additionalInfo: {
      userAgent: req.get('User-Agent'),
      errorType: 'request_error',
      errorHandlerType: 'central_error_handler'
    }
  })
  
  // Log the error
  logger.error('Request error', {
    message: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    requestId: req.id,
    statusCode: error.statusCode || 500
  })

  // Determine error type and status code
  let statusCode = 500
  let errorType = 'api_error'
  let errorCode = 'internal_error'
  let message = 'Internal server error'

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400
    errorType = 'invalid_request_error'
    errorCode = 'validation_error'
    message = error.message || 'Invalid request parameters'
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401
    errorType = 'invalid_request_error'
    errorCode = 'unauthorized'
    message = 'Unauthorized access'
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403
    errorType = 'invalid_request_error'
    errorCode = 'forbidden'
    message = 'Access forbidden'
  } else if (error.name === 'NotFoundError') {
    statusCode = 404
    errorType = 'invalid_request_error'
    errorCode = 'not_found'
    message = 'Resource not found'
  } else if (error.name === 'RateLimitError') {
    statusCode = 429
    errorType = 'rate_limit_error'
    errorCode = 'rate_limit_exceeded'
    message = 'Rate limit exceeded'
  } else if (error.name === 'TimeoutError') {
    statusCode = 408
    errorType = 'api_error'
    errorCode = 'timeout'
    message = 'Request timeout'
  } else if (error.response) {
    // Handle axios errors (from Qolaba API)
    statusCode = error.response.status || 502
    errorType = 'api_error'
    errorCode = 'upstream_error'
    
    if (error.response.status === 401) {
      statusCode = 401
      errorType = 'invalid_request_error'
      errorCode = 'invalid_api_key'
      message = 'Invalid API key'
    } else if (error.response.status === 429) {
      statusCode = 429
      errorType = 'rate_limit_error'
      errorCode = 'upstream_rate_limit'
      message = 'Qolaba API rate limit exceeded'
    } else if (error.response.status >= 500) {
      statusCode = 502
      errorType = 'api_error'
      errorCode = 'upstream_error'
      message = 'Qolaba API error'
    }
    
    // Try to get more specific error message from response
    if (error.response.data && error.response.data.error) {
      message = error.response.data.error.message || message
    }
  } else if (error.code === 'ECONNABORTED') {
    statusCode = 408
    errorType = 'api_error'
    errorCode = 'timeout'
    message = 'Request timeout'
  } else if (error.code === 'ECONNREFUSED') {
    statusCode = 503
    errorType = 'api_error'
    errorCode = 'service_unavailable'
    message = 'Service temporarily unavailable'
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error'
  }

  // Build error response in OpenAI format
  const errorResponse = {
    error: {
      message,
      type: errorType,
      code: errorCode,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: error.stack,
        details: error.details || error.message
      })
    }
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.request_id = req.id
  }

  try {
    logHeaderOperation(req.id, 'error_response_send', true)
    res.status(statusCode).json(errorResponse)
    
    logResponseState(req.id, 'error_response_sent_successfully', {
      headersSent: res.headersSent,
      responseEnded: res.writableEnded,
      writable: res.writable,
      statusCode
    })
  } catch (sendError) {
    logDetailedError(sendError, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      responseState: {
        headersSent: res.headersSent,
        ended: res.writableEnded,
        writable: res.writable
      },
      additionalInfo: {
        originalError: error.message,
        sendError: sendError.message,
        statusCode,
        errorType: 'error_response_send_failed'
      }
    })
    
    logHeaderOperation(req.id, 'error_response_send', false, sendError)
    
    // Try to send a minimal error response if the detailed one failed
    try {
      res.status(500).end('Internal Server Error')
    } catch (fallbackError) {
      logDetailedError(fallbackError, {
        requestId: req.id,
        method: req.method,
        url: req.url,
        responseState: {
          headersSent: res.headersSent,
          ended: res.writableEnded,
          writable: res.writable
        },
        additionalInfo: {
          originalError: error.message,
          sendError: sendError.message,
          fallbackError: fallbackError.message,
          errorType: 'fallback_error_response_failed'
        }
      })
    }
  }
}

export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'internal_error', details = null) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.details = details
    
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'validation_error', details)
    this.name = 'ValidationError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'forbidden')
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'not_found')
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'rate_limit_exceeded')
    this.name = 'RateLimitError'
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Request timeout') {
    super(message, 408, 'timeout')
    this.name = 'TimeoutError'
  }
}

export default {
  errorHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  TimeoutError
}