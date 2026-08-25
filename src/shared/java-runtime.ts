import type { JavaConfig } from './domain'
import type { WorldId } from './world'

export interface JavaRuntimeCandidate {
  executablePath: string
  version: string
  majorVersion: number
}

export interface JavaRuntimeStatus {
  config: JavaConfig
  candidates: JavaRuntimeCandidate[]
  selectedRuntime: JavaRuntimeCandidate | null
  errorMessage: string | null
}

export interface JavaRuntimeRequest {
  config: JavaConfig
  minecraftVersion: string
  minecraftVersionMetadataUrl?: string
}

export interface SaveJavaConfigRequest {
  worldId: WorldId
  config: JavaConfig
}
