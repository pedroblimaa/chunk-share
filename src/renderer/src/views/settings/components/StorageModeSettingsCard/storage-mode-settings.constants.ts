import { GoogleDriveSetupStatus } from '../../../../../../shared/cloud-storage.model'
import type { GoogleDriveStatusViewMap } from '../../settings.model'

export const STORAGE_MODE_INFO =
  'ChunkShare can store shared saves locally or in the configured Google Drive folder.'

export const CLOUD_SWITCH_NOTE =
  'Google Drive must be configured and validated before it can become the active storage provider.'

export const GOOGLE_DRIVE_STATUS_VIEW: GoogleDriveStatusViewMap = {
  [GoogleDriveSetupStatus.NotConfigured]: {
    label: 'Not configured',
    tone: 'disabled'
  },
  [GoogleDriveSetupStatus.NeedsAuth]: {
    label: 'Needs permission',
    tone: 'warning'
  },
  [GoogleDriveSetupStatus.Valid]: {
    label: 'Configured',
    tone: 'active'
  },
  [GoogleDriveSetupStatus.Blocked]: {
    label: 'Blocked',
    tone: 'danger'
  }
}
