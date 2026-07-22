import { ipcMain } from 'electron'
import {
  DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL,
  DRIVE_JOIN_WORLD_CHANNEL
} from '../../../shared/ipc-channels'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import { consumePendingGoogleDriveJoinLink } from '../../cloud-storage/google-drive-join-link'
import { joinGoogleDriveWorld } from '../../cloud-storage/google-drive-join-service'

export function registerDriveJoinIpcHandlers(): void {
  ipcMain.handle(DRIVE_JOIN_CONSUME_PENDING_LINK_CHANNEL, () => consumePendingGoogleDriveJoinLink())

  ipcMain.handle(DRIVE_JOIN_WORLD_CHANNEL, (_, joinLink: unknown) => {
    if (typeof joinLink !== 'string') {
      throw new GoogleDriveError('Paste a valid ChunkShare join link.')
    }

    return joinGoogleDriveWorld(joinLink)
  })
}
