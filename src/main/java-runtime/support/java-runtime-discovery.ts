import { execFile } from 'child_process'
import { readdir } from 'fs/promises'
import { delimiter, join, normalize } from 'path'
import type { JavaRuntimeCandidate } from '../../../shared/java-runtime'

const JAVA_EXECUTABLE = process.platform === 'win32' ? 'java.exe' : 'java'
const JAVA_INSTALLATION_NAME = /(java|jdk|jre|temurin|corretto|zulu)/i
const MAX_INSTALLATION_SEARCH_DEPTH = 3

export async function discoverJavaRuntimes(): Promise<JavaRuntimeCandidate[]> {
  const candidatePaths = await getJavaCandidatePaths()
  const candidates = await Promise.all(candidatePaths.map(inspectJavaRuntime))

  return candidates.filter(isJavaRuntimeCandidate).sort(compareJavaRuntimes)
}

export async function inspectJavaRuntime(executablePath: string): Promise<JavaRuntimeCandidate | null> {
  const path = executablePath.trim()

  if (!path) {
    return null
  }

  try {
    const { stderr, stdout } = await runJavaVersionCommand(path)
    const version = parseJavaVersion(`${stderr}\n${stdout}`)

    return version ? { executablePath: path, ...version } : null
  } catch {
    return null
  }
}

export function parseJavaVersion(
  output: string
): Pick<JavaRuntimeCandidate, 'version' | 'majorVersion'> | null {
  const version = output.match(/(?:java|openjdk) version ["']?([^"'\s]+)/i)?.[1]

  if (!version) {
    return null
  }

  const versionParts = version.split('.')
  const majorVersion = Number(versionParts[0]) === 1 ? Number(versionParts[1]) : Number(versionParts[0])

  return Number.isSafeInteger(majorVersion) && majorVersion > 0 ? { version, majorVersion } : null
}

async function getJavaCandidatePaths(): Promise<string[]> {
  const executablePaths = [
    JAVA_EXECUTABLE,
    ...getPathDirectories().map((directory) => join(directory, JAVA_EXECUTABLE)),
    ...(process.env.JAVA_HOME ? [join(trimPath(process.env.JAVA_HOME), 'bin', JAVA_EXECUTABLE)] : [])
  ]
  const commonLocationPaths = await Promise.all(getCommonJavaRoots().map(findJavaExecutablesInRoot))

  return deduplicatePaths([...executablePaths, ...commonLocationPaths.flat()])
}

function getPathDirectories(): string[] {
  return (process.env.PATH ?? '').split(delimiter).map(trimPath).filter(Boolean)
}

function trimPath(path: string): string {
  return path.trim().replace(/^"|"$/g, '')
}

function getCommonJavaRoots(): string[] {
  if (process.platform === 'win32') {
    const programFilesRoots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
      (path): path is string => Boolean(path)
    )
    const vendorFolders = ['Java', 'Eclipse Adoptium', 'Microsoft', 'Amazon Corretto', 'Zulu']

    return programFilesRoots.flatMap((root) => vendorFolders.map((vendorFolder) => join(root, vendorFolder)))
  }

  return process.platform === 'darwin' ? ['/Library/Java/JavaVirtualMachines'] : ['/usr/lib/jvm']
}

async function findJavaExecutablesInRoot(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const installationPaths = entries
    .filter(
      (entry) => (entry.isDirectory() || entry.isSymbolicLink()) && JAVA_INSTALLATION_NAME.test(entry.name)
    )
    .map((entry) => join(root, entry.name))

  return (
    await Promise.all(
      installationPaths.map((path) => findJavaExecutables(path, MAX_INSTALLATION_SEARCH_DEPTH))
    )
  ).flat()
}

async function findJavaExecutables(root: string, remainingDepth: number): Promise<string[]> {
  if (remainingDepth < 0) {
    return []
  }

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const paths = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(root, entry.name)

      if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase() === JAVA_EXECUTABLE) {
        return [path]
      }

      return entry.isDirectory() ? findJavaExecutables(path, remainingDepth - 1) : []
    })
  )

  return paths.flat()
}

function runJavaVersionCommand(executablePath: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(executablePath, ['-version'], { timeout: 5_000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

function deduplicatePaths(paths: string[]): string[] {
  const uniquePaths = new Map<string, string>()

  paths.forEach((path) => {
    const normalizedPath = normalize(path)
    const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
    if (!uniquePaths.has(key)) {
      uniquePaths.set(key, path)
    }
  })

  return [...uniquePaths.values()]
}

function isJavaRuntimeCandidate(candidate: JavaRuntimeCandidate | null): candidate is JavaRuntimeCandidate {
  return candidate !== null
}

function compareJavaRuntimes(left: JavaRuntimeCandidate, right: JavaRuntimeCandidate): number {
  return (
    left.majorVersion - right.majorVersion ||
    left.version.localeCompare(right.version, undefined, { numeric: true }) ||
    getRuntimePathPriority(left.executablePath) - getRuntimePathPriority(right.executablePath) ||
    left.executablePath.localeCompare(right.executablePath)
  )
}

function getRuntimePathPriority(executablePath: string): number {
  return executablePath === JAVA_EXECUTABLE ? 0 : 1
}
