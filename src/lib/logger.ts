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
 * In production, these should be sent to an error tracking service
 */
export function error(message: string, err?: unknown): void {
  console.error(`[ERROR] ${message}`, err || '');
  
  // In production, send to error tracking service (e.g., Sentry)
  // if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  //   // Send to error tracking service
  // }
}

