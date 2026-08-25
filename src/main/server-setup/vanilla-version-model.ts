export const VANILLA_VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export interface VersionManifestVersion {
  id: string
  type: string
  url: string
}

export interface VersionManifest {
  versions: VersionManifestVersion[]
}

export interface ServerDownloadMetadata {
  sha1: string
  size: number
  url: string
}

export interface VersionMetadata {
  javaVersion: {
    majorVersion: number
  }
  downloads: {
    server?: ServerDownloadMetadata
  }
}

export interface VanillaServerDownload {
  minecraftVersion: string
  serverJarUrl: string
  sha1: string
  size: number
}
