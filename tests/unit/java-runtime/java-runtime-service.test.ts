import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({
  execFile: (
    command: string,
    _args: readonly string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void
  ) => {
    const versions: Record<string, string> = {
      [process.platform === 'win32' ? 'java.exe' : 'java']: '21.0.4',
      'C:\\Java17\\bin\\java.exe': '17.0.12',
      'C:\\Java21\\bin\\java.exe': '21.0.4'
    }
    const version = versions[command]
    if (!version) return callback(new Error('not found'), '', '')
    callback(null, '', `openjdk version "${version}"`)
  }
}))

import {
  inspectJavaRuntime,
  parseJavaVersion
} from '../../../src/main/java-runtime/support/java-runtime-discovery'
import { getJavaRuntimeStatus } from '../../../src/main/java-runtime/java-runtime-service'

const METADATA_URL = 'https://minecraft.test/version.json'
const SYSTEM_JAVA_EXECUTABLE = process.platform === 'win32' ? 'java.exe' : 'java'

describe('Java runtime selection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            javaVersion: { majorVersion: 21 },
            downloads: {}
          })
        )
      )
    )
  })

  it('parses modern and legacy Java version output', () => {
    expect(parseJavaVersion('openjdk version "21.0.4"')).toEqual({
      majorVersion: 21,
      version: '21.0.4'
    })
    expect(parseJavaVersion('java version "1.8.0_401"')).toEqual({
      majorVersion: 8,
      version: '1.8.0_401'
    })
  })

  it('automatically selects an exact compatible Java major', async () => {
    await expect(
      getJavaRuntimeStatus({
        config: { mode: 'system', executablePath: null },
        minecraftVersion: '1.21.8',
        minecraftVersionMetadataUrl: METADATA_URL
      })
    ).resolves.toMatchObject({
      errorMessage: null,
      selectedRuntime: { executablePath: SYSTEM_JAVA_EXECUTABLE, majorVersion: 21 }
    })
  })

  it('validates typed manual paths and reports incompatible versions', async () => {
    await expect(inspectJavaRuntime('C:\\Java21\\bin\\java.exe')).resolves.toMatchObject({
      majorVersion: 21
    })
    await expect(
      getJavaRuntimeStatus({
        config: { mode: 'custom', executablePath: 'C:\\Java17\\bin\\java.exe' },
        minecraftVersion: '1.21.8',
        minecraftVersionMetadataUrl: METADATA_URL
      })
    ).resolves.toMatchObject({
      selectedRuntime: null,
      errorMessage: expect.stringContaining('selected runtime is Java 17')
    })
  })
})
