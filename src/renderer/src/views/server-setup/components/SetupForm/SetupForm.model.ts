import type {
  SetupServerInput,
  SupportedServerType,
  VanillaMinecraftVersion
} from '../../../../../../shared/server-setup'
import type { JavaConfig } from '../../../../../../shared/domain'

export interface SetupFormProps {
  serverType: SupportedServerType
  onServerTypeChange: (serverType: SupportedServerType) => void
  disabled: boolean
  onCancel: () => void
  onRetryVersions: () => void
  onSubmit: (input: SetupServerInput) => void
  versions: VanillaMinecraftVersion[]
  versionsErrorMessage: string | null
  versionsLoading: boolean
}

export interface SetupFormState {
  eulaAccepted: boolean
  minecraftVersion: string
  name: string
  port: string
  loaderVersion: string
  javaConfig: JavaConfig
}

export type SetupFieldName = keyof SetupFormState

export const DEFAULT_SETUP_FORM_STATE: SetupFormState = {
  eulaAccepted: false,
  minecraftVersion: '',
  name: '',
  port: '25565',
  loaderVersion: '',
  javaConfig: { mode: 'system', executablePath: null }
}
