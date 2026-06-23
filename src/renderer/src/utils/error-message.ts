export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return normalizeErrorMessage(error instanceof Error ? error.message : fallbackMessage)
}

export function normalizeErrorMessage(message: string): string {
  const remoteErrorMatch = message.match(
    /^Error invoking remote method '[^']+':\s*(?:[A-Za-z]+Error:\s*)?(.+)$/s
  )

  return remoteErrorMatch ? remoteErrorMatch[1] : message
}
