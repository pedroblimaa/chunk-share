import { ServerAvailability, type ServerDisplayState } from '../../shared/dashboard'
import { authorizeGoogleDriveFolder } from '../auth/auth-service'
import { getServerDisplayState } from '../dashboard/dashboard-service'
import { parseGoogleDriveJoinLink } from './google-drive-join-link'
import { activateSharedGoogleDriveWorld } from '../storage/core/cloud-storage-service'
import { StorageError } from '../storage/core/support/storage-error'
import { readLocalState } from '../storage/persistence/local-state-store'

export async function joinGoogleDriveWorld(joinLink: string): Promise<ServerDisplayState> {
  const folderId = parseGoogleDriveJoinLink(joinLink)

  const [currentState, localState] = await Promise.all([getServerDisplayState(), readLocalState()])
  const hasAvailableServer = currentState.serverAvailability !== ServerAvailability.None
  const hasServerSetup = localState.serverSetup.status !== 'not-configured'

  if (hasAvailableServer || hasServerSetup) {
    throw new StorageError('Finish or remove the current server setup before joining another world.')
  }

  await authorizeGoogleDriveFolder(folderId)
  await activateSharedGoogleDriveWorld(folderId)

  return getServerDisplayState()
}
