/**
 * Session-aware LLM runtime.
 *
 * Maintains persistent pi Agent instances per room/workflow so that:
 * 1. The stable prefix (system prompt + early turns) stays cached by the provider.
 * 2. The conversation transcript grows by appending, not rebuilding from scratch.
 * 3. Per-turn context (statements, steering, action) is injected as structured
 *    user messages with clear delimiters.
 *
 * This replaces the one-shot Agent-per-request pattern in PiAiLlmRuntime.
 */

import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Model, ProviderResponse } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type {
  CacheRetention,
  LlmRuntimeRequest,
  LlmRuntimeResponse,
  LlmTokenUsage,
} from '../core/llm-runtime.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { emitTelemetry, type LlmTelemetryEvent } from './pi-runtime.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum session idle time (no turns) before automatic eviction. */
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** How often to sweep stale sessions. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface RoomSession {
  /** The live pi Agent carrying the conversation transcript. */
  agent: Agent;
  /** Model spec string for this session. */
  modelSpec: string;
  /** Resolved model for cost/usage computation. */
  model: Model<any>;
  /** System prompt (stable prefix, set once). */
  systemPrompt: string;
  /** When the session was created. */
  createdAt: number;
  /** When the session last processed a turn. */
  lastUsedAt: number;
  /** Number of turns processed in this session. */
  turnCount: number;
  /** Whether this session has been explicitly destroyed. */
  destroyed: boolean;
  /** The last response cache headers, if any. */
  lastCacheHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Dependency injection for model resolution, key resolution, telemetry
// ---------------------------------------------------------------------------

export interface SessionRuntimeDeps {
  resolveModel: (spec: string) => Model<any>;
  resolveApiKey: (provider: string) => string | undefined;
  toAgentTools: (request: LlmRuntimeRequest) => AgentTool[];
  parseModelSpec: (spec: string) => { provider: string; modelId: string };
  deriveSessionId: (request: LlmRuntimeRequest) => string;
  extractCacheHeaders: (response: ProviderResponse) => Record<string, string>;
}

// ---------------------------------------------------------------------------
// Session-aware runtime
// ---------------------------------------------------------------------------

export class SessionAwareRuntime {
  private sessions = new Map<string, RoomSession>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private deps: SessionRuntimeDeps,
    private readonly telemetryEnabled: boolean = true,
  ) {
    this.startSweep();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a response in a session-aware way.
   *
   * - If a session for `sessionId` already exists, injects context messages
   *   and appends the prompt, then calls agent.continue().
   * - If no session exists, creates one with the given system prompt and tools.
   *
   * Context messages (retrieved statements, steering, etc.) should be passed
   * as an array of structured user messages *before* the main prompt. This
   * lets the provider cache the system prompt + context prefix while only
   * the player action is novel for each turn.
   *
   * The session's Agent must be in an idle state before calling this. Normal
   * usage: call generateInSession, await it fully, then call again.
   */
  async generateInSession(
    request: LlmRuntimeRequest & { contextMessages?: AgentMessage[] },
  ): Promise<LlmRuntimeResponse> {
    const sessionId = request.sessionId ?? this.deps.deriveSessionId(request);
    const cacheRetention: CacheRetention = request.cacheRetention ?? env.CACHE_RETENTION ?? 'short';
    const startedAt = Date.now();
    const requestId = request.metadata?.requestId ?? `llm-${Date.now()}`;

    // Get or create session
    let session = this.getOrCreateSession(sessionId, request, cacheRetention, requestId);

    // Emit start telemetry
    this.emitStartTelemetry(requestId, request, sessionId, cacheRetention);

    // Inject pre-turn context messages (statements, steering, etc.)
    if (request.contextMessages && request.contextMessages.length > 0 && !session.destroyed) {
      for (const msg of request.contextMessages) {
        session.agent.state.messages.push(msg);
      }
    }

    // Push the turn's user prompt
    if (!session.destroyed) {
      session.agent.state.messages.push({
        role: 'user',
        content: [{ type: 'text', text: request.prompt }],
        timestamp: Date.now(),
      } satisfies AgentMessage);
    }

    // Run continuation
    try {
      // Keep track of response headers
      let responseHeaders: Record<string, string> | undefined;

      // Register a one-shot onResponse for this turn
      const agent = session.agent;
      const originalOnResponse = agent.onResponse;
      agent.onResponse = (response: ProviderResponse) => {
        responseHeaders = this.deps.extractCacheHeaders(response);
        // Still call original if any
        if (originalOnResponse) {
          originalOnResponse(response, agent.state.model);
        }
      };

      await this.runWithTimeout(
        agent.continue(),
        env.LLM_CALL_TIMEOUT_MS,
        `LLM session ${sessionId}`,
      );

      // Restore original
      agent.onResponse = originalOnResponse;

      const elapsedMs = Date.now() - startedAt;
      session.lastUsedAt = Date.now();
      session.turnCount++;
      if (responseHeaders) {
        session.lastCacheHeaders = responseHeaders;
      }

      const lastAssistant = this.findLastAssistant(session);
      if (!lastAssistant) {
        logger.warn({ requestId, sessionId, elapsedMs }, 'session: no assistant message');
        this.emitCompleteTelemetry(requestId, request, elapsedMs, 0, sessionId);
        return { text: '' };
      }

      const text = this.assistantText(lastAssistant);
      const { usage, tokensPerSecond } = this.extractUsage(lastAssistant, elapsedMs);

      // Rich success log
      logger.info(
        {
          requestId,
          sessionId,
          turnNumber: session.turnCount,
          elapsedMs,
          modelSpec: request.modelSpec,
          caller: request.metadata?.caller,
          cacheRetention,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
          totalTokens: usage.totalTokens,
          costTotal: usage.cost.total,
          tokensPerSecond: tokensPerSecond.toFixed(1),
          responseChars: text.length,
          cacheHeaders: responseHeaders,
        },
        'session: turn success',
      );

      this.emitCompleteTelemetry(
        requestId,
        request,
        elapsedMs,
        text.length,
        sessionId,
        usage,
        tokensPerSecond,
        responseHeaders,
      );

      return { text, usage, tokensPerSecond };
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      logger.error(
        { requestId, sessionId, elapsedMs, modelSpec: request.modelSpec, err },
        'session: turn failed',
      );

      this.emitErrorTelemetry(requestId, request, elapsedMs, sessionId, err);

      // On error, destroy the session since its state may be inconsistent
      this.destroySession(sessionId);
      throw err;
    }
  }

  /** Explicitly destroy a session and clean up its resources. */
  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.destroyed = true;
    try {
      session.agent.reset();
      session.agent.clearAllQueues();
    } catch {
      // agent may be mid-stream; force cleanup
    }
    this.sessions.delete(sessionId);
    logger.debug({ sessionId, turnCount: session.turnCount }, 'session: destroyed');
  }

  /** Get stats about all active sessions. */
  getStats(): Array<{
    sessionId: string;
    turnCount: number;
    createdAt: number;
    lastUsedAt: number;
    modelSpec: string;
    ageMs: number;
    idleMs: number;
  }> {
    const now = Date.now();
    return Array.from(this.sessions.entries())
      .filter(([, s]) => !s.destroyed)
      .map(([sessionId, s]) => ({
        sessionId,
        turnCount: s.turnCount,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        modelSpec: s.modelSpec,
        ageMs: now - s.createdAt,
        idleMs: now - s.lastUsedAt,
      }));
  }

  /** Number of active sessions. */
  get activeCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (!s.destroyed) count++;
    }
    return count;
  }

  /** Dispose of all sessions and stop the sweep timer. */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const [id] of this.sessions) {
      this.destroySession(id);
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private startSweep(): void {
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (session.destroyed) {
          this.sessions.delete(id);
          continue;
        }
        if (now - session.lastUsedAt > SESSION_TTL_MS) {
          logger.info(
            { sessionId: id, idleMs: now - session.lastUsedAt },
            'session: evicting idle',
          );
          this.destroySession(id);
        }
      }
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  private getOrCreateSession(
    sessionId: string,
    request: LlmRuntimeRequest,
    cacheRetention: CacheRetention,
    requestId: string,
  ): RoomSession {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.destroyed && existing.modelSpec === request.modelSpec) {
      return existing;
    }

    // Destroy old if model changed
    if (existing) {
      this.destroySession(sessionId);
    }

    // Create new session
    const { provider } = this.deps.parseModelSpec(request.modelSpec);
    const model = this.deps.resolveModel(request.modelSpec);

    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: request.systemPrompt,
        tools: this.deps.toAgentTools(request),
      },
      sessionId,
      getApiKey: () => this.deps.resolveApiKey(provider),
      onPayload: (payload) => {
        if (env.LOG_LLM_INPUT) {
          logger.debug(
            { requestId, sessionId, payload: JSON.stringify(payload).slice(0, 8000) },
            'session: provider payload',
          );
        }
        return undefined;
      },
    });

    const session: RoomSession = {
      agent,
      modelSpec: request.modelSpec,
      model,
      systemPrompt: request.systemPrompt,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      turnCount: 0,
      destroyed: false,
    };

    this.sessions.set(sessionId, session);
    logger.info(
      { sessionId, modelSpec: request.modelSpec, caller: request.metadata?.caller },
      'session: created',
    );
    return session;
  }

  private findLastAssistant(session: RoomSession): AssistantMessage | undefined {
    return [...session.agent.state.messages]
      .reverse()
      .find((msg): msg is AssistantMessage => msg.role === 'assistant');
  }

  private assistantText(message: AssistantMessage): string {
    return message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private extractUsage(
    lastAssistant: AssistantMessage,
    elapsedMs: number,
  ): { usage: LlmTokenUsage; tokensPerSecond: number } {
    const u = lastAssistant.usage;
    const inputTokens = u?.input ?? 0;
    const outputTokens = u?.output ?? 0;
    const cacheRead = u?.cacheRead ?? 0;
    const cacheWrite = u?.cacheWrite ?? 0;
    const totalTokens = u?.totalTokens ?? inputTokens + outputTokens;

    const costInput = u?.cost?.input ?? 0;
    const costOutput = u?.cost?.output ?? 0;
    const costCacheRead = u?.cost?.cacheRead ?? 0;
    const costCacheWrite = u?.cost?.cacheWrite ?? 0;

    const tokensPerSecond =
      outputTokens > 0 && elapsedMs > 0 ? outputTokens / (elapsedMs / 1000) : 0;

    return {
      usage: {
        inputTokens,
        outputTokens,
        cacheRead,
        cacheWrite,
        totalTokens,
        cost: {
          input: costInput,
          output: costOutput,
          cacheRead: costCacheRead,
          cacheWrite: costCacheWrite,
          total: costInput + costOutput + costCacheRead + costCacheWrite,
        },
      },
      tokensPerSecond,
    };
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  // Telemetry
  private emitStartTelemetry(
    requestId: string,
    request: LlmRuntimeRequest,
    sessionId: string,
    cacheRetention: CacheRetention,
  ): void {
    if (!this.telemetryEnabled) return;
    emitTelemetry({
      type: 'request_start',
      timestamp: new Date().toISOString(),
      requestId,
      modelSpec: request.modelSpec,
      caller: request.metadata?.caller,
      roomId: request.metadata?.roomId,
      userId: request.metadata?.userId,
      sessionId,
      promptChars: request.prompt.length,
      systemPromptChars: request.systemPrompt.length,
    });
  }

  private emitCompleteTelemetry(
    requestId: string,
    request: LlmRuntimeRequest,
    elapsedMs: number,
    responseChars: number,
    sessionId: string,
    usage?: LlmTokenUsage,
    tokensPerSecond?: number,
    cacheHeaders?: Record<string, string>,
  ): void {
    if (!this.telemetryEnabled) return;
    emitTelemetry({
      type: 'response_complete',
      timestamp: new Date().toISOString(),
      requestId,
      modelSpec: request.modelSpec,
      caller: request.metadata?.caller,
      roomId: request.metadata?.roomId,
      userId: request.metadata?.userId,
      sessionId,
      elapsedMs,
      responseChars,
      usage,
      tokensPerSecond,
      cacheHeaders,
    });
  }

  private emitErrorTelemetry(
    requestId: string,
    request: LlmRuntimeRequest,
    elapsedMs: number,
    sessionId: string,
    err: unknown,
  ): void {
    if (!this.telemetryEnabled) return;
    emitTelemetry({
      type: 'response_error',
      timestamp: new Date().toISOString(),
      requestId,
      modelSpec: request.modelSpec,
      caller: request.metadata?.caller,
      roomId: request.metadata?.roomId,
      userId: request.metadata?.userId,
      sessionId,
      elapsedMs,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
