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
import { isRecord } from '../shared/main-helpers'

export async function listVanillaReleaseVersions(): Promise<VanillaMinecraftVersion[]> {
  const manifest = await fetchJson<VersionManifest>(VANILLA_VERSION_MANIFEST_URL, isVersionManifest)

  return manifest.versions
    .filter((version) => version.type === 'release')
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
  if (!isRecord(value) || !isRecord(value.downloads)) {
    return false
  }

  return value.downloads.server === undefined || isServerDownloadMetadata(value.downloads.server)
}

function isServerDownloadMetadata(value: unknown): value is ServerDownloadMetadata {
  if (!isRecord(value)) {
    return false
  }

  return isString(value.sha1) && isPositiveInteger(value.size) && isString(value.url)
}
