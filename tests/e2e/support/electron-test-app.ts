import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { GoogleAuthTokens } from '../../../src/main/auth/auth-model'
import { GOOGLE_AUTH_TOKENS_FILE_NAME } from '../../../src/main/auth/auth-constants'
import { DEFAULT_APP_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import type { Player } from '../../../src/shared/domain'
import type { AppState } from '../../../src/shared/world'
import {
  GOOGLE_TEST_ACCOUNTS,
  type GoogleTestAccountName
} from '../../support/google-drive/google-drive-test-environment'
import { E2EUser } from './e2e-user'
import { installGoogleE2EMocks } from './google-e2e-mocks'
import type { GoogleDriveE2EMock } from './google-drive-e2e-mock'

const require = createRequire(__filename)
const PROJECT_ROOT = process.cwd()
const ELECTRON_EXECUTABLE_PATH = require('electron') as string
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const VERSION_METADATA_URL = 'https://minecraft.e2e/version.json'
const SERVER_JAR_URL = 'https://minecraft.e2e/server.jar'
const SERVER_JAR_CONTENT = Buffer.from('chunkshare-e2e-server')
const E2E_SHARED_MINECRAFT_VERSION = '1.21.8'

export const E2E_MINECRAFT_VERSION = '1.21.8-e2e'
export const E2E_SERVER_NAME = 'E2E Survival'
export const E2E_WORLD_DATA = 'chunkshare-e2e-world'

const E2E_PLAYER: Player = {
  id: 'e2e-player',
  displayName: 'E2E Player',
  email: 'e2e@example.com',
  avatarUrl: null,
  avatarInitials: 'EP'
}

const E2E_AUTH_TOKENS: GoogleAuthTokens = {
  accessToken: 'e2e-access-token',
  refreshToken: 'e2e-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scope: 'openid email profile'
}

export interface ElectronE2EPaths {
  localStateFile: string
  root: string
  userDataFolder: string
}

export interface ElectronE2EWorldPaths {
  controlFile: string
  serverFolder: string
  worldFile: string
}

export interface LaunchChunkShareE2EAppOptions {
  accountName?: GoogleTestAccountName
  authenticated?: boolean
  driveMock?: GoogleDriveE2EMock
  paths?: ElectronE2EPaths
}

export interface CloseChunkShareE2EAppOptions {
  preserveData?: boolean
}

export interface ChunkShareE2EApp {
  crashMinecraftServer: () => Promise<void>
  electronApp: ElectronApplication
  page: Page
  paths: ElectronE2EPaths
  setJavaInspectionDelay: (delayMs: number) => Promise<void>
  user: E2EUser
  close: (options?: CloseChunkShareE2EAppOptions) => Promise<void>
}

interface MinecraftServerMockDiagnostics {
  readyOutputEmittedAt: string | null
  readyOutputWriteCompletedAt: string | null
  spawnCalledAt: string | null
  stdoutDataListenerAttachedAt: string | null
  stdoutDataListenerCountAtEmission: number | null
}

export async function launchChunkShareE2EApp(
  options: LaunchChunkShareE2EAppOptions = {}
): Promise<ChunkShareE2EApp> {
  const paths = options.paths ?? createElectronE2EPaths()
  const authenticated = options.authenticated ?? true
  const identity = getE2EIdentity(options.accountName)
  await prepareE2EStorage(paths, authenticated, identity.player)

  const electronApp = await electron.launch({
    args: [`--user-data-dir=${paths.userDataFolder}`, '--password-store=basic', PROJECT_ROOT],
    chromiumSandbox: false,
    cwd: PROJECT_ROOT,
    env: createE2EEnvironment(paths),
    executablePath: ELECTRON_EXECUTABLE_PATH
  })

  try {
    const page = await electronApp.firstWindow()
    await configureE2ESafeStorage(electronApp)
    await installGoogleE2EMocks(electronApp, {
      accountName: options.accountName ?? null,
      driveMockUrl: options.driveMock?.url ?? null,
      ...identity
    })
    await installMainProcessMocks(electronApp)

    if (authenticated) {
      await seedAuthTokensIfMissing(electronApp, identity.tokens)
      await page.reload()
    }

    return {
      crashMinecraftServer: () => crashMinecraftServer(electronApp),
      electronApp,
      page,
      paths,
      setJavaInspectionDelay: (delayMs) => setJavaInspectionDelay(electronApp, delayMs),
      user: new E2EUser(page),
      close: createCloseApp(electronApp, paths.root)
    }
  } catch (error) {
    await electronApp.close().catch(() => undefined)
    await rm(paths.root, { force: true, recursive: true })
    throw error
  }
}

export async function expectServerRunning(app: ChunkShareE2EApp): Promise<void> {
  try {
    await expect(app.page.getByText('RUNNING', { exact: true })).toBeVisible()
  } catch (error) {
    const diagnostics = await readMinecraftServerMockDiagnostics(app.electronApp)
    const diagnosticsJson = JSON.stringify(diagnostics, null, 2)

    console.error(`[E2E Minecraft startup diagnostics]\n${diagnosticsJson}`)
    await test
      .info()
      .attach('minecraft-startup-diagnostics', {
        body: Buffer.from(diagnosticsJson),
        contentType: 'application/json'
      })
      .catch(() => undefined)

    throw error
  }
}

async function crashMinecraftServer(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(() => {
    const testGlobal = globalThis as typeof globalThis & {
      chunkShareE2EServerProcess?: { emit: (event: string, exitCode: number) => void }
    }

    if (!testGlobal.chunkShareE2EServerProcess) {
      throw new Error('The E2E Minecraft process is not running.')
    }

    testGlobal.chunkShareE2EServerProcess.emit('close', 1)
  })
}

async function setJavaInspectionDelay(electronApp: ElectronApplication, delayMs: number): Promise<void> {
  await electronApp.evaluate((_electronModule, value) => {
    const testGlobal = globalThis as typeof globalThis & {
      chunkShareE2EJavaInspectionDelayMs?: number
    }

    testGlobal.chunkShareE2EJavaInspectionDelayMs = value
  }, delayMs)
}

export function createElectronE2EPaths(): ElectronE2EPaths {
  const root = resolve(PROJECT_ROOT, '.test-data', 'e2e', `${process.pid}-${randomUUID()}`)
  return {
    localStateFile: join(root, 'localState.json'),
    root,
    userDataFolder: join(root, 'user-data')
  }
}

export async function readSelectedWorldE2EPaths(paths: ElectronE2EPaths): Promise<ElectronE2EWorldPaths> {
  const appState = JSON.parse(await readFile(paths.localStateFile, 'utf8')) as AppState

  if (!appState.selectedWorldId) {
    throw new Error('Expected an E2E world to be selected.')
  }

  const storageFolder = join(paths.root, '.storage', appState.selectedWorldId)

  return {
    controlFile: join(storageFolder, 'control.json'),
    serverFolder: join(paths.root, '.servers', appState.selectedWorldId),
    worldFile: join(storageFolder, 'world.zip')
  }
}

async function prepareE2EStorage(
  paths: ElectronE2EPaths,
  authenticated: boolean,
  player: Player
): Promise<void> {
  await mkdir(paths.root, { recursive: true })
  if (await fileExists(paths.localStateFile)) {
    return
  }

  await writeFile(
    paths.localStateFile,
    JSON.stringify(
      {
        ...DEFAULT_APP_STATE,
        player: authenticated ? player : null
      },
      null,
      2
    )
  )
}

function createE2EEnvironment(paths: ElectronE2EPaths): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const relativeRoot = relative(PROJECT_ROOT, paths.root)

  delete environment.ELECTRON_RUN_AS_NODE

  return {
    ...environment,
    CHUNK_SHARE_DATA_ROOT: relativeRoot,
    CHUNKSHARE_GOOGLE_CLIENT_ID: 'e2e-google-client-id',
    CHUNKSHARE_GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret'
  }
}

