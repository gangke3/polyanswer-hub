export function redactSensitive(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/"cookie"\s*:\s*"[^"]+"/gi, "\"cookie\":\"[REDACTED]\"");
}

