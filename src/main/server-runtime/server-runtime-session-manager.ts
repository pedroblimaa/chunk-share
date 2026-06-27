import { ServerRuntimeError } from './server-runtime-error'
import { writePersistedServerRuntimeSession } from './server-runtime-state-store'
import type { PersistedServerRuntimeSession } from './server-runtime.model'

export class ServerRuntimeSessionManager {
  private session: PersistedServerRuntimeSession | null = null

  get current(): PersistedServerRuntimeSession | null {
    return this.session
  }

  restore(session: PersistedServerRuntimeSession): void {
    this.session = session
  }

  async replace(session: PersistedServerRuntimeSession): Promise<void> {
    this.session = session
    await writePersistedServerRuntimeSession(session)
  }

  async create(sessionId: string): Promise<void> {
    await this.replace({
      phase: 'lock-acquired',
      processId: null,
      processTag: null,
      sessionId,
      startedAt: new Date().toISOString()
    })
  }

  async markLaunching(): Promise<void> {
    const session = this.requirePhase('lock-acquired')

    await this.replace({
      ...session,
      phase: 'launching',
      processTag: session.sessionId,
      startedAt: new Date().toISOString()
    })
  }

  async markProcessStarted(processId: number): Promise<void> {
    const session = this.requirePhase('launching')

    await this.replace({
      ...session,
      phase: 'process-started',
      processId
    })
  }

  async markReady(): Promise<void> {
    const session = this.requirePhase('process-started')

    await this.replace({
      ...session,
      phase: 'ready'
    })
  }

  async markPublished(): Promise<void> {
    const session = this.requirePhase('process-started', 'ready')

    await this.replace({
      ...session,
      phase: 'published',
      processId: null
    })
  }

  async clear(): Promise<void> {
    await writePersistedServerRuntimeSession(null)
    this.session = null
  }

  forget(): void {
    this.session = null
  }

  private requirePhase(
    ...allowedPhases: PersistedServerRuntimeSession['phase'][]
  ): PersistedServerRuntimeSession {
    if (!this.session || !allowedPhases.includes(this.session.phase)) {
      throw new ServerRuntimeError(
        `Cannot update persisted server session from phase ${this.session?.phase ?? 'none'}.`
      )
    }

    return this.session
  }
}
