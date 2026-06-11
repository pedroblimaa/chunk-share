import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { stat } from 'fs/promises'
import { networkInterfaces } from 'os'
import type {
  ServerConnectionAddress,
  ServerRuntimeEvent,
  ServerRuntimeLogLine,
  ServerRuntimeSnapshot,
  ServerRuntimeStatus
} from '../../shared/server-runtime'
import { readLocalState } from '../storage/local-state-store'
import { managedServerFolderPath, managedServerJarFilePath } from '../storage/storage-paths'
import { ServerRuntimeError } from './server-runtime-error'

type ServerRuntimeListener = (event: ServerRuntimeEvent) => void
type RuntimeLogTone = ServerRuntimeLogLine['tone']

const SERVER_READY_PATTERN = /Done \(.+\)! For help, type "help"/
const SERVER_STOP_TIMEOUT_MS = 15_000
const JAVA_COMMAND = 'java'
const JAVA_ARGS = ['-Xmx4G', '-Xms2G', '-jar', 'server.jar', 'nogui']

let serverProcess: ChildProcessWithoutNullStreams | null = null
let stopTimeout: NodeJS.Timeout | null = null
let status: ServerRuntimeStatus = 'stopped'
let errorMessage: string | null = null
let logs: ServerRuntimeLogLine[] = []
let connectionAddresses: ServerConnectionAddress[] = []
const listeners = new Set<ServerRuntimeListener>()

export function getServerRuntimeSnapshot(): ServerRuntimeSnapshot {
  return {
    status,
    errorMessage,
    connectionAddresses,
    logs
  }
}

export function subscribeToServerRuntime(listener: ServerRuntimeListener): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

export async function startMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  if (serverProcess) {
    throw new ServerRuntimeError('Minecraft server is already running.')
  }

  const localState = await readLocalState()

  if (localState.serverSetup.status !== 'ready') {
    throw new ServerRuntimeError('Server setup must be completed before starting Minecraft.')
  }

  const serverFolderPath = localState.serverConfig.serverFolderPath ?? managedServerFolderPath

  await assertFolderExists(serverFolderPath)
  await assertFileExists(managedServerJarFilePath)

  status = 'starting'
  errorMessage = null
  logs = []
  connectionAddresses = getConnectionAddresses(localState.serverConfig.port)
  emitRuntimeEvent()
  addLogLine('ChunkShare', `Starting Minecraft server with ${JAVA_COMMAND} ${JAVA_ARGS.join(' ')}`)

  serverProcess = spawn(JAVA_COMMAND, JAVA_ARGS, {
    cwd: serverFolderPath,
    windowsHide: true
  })

  attachServerProcessListeners(serverProcess)

  return getServerRuntimeSnapshot()
}

function attachServerProcessListeners(minecraftProcess: ChildProcessWithoutNullStreams): void {
  minecraftProcess.stdout.on('data', (chunk: Buffer) => {
    handleServerOutput(chunk.toString(), 'Server thread/INFO', 'default')
  })

  minecraftProcess.stderr.on('data', (chunk: Buffer) => {
    handleServerOutput(chunk.toString(), 'Server thread/ERROR', 'error')
  })

  minecraftProcess.once('error', (error) => {
    serverProcess = null
    finishWithError(getProcessStartErrorMessage(error))
  })

  minecraftProcess.once('close', (exitCode) => {
    clearStopTimeout()

    if (status === 'error') {
      serverProcess = null
      emitRuntimeEvent()
      return
    }

    const stoppedCleanly = exitCode === 0 || status === 'stopping' || status === 'stopped'
    status = stoppedCleanly ? 'stopped' : 'crashed'
    errorMessage = stoppedCleanly
      ? null
      : `Minecraft server exited with code ${exitCode ?? 'unknown'}.`
    serverProcess = null

    emitRuntimeEvent()
  })
}

export async function stopMinecraftServer(): Promise<ServerRuntimeSnapshot> {
  if (!serverProcess) {
    status = 'stopped'
    errorMessage = null
    emitRuntimeEvent()
    return getServerRuntimeSnapshot()
  }

  status = 'stopping'
  errorMessage = null
  emitRuntimeEvent()
  addLogLine('ChunkShare', 'Sending graceful stop command to Minecraft server.')
  serverProcess.stdin.write('stop\n')

  clearStopTimeout()
  stopTimeout = setTimeout(() => {
    if (!serverProcess) {
      return
    }

    finishWithError('Minecraft server did not stop within 15 seconds.')
    serverProcess.kill()
  }, SERVER_STOP_TIMEOUT_MS)

  return getServerRuntimeSnapshot()
}

