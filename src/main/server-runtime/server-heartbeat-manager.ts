import { ServerLockStatus } from '../../shared/domain'
import type { ServerRuntimeLogLine, ServerRuntimeStatus } from '../../shared/server-runtime'
import { getActiveStorageAdapter } from '../storage/adapters/storage-adapter-service'
import { getErrorMessage } from '../shared/main-helpers'

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
    const storageAdapter = await getActiveStorageAdapter()
    const serverLock = await storageAdapter.readServerLock()

    if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
      stopHeartbeat()
      addLogLine('ChunkShare', 'Stopped heartbeat because the hosting lock changed.', 'warning')
      return
    }

    await storageAdapter.writeServerLock({
      ...serverLock,
      lastHeartbeat: new Date().toISOString()
    })
  } catch (error) {
    stopHeartbeat()
    addLogLine('ChunkShare', `Unable to update hosting heartbeat: ${getErrorMessage(error)}`, 'warning')
  }
}
