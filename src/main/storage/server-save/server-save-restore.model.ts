export type RestoreServerSavePhase = 'installing-server' | 'downloading' | 'extracting' | 'replacing-files'

export type RestoreServerSaveProgressListener = (phase: RestoreServerSavePhase) => void

export interface RestoreServerSaveOptions {
  confirmedFingerprint?: string
  initializeServer?: boolean
  onProgress?: RestoreServerSaveProgressListener
}
