import type {
  CloudStorageProvider,
  CloudStorageProviderSwitchPreview,
  CloudStorageProviderSwitchRequest,
  CloudStorageSettings,
  StorageProviderCopyProgress
} from './cloud-storage.model'
import type { ServerDisplayState } from './dashboard'
import type { ServerConfig, ServerStorageSnapshot } from './domain'
import type {
  GoogleDriveInviteResult,
  GoogleDriveRevokeResult,
  GoogleDriveSharingAvailability
} from './drive-sharing.model'
import type { ServerRuntimeEvent, ServerRuntimeSnapshot } from './server-runtime'
import type {
  DownloadSharedServerInput,
  ServerSetupProgressEvent,
  SetupVanillaServerInput,
  VanillaMinecraftVersion
} from './server-setup'

export const AUTH_GET_SESSION_CHANNEL = 'auth:get-session'
export const AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL = 'auth:sign-in-with-google'
export const AUTH_SIGN_OUT_CHANNEL = 'auth:sign-out'

export const DASHBOARD_SNAPSHOT_CHANNEL = 'dashboard:get-snapshot'
export const DASHBOARD_SELECT_WORLD_CHANNEL = 'dashboard:select-world'

export const DRIVE_SHARING_GET_AVAILABILITY_CHANNEL = 'driveSharing:get-availability'
export const DRIVE_SHARING_INVITE_MEMBER_CHANNEL = 'driveSharing:invite-member'
export const DRIVE_SHARING_REVOKE_MEMBER_CHANNEL = 'driveSharing:revoke-member'

export const DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL = 'driveJoin:consume-pending-link'
export const DRIVE_JOIN_LINK_AVAILABLE_CHANNEL = 'driveJoin:link-available'
export const DRIVE_JOIN_WORLD_CHANNEL = 'driveJoin:join-world'

export const STORAGE_SNAPSHOT_CHANNEL = 'storage:get-snapshot'
export const STORAGE_CLOUD_SETTINGS_CHANNEL = 'storage:get-cloud-settings'
export const STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL = 'storage:setup-google-drive-folder'
export const STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL = 'storage:validate-google-drive-folder'
export const STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL = 'storage:clear-google-drive-folder'
export const STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL = 'storage:get-provider-switch-preview'
export const STORAGE_SET_PROVIDER_CHANNEL = 'storage:set-provider'
export const STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL = 'storage:provider-copy-progress'
export const STORAGE_SAVE_SERVER_CONFIG_CHANNEL = 'storage:save-server-config'
export const STORAGE_DELETE_SERVER_CHANNEL = 'storage:delete-server'
export const STORAGE_RESET_SERVER_LOCK_CHANNEL = 'storage:reset-server-lock'

export const SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL = 'serverSetup:list-vanilla-versions'
export const SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL = 'serverSetup:download-shared-server'
export const SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL = 'serverSetup:setup-vanilla-server'
export const SERVER_SETUP_PROGRESS_CHANNEL = 'serverSetup:progress'
export const SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL = 'serverRuntime:download-shared-save'
export const SERVER_RUNTIME_SNAPSHOT_CHANNEL = 'serverRuntime:get-snapshot'
export const SERVER_RUNTIME_START_CHANNEL = 'serverRuntime:start'
export const SERVER_RUNTIME_STOP_CHANNEL = 'serverRuntime:stop'
export const SERVER_RUNTIME_EVENTS_CHANNEL = 'serverRuntime:events'

export interface IpcInvokeContract {
  [AUTH_GET_SESSION_CHANNEL]: IpcOperation<[], ServerDisplayState>
  [AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL]: IpcOperation<[], ServerDisplayState>
  [AUTH_SIGN_OUT_CHANNEL]: IpcOperation<[], ServerDisplayState>
  [DASHBOARD_SNAPSHOT_CHANNEL]: IpcOperation<[], ServerDisplayState>
  [DASHBOARD_SELECT_WORLD_CHANNEL]: IpcOperation<[worldId: string], ServerDisplayState>
  [DRIVE_SHARING_GET_AVAILABILITY_CHANNEL]: IpcOperation<[], GoogleDriveSharingAvailability>
  [DRIVE_SHARING_INVITE_MEMBER_CHANNEL]: IpcOperation<[email: string], GoogleDriveInviteResult>
  [DRIVE_SHARING_REVOKE_MEMBER_CHANNEL]: IpcOperation<[permissionId: string], GoogleDriveRevokeResult>
  [DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL]: IpcOperation<[], string | null>
  [DRIVE_JOIN_WORLD_CHANNEL]: IpcOperation<[joinLink: string], ServerDisplayState>
  [STORAGE_SNAPSHOT_CHANNEL]: IpcOperation<[], ServerStorageSnapshot>
  [STORAGE_CLOUD_SETTINGS_CHANNEL]: IpcOperation<[], CloudStorageSettings>
  [STORAGE_SETUP_GOOGLE_DRIVE_FOLDER_CHANNEL]: IpcOperation<[], CloudStorageSettings>
  [STORAGE_VALIDATE_GOOGLE_DRIVE_FOLDER_CHANNEL]: IpcOperation<[], CloudStorageSettings>
  [STORAGE_CLEAR_GOOGLE_DRIVE_FOLDER_CHANNEL]: IpcOperation<[], CloudStorageSettings>
  [STORAGE_GET_PROVIDER_SWITCH_PREVIEW_CHANNEL]: IpcOperation<
    [provider: CloudStorageProvider],
    CloudStorageProviderSwitchPreview
  >
  [STORAGE_SET_PROVIDER_CHANNEL]: IpcOperation<
    [request: CloudStorageProviderSwitchRequest],
    CloudStorageSettings
  >
  [STORAGE_SAVE_SERVER_CONFIG_CHANNEL]: IpcOperation<[serverConfig: ServerConfig], ServerStorageSnapshot>
  [STORAGE_DELETE_SERVER_CHANNEL]: IpcOperation<[worldId: string], ServerStorageSnapshot>
  [STORAGE_RESET_SERVER_LOCK_CHANNEL]: IpcOperation<[], ServerStorageSnapshot>
  [SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL]: IpcOperation<[], VanillaMinecraftVersion[]>
  [SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL]: IpcOperation<
    [input: DownloadSharedServerInput],
    ServerStorageSnapshot
  >
  [SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL]: IpcOperation<
    [input: SetupVanillaServerInput],
    ServerStorageSnapshot
  >
  [SERVER_RUNTIME_DOWNLOAD_SHARED_SAVE_CHANNEL]: IpcOperation<[], ServerRuntimeSnapshot>
  [SERVER_RUNTIME_SNAPSHOT_CHANNEL]: IpcOperation<[], ServerRuntimeSnapshot>
  [SERVER_RUNTIME_START_CHANNEL]: IpcOperation<[], ServerRuntimeSnapshot>
  [SERVER_RUNTIME_STOP_CHANNEL]: IpcOperation<[], ServerRuntimeSnapshot>
}

export interface IpcEventContract {
  [DRIVE_JOIN_LINK_AVAILABLE_CHANNEL]: []
  [STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL]: [progress: StorageProviderCopyProgress]
  [SERVER_SETUP_PROGRESS_CHANNEL]: [event: ServerSetupProgressEvent]
  [SERVER_RUNTIME_EVENTS_CHANNEL]: [event: ServerRuntimeEvent]
}

interface IpcOperation<TArgs extends unknown[], TResult> {
  args: TArgs
  result: TResult
}
