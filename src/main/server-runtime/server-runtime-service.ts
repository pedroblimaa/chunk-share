import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'
import type {
  ServerConnectionAddress,
  ServerRuntimeEvent,
  ServerRuntimeLogLine,
  ServerRuntimePlayers,
  ServerRuntimeResources,
  ServerRuntimeSnapshot,
  ServerRuntimeStatus
} from '../../shared/server-runtime'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getSyncStartBlockedMessage } from '../server-sync/server-sync-messages'
import { publishServerSave } from '../storage/server-save-publisher'
import { restoreLatestServerSave } from '../storage/server-save-restorer'
import { localServerFolderPath, localServerJarFilePath } from '../storage/storage-paths'
import { parseMinecraftOutput, type MinecraftOutputEvent } from './minecraft-output-parser'
import {
  clearHostingLockAfterCleanStop,
  clearHostingLockAfterStartFailure,
  createHostingLock
} from './server-hosting-lock-manager'
import { startHeartbeat, stopHeartbeat } from './server-heartbeat-manager'
import { startPlayerPolling, stopPlayerPolling } from './server-player-poller'
import { getConnectionAddresses } from './server-network-addresses'
import {
  assertFileExists,
  assertFolderExists,
  isMissingFileError
} from './server-runtime-file-checks'
import { ServerRuntimeError } from './server-runtime-error'

type ServerRuntimeListener = (event: ServerRuntimeEvent) => void
type RuntimeLogTone = ServerRuntimeLogLine['tone']

const SERVER_STOP_TIMEOUT_MS = 15_000
const JAVA_COMMAND = 'java'
const JAVA_ARGS = ['-Xmx4G', '-Xms2G', '-jar', 'server.jar', 'nogui']
const DEFAULT_PLAYER_LIMIT = 20
const MOCK_RESOURCES: ServerRuntimeResources = {
  cpuPercent: 0,
  memoryUsedMb: 0,
  memoryTotalMb: 4096,
  isMocked: true
}

class ServerRuntime {
  private serverProcess: ChildProcessWithoutNullStreams | null = null
  private stopTimeout: NodeJS.Timeout | null = null
  private userRequestedStop = false
  private status: ServerRuntimeStatus = 'stopped'
  private errorMessage: string | null = null
  private logs: ServerRuntimeLogLine[] = []
  private connectionAddresses: ServerConnectionAddress[] = []
  private players: ServerRuntimePlayers = { online: 0, max: DEFAULT_PLAYER_LIMIT }
  private resources: ServerRuntimeResources = MOCK_RESOURCES
  private listeners = new Set<ServerRuntimeListener>()

  getSnapshot(): ServerRuntimeSnapshot {
    return {
      status: this.status,
      errorMessage: this.errorMessage,
      connectionAddresses: this.connectionAddresses,
      players: this.players,
      resources: this.resources,
      logs: this.logs
    }
  }

