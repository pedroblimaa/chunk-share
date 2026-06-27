import type { ServerRecoveryProgressCopyMap } from './ServerRecoveryPanel.model'

export const SERVER_RECOVERY_PROGRESS_COPY: ServerRecoveryProgressCopyMap = {
  starting: {
    label: 'Starting recovery...',
    description: 'Minecraft is loading the local world and checking that it can run.'
  },
  saving: {
    label: 'Saving recovered world...',
    description: 'Minecraft loaded successfully and is performing a clean save and shutdown.'
  },
  publishing: {
    label: 'Publishing recovered world...',
    description: 'ChunkShare is uploading the clean save and releasing the hosting lock.'
  },
  restoring: {
    label: 'Restoring shared save...',
    description: 'ChunkShare is replacing the crashed local world with the last shared save.'
  }
}
