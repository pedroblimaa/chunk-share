import { spawn } from 'node:child_process'

const pnpmCli = process.env.npm_execpath

if (!pnpmCli) {
  throw new Error('Run this command through pnpm.')
}

const testProcess = spawn(
  process.execPath,
  [pnpmCli, 'exec', 'playwright', 'test', ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      CHUNK_SHARE_E2E_ACTION_DELAY: '750'
    },
    stdio: 'inherit'
  }
)

testProcess.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

testProcess.once('exit', (exitCode) => {
  process.exitCode = exitCode ?? 1
})
