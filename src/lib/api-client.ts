/**
 * Client-side API helper that handles authentication errors
 * Automatically redirects to login on 401 responses
 */

/**
 * Check if a token is expired (client-side check without secret)
 * This is a best-effort check - server will still validate
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false; // No expiration claim
    
    // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // If we can't parse, assume expired
  }
}

/**
 * Handle API response - redirects to login on 401
 * Call this after checking response.ok or response.status
 */
export function handleApiResponse(response: Response): void {
  if (response.status === 401) {
    // Clear authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
  const token = localStorage.getItem('token');
  
  // Check if token is expired before making request
  if (token && isTokenExpired(token)) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Token expired');
  }
  
  // Add authorization header if token exists
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Handle 401 responses
  if (response.status === 401) {
    handleApiResponse(response);
    throw new Error('Unauthorized');
  }
  
  return response;
}
