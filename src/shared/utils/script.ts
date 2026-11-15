/** Extract executable JavaScript fences without changing the existing script syntax. */
export function extractJavaScript(value: unknown): string | null {
  const blocks = [...String(value).matchAll(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g)]
    .filter(match => /^(?:js|javascript)?[ \t]*$/.test(match[1]));
  return blocks.length ? blocks.map(match => match[2]).join('\n;\n') : null;
}
