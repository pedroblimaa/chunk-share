import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { ServerStorageSnapshot } from '../../shared/domain'
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
import { publishServerSave } from '../storage/server-save/server-save-publisher'
import { restoreLatestServerSave } from '../storage/server-save/server-save-restorer'
import { runExclusiveStorageOperation } from '../storage/core/operations/operation-coordinator'
import { ExclusiveStorageOperation } from '../storage/core/operations/operation.model'
import {
  getSelectedWorldOperationContext,
  type WorldOperationContext
} from '../storage/core/world-operation-context'
import { startHeartbeat, stopHeartbeat } from './lifecycle/heartbeat-manager'
import {
  clearHostingLockAfterCleanStop,
  clearHostingLockAfterStartFailure,
  createHostingLock,
  markHostingLockRunning,
  markHostingLockStopping,
  releaseActiveRuntimeSession,
  updateHostingLockSaveVersion
} from './lifecycle/hosting-lock-manager'
import { startPlayerPolling, stopPlayerPolling } from './lifecycle/player-poller'
import { parseMinecraftOutput, type MinecraftOutputEvent } from './support/minecraft-output-parser'
import { getConnectionAddresses } from './support/network-addresses'
import { ServerRuntimeError } from './support/runtime-error'
import { assertFileExists, assertFolderExists, isMissingFileError } from './support/runtime-file-checks'

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
  private runningWorld: WorldOperationContext | null = null
  private stopTimeout: NodeJS.Timeout | null = null
  private sessionId: string | null = null
  private lockActivation: Promise<void> | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''
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
      runningWorldId: this.runningWorld?.worldId ?? null,
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
    if (this.serverProcess || this.runningWorld) {
      throw new ServerRuntimeError('Minecraft server is already running.')
    }

    if (
      this.status === 'starting' ||
      this.status === 'running' ||
      this.status === 'stopping' ||
      this.status === 'updating'
    ) {
      throw new ServerRuntimeError('Minecraft server cannot start while it is active or updating.')
    }

    return runExclusiveStorageOperation(
      ExclusiveStorageOperation.ServerStart,
      new ServerRuntimeError('Cannot start Minecraft while another storage operation is in progress.'),
      () => this.startServerSession()
    )
  }

  private async startServerSession(): Promise<ServerRuntimeSnapshot> {
    const operationContext = await getSelectedWorldOperationContext()
    this.runningWorld = operationContext
    this.beginServerStart()

    try {
      return await this.startConfiguredServerSession(operationContext)
    } catch (error) {
      await this.handleStartSessionFailure(operationContext, error)
      throw error
    }
  }

  private async startConfiguredServerSession(
    operationContext: WorldOperationContext
  ): Promise<ServerRuntimeSnapshot> {
    let storageSnapshot = await getServerSyncSnapshot(operationContext)
    let { localState, serverSync } = storageSnapshot

    if (localState.serverSetup.status !== 'ready') {
      throw new ServerRuntimeError('Server setup must be completed before starting Minecraft.')
    }

    const restoredCloudSaveBeforeStart = serverSync.status === ServerSyncStatus.UpdateAvailable

    if (restoredCloudSaveBeforeStart) {
      storageSnapshot = await this.restoreCloudSaveBeforeStart(operationContext, storageSnapshot)
      localState = storageSnapshot.localState
      serverSync = storageSnapshot.serverSync
    }

    this.assertServerSyncAllowsStart(serverSync)

    const serverFolderPath = operationContext.paths.serverFolder

    await this.runStartPreparation(() => assertFolderExists(serverFolderPath))
    await this.runStartPreparation(() => assertFileExists(operationContext.paths.serverJarFile))

    const connectionAddresses = getConnectionAddresses(localState.serverConfig.port)
    const maxPlayers = await this.runStartPreparation(() => readMaxPlayers(serverFolderPath))
    const sessionId = await this.runStartPreparation(() =>
      createHostingLock(operationContext, storageSnapshot, connectionAddresses)
    )
    this.sessionId = sessionId

    this.status = 'starting'
    this.errorMessage = null
    this.logs = restoredCloudSaveBeforeStart ? this.logs : []
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    this.connectionAddresses = connectionAddresses
    this.players = { online: 0, max: maxPlayers }
    this.resources = MOCK_RESOURCES
    this.emitRuntimeEvent()

    if (serverSync.status === ServerSyncStatus.LocalNewer) {
      storageSnapshot = await this.publishLocalNewerSaveBeforeStart(operationContext, sessionId)
      serverSync = storageSnapshot.serverSync
      this.assertServerSyncAllowsStart(serverSync)
    }

    this.addLogLine('ChunkShare', `Starting Minecraft server with ${JAVA_COMMAND} ${JAVA_ARGS.join(' ')}`)

    this.serverProcess = spawn(JAVA_COMMAND, JAVA_ARGS, {
      cwd: serverFolderPath,
      windowsHide: true
    })

    this.attachServerProcessListeners(this.serverProcess, operationContext, sessionId)

    return this.getSnapshot()
  }

  private beginServerStart(): void {
    this.status = 'starting'
    this.errorMessage = null
    this.logs = []
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    this.connectionAddresses = []
    this.players = { online: 0, max: DEFAULT_PLAYER_LIMIT }
    this.resources = MOCK_RESOURCES
    this.emitRuntimeEvent()
  }

  private async handleStartSessionFailure(
    operationContext: WorldOperationContext,
    error: unknown
  ): Promise<void> {
    const sessionId = this.sessionId

    if (sessionId) {
      await clearHostingLockAfterStartFailure(operationContext, sessionId).catch(() => undefined)
      this.sessionId = null
    }

    this.releaseRunningWorld(operationContext, sessionId)

    if (this.status === 'starting') {
      this.finishWithError(getErrorMessage(error))
      return
    }

    this.emitRuntimeEvent()
  }

  private async restoreCloudSaveBeforeStart(
    operationContext: WorldOperationContext,
    storageSnapshot: ServerStorageSnapshot
  ): Promise<ServerStorageSnapshot> {
    this.status = 'starting'
    this.errorMessage = null
    this.logs = []
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    this.connectionAddresses = getConnectionAddresses(storageSnapshot.localState.serverConfig.port)
    this.players = { online: 0, max: DEFAULT_PLAYER_LIMIT }
    this.resources = MOCK_RESOURCES
    this.emitRuntimeEvent()
    this.addLogLine('ChunkShare', 'Updating local server from shared save before start.')

    try {
      await restoreLatestServerSave(operationContext, storageSnapshot)
      this.addLogLine('ChunkShare', 'Local server updated from shared save.', 'success')

      return getServerSyncSnapshot(operationContext)
    } catch (error) {
      const message = getPreStartRestoreErrorMessage(error)
      this.finishWithError(message)
      throw new ServerRuntimeError(message)
    }
  }

  async downloadLatestSharedSave(): Promise<ServerRuntimeSnapshot> {
    if (this.status === 'updating') {
      throw new ServerRuntimeError('The shared save is already being updated.')
    }

    if (this.status !== 'stopped') {
      throw new ServerRuntimeError('Stop the Minecraft server before downloading a shared save.')
    }

    return runExclusiveStorageOperation(
      ExclusiveStorageOperation.ServerDownload,
      new ServerRuntimeError('Cannot download a shared save while another storage operation is in progress.'),
      () => this.runLatestSharedSaveDownload()
    )
  }

  private async runLatestSharedSaveDownload(): Promise<ServerRuntimeSnapshot> {
    const operationContext = await getSelectedWorldOperationContext()
    this.status = 'updating'
    this.errorMessage = null
    this.emitRuntimeEvent()

    try {
      const storageSnapshot = await getServerSyncSnapshot(operationContext)

      if (storageSnapshot.localState.serverSetup.status !== 'ready') {
        throw new ServerRuntimeError('Set up this shared server on this device before downloading it.')
      }

      if (storageSnapshot.serverSync.status !== ServerSyncStatus.UpdateAvailable) {
        throw new ServerRuntimeError('No newer shared save is available to download.')
      }

      this.addLogLine('ChunkShare', 'Downloading the latest shared save.')
      await restoreLatestServerSave(operationContext, storageSnapshot)
      this.status = 'stopped'
      this.addLogLine('ChunkShare', 'Local server updated from the shared save.', 'success')

      return this.getSnapshot()
    } catch (error) {
      const message = getDownloadSharedSaveErrorMessage(error)
      this.status = 'stopped'
      this.errorMessage = message
      this.addLogLine('ChunkShare', message, 'error')
      throw new ServerRuntimeError(message)
    }
  }

  private async publishLocalNewerSaveBeforeStart(
    operationContext: WorldOperationContext,
    sessionId: string
  ): Promise<ServerStorageSnapshot> {
    this.addLogLine('ChunkShare', 'Publishing newer local save before start.')

    try {
      const publishResult = await publishServerSave(operationContext)
      await updateHostingLockSaveVersion(operationContext, sessionId, publishResult.latestSave.saveVersion)

      this.addLogLine(
        'ChunkShare',
        `Server save v${publishResult.latestSave.saveVersion} published before start.`,
        'success'
      )

      if (publishResult.cleanupError) {
        this.addLogLine(
          'ChunkShare',
          `Server save published, but old save cleanup failed: ${publishResult.cleanupError.message}`,
          'warning'
        )
      }

      return getServerSyncSnapshot(operationContext)
    } catch (error) {
      await clearHostingLockAfterStartFailure(operationContext, sessionId).catch(() => undefined)
      this.sessionId = null

      const message = getPreStartPublishErrorMessage(error)
      this.finishWithError(message)
      throw new ServerRuntimeError(message)
    }
  }

  private async runStartPreparation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (this.status === 'starting') {
        this.finishWithError(getErrorMessage(error))
      }

      throw error
    }
  }

  async stop(): Promise<ServerRuntimeSnapshot> {
    if (this.status === 'updating') {
      throw new ServerRuntimeError('Cannot stop Minecraft while the shared save is being updated.')
    }

    if (!this.serverProcess) {
      await this.waitForLockActivation()
      this.status = 'stopped'
      this.errorMessage = null
      this.players = { ...this.players, online: 0 }
      await stopHeartbeat()
      this.emitRuntimeEvent()
      return this.getSnapshot()
    }

    this.status = 'stopping'
    this.errorMessage = null
    this.userRequestedStop = true
    stopPlayerPolling()
    this.emitRuntimeEvent()
    await this.waitForLockActivation()
    await stopHeartbeat()
    await this.markHostingLockStopping()

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
    operationContext: WorldOperationContext,
    sessionId: string
  ): void {
    minecraftProcess.stdout.on('data', (chunk: Buffer) => {
      this.stdoutBuffer = this.handleServerOutputChunk({
        chunk,
        buffer: this.stdoutBuffer,
        source: 'Server thread/INFO',
        fallbackTone: 'default',
        sessionId
      })
    })

    minecraftProcess.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer = this.handleServerOutputChunk({
        chunk,
        buffer: this.stderrBuffer,
        source: 'Server thread/ERROR',
        fallbackTone: 'error',
        sessionId
      })
    })

    minecraftProcess.once('error', (error) => {
      void this.handleServerProcessError(operationContext, sessionId, error)
    })

    minecraftProcess.once('close', (exitCode) => {
      void this.handleServerProcessClose(operationContext, sessionId, exitCode)
    })
  }

  private async handleServerProcessError(
    operationContext: WorldOperationContext,
    sessionId: string,
    error: Error
  ): Promise<void> {
    const failedDuringStart = this.status === 'starting'
    const message = getProcessStartErrorMessage(error)
    this.userRequestedStop = false
    this.status = 'error'
    this.errorMessage = message
    stopPlayerPolling()
    this.addLogLine('ChunkShare', message, 'error')
    await this.waitForLockActivation()
    await stopHeartbeat()
    if (failedDuringStart) {
      await clearHostingLockAfterStartFailure(operationContext, sessionId).catch(() => undefined)
    }

    if (this.runningWorld === operationContext && this.sessionId === sessionId) {
      this.sessionId = null
    }
  }

  private async handleServerProcessClose(
    operationContext: WorldOperationContext,
    sessionId: string,
    exitCode: number | null
  ): Promise<void> {
    this.clearStopTimeout()
    stopPlayerPolling()
    await this.waitForLockActivation()
    await stopHeartbeat()
    this.flushServerOutputBuffers()

    if (this.status === 'error') {
      this.serverProcess = null
      if (this.sessionId === sessionId) {
        this.sessionId = null
      }
      this.userRequestedStop = false
      this.releaseRunningWorld(operationContext, sessionId)
      this.emitRuntimeEvent()
      return
    }

    this.serverProcess = null
    this.players = { ...this.players, online: 0 }

    if (this.userRequestedStop && exitCode === 0) {
      await this.publishSaveAfterCleanStop(operationContext, sessionId)
      return
    }

    if (this.sessionId === sessionId) {
      this.sessionId = null
    }
    this.userRequestedStop = false
    this.status = 'crashed'
    this.errorMessage = `Minecraft server exited unexpectedly with code ${exitCode ?? 'unknown'}.`
    this.releaseRunningWorld(operationContext, sessionId)

    this.emitRuntimeEvent()
  }

  private async publishSaveAfterCleanStop(
    operationContext: WorldOperationContext,
    sessionId: string
  ): Promise<void> {
    this.addLogLine('ChunkShare', 'Publishing server save.')

    try {
      const publishResult = await publishServerSave(operationContext)
      await clearHostingLockAfterCleanStop(operationContext, sessionId)
      if (this.sessionId === sessionId) {
        this.sessionId = null
      }
      this.userRequestedStop = false
      this.status = 'stopped'
      this.errorMessage = null
      this.releaseRunningWorld(operationContext, sessionId)
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
      this.releaseRunningWorld(operationContext, sessionId)
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

  private handleServerOutputChunk({
    chunk,
    buffer,
    source,
    fallbackTone,
    sessionId
  }: {
    chunk: Buffer
    buffer: string
    source: string
    fallbackTone: RuntimeLogTone
    sessionId: string
  }): string {
    const nextOutput = `${buffer}${chunk.toString()}`
    const lines = nextOutput.split(/\r?\n/)
    const nextBuffer = lines.pop() ?? ''
    const completeOutput = lines.join('\n')

    if (completeOutput) {
      this.handleServerOutput(completeOutput, source, fallbackTone, sessionId)
    }

    return nextBuffer
  }

  private flushServerOutputBuffers(): void {
    if (!this.sessionId) {
      this.stdoutBuffer = ''
      this.stderrBuffer = ''
      return
    }

    if (this.stdoutBuffer) {
      this.handleServerOutput(this.stdoutBuffer, 'Server thread/INFO', 'default', this.sessionId)
    }

    if (this.stderrBuffer) {
      this.handleServerOutput(this.stderrBuffer, 'Server thread/ERROR', 'error', this.sessionId)
    }

    this.stdoutBuffer = ''
    this.stderrBuffer = ''
  }

  private handleMinecraftOutputEvent(event: MinecraftOutputEvent, source: string, sessionId: string): void {
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
    const lockActivation = this.startHeartbeatAfterLockActivation(sessionId)
    this.lockActivation = lockActivation
    void lockActivation.finally(() => {
      if (this.lockActivation === lockActivation) {
        this.lockActivation = null
      }
    })
    startPlayerPolling({
      getServerProcess: () => this.serverProcess,
      getStatus: () => this.status,
      onPlayersChanged: (nextPlayers) => this.updatePlayers(nextPlayers)
    })
    this.emitRuntimeEvent()
  }

  private async waitForLockActivation(): Promise<void> {
    await this.lockActivation
  }

  private async startHeartbeatAfterLockActivation(sessionId: string): Promise<void> {
    if (this.status !== 'running') {
      return
    }

    const operationContext = this.runningWorld

    if (!operationContext) {
      return
    }

    try {
      await markHostingLockRunning(operationContext, sessionId)
    } catch (error: unknown) {
      this.addLogLine(
        'ChunkShare',
        `Unable to mark hosting lock as running: ${getErrorMessage(error)}`,
        'warning'
      )
      return
    }

    if (this.status !== 'running') {
      return
    }

    startHeartbeat({
      sessionId,
      storageAdapter: operationContext.storageAdapter,
      getStatus: () => this.status,
      addLogLine: (logSource, message, logTone) => this.addLogLine(logSource, message, logTone)
    })
  }

  private async markHostingLockStopping(): Promise<void> {
    if (!this.sessionId || !this.runningWorld) {
      return
    }

    try {
      await markHostingLockStopping(this.runningWorld, this.sessionId)
    } catch (error: unknown) {
      this.addLogLine(
        'ChunkShare',
        `Unable to mark hosting lock as stopping: ${getErrorMessage(error)}`,
        'warning'
      )
    }
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
    void stopHeartbeat()
    this.addLogLine('ChunkShare', message, 'error')
  }

  private assertServerSyncIsStartAllowed(serverSync: ServerSyncSnapshot): void {
    if (serverSync.isStartAllowed) {
      return
    }

    throw new ServerRuntimeError(getSyncStartBlockedMessage(serverSync))
  }

  private assertServerSyncAllowsStart(serverSync: ServerSyncSnapshot): void {
    try {
      this.assertServerSyncIsStartAllowed(serverSync)
    } catch (error) {
      if (this.status === 'starting') {
        this.finishWithError(getErrorMessage(error))
      }

      throw error
    }
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

  private releaseRunningWorld(operationContext: WorldOperationContext, sessionId: string | null): void {
    if (sessionId) {
      releaseActiveRuntimeSession(operationContext.worldId, sessionId)
    }

    if (this.runningWorld === operationContext) {
      this.runningWorld = null
    }
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

export function downloadLatestSharedSave(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.downloadLatestSharedSave()
}

async function readMaxPlayers(serverFolderPath: string): Promise<number> {
  const properties = await readFile(join(serverFolderPath, 'server.properties'), 'utf8').catch(() => '')
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

function getPreStartPublishErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to publish newer local save before start: ${error.message}`
  }

  return 'Unable to publish newer local save before start.'
}

function getPreStartRestoreErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to update local server from shared save before start: ${error.message}`
  }

  return 'Unable to update local server from shared save before start.'
}

function getDownloadSharedSaveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to download the shared save: ${error.message}`
  }

  return 'Unable to download the shared save.'
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}

function isMissingExecutableError(error: unknown): boolean {
  return isMissingFileError(error)
}
