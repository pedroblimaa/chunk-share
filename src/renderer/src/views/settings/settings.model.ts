import type { GoogleDriveSetupStatus } from '../../../../shared/cloud-storage.model'
import type { BadgeTone } from '../../components/shared/Badge/Badge.model'

export interface GoogleDriveStatusView {
  label: string
  tone: BadgeTone
}

export type GoogleDriveSettingsAction = 'load' | 'setup-default-folder' | 'validate-folder'

export type GoogleDriveSettingsActionState = GoogleDriveSettingsAction | null

export type GoogleDriveStatusViewMap = Record<GoogleDriveSetupStatus, GoogleDriveStatusView>
