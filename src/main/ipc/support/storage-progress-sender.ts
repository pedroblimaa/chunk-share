import type { StorageProviderCopyProgress } from '../../../shared/cloud-storage.model'
import { STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL } from '../../../shared/ipc-channels'
import { sendIpcEvent } from '../typed-ipc'

export function createCopyProgressSender(
  sender: Electron.WebContents
): (progress: StorageProviderCopyProgress) => void {
  return (progress) => {
    if (!sender.isDestroyed()) {
      sendIpcEvent(sender, STORAGE_PROVIDER_COPY_PROGRESS_CHANNEL, progress)
    }
  }
}
