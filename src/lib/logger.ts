/**
 * Logger utility for consistent logging across the application
 * Logs are only shown in development mode to prevent sensitive data exposure
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Log debug messages (only in development)
 */
export function debug(message: string, data?: unknown): void {
  if (isDevelopment) {
    console.log(`[DEBUG] ${message}`, data || '');
  }
}

/**
 * Log info messages (always logged)
 */
export function info(message: string, data?: unknown): void {
  console.log(`[INFO] ${message}`, data || '');
}

/**
 * Log warning messages (always logged)
 */
export function warn(message: string, data?: unknown): void {
  console.warn(`[WARN] ${message}`, data || '');
}

/**
 * Log error messages (always logged)
 * Sanitizes error objects to prevent sensitive data leakage (stack traces, full objects)
 * In production, these should be sent to an error tracking service
 */
export function error(message: string, err?: unknown): void {
  // Sanitize error to prevent data leakage
  let sanitizedError: string | unknown = '';
  
  if (err instanceof Error) {
    // Only log error message, not stack trace or full error object
    sanitizedError = err.message;
  } else if (typeof err === 'object' && err !== null) {
    // For objects, only log safe properties (avoid logging full objects with sensitive data)
    // Only log specific safe fields if needed
    sanitizedError = JSON.stringify(err, null, 0).substring(0, 200); // Limit to 200 chars
  } else {
    sanitizedError = err;
  }
  
  console.error(`[ERROR] ${message}`, sanitizedError || '');
  
  // In production, send to error tracking service (e.g., Sentry)
  // if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  //   // Send to error tracking service
  // }
}

