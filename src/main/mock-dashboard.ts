import type { DashboardSnapshot, MockUser } from '../shared/dashboard'

const mockGoogleUser: MockUser = {
  id: 'user-pedro',
  name: 'Pedro Lima',
  email: 'pedro@example.com',
  avatarInitials: 'PL'
}

let signedInUser: MockUser | null = null

export function getMockDashboardSnapshot(): DashboardSnapshot {
  return {
    signedInUser,
    serverName: 'Vanilla Survival',
    serverStatus: 'stopped',
    serverType: 'Vanilla',
    minecraftVersion: '1.20.1',
    lastActiveLabel: '4 hours ago',
    currentHost: 'Alex',
    latestSaveLabel: '2 hours ago',
    worldVersion: 7,
    connectionAddress: 'play.chunkshare.app',
    players: {
      online: 0,
      max: 5
    },
    resources: {
      cpuPercent: 0,
      memoryUsedMb: 0,
      memoryTotalMb: 8192
    },
    consoleLogs: [
      {
        id: 'log-001',
        timestamp: '10:24:31',
        source: 'Server thread/INFO',
        message: 'Stopping server',
        tone: 'default'
      },
      {
        id: 'log-002',
        timestamp: '10:24:31',
        source: 'Server thread/INFO',
        message: 'Saving players',
        tone: 'default'
      },
      {
        id: 'log-003',
        timestamp: '10:24:31',
        source: 'Server thread/INFO',
        message: 'Saving worlds',
        tone: 'default'
      },
      {
        id: 'log-004',
        timestamp: '10:24:31',
        source: 'Server thread/INFO',
        message: "Saving chunks for level 'ServerLevel'/minecraft:overworld",
        tone: 'default'
      },
      {
        id: 'log-005',
        timestamp: '10:24:33',
        source: 'Server thread/INFO',
        message: 'ThreadedAnvilChunkStorage: All dimensions are saved',
        tone: 'default'
      },
      {
        id: 'log-006',
        timestamp: '10:24:34',
        source: 'Server thread/INFO',
        message: 'Server stopped gracefully.',
        tone: 'success'
      }
    ],
    allowedPlayers: [
      { id: 'player-pedro', name: 'Pedro', status: 'offline' },
      { id: 'player-camila', name: 'Camila', status: 'offline' },
      { id: 'player-alex', name: 'Alex', status: 'offline' }
    ]
  }
}

export function signInWithMockGoogleUser(): DashboardSnapshot {
  signedInUser = mockGoogleUser

  return getMockDashboardSnapshot()
}
