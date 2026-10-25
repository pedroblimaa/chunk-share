import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, readFile, rename, rm, stat } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import { ServerSetupProgressStep as Step, type ServerSetupProgressEvent } from '../../shared/server-setup'
import type { WorldPaths } from '../storage/core/support/storage-paths'
import { ServerSetupError } from './server-setup-error'
import { resolveVanillaServerDownload } from './vanilla-version-resolver'

export interface DistributionInstallOptions {
  metadataUrl?: string
  onProgress?: (event: ServerSetupProgressEvent) => void
}

export async function installVanillaRuntime(
  paths: Pick<WorldPaths, 'serverFolder' | 'serverJarFile'>,
  minecraftVersion: string,
  options: DistributionInstallOptions = {}
): Promise<void> {
  const temporaryJar = `${paths.serverJarFile}.tmp`
  await mkdir(paths.serverFolder, { recursive: true })
  try {
    options.onProgress?.({ step: Step.ResolvingVersion })
    const download = await resolveVanillaServerDownload(minecraftVersion, options.metadataUrl)
    options.onProgress?.({ step: Step.DownloadingJar })
    await downloadServerJar(download.serverJarUrl, temporaryJar)
    options.onProgress?.({ step: Step.VerifyingJar })
    await verifyServerJar(temporaryJar, download.size, download.sha1)
    await rename(temporaryJar, paths.serverJarFile)
  } finally {
    await rm(temporaryJar, { force: true })
  }
}

async function downloadServerJar(serverJarUrl: string, serverJarTempFilePath: string): Promise<void> {
  let response: Response

  try {
    response = await fetch(serverJarUrl)
  } catch (error) {
    throw new ServerSetupError(`Unable to download Minecraft server jar: ${getErrorMessage(error)}`)
  }

  if (!response.ok) {
    throw new ServerSetupError(`Unable to download Minecraft server jar. Received HTTP ${response.status}.`)
  }

  if (!response.body) {
    throw new ServerSetupError('Minecraft server jar response did not include a body.')
  }

  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream),
    createWriteStream(serverJarTempFilePath)
  )
}

async function verifyServerJar(
  serverJarTempFilePath: string,
  expectedSize: number,
  expectedSha1: string
): Promise<void> {
  const fileStats = await stat(serverJarTempFilePath)

  if (fileStats.size !== expectedSize) {
    throw new ServerSetupError(
      `Downloaded server jar has unexpected size. Expected ${expectedSize} bytes, received ${fileStats.size} bytes.`
    )
  }

  const serverJar = await readFile(serverJarTempFilePath)
  const actualSha1 = createHash('sha1').update(serverJar).digest('hex')

  if (actualSha1 !== expectedSha1) {
    throw new ServerSetupError('Downloaded server jar failed integrity verification.')
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown download error.'
}
