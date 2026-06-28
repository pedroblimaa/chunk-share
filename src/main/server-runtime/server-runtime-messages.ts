export function getProcessStartErrorMessage(error: Error): string {
  if ('code' in error && error.code === 'ENOENT') {
    return 'Java was not found on PATH. Install Java or add java.exe to PATH, then restart ChunkShare and try again.'
  }

  return `Unable to start Minecraft server: ${error.message}`
}

export function getPublishErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to publish server save: ${error.message}`
    : 'Unable to publish server save.'
}

export function getPreStartPublishErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to publish newer local save before start: ${error.message}`
    : 'Unable to publish newer local save before start.'
}

export function getPreStartRestoreErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to update local server from shared save before start: ${error.message}`
    : 'Unable to update local server from shared save before start.'
}

export function getDownloadSharedSaveErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to download the shared save: ${error.message}`
    : 'Unable to download the shared save.'
}

export function getRecoveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to recover Minecraft server: ${error.message}`
    : 'Unable to recover Minecraft server.'
}

export function getRestoreRecoveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Unable to restore the last shared save: ${error.message}`
    : 'Unable to restore the last shared save.'
}

export function getStopCompletionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null

  if (message?.startsWith('Cannot unlock server')) {
    return `Server save published, but ChunkShare could not unlock the server: ${message}`
  }

  return getPublishErrorMessage(error)
}

export function getConsoleTimestamp(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())
}
