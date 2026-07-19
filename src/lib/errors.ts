// Electron's ipcRenderer.invoke wraps main-process errors in boilerplate like
// "Error invoking remote method 'lessons:create': Error: <message>" — strip
// that off so only the message the IPC handler actually threw is shown.
export function getErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
}
