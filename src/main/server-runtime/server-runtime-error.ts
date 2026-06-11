export class ServerRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerRuntimeError'
  }
}
