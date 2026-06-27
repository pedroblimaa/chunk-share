import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { ServerLockStatus, type ServerStorageSnapshot } from '../../shared/domain'
import type {
  ServerConnectionAddress,
  ServerRecoveryPhase,
  ServerRuntimeEvent,
  ServerRuntimeLogLine,
  ServerRuntimePlayers,
  ServerRuntimeRecovery,
  ServerRuntimeResources,
  ServerRuntimeSnapshot,
  ServerRuntimeStatus
} from '../../shared/server-runtime'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'
import { getSyncStartBlockedMessage } from '../server-sync/server-sync-messages'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { getErrorMessage } from '../shared/main-helpers'
import { getActiveStorageAdapter } from '../storage/adapters/storage-adapter-service'
import { localServerFolderPath, localServerJarFilePath } from '../storage/core/storage-paths'
import { readLocalState, saveLocalStateDirty } from '../storage/persistence/local-state-store'
import { publishServerSave } from '../storage/server-save/server-save-publisher'
import { restoreLatestServerSave } from '../storage/server-save/server-save-restorer'
import { parseMinecraftOutput, type MinecraftOutputEvent } from './minecraft-output-parser'
import { startHeartbeat, stopHeartbeat } from './server-heartbeat-manager'
import {
  clearHostingLockAfterCleanStop,
  clearHostingLockAfterStartFailure,
  createHostingLock,
  markHostingLockRunning,
  markHostingLockStopping,
  restoreActiveRuntimeSessionId,
  updateHostingLockSaveVersion
} from './server-hosting-lock-manager'
import { getConnectionAddresses } from './server-network-addresses'
import { startPlayerPolling, stopPlayerPolling } from './server-player-poller'
import {
  findOwnedMinecraftProcess,
  isProcessRunning,
  isTcpPortOpen,
  waitForProcessExit
} from './server-process-inspector'
import { ServerRuntimeError } from './server-runtime-error'
import { assertFileExists, assertFolderExists } from './server-runtime-file-checks'
import {
  getConsoleTimestamp,
  getPreStartPublishErrorMessage,
  getPreStartRestoreErrorMessage,
  getProcessStartErrorMessage,
  getRecoveryErrorMessage,
  getRestoreRecoveryErrorMessage,
  getStopCompletionErrorMessage
} from './server-runtime-messages'
import { ServerRuntimeSessionManager } from './server-runtime-session-manager'
import { readPersistedServerRuntimeSession } from './server-runtime-state-store'
import type { PersistedServerRuntimeSession } from './server-runtime.model'

type ServerRuntimeListener = (event: ServerRuntimeEvent) => void
type RuntimeLogTone = ServerRuntimeLogLine['tone']

