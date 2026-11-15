export function tryParseJson(value: unknown): unknown {
  try {
    return JSON.parse(String(value).trim());
  } catch {
    return undefined;
  }
}
