import type { Message } from '../../core/types';

export class ContextCompressor {
  compress(messages: Message[], maxTokens: number): Message[] {
    if (messages.length === 0) return [];

    const estimateTokens = (msg: Message): number => {
      let tokens = 0;
      // Content tokens
      if (msg.content) {
        if (typeof msg.content === 'string') {
          tokens += Math.ceil(msg.content.length / 4);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.text) tokens += Math.ceil(part.text.length / 4);
            if (part.image_url) tokens += 100; // Base64 images are large
          }
        }
      }
      // Tool calls tokens
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          tokens += 20; // Base overhead for tool call
          if (tc?.function?.name) {
            tokens += Math.ceil(tc.function.name.length / 4);
          }
          if (tc?.function?.arguments) {
            tokens += Math.ceil(tc.function.arguments.length / 4);
          }
        }
      }
      // Tool result tokens
      if (msg.tool_call_id) {
        tokens += 20; // Base overhead for tool result
        if (msg.content && typeof msg.content === 'string') {
          tokens += Math.ceil(msg.content.length / 4);
        }
      }
      return tokens;
    };

    let totalTokens = 0;
    for (const msg of messages) {
      totalTokens += estimateTokens(msg);
    }

    if (totalTokens <= maxTokens) return messages;

    const result: Message[] = [];
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    // Always keep system messages
    for (const sys of systemMessages) {
      result.push(sys);
    }

    if (nonSystem.length <= 12) return [...result, ...nonSystem];

    // Keep the last few messages intact - this MUST include complete tool call/result pairs
    // Increased to 12 to avoid cutting tool call/result pairs
    const keepLast = 12;
    const tail = nonSystem.slice(-keepLast);
    const middle = nonSystem.slice(0, -keepLast);

    // Group messages into pairs: assistant with tool_calls + their tool results
    const groups: Message[][] = [];
    let i = 0;
    while (i < middle.length) {
      const msg = middle[i];
      const group: Message[] = [msg];

      if (msg.role === "assistant" && msg.tool_calls) {
        // Find all corresponding tool results
        i++;
        while (i < middle.length && middle[i].role === "tool") {
          group.push(middle[i]);
          i++;
        }
      } else {
        i++;
      }
      groups.push(group);
    }

    // Summarize the groups, preserving tool call/result structure
    const summaryParts: string[] = [];
    for (const group of groups) {
      const first = group[0];
      if (first.role === "assistant" && first.tool_calls) {
        const toolNames = first.tool_calls
          .map(tc => tc?.function?.name || "unknown")
          .join(", ");
        summaryParts.push(`Assistant: Called tools [${toolNames}]`);

        // Summarize tool results
        for (let j = 1; j < group.length; j++) {
          const toolMsg = group[j];
          if (toolMsg.role === "tool") {
            const toolName = toolMsg.name || "unknown";
            const content = typeof toolMsg.content === 'string' ? toolMsg.content : "";
            const snippet = content.length > 100 ? content.slice(0, 100) + "..." : content;
            summaryParts.push(`Tool result for ${toolName}: ${snippet}`);
          }
        }
      } else if (first.role === "user") {
        const snippet = typeof first.content === 'string' && first.content
          ? (first.content.length > 200 ? first.content.slice(0, 200) + "..." : first.content)
          : "";
        summaryParts.push(`User: ${snippet}`);
      } else if (first.role === "assistant") {
        const snippet = typeof first.content === 'string' && first.content
          ? (first.content.length > 200 ? first.content.slice(0, 200) + "..." : first.content)
          : "";
        summaryParts.push(`Assistant: ${snippet}`);
      }
    }

    result.push({
      role: "system",
      content: `[Earlier conversation summarized]\n${summaryParts.join("\n")}`,
    });

    // Keep the tail intact with all tool call/result pairs preserved
    result.push(...tail);

    return result;
  }
}

/**
 * Compress conversation text
 */
export function compressText(messages: Message[], maxTokens: number): Message[] {
  const compressor = new ContextCompressor();
  return compressor.compress(messages, maxTokens);
}
