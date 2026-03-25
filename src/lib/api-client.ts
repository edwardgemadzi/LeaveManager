/**
 * Client-side API helper that handles authentication errors
 * Automatically redirects to login on 401 responses
 */

import { clearStoredUser } from '@/lib/clientUserStorage';

/**
 * Handle API response - redirects to login on 401
 * Call this after checking response.ok or response.status
 */
export function handleApiResponse(response: Response): void {
  if (response.status === 401) {
    clearStoredUser();
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}

/**
 * Check response and handle 401 - returns true if should return early
 * Use this in fetch error handling: if (handleUnauthorized(response)) return;
 */
export function handleUnauthorized(response: Response): boolean {
  if (response.status === 401) {
    clearStoredUser();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return true;
  }
  return false;
}

/**
 * Helper to check response.ok and handle 401 automatically
 * Returns true if response is ok, false otherwise (and handles 401)
 */
export function checkResponseOk(response: Response): boolean {
  if (!response.ok) {
    if (handleUnauthorized(response)) {
      return false;
    }
    return false;
  }
  return true;
}

/**
 * Fetch wrapper that handles 401 responses automatically
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });
  
  // Handle 401 responses
  if (response.status === 401) {
    handleApiResponse(response);
    throw new Error('Unauthorized');
  }
  
  return response;
}
