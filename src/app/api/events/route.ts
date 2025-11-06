import { NextRequest } from 'next/server';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { subscribeToTeamEvents } from '@/lib/teamEvents';
import { error as logError, info } from '@/lib/logger';

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
  try {
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
        let keepaliveInterval: NodeJS.Timeout | null = null;
        let unsubscribe: (() => void) | null = null;
        let user: { username: string; teamId: string } | null = null;
        
        // Send initial connection message
        const sendEvent = (event: string, data: unknown) => {
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            logError('Error encoding SSE event:', error);
            // If controller is closed, we can't send events
            if (error instanceof Error && error.message.includes('closed')) {
              throw error;
            }
          }
        };

        // Cleanup function
        const cleanup = () => {
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        };

        try {
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

          const authenticatedUser = verifyToken(token);
          if (!authenticatedUser || !authenticatedUser.teamId) {
            sendEvent('error', { message: 'Unauthorized: Invalid token or no team assigned' });
            controller.close();
            return;
          }

          user = { username: authenticatedUser.username, teamId: authenticatedUser.teamId };
          info(`[SSE] Client connected: ${user.username} (team: ${user.teamId})`);

          // Subscribe to team events
          unsubscribe = subscribeToTeamEvents(user.teamId, (event) => {
            try {
              sendEvent(event.type, event.data);
            } catch (error) {
              logError('Error sending SSE event:', error);
              // If controller is closed, cleanup
              if (error instanceof Error && error.message.includes('closed')) {
                cleanup();
              }
            }
          });

          // Send keepalive messages every 25 seconds to prevent connection timeout
          keepaliveInterval = setInterval(() => {
            try {
              sendEvent('keepalive', { timestamp: Date.now() });
            } catch (error) {
              logError('Error sending keepalive:', error);
              cleanup();
            }
          }, 25000);

          // Clean up on client disconnect
          request.signal.addEventListener('abort', () => {
            if (user) {
              info(`[SSE] Client disconnected: ${user.username} (team: ${user.teamId})`);
            }
            cleanup();
            try {
              controller.close();
            } catch {
              // Controller might already be closed
            }
          });
        } catch (error) {
          logError('Error in SSE stream start:', error);
          try {
            sendEvent('error', { message: 'Internal server error' });
            controller.close();
          } catch {
            // Controller might already be closed
          }
          cleanup();
        }
      },
    });

    return new Response(stream, { headers });
  } catch (error) {
    logError('Error creating SSE stream:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create event stream' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

