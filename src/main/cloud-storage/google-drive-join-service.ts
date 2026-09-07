import { ServerAvailability, type ServerDisplayState } from '../../shared/dashboard'
import { authorizeGoogleDriveFiles } from '../auth/auth-service'
import { getServerDisplayState } from '../dashboard/dashboard-service'
import { parseGoogleDriveJoinLink } from './google-drive-join-link'
import { activateSharedGoogleDriveWorld } from '../storage/core/cloud-storage-service'
import { StorageError } from '../storage/core/support/storage-error'
import { readCloudStorageSettings, readLocalState } from '../storage/persistence/local-state-store'
import { GoogleDriveSetupStatus } from '../../shared/cloud-storage.model'

export async function joinGoogleDriveWorld(joinLink: string): Promise<ServerDisplayState> {
  const reference = parseGoogleDriveJoinLink(joinLink)

  const [currentState, localState, storageSettings] = await Promise.all([
    getServerDisplayState(),
    readLocalState(),
    readCloudStorageSettings()
  ])
  const hasAvailableServer = currentState.serverAvailability !== ServerAvailability.None
  const hasServerSetup = localState.serverSetup.status !== 'not-configured'

  if (hasAvailableServer || hasServerSetup) {
    throw new StorageError('Finish or remove the current server setup before joining another world.')
  }

  if (
    storageSettings.googleDrive.status !== GoogleDriveSetupStatus.Valid ||
    !storageSettings.googleDrive.rootFolderId
  ) {
    throw new StorageError('Set up Google Drive in Settings before joining a shared world.')
  }

  await authorizeGoogleDriveFiles([reference.controlFileId, reference.worldFileId])
  await activateSharedGoogleDriveWorld(reference)

  return getServerDisplayState()
}
