import { ServerLockStatus } from '../../shared/domain'
import type { ServerRuntimeLogLine, ServerRuntimeStatus } from '../../shared/server-runtime'
import { readServerLock, writeServerLock } from '../storage/local-mock-cloud-storage'

type RuntimeLogTone = ServerRuntimeLogLine['tone']

const HEARTBEAT_INTERVAL_MS = 15_000

let heartbeatInterval: NodeJS.Timeout | null = null

interface StartHeartbeatInput {
  sessionId: string
  getStatus: () => ServerRuntimeStatus
  addLogLine: (source: string, message: string, tone?: RuntimeLogTone) => void
}

export function startHeartbeat(input: StartHeartbeatInput): void {
  void updateHostingHeartbeat(input)

  if (heartbeatInterval) {
    return
  }

  heartbeatInterval = setInterval(() => {
    void updateHostingHeartbeat(input)
  }, HEARTBEAT_INTERVAL_MS)
}

export function stopHeartbeat(): void {
  if (!heartbeatInterval) {
    return
  }

  clearInterval(heartbeatInterval)
  heartbeatInterval = null
}

async function updateHostingHeartbeat({
  sessionId,
  getStatus,
  addLogLine
}: StartHeartbeatInput): Promise<void> {
  if (getStatus() !== 'running') {
    return
  }

  try {
    const serverLock = await readServerLock()

    if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
      stopHeartbeat()
      addLogLine('ChunkShare', 'Stopped heartbeat because the hosting lock changed.', 'warning')
      return
    }

    await writeServerLock({
      ...serverLock,
      lastHeartbeat: new Date().toISOString()
    })
  } catch (error) {
    stopHeartbeat()
    addLogLine(
      'ChunkShare',
      `Unable to update hosting heartbeat: ${getErrorMessage(error)}`,
      'warning'
    )
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}