async function configureE2ESafeStorage(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ safeStorage }) => {
    if (process.platform === 'linux') {
      safeStorage.setUsePlainTextEncryption(true)
    }
  })
}

async function installMainProcessMocks(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    async (_electronModule, fixture) => {
      const childProcess = process.getBuiltinModule('node:child_process')
      const events = process.getBuiltinModule('node:events')
      const fileSystem = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      const stream = process.getBuiltinModule('node:stream')
      const googleFetch = globalThis.fetch
      const testGlobal = globalThis as typeof globalThis & {
        chunkShareE2EJavaInspectionDelayMs?: number
        chunkShareE2EServerProcess?: { emit: (event: string, exitCode: number) => void }
        chunkShareE2EServerMockDiagnostics?: MinecraftServerMockDiagnostics
      }
      const createDiagnostics = (): MinecraftServerMockDiagnostics => ({
        readyOutputEmittedAt: null,
        readyOutputWriteCompletedAt: null,
        spawnCalledAt: null,
        stdoutDataListenerAttachedAt: null,
        stdoutDataListenerCountAtEmission: null
      })

      testGlobal.chunkShareE2EServerMockDiagnostics = createDiagnostics()

      globalThis.fetch = async (input, init): Promise<Response> => {
        const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

        if (requestUrl === fixture.versionManifestUrl) {
          return Response.json({
            versions: fixture.minecraftVersions.map((id) => ({
              id,
              type: 'release',
              url: fixture.versionMetadataUrl
            }))
          })
        }

        if (requestUrl === fixture.versionMetadataUrl) {
          return Response.json({
            javaVersion: { majorVersion: 21 },
            downloads: {
              server: {
                sha1: fixture.serverJarSha1,
                size: fixture.serverJarSize,
                url: fixture.serverJarUrl
              }
            }
          })
        }

        if (requestUrl === fixture.serverJarUrl) {
          return new Response(Buffer.from(fixture.serverJarBase64, 'base64'))
        }

        return googleFetch(input, init)
      }

      Object.defineProperty(childProcess, 'spawn', {
        configurable: true,
        value: (_command: string, _args: readonly string[], options: { cwd?: string }) => {
          const serverProcess = new events.EventEmitter()
          const stdout = new stream.PassThrough()
          const stderr = new stream.PassThrough()
          const diagnostics = createDiagnostics()

          diagnostics.spawnCalledAt = new Date().toISOString()
          testGlobal.chunkShareE2EServerMockDiagnostics = diagnostics
          stdout.once('newListener', (eventName: string | symbol) => {
            if (eventName === 'data') {
              diagnostics.stdoutDataListenerAttachedAt = new Date().toISOString()
            }
          })
          const stdin = new stream.Writable({
            write(chunk, _encoding, callback) {
              const command = chunk.toString()

              if (command === 'save-all flush\n') {
                if (!options.cwd) {
                  throw new Error('Expected Minecraft to start with a world-scoped working directory.')
                }

                const serverFolder = options.cwd
                const worldFolder = path.join(serverFolder, 'world')
                fileSystem.mkdirSync(worldFolder, { recursive: true })
                fileSystem.writeFileSync(path.join(worldFolder, 'level.dat'), fixture.worldData, 'utf8')
              }

              if (command === 'stop\n') {
                queueMicrotask(() => serverProcess.emit('close', 0))
              }

              callback()
            }
          })

          Object.assign(serverProcess, {
            connected: false,
            exitCode: null,
            killed: false,
            kill: () => {
              queueMicrotask(() => serverProcess.emit('close', 1))
              return true
            },
            pid: 12345,
            signalCode: null,
            spawnargs: [],
            spawnfile: 'java',
            stderr,
            stdin,
            stdio: [stdin, stdout, stderr],
            stdout
          })
          testGlobal.chunkShareE2EServerProcess = serverProcess

          setImmediate(() => {
            diagnostics.readyOutputEmittedAt = new Date().toISOString()
            diagnostics.stdoutDataListenerCountAtEmission = stdout.listenerCount('data')
            stdout.write('[Server thread/INFO]: Done (1.000s)! For help, type "help"\n', () => {
              diagnostics.readyOutputWriteCompletedAt = new Date().toISOString()
            })
          })

          return serverProcess
        }
      })
      Object.defineProperty(childProcess, 'execFile', {
        configurable: true,
        value: (
          _command: string,
          _args: readonly string[],
          _options: unknown,
          callback: (error: null, stdout: string, stderr: string) => void
        ) => {
          setTimeout(
            () => callback(null, '', 'openjdk version "21.0.1"'),
            testGlobal.chunkShareE2EJavaInspectionDelayMs ?? 0
          )
        }
      })
    },
    {
      minecraftVersions: [E2E_MINECRAFT_VERSION, E2E_SHARED_MINECRAFT_VERSION],
      serverJarBase64: SERVER_JAR_CONTENT.toString('base64'),
      serverJarSha1: createHash('sha1').update(SERVER_JAR_CONTENT).digest('hex'),
      serverJarSize: SERVER_JAR_CONTENT.length,
      serverJarUrl: SERVER_JAR_URL,
      versionManifestUrl: VERSION_MANIFEST_URL,
      versionMetadataUrl: VERSION_METADATA_URL,
      worldData: E2E_WORLD_DATA
    }
  )
}

