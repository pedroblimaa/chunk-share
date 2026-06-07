export class ServerSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerSetupError'
  }
}
