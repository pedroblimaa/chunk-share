import type { ServerRuntimeLogLine, ServerRuntimePlayers } from '../../shared/server-runtime'

type RuntimeLogTone = ServerRuntimeLogLine['tone']

const SERVER_READY_PATTERN = /Done \(.+\)! For help, type "help"/
const PLAYER_LIST_PATTERN = /There are (\d+) of a max of (\d+) players online/

export type MinecraftOutputEvent =
  | {
      type: 'players'
      players: ServerRuntimePlayers
    }
  | {
      type: 'log'
      message: string
      tone: RuntimeLogTone
    }
  | {
      type: 'ready'
    }
  | {
      type: 'java-version-mismatch'
      requiredJavaVersion: number
      currentJavaVersion: number
    }

export function parseMinecraftOutput(
  output: string,
  fallbackTone: RuntimeLogTone
): MinecraftOutputEvent[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => parseMinecraftOutputLine(line, fallbackTone))
}

function parseMinecraftOutputLine(
  line: string,
  fallbackTone: RuntimeLogTone
): MinecraftOutputEvent[] {
  const players = parsePlayers(line)

  if (players) {
    return [{ type: 'players', players }]
  }

  const events: MinecraftOutputEvent[] = [
    {
      type: 'log',
      message: line,
      tone: getLogTone(line, fallbackTone)
    }
  ]
  const javaVersionMismatch = parseJavaVersionMismatch(line)

  if (javaVersionMismatch) {
    events.push(javaVersionMismatch)
  }

  if (SERVER_READY_PATTERN.test(line)) {
    events.push({ type: 'ready' })
  }

  return events
}

function parsePlayers(line: string): ServerRuntimePlayers | null {
  const match = line.match(PLAYER_LIST_PATTERN)

  if (!match) {
    return null
  }

  return {
    online: Number(match[1]),
    max: Number(match[2])
  }
}

function parseJavaVersionMismatch(line: string): MinecraftOutputEvent | null {
  const match = line.match(/class file version (\d+)\.0.+up to (\d+)\.0/)

  if (!match) {
    return null
  }

  return {
    type: 'java-version-mismatch',
    requiredJavaVersion: getJavaVersionFromClassFileVersion(Number(match[1])),
    currentJavaVersion: getJavaVersionFromClassFileVersion(Number(match[2]))
  }
}

function getJavaVersionFromClassFileVersion(classFileVersion: number): number {
  if (classFileVersion === 45) {
    return 1
  }

  return classFileVersion - 44
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
