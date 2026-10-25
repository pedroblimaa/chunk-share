import type { FabricRuntime } from './fabric'
import type { JavaConfig, LocalState, ServerType } from './domain'
import type { WorldId } from './world'

export const SUPPORTED_SERVER_TYPES = ['vanilla', 'fabric'] as const satisfies readonly ServerType[]

export type SupportedServerType = (typeof SUPPORTED_SERVER_TYPES)[number]

export interface VanillaMinecraftVersion {
  id: string
  metadataUrl: string
}

export interface SetupVanillaServerInput {
  name: string
  minecraftVersion: string
  minecraftVersionMetadataUrl?: string
  port: number
  eulaAccepted: boolean
  javaConfig: JavaConfig
}

export interface SetupServerInput extends SetupVanillaServerInput {
  serverType: SupportedServerType
  fabric?: FabricRuntime
}

export interface SetupServerResult {
  worldId: WorldId | null
  localState: LocalState
}

export interface DownloadSharedServerInput {
  eulaAccepted: boolean
}

export enum ServerSetupProgressStep {
  CreatingFolder = 'creating-folder',
  SettingUpGoogleDrive = 'setting-up-google-drive',
  ResolvingVersion = 'resolving-version',
  DownloadingJar = 'downloading-jar',
  VerifyingJar = 'verifying-jar',
  WritingProperties = 'writing-properties',
  WritingEula = 'writing-eula',
  Ready = 'ready'
}

export interface ServerSetupProgressEvent {
  step: ServerSetupProgressStep
}

export function isSupportedServerType(value: unknown): value is SupportedServerType {
  return SUPPORTED_SERVER_TYPES.some((serverType) => serverType === value)
}
