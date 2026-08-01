import {
  DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL,
  DRIVE_JOIN_WORLD_CHANNEL
} from '../../../shared/ipc-channels'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import { consumePendingGoogleDriveJoinLink } from '../../cloud-storage/google-drive-join-link'
import { joinGoogleDriveWorld } from '../../cloud-storage/google-drive-join-service'
import { handleIpc } from '../typed-ipc'

export function registerDriveJoinIpcHandlers(): void {
  handleIpc(DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL, () => consumePendingGoogleDriveJoinLink())

  handleIpc(DRIVE_JOIN_WORLD_CHANNEL, (_, joinLink: unknown) => {
    if (typeof joinLink !== 'string') {
      throw new GoogleDriveError('Paste a valid ChunkShare join link.')
    }

    return joinGoogleDriveWorld(joinLink)
  })
}
