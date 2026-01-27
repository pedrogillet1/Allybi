export interface AppError {
  titleKey: string;
  messageKey: string;
  type: 'network' | 'api' | 'timeout' | 'auth' | 'unknown';
  retryable: boolean;
  originalError?: any;
  // Fallback message from server (if available)
  serverMessage?: string;
}

/**
 * Convert various error types to user-friendly AppError with translation keys
 * Callers should use t(error.titleKey) and t(error.messageKey) to get translated strings
 */
export function handleError(error: any): AppError {

  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      titleKey: 'errors.connectionError',
      messageKey: 'errors.connectionErrorMessage',
      type: 'network',
      retryable: true,
      originalError: error
    };
  }

  // Timeout errors
  if (error.name === 'AbortError' || error.message.includes('timeout')) {
    return {
      titleKey: 'errors.requestTimeout',
      messageKey: 'errors.requestTimeoutMessage',
      type: 'timeout',
      retryable: true,
      originalError: error
    };
  }

  // API errors with response object
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 400:
        return {
          titleKey: 'errors.invalidRequest',
          messageKey: 'errors.invalidRequestMessage',
          type: 'api',
          retryable: false,
          originalError: error,
          serverMessage: data?.error
        };

      case 401:
        return {
          titleKey: 'errors.authenticationRequired',
          messageKey: 'errors.authenticationRequiredMessage',
          type: 'auth',
          retryable: false,
          originalError: error
        };

      case 403:
        return {
          titleKey: 'errors.accessDenied',
          messageKey: 'errors.accessDeniedMessage',
          type: 'auth',
          retryable: false,
          originalError: error
        };

      case 404:
        return {
          titleKey: 'errors.notFound',
          messageKey: 'errors.notFoundMessage',
          type: 'api',
          retryable: false,
          originalError: error
        };

      case 429:
        return {
          titleKey: 'errors.tooManyRequests',
          messageKey: 'errors.tooManyRequestsMessage',
          type: 'api',
          retryable: true,
          originalError: error
        };

      case 500:
      case 502:
      case 503:
        return {
          titleKey: 'errors.serverError',
          messageKey: 'errors.serverErrorMessage',
          type: 'api',
          retryable: true,
          originalError: error
        };

      default:
        return {
          titleKey: 'errors.error',
          messageKey: 'errors.unexpectedError',
          type: 'unknown',
          retryable: true,
          originalError: error,
          serverMessage: data?.error || error.message
        };
    }
  }

  // API errors with status property (axios-like)
  if (error.status) {
    switch (error.status) {
      case 400:
        return {
          titleKey: 'errors.invalidRequest',
          messageKey: 'errors.invalidRequestMessage',
          type: 'api',
          retryable: false,
          originalError: error,
          serverMessage: error.message
        };

      case 401:
        return {
          titleKey: 'errors.authenticationRequired',
          messageKey: 'errors.authenticationRequiredMessage',
          type: 'auth',
          retryable: false,
          originalError: error
        };

      case 403:
        return {
          titleKey: 'errors.accessDenied',
          messageKey: 'errors.accessDeniedMessage',
          type: 'auth',
          retryable: false,
          originalError: error
        };

      case 404:
        return {
          titleKey: 'errors.notFound',
          messageKey: 'errors.notFoundMessage',
          type: 'api',
          retryable: false,
          originalError: error
        };

      case 429:
        return {
          titleKey: 'errors.tooManyRequests',
          messageKey: 'errors.tooManyRequestsMessage',
          type: 'api',
          retryable: true,
          originalError: error
        };

      case 500:
      case 502:
      case 503:
        return {
          titleKey: 'errors.serverError',
          messageKey: 'errors.serverErrorMessage',
          type: 'api',
          retryable: true,
          originalError: error
        };

      default:
        return {
          titleKey: 'errors.error',
          messageKey: 'errors.unexpectedError',
          type: 'unknown',
          retryable: true,
          originalError: error,
          serverMessage: error.message
        };
    }
  }

  // Generic errors
  return {
    titleKey: 'errors.error',
    messageKey: 'errors.unexpectedErrorRetry',
    type: 'unknown',
    retryable: true,
    originalError: error,
    serverMessage: error.message
  };
}
