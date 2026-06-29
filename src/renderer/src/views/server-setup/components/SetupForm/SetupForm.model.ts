import type { SetupVanillaServerInput, VanillaMinecraftVersion } from '../../../../../../shared/server-setup'

export interface SetupFormProps {
  disabled: boolean
  onCancel: () => void
  onRetryVersions: () => void
  onSubmit: (input: SetupVanillaServerInput) => void
  versions: VanillaMinecraftVersion[]
  versionsErrorMessage: string | null
  versionsLoading: boolean
}

export interface SetupFormState {
  eulaAccepted: boolean
  minecraftVersion: string
  name: string
  port: string
  serverType: string
}

export type SetupFieldName = keyof SetupFormState

export const DEFAULT_SETUP_FORM_STATE: SetupFormState = {
  eulaAccepted: false,
  minecraftVersion: '',
  name: '',
  port: '25565',
  serverType: 'Vanilla'
}