const SERVER_STOP_TIMEOUT_MS = 15_000
const SERVER_START_TIMEOUT_MS = 120_000
const JAVA_COMMAND = 'java'
const BASE_JAVA_ARGS = ['-Xmx4G', '-Xms2G']
const SERVER_JAVA_ARGS = ['-jar', 'server.jar', 'nogui']
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
  private startTimeout: NodeJS.Timeout | null = null
  private sessionId: string | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private userRequestedStop = false
  private status: ServerRuntimeStatus = 'initializing'
  private errorMessage: string | null = null
  private logs: ServerRuntimeLogLine[] = []
  private connectionAddresses: ServerConnectionAddress[] = []
  private players: ServerRuntimePlayers = { online: 0, max: DEFAULT_PLAYER_LIMIT }
  private resources: ServerRuntimeResources = MOCK_RESOURCES
  private recovery: ServerRuntimeRecovery | null = null
  private persistedSessionManager = new ServerRuntimeSessionManager()
  private serverReachedReady = false
  private recoveryMode = false
  private processClosePromise: Promise<void> | null = null
  private resolveProcessClose: (() => void) | null = null
  private processFailureMessage: string | null = null
  private listeners = new Set<ServerRuntimeListener>()

  private get persistedSession(): PersistedServerRuntimeSession | null {
    return this.persistedSessionManager.current
  }

  getSnapshot(): ServerRuntimeSnapshot {
    return {
      status: this.status,
      errorMessage: this.errorMessage,
      connectionAddresses: this.connectionAddresses,
      players: this.players,
      resources: this.resources,
      logs: this.logs,
      recovery: this.recovery
    }
  }

  async initialize(): Promise<void> {
    let persistedSession: PersistedServerRuntimeSession | null

    try {
      persistedSession = await readPersistedServerRuntimeSession()
    } catch (error) {
      try {
        const restoredLegacySession = await this.restoreLegacyRuntimeSession()

        if (!restoredLegacySession) {
          this.finishWithError(`Unable to read the previous server session: ${getErrorMessage(error)}`)
        }
      } catch {
        this.finishWithError(`Unable to read the previous server session: ${getErrorMessage(error)}`)
      }

      this.finishInitialization()
      return
    }

    if (!persistedSession) {
      try {
        await this.restoreLegacyRuntimeSession()
      } catch (error) {
        this.finishWithError(`Unable to restore the previous server session: ${getErrorMessage(error)}`)
      }

      this.finishInitialization()
      return
    }

    this.persistedSessionManager.restore(persistedSession)
    restoreActiveRuntimeSessionId(persistedSession.sessionId)

    if (persistedSession.phase === 'published') {
      await this.reconcilePublishedSession()
      return
    }

    if (persistedSession.phase !== 'lock-acquired') {
      const processIsRunning = await this.getPersistedProcessIsRunning()
      this.enterRecoveryRequired(
        processIsRunning
          ? 'The Minecraft server is still running in the background.'
          : 'The previous Minecraft server session ended without publishing.',
        false,
        processIsRunning
      )
      return
    }

    try {
      await this.clearInterruptedStart(persistedSession.sessionId)
      this.finishWithError('The previous Minecraft server start was interrupted. Try starting again.')
    } catch (error) {
      this.enterRecoveryRequired(
        `The previous server start was interrupted, but its lock could not be cleared: ${getErrorMessage(error)}`,
        false,
        false
      )
    }
  }

  private async restoreLegacyRuntimeSession(): Promise<boolean> {
    const localState = await readLocalState()

    if (!localState.activeSessionId) {
      return false
    }

    const storageAdapter = await getActiveStorageAdapter()
    const serverLock = await storageAdapter.readServerLock()

    if (
      serverLock.status !== ServerLockStatus.Locked ||
      serverLock.sessionId !== localState.activeSessionId
    ) {
      return false
    }

    await this.persistedSessionManager.replace({
      phase: 'ready',
      processId: null,
      processTag: null,
      sessionId: localState.activeSessionId,
      startedAt: serverLock.startedAt
    })
    restoreActiveRuntimeSessionId(localState.activeSessionId)
    this.enterRecoveryRequired(
      'The previous Minecraft server session ended without publishing.',
      false,
      false
    )

    return true
  }

  subscribe(listener: ServerRuntimeListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  failInitialization(error: unknown): void {
    this.finishWithError(`Unable to initialize the server runtime: ${getErrorMessage(error)}`)
  }

  async start(): Promise<ServerRuntimeSnapshot> {
    if (this.status === 'initializing') {
      throw new ServerRuntimeError('ChunkShare is still checking the previous server session.')
    }

    if (this.serverProcess) {
      throw new ServerRuntimeError('Minecraft server is already running.')
    }

    if (
      this.status === 'starting' ||
      this.status === 'running' ||
      this.status === 'stopping' ||
      this.status === 'recovering' ||
      this.status === 'recovery-required'
    ) {
      throw new ServerRuntimeError('Minecraft server is already starting, running, or stopping.')
    }

    this.beginServerStart()

    try {
      return await this.startConfiguredServer()
    } catch (error) {
      await this.handleStartPreparationFailure(error)
      throw error
    }
  }

  private async startConfiguredServer(): Promise<ServerRuntimeSnapshot> {
    let storageSnapshot = await getServerSyncSnapshot()
    let { localState, serverSync } = storageSnapshot

    if (localState.serverSetup.status !== 'ready') {
      throw new ServerRuntimeError('Server setup must be completed before starting Minecraft.')
    }

    const restoredCloudSaveBeforeStart = serverSync.status === ServerSyncStatus.UpdateAvailable

    if (restoredCloudSaveBeforeStart) {
      storageSnapshot = await this.restoreCloudSaveBeforeStart(storageSnapshot)
      localState = storageSnapshot.localState
      serverSync = storageSnapshot.serverSync
    }

    this.assertServerSyncAllowsStart(serverSync)

    const serverFolderPath = localState.serverConfig.serverFolderPath ?? localServerFolderPath

    await this.runStartPreparation(() => assertFolderExists(serverFolderPath))
    await this.runStartPreparation(() => assertFileExists(localServerJarFilePath))

    const connectionAddresses = getConnectionAddresses(localState.serverConfig.port)
    const maxPlayers = await this.runStartPreparation(() => readMaxPlayers(serverFolderPath))
    const sessionId = await this.runStartPreparation(() =>
      createHostingLock(storageSnapshot, connectionAddresses)
    )
    this.sessionId = sessionId
    await this.persistedSessionManager.create(sessionId)

    this.connectionAddresses = connectionAddresses
    this.players = { online: 0, max: maxPlayers }

    if (serverSync.status === ServerSyncStatus.LocalNewer) {
      storageSnapshot = await this.publishLocalNewerSaveBeforeStart(sessionId)
      serverSync = storageSnapshot.serverSync
      this.assertServerSyncAllowsStart(serverSync)
    }

    const javaArgs = getJavaArgs(sessionId)
    this.addLogLine(
      'ChunkShare',
      `Starting Minecraft server with ${JAVA_COMMAND} ${[...BASE_JAVA_ARGS, ...SERVER_JAVA_ARGS].join(' ')}`
    )

    await this.launchServerProcess(serverFolderPath, sessionId, javaArgs)

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
    this.recovery = null
    this.recoveryMode = false
    this.serverReachedReady = false
    this.processFailureMessage = null
    this.emitRuntimeEvent()
  }

  private async handleStartPreparationFailure(error: unknown): Promise<void> {
    if (this.status === 'recovery-required') {
      return
    }

    if (this.sessionId && !this.serverProcess) {
      const lockWasCleared = await this.clearFailedStartSession(this.sessionId, getErrorMessage(error))

      if (!lockWasCleared) {
        return
      }
    }

    if (this.status !== 'error') {
      this.finishWithError(getErrorMessage(error))
    }
  }

  private async restoreCloudSaveBeforeStart(
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
      await restoreLatestServerSave(storageSnapshot)
      this.addLogLine('ChunkShare', 'Local server updated from shared save.', 'success')

      return getServerSyncSnapshot()
    } catch (error) {
      const message = getPreStartRestoreErrorMessage(error)
      this.finishWithError(message)
      throw new ServerRuntimeError(message)
    }
  }

  private async publishLocalNewerSaveBeforeStart(sessionId: string): Promise<ServerStorageSnapshot> {
    this.addLogLine('ChunkShare', 'Publishing newer local save before start.')

    try {
      const publishResult = await publishServerSave()
      await updateHostingLockSaveVersion(sessionId, publishResult.latestSave.saveVersion)

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

      return getServerSyncSnapshot()
    } catch (error) {
      const message = getPreStartPublishErrorMessage(error)

      if (!(await this.clearFailedStartSession(sessionId, message))) {
        throw new ServerRuntimeError(message)
      }

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

  async recover(): Promise<ServerRuntimeSnapshot> {
    if (this.status !== 'recovery-required' || !this.persistedSession) {
      throw new ServerRuntimeError('No crashed Minecraft server session is available to recover.')
    }

    this.recoveryMode = true
    this.serverReachedReady = false
    this.setRecoveryProgress(
      'starting',
      this.persistedSession.processId !== null && isProcessRunning(this.persistedSession.processId)
    )

    try {
      if (this.persistedSession.phase === 'published') {
        await this.finalizePublishedSession()
        return this.getSnapshot()
      }

      await this.stopPersistedBackgroundProcess()
      await this.startRecoveryServer()
      return this.getSnapshot()
    } catch (error) {
      const message = getRecoveryErrorMessage(error)
      const processIsRunning = await this.getPersistedProcessIsRunning()
      this.enterRecoveryRequired(message, true, processIsRunning)
      throw new ServerRuntimeError(message)
    }
  }

  async restoreSharedSaveAfterRecovery(): Promise<ServerRuntimeSnapshot> {
    if (this.status !== 'recovery-required' || !this.recovery?.attemptFailed || !this.persistedSession) {
      throw new ServerRuntimeError('Recover the server before restoring the last shared save.')
    }

    this.setRecoveryProgress('restoring', false)

    const persistedSession = this.persistedSession

    try {
      await this.assertPersistedProcessStopped()

      const storageSnapshot = await getServerSyncSnapshot()

      if (!storageSnapshot.latestSave) {
        throw new ServerRuntimeError('No shared save is available to restore.')
      }

      await restoreLatestServerSave(storageSnapshot, { allowDirtyLocalState: true })
      await saveLocalStateDirty(false)
      await this.clearInterruptedStart(persistedSession.sessionId)

      this.completeStoppedRuntime()

      return this.getSnapshot()
    } catch (error) {
      const message = getRestoreRecoveryErrorMessage(error)
      const processIsRunning = await this.getPersistedProcessIsRunning()
      this.enterRecoveryRequired(message, true, processIsRunning)
      throw new ServerRuntimeError(message)
    }
  }

  async shutdown(): Promise<void> {
    if (!this.serverProcess) {
      const pendingProcessClose = this.processClosePromise
      await pendingProcessClose

      if (pendingProcessClose) {
        this.assertShutdownCompleted()
      }

      return
    }

    if (this.status === 'recovering' && this.recovery?.phase === 'starting') {
      this.serverProcess.kill()
    } else if (this.status !== 'stopping' && this.status !== 'recovering') {
      await this.stop()
    }

    await this.processClosePromise
    this.assertShutdownCompleted()
  }

  private assertShutdownCompleted(): void {
    if (this.status !== 'stopped') {
      throw new ServerRuntimeError(
        this.errorMessage ?? 'Minecraft server shutdown did not finish successfully.'
      )
    }
  }

  private async startRecoveryServer(): Promise<void> {
    const storageSnapshot = await getServerSyncSnapshot()
    const { localState } = storageSnapshot

    if (localState.serverSetup.status !== 'ready') {
      throw new ServerRuntimeError('Server setup must be completed before recovery.')
    }

    const serverFolderPath = localState.serverConfig.serverFolderPath ?? localServerFolderPath
    await assertFolderExists(serverFolderPath)
    await assertFileExists(localServerJarFilePath)

    const connectionAddresses = getConnectionAddresses(localState.serverConfig.port)
    const maxPlayers = await readMaxPlayers(serverFolderPath)
    const sessionId = await createHostingLock(storageSnapshot, connectionAddresses)

    this.sessionId = sessionId
    await this.persistedSessionManager.create(sessionId)
    this.connectionAddresses = connectionAddresses
    this.players = { online: 0, max: maxPlayers }
    this.addLogLine('ChunkShare', 'Starting Minecraft server recovery.')

    await this.launchServerProcess(serverFolderPath, sessionId, getJavaArgs(sessionId))
  }

  private async launchServerProcess(
    serverFolderPath: string,
    sessionId: string,
    javaArgs: string[]
  ): Promise<void> {
    await this.persistedSessionManager.markLaunching()
    await saveLocalStateDirty(true)

    let minecraftProcess: ChildProcessWithoutNullStreams

    try {
      minecraftProcess = spawn(JAVA_COMMAND, javaArgs, {
        cwd: serverFolderPath,
        windowsHide: true
      })
    } catch (error) {
      await saveLocalStateDirty(false)
      throw error
    }

    if (!minecraftProcess.pid) {
      minecraftProcess.kill()
      await saveLocalStateDirty(false)
      throw new ServerRuntimeError('Minecraft server did not return a process ID.')
    }

    this.serverProcess = minecraftProcess
    this.processClosePromise = new Promise<void>((resolve) => {
      this.resolveProcessClose = resolve
    })
    this.attachServerProcessListeners(minecraftProcess, sessionId)
    this.scheduleStartTimeout()

    try {
      await this.persistedSessionManager.markProcessStarted(minecraftProcess.pid)
    } catch (error) {
      minecraftProcess.kill()
      throw error
    }
  }

  async stop(): Promise<ServerRuntimeSnapshot> {
    if (!this.serverProcess) {
      if (this.status === 'recovery-required') {
        throw new ServerRuntimeError('Recover the server before attempting to stop it.')
      }

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
    this.markHostingLockStopping()

    this.addLogLine('ChunkShare', 'Saving world before shutdown.')
    this.serverProcess.stdin.write('save-all flush\n')

    this.addLogLine('ChunkShare', 'Sending graceful stop command to Minecraft server.')
    this.serverProcess.stdin.write('stop\n')

    this.scheduleStopTimeout()

    return this.getSnapshot()
  }

  private scheduleStopTimeout(): void {
    this.clearStopTimeout()
    this.stopTimeout = setTimeout(() => {
      if (!this.serverProcess) {
        return
      }

      this.userRequestedStop = false
      this.finishWithError('Minecraft server did not stop within 15 seconds.')
      this.serverProcess.kill()
    }, SERVER_STOP_TIMEOUT_MS)
  }

  private scheduleStartTimeout(): void {
    this.clearStartTimeout()
    this.startTimeout = setTimeout(() => {
      if (!this.serverProcess || this.serverReachedReady) {
        return
      }

      this.processFailureMessage = 'Minecraft server did not finish starting within 2 minutes.'
      this.serverProcess.kill()
    }, SERVER_START_TIMEOUT_MS)
  }

  private attachServerProcessListeners(
    minecraftProcess: ChildProcessWithoutNullStreams,
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
      this.processFailureMessage = getProcessStartErrorMessage(error)
    })

    minecraftProcess.once('close', (exitCode) => {
      void this.handleServerProcessClose(exitCode)
    })
  }

  private async handleServerProcessClose(exitCode: number | null): Promise<void> {
    this.clearStopTimeout()
    this.clearStartTimeout()
    stopPlayerPolling()
    stopHeartbeat()
    this.flushServerOutputBuffers()

    this.serverProcess = null
    this.players = { ...this.players, online: 0 }

    if (this.userRequestedStop && exitCode === 0) {
      await this.publishSaveAfterCleanStop()
      this.resolveManagedProcessClose()
      return
    }

    const failureMessage =
      this.processFailureMessage ?? `Minecraft server exited with code ${exitCode ?? 'unknown'}.`

    this.userRequestedStop = false

    this.sessionId = null
    this.enterRecoveryRequired(failureMessage, this.recoveryMode, false)
    this.resolveManagedProcessClose()
  }

  private async publishSaveAfterCleanStop(): Promise<void> {
    if (this.recoveryMode && this.recovery) {
      this.setRecoveryProgress('publishing', false)
    }

    this.addLogLine('ChunkShare', 'Publishing server save.')

    try {
      const publishResult = await publishServerSave()
      await saveLocalStateDirty(false)
      await this.persistedSessionManager.markPublished()
      await clearHostingLockAfterCleanStop()
      await this.clearPersistedRuntimeState()
      this.completeStoppedRuntime(false)
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

      this.enterRecoveryRequired(getStopCompletionErrorMessage(error), this.recoveryMode, false)
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
      this.processFailureMessage =
        `This Minecraft server requires Java ${event.requiredJavaVersion}, but ChunkShare is using Java ${event.currentJavaVersion}. ` +
        'Install a newer Java version and restart ChunkShare.'
      this.serverProcess?.kill()
      return
    }

    if (this.status === 'starting' || this.status === 'recovering') {
      void this.markServerReady(sessionId)
    }
  }

  private async markServerReady(sessionId: string): Promise<void> {
    if (this.serverReachedReady) {
      return
    }

    this.serverReachedReady = true
    this.clearStartTimeout()

    try {
      await this.persistedSessionManager.markReady()

      if (!this.serverProcess || this.sessionId !== sessionId) {
        return
      }

      await markHostingLockRunning(sessionId)
    } catch (error) {
      this.processFailureMessage = `Unable to prepare the running server: ${getErrorMessage(error)}`
      this.serverProcess?.kill()
      return
    }

    if (!this.serverProcess || this.sessionId !== sessionId) {
      return
    }

    if (this.recoveryMode) {
      this.beginAutomaticRecoveryStop()
      return
    }

    this.status = 'running'
    this.startHeartbeatForSession(sessionId)
    startPlayerPolling({
      getServerProcess: () => this.serverProcess,
      getStatus: () => this.status,
      onPlayersChanged: (nextPlayers) => this.updatePlayers(nextPlayers)
    })
    this.emitRuntimeEvent()
  }

  private startHeartbeatForSession(sessionId: string): void {
    startHeartbeat({
      sessionId,
      getStatus: () => this.status,
      addLogLine: (logSource, message, logTone) => this.addLogLine(logSource, message, logTone)
    })
  }

  private beginAutomaticRecoveryStop(): void {
    if (!this.serverProcess || !this.recovery) {
      return
    }

    this.userRequestedStop = true
    this.setRecoveryProgress('saving', true)
    this.markHostingLockStopping()
    this.addLogLine('ChunkShare', 'Recovery loaded successfully. Saving the world.')
    this.serverProcess.stdin.write('save-all flush\n')
    this.serverProcess.stdin.write('stop\n')
    this.scheduleStopTimeout()
  }

  private markHostingLockStopping(): void {
    if (!this.sessionId) {
      return
    }

    void markHostingLockStopping(this.sessionId).catch((error: unknown) => {
      this.addLogLine(
        'ChunkShare',
        `Unable to mark hosting lock as stopping: ${getErrorMessage(error)}`,
        'warning'
      )
    })
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

  private async reconcilePublishedSession(): Promise<void> {
    try {
      await this.finalizePublishedSession()
    } catch (error) {
      this.enterRecoveryRequired(
        `The previous save was published, but the hosting lock still needs cleanup: ${getErrorMessage(error)}`,
        false,
        false
      )
    }
  }

  private async finalizePublishedSession(): Promise<void> {
    await clearHostingLockAfterCleanStop()
    await this.clearPersistedRuntimeState()
    this.completeStoppedRuntime()
  }

  private async clearPersistedRuntimeState(): Promise<void> {
    try {
      await this.persistedSessionManager.clear()
    } catch (error) {
      this.addLogLine(
        'ChunkShare',
        `The server session finished, but its local recovery metadata could not be removed: ${getErrorMessage(error)}`,
        'warning'
      )
    }

    this.persistedSessionManager.forget()
  }

  private completeStoppedRuntime(emitEvent = true): void {
    this.resetRuntimeSession()
    this.status = 'stopped'
    this.errorMessage = null

    if (emitEvent) {
      this.emitRuntimeEvent()
    }
  }

  private finishInitialization(): void {
    if (this.status !== 'initializing') {
      return
    }

    this.status = 'stopped'
    this.emitRuntimeEvent()
  }

  private setRecoveryProgress(phase: ServerRecoveryPhase, processIsRunning: boolean): void {
    this.status = 'recovering'
    this.errorMessage = null
    this.recovery = {
      phase,
      attemptFailed: false,
      processIsRunning
    }
    this.emitRuntimeEvent()
  }

  private async getPersistedProcessIsRunning(): Promise<boolean> {
    if (!this.persistedSession) {
      return false
    }

    try {
      return (await findOwnedMinecraftProcess(this.persistedSession)) !== null
    } catch {
      return false
    }
  }

  private enterRecoveryRequired(message: string, attemptFailed: boolean, processIsRunning: boolean): void {
    this.status = 'recovery-required'
    this.errorMessage = message
    this.recoveryMode = this.serverProcess !== null && this.recoveryMode
    this.recovery = {
      phase: null,
      attemptFailed,
      processIsRunning
    }
    stopPlayerPolling()
    stopHeartbeat()
    this.addLogLine('ChunkShare', message, 'error')
  }

  private async stopPersistedBackgroundProcess(): Promise<void> {
    if (!this.persistedSession) {
      return
    }

    const processId = await findOwnedMinecraftProcess(this.persistedSession)

    if (processId === null) {
      await this.assertNoUntrackedBackgroundServer()
      return
    }

    try {
      process.kill(processId)
    } catch (error) {
      throw new ServerRuntimeError(
        `Unable to stop the background Minecraft process: ${getErrorMessage(error)}`
      )
    }

    await waitForProcessExit(processId)
  }

  private async assertNoUntrackedBackgroundServer(): Promise<void> {
    const localState = await readLocalState()

    if (await isTcpPortOpen(localState.serverConfig.port)) {
      throw new ServerRuntimeError(
        'The previous Minecraft server is still running, but ChunkShare does not know its process ID. Stop the Java process, then retry recovery.'
      )
    }
  }

  private async assertPersistedProcessStopped(): Promise<void> {
    if (!this.persistedSession) {
      return
    }

    if ((await findOwnedMinecraftProcess(this.persistedSession)) !== null) {
      throw new ServerRuntimeError('Cannot restore while the previous server process is still running.')
    }

    await this.assertNoUntrackedBackgroundServer()
  }

  private async clearInterruptedStart(sessionId: string): Promise<void> {
    await clearHostingLockAfterStartFailure(sessionId)
    await this.clearPersistedRuntimeState()
  }

  private async clearFailedStartSession(sessionId: string, failureMessage: string): Promise<boolean> {
    try {
      await this.clearInterruptedStart(sessionId)
      this.sessionId = null
      return true
    } catch (error) {
      this.enterRecoveryRequired(
        `${failureMessage} The hosting lock could not be cleared: ${getErrorMessage(error)}`,
        false,
        false
      )
      return false
    }
  }

  private resetRuntimeSession(): void {
    this.sessionId = null
    this.persistedSessionManager.forget()
    this.recovery = null
    this.recoveryMode = false
    this.serverReachedReady = false
    this.processFailureMessage = null
    this.userRequestedStop = false
    this.connectionAddresses = []
  }

  private resolveManagedProcessClose(): void {
    this.resolveProcessClose?.()
    this.resolveProcessClose = null
    this.processClosePromise = null
  }

  private finishWithError(message: string): void {
    this.status = 'error'
    this.errorMessage = message
    stopPlayerPolling()
    stopHeartbeat()
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

  private clearStartTimeout(): void {
    if (!this.startTimeout) {
      return
    }

    clearTimeout(this.startTimeout)
    this.startTimeout = null
  }
}

const serverRuntime = new ServerRuntime()

export function getServerRuntimeSnapshot(): ServerRuntimeSnapshot {
  return serverRuntime.getSnapshot()
}

export function subscribeToServerRuntime(listener: ServerRuntimeListener): () => void {
  return serverRuntime.subscribe(listener)
}

export async function initializeServerRuntime(): Promise<void> {
  try {
    await serverRuntime.initialize()
  } catch (error) {
    serverRuntime.failInitialization(error)
  }
}

export function startMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.start()
}

export function stopMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.stop()
}

export function recoverMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.recover()
}

export function restoreSharedSaveAfterRecovery(): Promise<ServerRuntimeSnapshot> {
  return serverRuntime.restoreSharedSaveAfterRecovery()
}

export function shutdownMinecraftServer(): Promise<void> {
  return serverRuntime.shutdown()
}

async function readMaxPlayers(serverFolderPath: string): Promise<number> {
  const properties = await readFile(join(serverFolderPath, 'server.properties'), 'utf8').catch(() => '')
  const match = properties.match(/^max-players=(\d+)$/m)

  return match ? Number(match[1]) : DEFAULT_PLAYER_LIMIT
}

function getJavaArgs(sessionId: string): string[] {
  return [...BASE_JAVA_ARGS, `-Dchunkshare.sessionId=${sessionId}`, ...SERVER_JAVA_ARGS]
}
