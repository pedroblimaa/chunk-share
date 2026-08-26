import { EventEmitter } from 'events'
import { PassThrough, Writable } from 'stream'
import type { ChildProcessWithoutNullStreams } from 'child_process'

interface MinecraftSpawnInvocation {
  args: readonly string[]
  command: string
  options: {
    cwd?: string
    windowsHide?: boolean
  }
}

class MinecraftProcessMock extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly commands: string[] = []
  readonly stdin = new Writable({
    write: (chunk, _encoding, callback) => {
      const command = chunk.toString()
      this.commands.push(command)

      if (command === 'stop\n') {
        queueMicrotask(() => this.emit('close', 0))
      }

      callback()
    }
  })

  readonly stdio = [this.stdin, this.stdout, this.stderr] as const
  readonly killed = false
  readonly pid = 12345
  readonly connected = false
  readonly exitCode = null
  readonly signalCode = null
  readonly spawnargs: string[] = []
  readonly spawnfile = 'java'

  emitReady(): void {
    this.stdout.write('[Server thread/INFO]: Done (1.000s)! For help, type "help"\n')
  }

  kill(): boolean {
    queueMicrotask(() => this.emit('close', 1))
    return true
  }
}

let activeProcess: MinecraftProcessMock | null = null
let lastSpawnInvocation: MinecraftSpawnInvocation | null = null

export function spawnMinecraftProcess(
  command: string,
  args: readonly string[],
  options: MinecraftSpawnInvocation['options']
): ChildProcessWithoutNullStreams {
  lastSpawnInvocation = { args: [...args], command, options: { ...options } }
  activeProcess = new MinecraftProcessMock()
  return activeProcess as unknown as ChildProcessWithoutNullStreams
}

export function inspectJavaProcess(
  _command: string,
  _args: readonly string[],
  _options: unknown,
  callback: (error: Error | null, stdout: string, stderr: string) => void
): void {
  if (_command.includes('invalid-java')) {
    callback(new Error('Java not found'), '', '')
    return
  }
  callback(null, '', 'openjdk version "21.0.1"')
}

export function getMinecraftSpawnInvocation(): MinecraftSpawnInvocation {
  if (!lastSpawnInvocation) {
    throw new Error('Minecraft process has not been spawned.')
  }

  return lastSpawnInvocation
}

export function getMinecraftProcessMock(): MinecraftProcessMock {
  if (!activeProcess) {
    throw new Error('Minecraft process has not been started.')
  }

  return activeProcess
}

export function resetMinecraftProcessMock(): void {
  activeProcess = null
  lastSpawnInvocation = null
}
