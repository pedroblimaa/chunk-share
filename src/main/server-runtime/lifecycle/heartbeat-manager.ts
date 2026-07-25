import { ServerLockStatus } from '../../../shared/domain'
import type { ServerRuntimeLogLine, ServerRuntimeStatus } from '../../../shared/server-runtime'
import { getActiveStorageAdapter } from '../../storage/adapters/storage-adapter-service'

type RuntimeLogTone = ServerRuntimeLogLine['tone']

const HEARTBEAT_INTERVAL_MS = 60_000

interface StartHeartbeatInput {
  sessionId: string
  getStatus: () => ServerRuntimeStatus
  addLogLine: (source: string, message: string, tone?: RuntimeLogTone) => void
}

export function startHeartbeat(input: StartHeartbeatInput): void {
  heartbeatManager.start(input)
}

export function stopHeartbeat(): Promise<void> {
  return heartbeatManager.stop()
}

class HeartbeatManager {
  private interval: NodeJS.Timeout | null = null
  private activeHeartbeat: Promise<boolean> | null = null

  start(input: StartHeartbeatInput): void {
    if (this.interval) {
      return
    }

    this.interval = setInterval(() => this.runHeartbeat(input), HEARTBEAT_INTERVAL_MS)
    this.runHeartbeat(input)
  }

  async stop(): Promise<void> {
    this.clearInterval()
    await this.activeHeartbeat
  }

  private runHeartbeat(input: StartHeartbeatInput): void {
    if (!this.interval || this.activeHeartbeat) {
      return
    }

    const heartbeat = this.updateHeartbeat(input)
    this.activeHeartbeat = heartbeat
    void heartbeat.then((shouldContinue) => this.finishHeartbeat(heartbeat, shouldContinue))
  }

  private async updateHeartbeat({ sessionId, getStatus, addLogLine }: StartHeartbeatInput): Promise<boolean> {
    try {
      if (getStatus() !== 'running') {
        return false
      }

      const storageAdapter = await getActiveStorageAdapter()
      const lockUpdated = await storageAdapter.updateServerLock((serverLock) => {
        if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
          return null
        }

        return {
          ...serverLock,
          lastHeartbeat: new Date().toISOString()
        }
      })

      if (!lockUpdated) {
        addLogLine('ChunkShare', 'Stopped heartbeat because the hosting lock changed.', 'warning')
        return false
      }

      return true
    } catch (error) {
      addLogLine('ChunkShare', `Unable to update hosting heartbeat: ${getErrorMessage(error)}`, 'warning')
      return false
    }
  }

  private finishHeartbeat(heartbeat: Promise<boolean>, shouldContinue: boolean): void {
    if (this.activeHeartbeat !== heartbeat) {
      return
    }

    this.activeHeartbeat = null

    if (!shouldContinue) {
      this.clearInterval()
    }
  }

  private clearInterval(): void {
    if (!this.interval) {
      return
    }

    clearInterval(this.interval)
    this.interval = null
  }
}

const heartbeatManager = new HeartbeatManager()

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}
