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
