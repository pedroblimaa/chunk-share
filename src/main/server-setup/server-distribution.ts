import { mkdir, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { ServerConfig } from '../../shared/domain'
import { isFabricRuntime } from '../../shared/fabric'
import { ServerSetupProgressStep as Step } from '../../shared/server-setup'
import { getFabricGameJarFile, type WorldPaths } from '../storage/core/support/storage-paths'
import { getFabricLauncherUrl, validateFabricSelection } from './fabric-version-resolver'
import { ServerSetupError } from './server-setup-error'
import { installVanillaRuntime, type DistributionInstallOptions } from './vanilla-server-installer'

const ZIP_FILE_SIGNATURE = 0x04034b50

type ServerDistributionPaths = Pick<
  WorldPaths,
  'serverFolder' | 'serverJarFile' | 'serverModsFolder' | 'serverConfigFolder'
>

export async function installServerDistribution(
  paths: ServerDistributionPaths,
  config: ServerConfig,
  options: DistributionInstallOptions = {}
): Promise<void> {
  if (config.serverType === 'vanilla') {
    return installVanillaRuntime(paths, config.minecraftVersion, options)
  }

  if (config.serverType !== 'fabric') {
    throw new ServerSetupError('Unsupported server type.')
  }

  options.onProgress?.({ step: Step.ResolvingVersion })
  await installFabricRuntime(paths, config, () => options.onProgress?.({ step: Step.DownloadingJar }))
  options.onProgress?.({ step: Step.VerifyingJar })
}

export async function installFabricRuntime(
  paths: ServerDistributionPaths,
  config: ServerConfig,
  onDownloadStart?: () => void
): Promise<void> {
  if (!isFabricRuntime(config.fabric)) {
    throw new ServerSetupError('Fabric runtime versions are missing.')
  }

  await validateFabricSelection(config.minecraftVersion, config.fabric)
  onDownloadStart?.()

  const launcher = await downloadFabricLauncher(getFabricLauncherUrl(config.minecraftVersion, config.fabric))
  const temporaryJar = `${paths.serverJarFile}.tmp`

  await mkdir(paths.serverFolder, { recursive: true })

  try {
    await writeFile(temporaryJar, launcher)
    await rename(temporaryJar, paths.serverJarFile)
    await mkdir(paths.serverModsFolder, { recursive: true })
    await mkdir(paths.serverConfigFolder, { recursive: true })
  } finally {
    await rm(temporaryJar, { force: true })
  }
}

export async function ensureFabricGameJar(
  serverFolder: string,
  minecraftVersion: string,
  onDownloadStart?: () => void
): Promise<void> {
  const gameJarFile = getFabricGameJarFile(serverFolder, minecraftVersion)

  if (await isFile(gameJarFile)) {
    return
  }

  onDownloadStart?.()
  await installVanillaRuntime(
    { serverFolder: dirname(gameJarFile), serverJarFile: gameJarFile },
    minecraftVersion
  )
}

async function downloadFabricLauncher(launcherUrl: string): Promise<Buffer> {
  const response = await fetch(launcherUrl)

  if (!response.ok) {
    throw new ServerSetupError(`Unable to download Fabric launcher (HTTP ${response.status}).`)
  }

  const launcher = Buffer.from(await response.arrayBuffer())

  if (launcher.length < 4 || launcher.readUInt32LE(0) !== ZIP_FILE_SIGNATURE) {
    throw new ServerSetupError('The downloaded Fabric launcher is not a JAR archive.')
  }

  return launcher
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}
