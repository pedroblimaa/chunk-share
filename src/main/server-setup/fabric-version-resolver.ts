import { isFabricVersion, type FabricRuntime, type FabricVersionOptions } from '../../shared/fabric'
import type { VanillaMinecraftVersion } from '../../shared/server-setup'
import { ServerSetupError } from './server-setup-error'
import { listVanillaReleaseVersions } from './vanilla-version-resolver'

const FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions'
const MINIMUM_LOADER_MINOR = 12
const MINIMUM_INSTALLER_MINOR = 8

export async function listFabricReleaseVersions(): Promise<VanillaMinecraftVersion[]> {
  const [versions, games] = await Promise.all([listVanillaReleaseVersions(), fetchFabricMetadata('game')])
  const supported = new Set(games.filter((game) => game.stable === true).map((game) => game.version))
  return versions.filter(({ id }) => supported.has(id))
}

export async function getFabricVersionOptions(minecraftVersion: string): Promise<FabricVersionOptions> {
  if (!minecraftVersion.trim()) throw new ServerSetupError('Minecraft version is required.')
  const [loaders, installers] = await Promise.all([
    fetchFabricMetadata(`loader/${encodeURIComponent(minecraftVersion)}`),
    fetchFabricMetadata('installer')
  ])
  const versions = loaders.flatMap((entry) => {
    const loader = entry.loader
    return isRecord(loader) &&
      loader.stable === true &&
      isLauncherVersion(loader.version, MINIMUM_LOADER_MINOR)
      ? [loader.version]
      : []
  })
  const installer = installers.find(
    (entry) => entry.stable === true && isLauncherVersion(entry.version, MINIMUM_INSTALLER_MINOR)
  )
  if (!versions.length || !installer || !isFabricVersion(installer.version)) {
    throw new ServerSetupError(
      'No stable Fabric loader and installer are available for this Minecraft version.'
    )
  }
  return { loaders: versions, installerVersion: installer.version }
}

export async function validateFabricSelection(
  minecraftVersion: string,
  runtime: FabricRuntime
): Promise<void> {
  const [loaders, installers] = await Promise.all([
    fetchFabricMetadata(`loader/${encodeURIComponent(minecraftVersion)}`),
    fetchFabricMetadata('installer')
  ])
  if (
    !isLauncherVersion(runtime.loaderVersion, MINIMUM_LOADER_MINOR) ||
    !isLauncherVersion(runtime.installerVersion, MINIMUM_INSTALLER_MINOR)
  ) {
    throw new ServerSetupError('These Fabric versions do not support the executable server launcher.')
  }
  const hasLoader = loaders.some(
    (entry) =>
      isRecord(entry.loader) && entry.loader.version === runtime.loaderVersion && entry.loader.stable === true
  )
  const hasInstaller = installers.some(
    (entry) => entry.version === runtime.installerVersion && entry.stable === true
  )
  if (!hasLoader || !hasInstaller) throw new ServerSetupError('The selected Fabric version is unavailable.')
}

export function getFabricLauncherUrl(minecraftVersion: string, runtime: FabricRuntime): string {
  return `${FABRIC_META_URL}/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(runtime.loaderVersion)}/${encodeURIComponent(runtime.installerVersion)}/server/jar`
}

async function fetchFabricMetadata(path: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${FABRIC_META_URL}/${path}`)
  if (!response.ok) throw new ServerSetupError(`Unable to fetch Fabric versions (HTTP ${response.status}).`)
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(isRecord))
    throw new ServerSetupError('Invalid Fabric metadata response.')
  return data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLauncherVersion(value: unknown, minimumMinor: number): value is string {
  if (!isFabricVersion(value)) return false
  const [major = 0, minor = 0] = value.split('.').map(Number)
  return major > 0 || minor >= minimumMinor
}