function handleServerOutput(output: string, source: string, fallbackTone: RuntimeLogTone): void {
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const tone = getLogTone(line, fallbackTone)
      addLogLine(source, line, tone)
      detectJavaClassVersionMismatch(line)

      if (status === 'starting' && SERVER_READY_PATTERN.test(line)) {
        status = 'running'
        emitRuntimeEvent()
      }
    })
}

function addLogLine(source: string, message: string, tone: RuntimeLogTone = 'default'): void {
  const logLine: ServerRuntimeLogLine = {
    id: `runtime-log-${Date.now()}-${logs.length}`,
    timestamp: getConsoleTimestamp(),
    source,
    message,
    tone
  }

  logs = [...logs, logLine]
  emitRuntimeEvent(logLine)
}

function finishWithError(message: string): void {
  status = 'error'
  errorMessage = message
  addLogLine('ChunkShare', message, 'error')
}

function getProcessStartErrorMessage(error: Error): string {
  if (isMissingExecutableError(error)) {
    return 'Java was not found on PATH. Install Java or add java.exe to PATH, then restart ChunkShare and try again.'
  }

  return `Unable to start Minecraft server: ${error.message}`
}

function emitRuntimeEvent(logLine?: ServerRuntimeLogLine): void {
  const event: ServerRuntimeEvent = {
    snapshot: getServerRuntimeSnapshot(),
    logLine
  }

  listeners.forEach((listener) => listener(event))
}

function getConnectionAddresses(port: number): ServerConnectionAddress[] {
  const addresses = Object.entries(networkInterfaces()).flatMap(([interfaceName, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({
        label: interfaceName,
        address: `${entry.address}:${port}`
      }))
  )

  if (addresses.length === 0) {
    return [
      {
        label: 'Localhost',
        address: `localhost:${port}`,
        isPrimary: true
      }
    ]
  }

  return addresses.map((address, index) => ({
    ...address,
    isPrimary: index === 0
  }))
}

function getLogTone(line: string, fallbackTone: RuntimeLogTone): RuntimeLogTone {
  if (SERVER_READY_PATTERN.test(line)) {
    return 'success'
  }

  if (/\b(warn|warning)\b/i.test(line)) {
    return 'warning'
  }

  if (/\b(error|exception|failed)\b/i.test(line)) {
    return 'error'
  }

  return fallbackTone
}

function detectJavaClassVersionMismatch(line: string): void {
  if (status === 'error') {
    return
  }

  const match = line.match(/class file version (\d+)\.0.+up to (\d+)\.0/)

  if (!match) {
    return
  }

  const requiredJavaVersion = getJavaVersionFromClassFileVersion(Number(match[1]))
  const currentJavaVersion = getJavaVersionFromClassFileVersion(Number(match[2]))

  finishWithError(
    `This Minecraft server requires Java ${requiredJavaVersion}, but ChunkShare is using Java ${currentJavaVersion}. Install a newer Java version and restart ChunkShare.`
  )
}

function getJavaVersionFromClassFileVersion(classFileVersion: number): number {
  if (classFileVersion === 45) {
    return 1
  }

  return classFileVersion - 44
}

function getConsoleTimestamp(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())
}

async function assertFolderExists(folderPath: string): Promise<void> {
  const fileStats = await stat(folderPath).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new ServerRuntimeError(`Server folder does not exist: ${folderPath}`)
    }

    throw error
  })

  if (!fileStats.isDirectory()) {
    throw new ServerRuntimeError(`Server folder is not a directory: ${folderPath}`)
  }
}

async function assertFileExists(filePath: string): Promise<void> {
  const fileStats = await stat(filePath).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new ServerRuntimeError(`server.jar was not found at ${filePath}`)
    }

    throw error
  })

  if (!fileStats.isFile()) {
    throw new ServerRuntimeError(`server.jar path is not a file: ${filePath}`)
  }
}

function clearStopTimeout(): void {
  if (!stopTimeout) {
    return
  }

  clearTimeout(stopTimeout)
  stopTimeout = null
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isMissingExecutableError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
