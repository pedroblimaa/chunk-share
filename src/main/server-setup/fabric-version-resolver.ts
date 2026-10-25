import { isFabricVersion, type FabricRuntime, type FabricVersionOptions } from '../../shared/fabric'
import type { VanillaMinecraftVersion } from '../../shared/server-setup'
import { ServerSetupError } from './server-setup-error'
import { listVanillaReleaseVersions } from './vanilla-version-resolver'

export const FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions'

const MINIMUM_LAUNCHER_LOADER_MINOR = 12
const MINIMUM_LAUNCHER_INSTALLER_MINOR = 8

const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

interface FabricMetaVersion {
  version: string
  isStable: boolean
}

interface LauncherFabricVersions {
  loaders: FabricMetaVersion[]
  installers: FabricMetaVersion[]
}

export async function listFabricReleaseVersions(): Promise<VanillaMinecraftVersion[]> {
  const [vanillaVersions, games] = await Promise.all([
    listVanillaReleaseVersions(),
    fetchFabricMetadata('game')
  ])
  const supportedVersions = new Set(games.filter(isStableEntry).map((game) => game.version))

  return vanillaVersions.filter(({ id }) => supportedVersions.has(id))
}

export async function getFabricVersionOptions(minecraftVersion: string): Promise<FabricVersionOptions> {
  if (!minecraftVersion.trim()) {
    throw new ServerSetupError('Minecraft version is required.')
  }

  const { loaders, installers } = await fetchLauncherFabricVersions(minecraftVersion)
  const releaseLoaders = sortStableFirst(loaders.filter(isReleaseVersion))
  const installer = installers.find(({ isStable }) => isStable) ?? installers.find(isReleaseVersion)

  if (!releaseLoaders.length || !installer) {
    throw new ServerSetupError('No Fabric loader and installer are available for this Minecraft version.')
  }

  return {
    loaders: releaseLoaders.map(({ version }) => version),
    installerVersion: installer.version
  }
}

export async function validateFabricSelection(
  minecraftVersion: string,
  runtime: FabricRuntime
): Promise<void> {
  const { loaders, installers } = await fetchLauncherFabricVersions(minecraftVersion)
  const hasLoader = loaders.some(({ version }) => version === runtime.loaderVersion)
  const hasInstaller = installers.some(({ version }) => version === runtime.installerVersion)

  if (!hasLoader || !hasInstaller) {
    throw new ServerSetupError('The selected Fabric version is unavailable.')
  }
}

export function getFabricLauncherUrl(minecraftVersion: string, runtime: FabricRuntime): string {
  const path = [minecraftVersion, runtime.loaderVersion, runtime.installerVersion]
    .map(encodeURIComponent)
    .join('/')

  return `${FABRIC_META_URL}/loader/${path}/server/jar`
}

async function fetchLauncherFabricVersions(minecraftVersion: string): Promise<LauncherFabricVersions> {
  const [loaderEntries, installerEntries] = await Promise.all([
    fetchFabricMetadata(`loader/${encodeURIComponent(minecraftVersion)}`),
    fetchFabricMetadata('installer')
  ])

  return {
    loaders: getLauncherVersions(
      loaderEntries.map((entry) => entry.loader).filter(isRecord),
      MINIMUM_LAUNCHER_LOADER_MINOR
    ),
    installers: getLauncherVersions(installerEntries, MINIMUM_LAUNCHER_INSTALLER_MINOR)
  }
}

function getLauncherVersions(entries: Record<string, unknown>[], minimumMinor: number): FabricMetaVersion[] {
  return entries.flatMap((entry) =>
    isLauncherVersion(entry.version, minimumMinor)
      ? [{ version: entry.version, isStable: isStableEntry(entry) }]
      : []
  )
}

async function fetchFabricMetadata(path: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${FABRIC_META_URL}/${path}`)

  if (!response.ok) {
    throw new ServerSetupError(`Unable to fetch Fabric versions (HTTP ${response.status}).`)
  }

  const data: unknown = await response.json()

  if (!Array.isArray(data) || !data.every(isRecord)) {
    throw new ServerSetupError('Invalid Fabric metadata response.')
  }

  return data
}

function isLauncherVersion(version: unknown, minimumMinor: number): version is string {
  if (!isFabricVersion(version)) {
    return false
  }

  const [major = 0, minor = 0] = version.split('.').map(Number)

  return major > 0 || minor >= minimumMinor
}

function sortStableFirst(versions: FabricMetaVersion[]): FabricMetaVersion[] {
  return [...versions].sort((first, second) => Number(second.isStable) - Number(first.isStable))
}

function isReleaseVersion({ version }: FabricMetaVersion): boolean {
  return RELEASE_VERSION_PATTERN.test(version)
}

function isStableEntry(entry: Record<string, unknown>): boolean {
  return entry.stable === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
