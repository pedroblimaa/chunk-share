import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)

const electronPackagePath = require.resolve('electron/package.json')
const electronPackage = require(electronPackagePath)
const electronCliPath = path.join(path.dirname(electronPackagePath), 'cli.js')
const electronEnvironment = { ...process.env }
const electronArguments = ['--version']

delete electronEnvironment.ELECTRON_RUN_AS_NODE

if (process.platform === 'linux' && process.env.CI) {
  electronArguments.unshift('--no-sandbox')
}

const result = spawnSync(process.execPath, [electronCliPath, ...electronArguments], {
  encoding: 'utf8',
  env: electronEnvironment
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const outputLines = result.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
const installedVersion = outputLines.at(-1)
const expectedVersion = `v${electronPackage.version}`

if (installedVersion !== expectedVersion) {
  throw new Error(`Expected Electron ${expectedVersion}, received ${installedVersion || '<empty>'}.`)
}

console.log(`Electron ${installedVersion} is installed and executable.`)
