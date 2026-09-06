import { ServerSetupError } from './server-setup-error'
import type { VanillaMinecraftVersion } from '../../shared/server-setup'
import {
  VANILLA_VERSION_MANIFEST_URL,
  type ServerDownloadMetadata,
  type VanillaServerDownload,
  type VersionManifest,
  type VersionManifestVersion,
  type VersionMetadata
} from './vanilla-version-model'

const UNSUPPORTED_VANILLA_SERVER_VERSION_IDS = new Set(['1.2.4', '1.2.3', '1.2.2', '1.2.1', '1.1', '1.0'])

export async function listVanillaReleaseVersions(): Promise<VanillaMinecraftVersion[]> {
  const manifest = await fetchJson<VersionManifest>(VANILLA_VERSION_MANIFEST_URL, isVersionManifest)

  return manifest.versions
    .filter(
      (version) => version.type === 'release' && !UNSUPPORTED_VANILLA_SERVER_VERSION_IDS.has(version.id)
    )
    .map((version) => ({
      id: version.id,
      metadataUrl: version.url
    }))
}

export async function resolveVanillaServerDownload(
  minecraftVersion: string,
  metadataUrl?: string
): Promise<VanillaServerDownload> {
  const versionMetadataUrl = metadataUrl ?? (await resolveVanillaVersionMetadataUrl(minecraftVersion))
  const versionMetadata = await fetchJson<VersionMetadata>(versionMetadataUrl, isVersionMetadata)
  const serverDownload = versionMetadata.downloads.server

  if (!serverDownload) {
    throw new ServerSetupError(
      `Minecraft release version "${minecraftVersion}" does not provide a server download.`
    )
  }

  return {
    minecraftVersion,
    serverJarUrl: serverDownload.url,
    sha1: serverDownload.sha1,
    size: serverDownload.size
  }
}

export async function resolveRequiredJavaMajorVersion(
  minecraftVersion: string,
  metadataUrl?: string
): Promise<number> {
  const versionMetadataUrl = metadataUrl ?? (await resolveVanillaVersionMetadataUrl(minecraftVersion))
  const versionMetadata = await fetchJson<VersionMetadata>(versionMetadataUrl, isVersionMetadata)

  return versionMetadata.javaVersion.majorVersion
}

async function resolveVanillaVersionMetadataUrl(minecraftVersion: string): Promise<string> {
  const manifest = await fetchJson<VersionManifest>(VANILLA_VERSION_MANIFEST_URL, isVersionManifest)
  const version = manifest.versions.find((v) => v.id === minecraftVersion && v.type === 'release')

  if (!version) {
    throw new ServerSetupError(`Minecraft release version "${minecraftVersion}" was not found.`)
  }

  return version.url
}

async function fetchJson<T>(url: string, validate: (value: unknown) => value is T): Promise<T> {
  let response: Response

  try {
    response = await fetch(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error.'
    throw new ServerSetupError(`Unable to fetch Minecraft metadata: ${message}`)
  }

  if (!response.ok) {
    throw new ServerSetupError(`Unable to fetch Minecraft metadata. Received HTTP ${response.status}.`)
  }

  const json: unknown = await response.json()

  if (!validate(json)) {
    throw new ServerSetupError('Minecraft metadata response has an unexpected shape.')
  }

  return json
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isVersionManifest(value: unknown): value is VersionManifest {
  if (!isRecord(value) || !Array.isArray(value.versions)) {
    return false
  }

  return value.versions.every(isVersionManifestVersion)
}

function isVersionManifestVersion(value: unknown): value is VersionManifestVersion {
  if (!isRecord(value)) {
    return false
  }

  return isString(value.id) && isString(value.type) && isString(value.url)
}

function isVersionMetadata(value: unknown): value is VersionMetadata {
  if (!isRecord(value) || !isRecord(value.javaVersion) || !isRecord(value.downloads)) {
    return false
  }

  return (
    isPositiveInteger(value.javaVersion.majorVersion) &&
    (value.downloads.server === undefined || isServerDownloadMetadata(value.downloads.server))
  )
}

function isServerDownloadMetadata(value: unknown): value is ServerDownloadMetadata {
  if (!isRecord(value)) {
    return false
  }

  return isString(value.sha1) && isPositiveInteger(value.size) && isString(value.url)
}
