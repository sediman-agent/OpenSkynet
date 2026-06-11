import { Hono } from "hono";
import { sseHeaders, sseEvent } from "../sse";
import type { AgentLoop } from "../../agent/loop";
import type { LLMProvider } from "../../llm/provider";
import { getKey } from "../../core/auth";
import { createProvider, PROVIDERS } from "../../llm/provider";

export function createAgentRoutes(deps: {
  agentLoop: AgentLoop;
  llmProvider: LLMProvider;
}): Hono {
  const router = new Hono();

  router.post("/run", async (c) => {
    const body = await c.req.json<{
      task: string;
      mode?: string;
      model?: string;
      provider?: string;
      conversation?: Array<{ role: string; content: string; timestamp?: string }>;
    }>();
    if (!body.task?.trim()) {
      return c.json(
        { error: "VALIDATION_ERROR", message: "task is required" },
        400,
      );
    }

    // Log conversation history if provided
    if (body.conversation && body.conversation.length > 0) {
      console.log(`[API Agent] Conversation history provided: ${body.conversation.length} messages`);
    }

    // Update provider if specified in request
    if (body.provider || body.model) {
      const providerName = body.provider || (deps.llmProvider as any).name || 'openai';
      const preset = PROVIDERS[providerName];

      let apiKey: string | undefined = undefined;
      if (preset?.api_key_env) {
        // Try to get saved key first
        const savedKey = await getKey(providerName);
        apiKey = savedKey || process.env[preset.api_key_env];
        console.log(`[API Agent] Creating provider: ${providerName}, Key found: ${!!apiKey}, Key length: ${apiKey?.length || 0}`);
      }

      const newProvider = createProvider(
        providerName,
        body.model,
        undefined,
        apiKey
      );
      deps.llmProvider = newProvider;
      deps.agentLoop.setLLMProvider(newProvider);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(sseEvent(event, data)));
          } catch (err) {
            // Ignore errors if controller is closed
            if ((err as Error).message?.includes('closed')) {
              return;
            }
            console.error('[API Agent] Error enqueuing event:', err);
          }
        };

        // Subscribe to agent loop streaming events
        const unsubscribe = deps.agentLoop.onStreamEvent((streamEvent) => {
          // Debug logging
          console.log('[API Agent] Stream event received:', streamEvent.type, streamEvent);

          switch (streamEvent.type) {
            case 'step_start':
              console.log('[API Agent] step_start event - emitting progress with action:', streamEvent.action);
              enqueue("progress", {
                phase: streamEvent.phase,
                action: streamEvent.action,
                detail: streamEvent.detail,
                url: streamEvent.url,
              });
              break;
            case 'step_complete':
              console.log('[API Agent] step_complete event - emitting progress');
              enqueue("progress", {
                phase: streamEvent.phase,
                action: streamEvent.action,
                observation: streamEvent.observation,
                success: streamEvent.success,
              });
              break;
            case 'thinking':
              enqueue("chunk", { delta: streamEvent.content, phase: streamEvent.phase });
              break;
            case 'content':
              enqueue("chunk", { delta: streamEvent.content, phase: "responding" });
              break;
            case 'progress':
              enqueue("progress", {
                phase: streamEvent.phase,
                iteration: streamEvent.iteration,
                maxIterations: streamEvent.maxIterations,
              });
              break;
            case 'error':
              enqueue("error", { error: streamEvent.error });
              break;
            case 'intervention':
              enqueue("intervention", { message: streamEvent.message, id: streamEvent.id });
              break;
            case 'browser_open_required':
              enqueue("browser_open_required", {
                reason: streamEvent.reason,
                task: streamEvent.task,
              });
              break;
          }
        });

        try {
          const result = await deps.agentLoop.run(
            body.task,
            body.mode,
            body.conversation
          );

          // Session is already saved by PostTaskHandler during handlePostExecution
          // No need to save again here - prevents duplicate sessions
          console.log('[API Agent] Agent execution completed, session already saved by PostTaskHandler');

          enqueue("done", {
            success: result.success,
            result: result.result,
            strategy_used: result.strategy_used,
            iterations: result.iterations,
            elapsed_secs: result.elapsed_secs,
          });
        } catch (err) {
          enqueue("done", {
            success: false,
            result: err instanceof Error ? err.message : String(err),
          });
        } finally {
          unsubscribe();
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  });

  return router;
}