async function readMinecraftServerMockDiagnostics(
  electronApp: ElectronApplication
): Promise<MinecraftServerMockDiagnostics | { diagnosticError: string }> {
  try {
    return await electronApp.evaluate(() => {
      const testGlobal = globalThis as typeof globalThis & {
        chunkShareE2EServerMockDiagnostics?: MinecraftServerMockDiagnostics
      }

      return (
        testGlobal.chunkShareE2EServerMockDiagnostics ?? {
          diagnosticError: 'Minecraft server mock diagnostics were not initialized.'
        }
      )
    })
  } catch (error) {
    return {
      diagnosticError: error instanceof Error ? error.message : 'Unable to read diagnostics.'
    }
  }
}

async function seedAuthTokensIfMissing(
  electronApp: ElectronApplication,
  tokens: GoogleAuthTokens
): Promise<void> {
  await electronApp.evaluate(
    async ({ app, safeStorage }, fixture) => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Electron safeStorage is unavailable for the E2E session.')
      }

      const fileSystem = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      const tokenFilePath = path.join(app.getPath('userData'), fixture.tokenFileName)

      try {
        await fileSystem.promises.access(tokenFilePath)
        return
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error
        }
      }

      const encryptedTokens = safeStorage.encryptString(JSON.stringify(fixture.tokens)).toString('base64')

      await fileSystem.promises.mkdir(path.dirname(tokenFilePath), { recursive: true })
      await fileSystem.promises.writeFile(tokenFilePath, JSON.stringify({ encryptedTokens }, null, 2), 'utf8')
    },
    {
      tokenFileName: GOOGLE_AUTH_TOKENS_FILE_NAME,
      tokens
    }
  )
}

function createCloseApp(
  electronApp: ElectronApplication,
  root: string
): (options?: CloseChunkShareE2EAppOptions) => Promise<void> {
  let isClosed = false

  return async (options = {}) => {
    if (isClosed) {
      return
    }

    isClosed = true

    try {
      await electronApp.close()
    } finally {
      if (!options.preserveData) {
        await rm(root, { force: true, recursive: true })
      }
    }
  }
}

interface E2EIdentity {
  player: Player
  tokens: GoogleAuthTokens
}

function getE2EIdentity(accountName?: GoogleTestAccountName): E2EIdentity {
  return accountName
    ? {
        player: GOOGLE_TEST_ACCOUNTS[accountName].session.player,
        tokens: GOOGLE_TEST_ACCOUNTS[accountName].session.tokens
      }
    : {
        player: E2E_PLAYER,
        tokens: E2E_AUTH_TOKENS
      }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}