  subscribe(listener: ServerRuntimeListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  async start(): Promise<ServerRuntimeSnapshot> {
    if (this.serverProcess) {
      throw new ServerRuntimeError('Minecraft server is already running.')
    }

    if (this.status === 'starting' || this.status === 'running' || this.status === 'stopping') {
      throw new ServerRuntimeError('Minecraft server is already starting, running, or stopping.')
    }

    let storageSnapshot = await getServerSyncSnapshot()
    let { localState, serverSync } = storageSnapshot

    if (localState.serverSetup.status !== 'ready') {
      throw new ServerRuntimeError('Server setup must be completed before starting Minecraft.')
    }

    if (serverSync.status === ServerSyncStatus.UpdateAvailable) {
      await restoreLatestServerSave(storageSnapshot)
      storageSnapshot = await getServerSyncSnapshot()
      localState = storageSnapshot.localState
      serverSync = storageSnapshot.serverSync
    }

    this.assertServerSyncAllowsStart(serverSync)

    const serverFolderPath = localState.serverConfig.serverFolderPath ?? localServerFolderPath

    await assertFolderExists(serverFolderPath)
    await assertFileExists(localServerJarFilePath)

    const connectionAddresses = getConnectionAddresses(localState.serverConfig.port)
    const sessionId = await createHostingLock(storageSnapshot, connectionAddresses)

    this.status = 'starting'
    this.errorMessage = null
    this.logs = []
    this.connectionAddresses = connectionAddresses
    this.players = { online: 0, max: await readMaxPlayers(serverFolderPath) }
    this.resources = MOCK_RESOURCES
    this.emitRuntimeEvent()
    this.addLogLine(
      'ChunkShare',
      `Starting Minecraft server with ${JAVA_COMMAND} ${JAVA_ARGS.join(' ')}`
    )

    this.serverProcess = spawn(JAVA_COMMAND, JAVA_ARGS, {
      cwd: serverFolderPath,
      windowsHide: true
    })

    this.attachServerProcessListeners(this.serverProcess, sessionId)

    return this.getSnapshot()
  }

  async stop(): Promise<ServerRuntimeSnapshot> {
    if (!this.serverProcess) {
      this.status = 'stopped'
      this.errorMessage = null
      this.players = { ...this.players, online: 0 }
      stopHeartbeat()
      this.emitRuntimeEvent()
      return this.getSnapshot()
    }

    this.status = 'stopping'
    this.errorMessage = null
    this.userRequestedStop = true
    stopPlayerPolling()
    stopHeartbeat()
    this.emitRuntimeEvent()

    this.addLogLine('ChunkShare', 'Saving world before shutdown.')
    this.serverProcess.stdin.write('save-all flush\n')

    this.addLogLine('ChunkShare', 'Sending graceful stop command to Minecraft server.')
    this.serverProcess.stdin.write('stop\n')

    this.clearStopTimeout()
    this.stopTimeout = setTimeout(() => {
      if (!this.serverProcess) {
        return
      }

      this.userRequestedStop = false
      this.finishWithError('Minecraft server did not stop within 15 seconds.')
      this.serverProcess.kill()
    }, SERVER_STOP_TIMEOUT_MS)

    return this.getSnapshot()
  }

  private attachServerProcessListeners(
    minecraftProcess: ChildProcessWithoutNullStreams,
    sessionId: string
  ): void {
    minecraftProcess.stdout.on('data', (chunk: Buffer) => {
      this.handleServerOutput(chunk.toString(), 'Server thread/INFO', 'default', sessionId)
    })

    minecraftProcess.stderr.on('data', (chunk: Buffer) => {
      this.handleServerOutput(chunk.toString(), 'Server thread/ERROR', 'error', sessionId)
    })

    minecraftProcess.once('error', (error) => {
      this.serverProcess = null
      this.userRequestedStop = false
      stopHeartbeat()
      void clearHostingLockAfterStartFailure()
      this.finishWithError(getProcessStartErrorMessage(error))
    })

    minecraftProcess.once('close', (exitCode) => {
      void this.handleServerProcessClose(exitCode)
    })
  }

  private async handleServerProcessClose(exitCode: number | null): Promise<void> {
    this.clearStopTimeout()
    stopPlayerPolling()
    stopHeartbeat()

    if (this.status === 'error') {
      this.serverProcess = null
      this.userRequestedStop = false
      this.emitRuntimeEvent()
      return
    }

    this.serverProcess = null
    this.players = { ...this.players, online: 0 }

    if (this.userRequestedStop && exitCode === 0) {
      await this.publishSaveAfterCleanStop()
      return
    }

    this.userRequestedStop = false
    this.status = exitCode === 0 ? 'stopped' : 'crashed'
    this.errorMessage =
      this.status === 'stopped'
        ? null
        : `Minecraft server exited with code ${exitCode ?? 'unknown'}.`

    this.emitRuntimeEvent()
  }

  private async publishSaveAfterCleanStop(): Promise<void> {
    this.addLogLine('ChunkShare', 'Publishing server save.')

    try {
      const publishResult = await publishServerSave()
      await clearHostingLockAfterCleanStop()
      this.userRequestedStop = false
      this.status = 'stopped'
      this.errorMessage = null
      this.addLogLine(
        'ChunkShare',
        `Server save v${publishResult.latestSave.saveVersion} published.`,
        'success'
      )

      if (publishResult.cleanupError) {
        this.addLogLine(
          'ChunkShare',
          `Server save published, but old save cleanup failed: ${publishResult.cleanupError.message}`,
          'warning'
        )
      }

      this.addLogLine('ChunkShare', 'Server unlocked for the next host.', 'success')

      this.emitRuntimeEvent()
    } catch (error) {
      this.userRequestedStop = false
      this.finishWithError(getStopCompletionErrorMessage(error))
    }
  }

  private handleServerOutput(
    output: string,
    source: string,
    fallbackTone: RuntimeLogTone,
    sessionId: string
  ): void {
    parseMinecraftOutput(output, fallbackTone).forEach((event) =>
      this.handleMinecraftOutputEvent(event, source, sessionId)
    )
  }

  private handleMinecraftOutputEvent(
    event: MinecraftOutputEvent,
    source: string,
    sessionId: string
  ): void {
    if (event.type === 'players') {
      this.updatePlayers(event.players)
      return
    }

    if (event.type === 'log') {
      this.addLogLine(source, event.message, event.tone)
      return
    }

    if (event.type === 'java-version-mismatch') {
      this.finishWithError(
        `This Minecraft server requires Java ${event.requiredJavaVersion}, but ChunkShare is using Java ${event.currentJavaVersion}. Install a newer Java version and restart ChunkShare.`
      )
      return
    }

    if (this.status === 'starting') {
      this.markServerReady(sessionId)
    }
  }

  private markServerReady(sessionId: string): void {
    this.status = 'running'
    startPlayerPolling({
      getServerProcess: () => this.serverProcess,
      getStatus: () => this.status,
      onPlayersChanged: (nextPlayers) => this.updatePlayers(nextPlayers)
    })
    startHeartbeat({
      sessionId,
      getStatus: () => this.status,
      addLogLine: (logSource, message, logTone) => this.addLogLine(logSource, message, logTone)
    })
    this.emitRuntimeEvent()
  }

  private updatePlayers(nextPlayers: ServerRuntimePlayers): void {
    this.players = nextPlayers
    this.emitRuntimeEvent()
  }

  private addLogLine(source: string, message: string, tone: RuntimeLogTone = 'default'): void {
    const logLine: ServerRuntimeLogLine = {
      id: `runtime-log-${Date.now()}-${this.logs.length}`,
      timestamp: getConsoleTimestamp(),
      source,
      message,
      tone
    }

    this.logs = [...this.logs, logLine]
    this.emitRuntimeEvent(logLine)
  }

  private finishWithError(message: string): void {
    this.status = 'error'
    this.errorMessage = message
    stopPlayerPolling()
    stopHeartbeat()
    this.addLogLine('ChunkShare', message, 'error')
  }

  private assertServerSyncAllowsStart(serverSync: ServerSyncSnapshot): void {
    if (serverSync.isStartAllowed) {
      return
    }

    throw new ServerRuntimeError(getSyncStartBlockedMessage(serverSync))
  }

  private emitRuntimeEvent(logLine?: ServerRuntimeLogLine): void {
    const event: ServerRuntimeEvent = {
      snapshot: this.getSnapshot(),
      logLine
    }

    this.listeners.forEach((listener) => listener(event))
  }

  private clearStopTimeout(): void {
    if (!this.stopTimeout) {
      return
    }

    clearTimeout(this.stopTimeout)
    this.stopTimeout = null
  }
}

const serverRuntime = new ServerRuntime()

export function getServerRuntimeSnapshot(): ServerRuntimeSnapshot {
  return serverRuntime.getSnapshot()
}

export function subscribeToServerRuntime(listener: ServerRuntimeListener): () => void {
  return serverRuntime.subscribe(listener)
}

export function startMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.start()
}

export function stopMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.stop()
}

async function readMaxPlayers(serverFolderPath: string): Promise<number> {
  const properties = await readFile(join(serverFolderPath, 'server.properties'), 'utf8').catch(
    () => ''
  )
  const match = properties.match(/^max-players=(\d+)$/m)

  return match ? Number(match[1]) : DEFAULT_PLAYER_LIMIT
}

function getProcessStartErrorMessage(error: Error): string {
  if (isMissingExecutableError(error)) {
    return 'Java was not found on PATH. Install Java or add java.exe to PATH, then restart ChunkShare and try again.'
  }

  return `Unable to start Minecraft server: ${error.message}`
}

function getPublishErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to publish server save: ${error.message}`
  }

  return 'Unable to publish server save.'
}

function getStopCompletionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null

  if (message?.startsWith('Cannot unlock server')) {
    return `Server save published, but ChunkShare could not unlock the server: ${message}`
  }

  return getPublishErrorMessage(error)
}

function getConsoleTimestamp(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())
}

function isMissingExecutableError(error: unknown): boolean {
  return isMissingFileError(error)
}
