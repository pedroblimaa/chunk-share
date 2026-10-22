import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { ServerSetupProgressStep as Step } from '../../shared/server-setup'
import { installVanillaRuntime, type DistributionInstallOptions } from './vanilla-server-installer'
import { isFabricRuntime } from '../../shared/fabric'
import type { ServerConfig } from '../../shared/domain'
import type { WorldPaths } from '../storage/core/support/storage-paths'
import { getFabricLauncherUrl, validateFabricSelection } from './fabric-version-resolver'
import { ServerSetupError } from './server-setup-error'

export async function installServerDistribution(
  paths: Pick<WorldPaths, 'serverFolder' | 'serverJarFile' | 'serverModsFolder' | 'serverConfigFolder'>,
  config: ServerConfig,
  options: DistributionInstallOptions = {}
): Promise<void> {
  if (config.serverType === 'vanilla') {
    return installVanillaRuntime(paths, config.minecraftVersion, options)
  }
  if (config.serverType !== 'fabric') throw new ServerSetupError('Unsupported server type.')
  options.onProgress?.({ step: Step.ResolvingVersion })
  options.onProgress?.({ step: Step.DownloadingJar })
  await installFabricRuntime(paths, config)
  options.onProgress?.({ step: Step.VerifyingJar })
}

export async function installFabricRuntime(
  paths: Pick<WorldPaths, 'serverFolder' | 'serverJarFile' | 'serverModsFolder' | 'serverConfigFolder'>,
  config: ServerConfig
): Promise<void> {
  if (!isFabricRuntime(config.fabric)) throw new ServerSetupError('Fabric runtime versions are missing.')
  await validateFabricSelection(config.minecraftVersion, config.fabric)
  const response = await fetch(getFabricLauncherUrl(config.minecraftVersion, config.fabric))
  if (!response.ok)
    throw new ServerSetupError(`Unable to download Fabric launcher (HTTP ${response.status}).`)
  const launcher = Buffer.from(await response.arrayBuffer())
  if (launcher.length < 4 || launcher.readUInt32LE(0) !== 0x04034b50) {
    throw new ServerSetupError('The downloaded Fabric launcher is not a JAR archive.')
  }
  await mkdir(paths.serverFolder, { recursive: true })
  const temporaryJar = `${paths.serverJarFile}.tmp`
  try {
    await writeFile(temporaryJar, launcher)
    await rename(temporaryJar, paths.serverJarFile)
    await mkdir(paths.serverModsFolder, { recursive: true })
    await mkdir(paths.serverConfigFolder, { recursive: true })
  } finally {
    await rm(temporaryJar, { force: true })
  }
}
