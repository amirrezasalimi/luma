/** Local MCP uses direct execution, never a shell or relative executable paths. */
export function validLocalMcpCommand(command: unknown): command is string {
  return typeof command === 'string'
    && !command.includes('\0')
    && command.length <= 4096
    && (command === 'bun' || command === 'bunx' || command.startsWith('/'));
}
