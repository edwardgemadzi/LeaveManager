import { NextRequest } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { subscribeToTeamEvents } from '@/lib/teamEvents';
import { error as logError } from '@/lib/logger';

/**
 * Server-Sent Events (SSE) endpoint for real-time updates
 * 
 * This endpoint streams events to clients using SSE.
 * Clients connect via EventSource API and receive real-time updates
 * when leave requests are created, updated, deleted, or team settings change.
 * 
 * Authentication: JWT token via Authorization header or query parameter
 * 
 * Events are scoped to teamId for privacy and security.
 */
export async function GET(request: NextRequest) {
  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable buffering for Nginx
  });

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Send initial connection message
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send connect event
      sendEvent('connected', { message: 'Connected to event stream' });

      // Authenticate user
      let token = getTokenFromRequest(request);
      if (!token) {
        // Try query parameter as fallback
        const url = new URL(request.url);
        token = url.searchParams.get('token') || null;
      }

      if (!token) {
        sendEvent('error', { message: 'Unauthorized: No token provided' });
        controller.close();
        return;
      }

      const user = verifyToken(token);
      if (!user || !user.teamId) {
        sendEvent('error', { message: 'Unauthorized: Invalid token or no team assigned' });
        controller.close();
        return;
      }

      // Subscribe to team events
      const unsubscribe = subscribeToTeamEvents(user.teamId, (event) => {
        try {
          sendEvent(event.type, event.data);
        } catch (error) {
          logError('Error sending SSE event:', error);
        }
      });

      // Send keepalive messages every 25 seconds to prevent connection timeout
      const keepaliveInterval = setInterval(() => {
        try {
          sendEvent('keepalive', { timestamp: Date.now() });
        } catch (error) {
          logError('Error sending keepalive:', error);
          clearInterval(keepaliveInterval);
        }
      }, 25000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(keepaliveInterval);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}

