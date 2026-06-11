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
