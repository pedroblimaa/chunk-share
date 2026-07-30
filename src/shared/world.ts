import type {
  CloudStorageProvider,
  GoogleDriveSetupState,
  GoogleDriveWorldState
} from './cloud-storage.model'
import type { JavaConfig, Player, ServerConfig, ServerSetupState } from './domain'

const WORLD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type WorldId = string

export interface LocalWorldState {
  id: WorldId
  createdAt: string
  serverConfig: ServerConfig
  javaConfig: JavaConfig
  serverSetup: ServerSetupState
  localSaveVersion: number | null
  activeSessionId: string | null
  dirty: boolean
  googleDrive: GoogleDriveWorldState | null
}

export interface AppState {
  player: Player | null
  selectedWorldId: WorldId | null
  activeProvider: CloudStorageProvider
  googleDrive: GoogleDriveSetupState
  worlds: LocalWorldState[]
}

export function isWorldId(value: unknown): value is WorldId {
  return typeof value === 'string' && WORLD_ID_PATTERN.test(value)
}
