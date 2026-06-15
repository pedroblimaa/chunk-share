import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { ServerRuntimePlayers, ServerRuntimeStatus } from '../../shared/server-runtime'

const PLAYER_LIST_PATTERN = /There are (\d+) of a max of (\d+) players online/
const PLAYER_POLL_INTERVAL_MS = 10_000

let playerPollInterval: NodeJS.Timeout | null = null

interface PlayerPollerInput {
  getServerProcess: () => ChildProcessWithoutNullStreams | null
  getStatus: () => ServerRuntimeStatus
  onPlayersChanged: (players: ServerRuntimePlayers) => void
}

export function startPlayerPolling(input: PlayerPollerInput): void {
  pollPlayerList(input)

  if (playerPollInterval) {
    return
  }

  playerPollInterval = setInterval(() => pollPlayerList(input), PLAYER_POLL_INTERVAL_MS)
}

export function stopPlayerPolling(): void {
  if (!playerPollInterval) {
    return
  }

  clearInterval(playerPollInterval)
  playerPollInterval = null
}

export function updatePlayersFromListResponse(
  line: string,
  onPlayersChanged: PlayerPollerInput['onPlayersChanged']
): boolean {
  const match = line.match(PLAYER_LIST_PATTERN)

  if (!match) {
    return false
  }

  onPlayersChanged({
    online: Number(match[1]),
    max: Number(match[2])
  })

  return true
}

function pollPlayerList({ getServerProcess, getStatus }: PlayerPollerInput): void {
  const serverProcess = getServerProcess()

  if (!serverProcess || getStatus() !== 'running' || !serverProcess.stdin.writable) {
    return
  }

  serverProcess.stdin.write('list\n')
}
