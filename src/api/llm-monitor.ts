/**
 * LLM Telemetry Monitor — SSE endpoint for live LLM call observability.
 *
 * Provides a Server-Sent Events endpoint at GET /llm-events.
 * Clients (browser, curl, or an agent) can tail this endpoint to watch
 * LLM calls in real time: token counts, cache hits, cost, tokens/sec, etc.
 *
 * Example usage:
 *   curl -N http://localhost:3000/llm-events
 *   # Each event is a JSON line:
 *   # event: llm_telemetry
 *   # data: { "type": "response_complete", ... }
 *
 * To filter: curl -N http://localhost:3000/llm-events?roomId=<uuid>
 */

import type { Context } from 'hono';
import { onLlmTelemetry, type LlmTelemetryEvent } from '../models/pi-runtime.js';
import { logger } from '../config/logger.js';

// Ring buffer for replaying recent events to new SSE connections
const RECENT_EVENT_LIMIT = 100;
const recentEvents: LlmTelemetryEvent[] = [];

function pushRecent(event: LlmTelemetryEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > RECENT_EVENT_LIMIT) {
    recentEvents.shift();
  }
}

// Active SSE connections
interface SseConnection {
  controller: ReadableStreamDefaultController;
  filter?: { roomId?: string; caller?: string };
}

const connections = new Set<SseConnection>();

let initialized = false;

export function initLlmMonitor(): void {
  if (initialized) return;
  initialized = true;

  // Subscribe to telemetry events from pi-runtime
  onLlmTelemetry((event) => {
    pushRecent(event);
    broadcast(event);
  });

  logger.info({ recentEventLimit: RECENT_EVENT_LIMIT }, 'llm-monitor: initialized');
}

function broadcast(event: LlmTelemetryEvent): void {
  const data = JSON.stringify(event);

  for (const conn of connections) {
    // Apply filters
    if (conn.filter?.roomId && event.roomId !== conn.filter.roomId) continue;
    if (conn.filter?.caller && event.caller !== conn.filter.caller) continue;

    try {
      const encoder = new TextEncoder();
      conn.controller.enqueue(encoder.encode(`event: llm_telemetry\ndata: ${data}\n\n`));
    } catch {
      // Connection may have closed — remove it
      connections.delete(conn);
    }
  }
}

/**
 * SSE handler for GET /llm-events.
 *
 * Query params (all optional):
 *   - roomId: filter events for a specific room
 *   - caller: filter events by caller name (e.g. "narrator.compose")
 *   - replay: if "1", replay the last N events on connect
 *
 * Usage from curl:
 *   curl -N "http://localhost:3000/llm-events?roomId=<uuid>"
 *
 * Usage from an agent:
 *   A side agent can curl this endpoint and grep for events with
 *   low tokensPerSecond, high cache miss rate, or errors.
 */
export function handleLlmEvents(c: Context): Response {
  const roomId = c.req.query('roomId') || undefined;
  const caller = c.req.query('caller') || undefined;
  const replay = c.req.query('replay') === '1';

  const stream = new ReadableStream({
    start(controller) {
      const conn: SseConnection = {
        controller,
        filter: roomId || caller ? { roomId, caller } : undefined,
      };
      connections.add(conn);

      // Send initial comment header
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(':ok\n\n'));

      // Replay recent events if requested
      if (replay) {
        for (const event of recentEvents) {
          if (conn.filter?.roomId && event.roomId !== conn.filter.roomId) continue;
          if (conn.filter?.caller && event.caller !== conn.filter.caller) continue;

          try {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`event: llm_telemetry\ndata: ${data}\n\n`));
          } catch {
            break;
          }
        }
      }

      // Keepalive ping every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':\n\n'));
        } catch {
          clearInterval(keepalive);
          connections.delete(conn);
        }
      }, 30000);

      // Cleanup on client disconnect
      const cleanup = () => {
        clearInterval(keepalive);
        connections.delete(conn);
      };
      c.req.raw.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
