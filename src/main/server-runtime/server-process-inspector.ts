import { execFile } from 'child_process'
import { createConnection } from 'net'
import { promisify } from 'util'
import type { PersistedServerRuntimeSession } from './server-runtime.model'
import { ServerRuntimeError } from './server-runtime-error'
import { getErrorMessage, isRecord } from '../shared/main-helpers'

interface ProcessDetails {
  commandLine: string
  processId: number
  startedAt: string
}

const execFileAsync = promisify(execFile)
const PROCESS_START_TIME_TOLERANCE_MS = 30_000

export function isProcessRunning(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

export async function waitForProcessExit(processId: number): Promise<void> {
  const timeoutAt = Date.now() + 5_000

  while (isProcessRunning(processId) && Date.now() < timeoutAt) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  if (isProcessRunning(processId)) {
    throw new ServerRuntimeError('The background Minecraft process did not stop.')
  }
}

export function isTcpPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false

    const finish = (isOpen: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(isOpen)
    }

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })
}

export async function findOwnedMinecraftProcess(
  session: PersistedServerRuntimeSession
): Promise<number | null> {
  const runningProcesses = await readRunningProcesses()
  const persistedStartTime = new Date(session.startedAt).getTime()
  const matchingProcesses = runningProcesses.filter((runningProcess) => {
    const processStartTime = new Date(runningProcess.startedAt).getTime()
    const startedAtMatches =
      Number.isFinite(persistedStartTime) &&
      Number.isFinite(processStartTime) &&
      Math.abs(processStartTime - persistedStartTime) <= PROCESS_START_TIME_TOLERANCE_MS
    const identityMatches =
      session.processTag === null
        ? startedAtMatches
        : commandMatchesSession(runningProcess.commandLine, session)

    return isMinecraftServerCommand(runningProcess.commandLine) && identityMatches
  })

  if (session.processTag === null && matchingProcesses.length > 0) {
    throw new ServerRuntimeError(
      'The previous Minecraft process predates safe process tagging. Stop it manually before recovery.'
    )
  }

  if (session.processId !== null) {
    const persistedProcess = runningProcesses.find(
      (runningProcess) => runningProcess.processId === session.processId
    )

    if (!persistedProcess) {
      return null
    }

    if (!matchingProcesses.some((runningProcess) => runningProcess.processId === session.processId)) {
      throw new ServerRuntimeError(
        'The saved server process ID now belongs to a different process. ChunkShare will not stop it.'
      )
    }

    return session.processId
  }

  if (matchingProcesses.length > 1) {
    throw new ServerRuntimeError(
      'More than one possible Minecraft process matches the interrupted session. Stop them manually before recovery.'
    )
  }

  return matchingProcesses[0]?.processId ?? null
}

async function readRunningProcesses(): Promise<ProcessDetails[]> {
  try {
    return process.platform === 'win32' ? await readWindowsProcesses() : await readUnixProcesses()
  } catch (error) {
    throw new ServerRuntimeError(`Unable to verify the previous Minecraft process: ${getErrorMessage(error)}`)
  }
}

async function readWindowsProcesses(): Promise<ProcessDetails[]> {
  const script = [
    'Get-CimInstance Win32_Process',
    "Where-Object { $_.Name -in @('java.exe', 'javaw.exe') }",
    "ForEach-Object { [PSCustomObject]@{ processId = $_.ProcessId; commandLine = $_.CommandLine; startedAt = $_.CreationDate.ToUniversalTime().ToString('O') } }",
    'ConvertTo-Json -Compress'
  ].join(' | ')
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script
  ])

  if (!stdout.trim()) {
    return []
  }

  const parsed: unknown = JSON.parse(stdout)
  const processValues = Array.isArray(parsed) ? parsed : [parsed]

  return processValues.filter(isProcessDetails)
}

async function readUnixProcesses(): Promise<ProcessDetails[]> {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,lstart=,command='], {
    env: {
      ...process.env,
      LC_ALL: 'C'
    }
  })

  return stdout
    .split(/\r?\n/)
    .map(parseUnixProcessLine)
    .filter((processDetails): processDetails is ProcessDetails => processDetails !== null)
}

function parseUnixProcessLine(line: string): ProcessDetails | null {
  const match = line.trim().match(/^(\d+)\s+(.{24})\s+(.+)$/)

  if (!match) {
    return null
  }

  const processId = Number(match[1])
  const processStartTime = new Date(match[2])

  if (!Number.isFinite(processStartTime.getTime())) {
    return null
  }

  return {
    processId,
    startedAt: processStartTime.toISOString(),
    commandLine: match[3]
  }
}

function isMinecraftServerCommand(commandLine: string): boolean {
  const normalizedCommand = commandLine.toLowerCase()

  return (
    normalizedCommand.includes('java') &&
    normalizedCommand.includes('server.jar') &&
    normalizedCommand.includes('nogui')
  )
}

function commandMatchesSession(commandLine: string, session: PersistedServerRuntimeSession): boolean {
  if (session.processTag === null) {
    return true
  }

  return commandLine.toLowerCase().includes(`-dchunkshare.sessionid=${session.processTag.toLowerCase()}`)
}

function isProcessDetails(value: unknown): value is ProcessDetails {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.processId === 'number' &&
    Number.isInteger(value.processId) &&
    value.processId > 0 &&
    typeof value.commandLine === 'string' &&
    typeof value.startedAt === 'string'
  )
}
