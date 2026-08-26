import type { JavaConfig } from '../../shared/domain'
import type {
  JavaRuntimeCandidate,
  JavaRuntimeRequest,
  JavaRuntimeStatus,
  SaveJavaConfigRequest
} from '../../shared/java-runtime'
import { isWorldId } from '../../shared/world'
import { resolveRequiredJavaMajorVersion } from '../server-setup/vanilla-version-resolver'
import { readWorld, saveWorldJavaConfig } from '../storage/persistence/local-state-store'
import { isJavaConfig } from '../storage/core/support/storage-validation'
import { StorageError } from '../storage/core/support/storage-error'
import { discoverJavaRuntimes, inspectJavaRuntime } from './support/java-runtime-discovery'

interface JavaRuntimeResolution {
  selectedRuntime: JavaRuntimeCandidate | null
  errorMessage: string | null
}

export async function getJavaRuntimeStatus(request: unknown): Promise<JavaRuntimeStatus> {
  assertJavaRuntimeRequest(request)
  const requiredMajorVersion = await resolveRequiredJavaMajorVersion(
    request.minecraftVersion,
    request.minecraftVersionMetadataUrl
  )
  const candidates = await discoverJavaRuntimes()
  const validation = await resolveJavaRuntime(request.config, requiredMajorVersion, candidates)

  return { config: request.config, candidates, ...validation }
}

export async function getWorldJavaRuntimeStatus(
  worldId: string,
  minecraftVersion?: string
): Promise<JavaRuntimeStatus> {
  const world = await readWorld(worldId)

  try {
    return await getJavaRuntimeStatus({
      config: world.javaConfig,
      minecraftVersion: minecraftVersion ?? world.serverConfig.minecraftVersion
    })
  } catch (error) {
    return {
      config: world.javaConfig,
      candidates: [],
      selectedRuntime: null,
      errorMessage: error instanceof Error ? error.message : 'Unable to check Java compatibility.'
    }
  }
}

export async function saveJavaConfig(request: unknown): Promise<void> {
  assertSaveJavaConfigRequest(request)

  await saveWorldJavaConfig(request.worldId, request.config)
}

export async function validateJavaRuntime(
  config: JavaConfig,
  minecraftVersion: string,
  metadataUrl?: string
): Promise<JavaRuntimeCandidate> {
  const requiredMajorVersion = await resolveRequiredJavaMajorVersion(minecraftVersion, metadataUrl)
  const validation = await resolveJavaRuntime(config, requiredMajorVersion, await discoverJavaRuntimes())

  if (!validation.selectedRuntime) {
    throw new StorageError(validation.errorMessage ?? `Java ${requiredMajorVersion} or newer is required.`)
  }

  return validation.selectedRuntime
}

async function resolveJavaRuntime(
  config: JavaConfig,
  requiredMajorVersion: number,
  candidates: JavaRuntimeCandidate[]
): Promise<JavaRuntimeResolution> {
  if (config.mode === 'custom') {
    const selectedRuntime = config.executablePath ? await inspectJavaRuntime(config.executablePath) : null

    if (!selectedRuntime) {
      return {
        selectedRuntime: null,
        errorMessage: 'The selected Java executable could not be validated.'
      }
    }

    return selectedRuntime.majorVersion >= requiredMajorVersion
      ? { selectedRuntime, errorMessage: null }
      : {
          selectedRuntime: null,
          errorMessage: `Java ${requiredMajorVersion} or newer is required, but the selected runtime is Java ${selectedRuntime.majorVersion}.`
        }
  }

  const compatibleCandidates = candidates.filter(({ majorVersion }) => majorVersion >= requiredMajorVersion)
  const selectedRuntime =
    compatibleCandidates.find(({ majorVersion }) => majorVersion === requiredMajorVersion) ??
    compatibleCandidates[0] ??
    null

  return selectedRuntime
    ? { selectedRuntime, errorMessage: null }
    : {
        selectedRuntime: null,
        errorMessage: `Java ${requiredMajorVersion} or newer was not found. Install Java or select its executable manually.`
      }
}

function assertJavaRuntimeRequest(value: unknown): asserts value is JavaRuntimeRequest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('config' in value) ||
    !isJavaConfig(value.config) ||
    !('minecraftVersion' in value) ||
    typeof value.minecraftVersion !== 'string' ||
    !value.minecraftVersion.trim() ||
    ('minecraftVersionMetadataUrl' in value &&
      value.minecraftVersionMetadataUrl !== undefined &&
      (typeof value.minecraftVersionMetadataUrl !== 'string' || !value.minecraftVersionMetadataUrl.trim()))
  ) {
    throw new StorageError('Invalid Java runtime request.')
  }
}

function assertSaveJavaConfigRequest(value: unknown): asserts value is SaveJavaConfigRequest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('worldId' in value) ||
    !isWorldId(value.worldId) ||
    !('config' in value) ||
    !isJavaConfig(value.config)
  ) {
    throw new StorageError('Invalid Java configuration payload.')
  }
}
