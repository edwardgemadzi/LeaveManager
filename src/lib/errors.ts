import { NextResponse } from 'next/server';

/**
 * Standardized error response utilities for consistent error handling across the API
 */

interface ErrorResponse {
  error: string;
  details?: string[];
}

/**
 * Create a standardized error response
 * @param message - Error message
 * @param status - HTTP status code
 * @param details - Optional error details (only included in development)
 * @returns NextResponse with error
 */
export function errorResponse(
  message: string,
  status: number,
  details?: string[]
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = { error: message };
  
  // Only include details in development mode or if explicitly enabled
  if (details && (process.env.NODE_ENV === 'development' || process.env.EXPOSE_ERROR_DETAILS === 'true')) {
    response.details = details;
  }
  
  return NextResponse.json(response, { status });
}

/**
 * Unauthorized error (401)
 */
export function unauthorizedError(message = 'Unauthorized'): NextResponse<ErrorResponse> {
  return errorResponse(message, 401);
}

/**
 * Forbidden error (403)
 */
export function forbiddenError(message = 'Forbidden'): NextResponse<ErrorResponse> {
  return errorResponse(message, 403);
}

/**
 * Not found error (404)
 */
export function notFoundError(message = 'Resource not found'): NextResponse<ErrorResponse> {
  return errorResponse(message, 404);
}

/**
 * Bad request error (400)
 */
export function badRequestError(message = 'Bad request', details?: string[]): NextResponse<ErrorResponse> {
  return errorResponse(message, 400, details);
}

/**
 * Internal server error (500)
 */
export function internalServerError(message = 'Internal server error'): NextResponse<ErrorResponse> {
  return errorResponse(message, 500);
}

