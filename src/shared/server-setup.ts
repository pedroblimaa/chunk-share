import type { JavaConfig, LocalState } from './domain'
import type { WorldId } from './world'

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

export interface SetupVanillaServerResult {
  worldId: WorldId | null
  localState: LocalState
}

export interface DownloadSharedServerInput {
  eulaAccepted: boolean
}

export enum ServerSetupProgressStep {
  CreatingFolder = 'creating-folder',
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
