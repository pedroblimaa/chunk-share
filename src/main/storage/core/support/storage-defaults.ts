import { ServerLockStatus } from '../../../../shared/domain'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../../shared/cloud-storage.model'
import type { CloudStorageSettings } from '../../../../shared/cloud-storage.model'
import type {
  JavaConfig,
  LatestSave,
  LocalState,
  ServerConfig,
  ServerLock,
  ServerSetupState
} from '../../../../shared/domain'
import type { StorageControl } from '../../adapters/storage-adapter.model'

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  name: 'Vanilla Survival',
  serverType: 'vanilla',
  minecraftVersion: '1.20.1',
  serverFolderPath: null,
  port: 25565
}

export const DEFAULT_JAVA_CONFIG: JavaConfig = {
  mode: 'system',
  executablePath: null,
  detectedVersion: null,
  isValidated: false
}

export const DEFAULT_LATEST_SAVE: LatestSave = null

export const DEFAULT_SERVER_LOCK: ServerLock = {
  status: ServerLockStatus.Unlocked
}

export const DEFAULT_STORAGE_CONTROL: StorageControl = {
  formatVersion: 1,
  latestSave: DEFAULT_LATEST_SAVE,
  serverLock: DEFAULT_SERVER_LOCK,
  storageMutation: null
}

export const DEFAULT_SERVER_SETUP_STATE: ServerSetupState = {
  status: 'not-configured',
  errorMessage: null,
  completedAt: null
}

export const DEFAULT_CLOUD_STORAGE_SETTINGS: CloudStorageSettings = {
  activeProvider: CloudStorageProvider.Local,
  googleDrive: {
    status: GoogleDriveSetupStatus.NotConfigured,
    folder: null,
    errorMessage: null
  }
}

export const DEFAULT_LOCAL_STATE: LocalState = {
  player: null,
  serverConfig: DEFAULT_SERVER_CONFIG,
  javaConfig: DEFAULT_JAVA_CONFIG,
  serverSetup: DEFAULT_SERVER_SETUP_STATE,
  localSaveVersion: null,
  activeSessionId: null,
  dirty: false
}
