export function formatConversationContext(
  messages: Array<{ role: string; content?: string }>,
  maxChars = 2000,
): string {
  const parts: string[] = [];
  let total = 0;

  for (const msg of messages) {
    const content = msg.content ?? "";
    const line = `[${msg.role}] ${content}`;
    if (total + line.length > maxChars) break;
    parts.push(line);
    total += line.length;
  }

  return parts.join("\n");
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
