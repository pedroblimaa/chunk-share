import { GoogleDriveSetupStatus } from '../../../../../../shared/cloud-storage.model'
import type { GoogleDriveStatusViewMap } from '../../settings.model'

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
