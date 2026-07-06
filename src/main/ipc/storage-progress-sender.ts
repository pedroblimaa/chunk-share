import type { StorageProviderCopyProgress } from '../../shared/cloud-storage.model'
import { STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL } from '../../shared/ipc-channels'

export function createCopyProgressSender(
  sender: Electron.WebContents
): (progress: StorageProviderCopyProgress) => void {
  return (progress) => {
    if (!sender.isDestroyed()) {
      sender.send(STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL, progress)
    }
  }
}
