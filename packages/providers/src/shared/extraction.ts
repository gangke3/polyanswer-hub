export function normalizeAnswerText(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}

