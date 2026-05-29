export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTokens(messages: Array<{ content?: string }>): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.content && typeof msg.content === "string") {
      total += countTokens(msg.content);
    }
  }
  return total;
}
