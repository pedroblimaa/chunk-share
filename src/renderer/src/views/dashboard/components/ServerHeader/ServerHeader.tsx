import './ServerHeader.css'

import type { ServerStatus } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface ServerHeaderProps {
  name: string
  status: ServerStatus
  connectionAddress: string | null
  isAnimating: boolean
  onToggleServer: () => void
}

function formatStatus(status: ServerStatus): string {
  return status.replace('-', ' ').toUpperCase()
}

function isServerRunning(status: ServerStatus): boolean {
  return status === 'running'
}

function ServerHeader({
  name,
  status,
  connectionAddress,
  isAnimating,
  onToggleServer
}: ServerHeaderProps): React.JSX.Element {
  const serverIsRunning = isServerRunning(status)
  const toggleButtonLabel = serverIsRunning ? 'Stop Server' : 'Start Server'

  return (
    <section className="server-header">
      <div>
        <h2>{name}</h2>
        <div className="server-meta-row">
          <span className={`status-pill status-${status}`}>
            <span />
            {formatStatus(status)}
          </span>

          <div className="connection-pill">
            <span>{connectionAddress ?? 'No address yet'}</span>
            <button type="button" aria-label="Copy server address">
              <MaterialIcon name="content_copy" />
            </button>
          </div>
        </div>
      </div>

      <div className="server-actions">
        <button
          aria-label={toggleButtonLabel}
          className={`server-toggle-button is-${serverIsRunning ? 'running' : 'stopped'}${
            isAnimating ? ' is-animating' : ''
          }`}
          type="button"
          onClick={onToggleServer}
        >
          <MaterialIcon name={serverIsRunning ? 'stop' : 'play_arrow'} filled />
          <span>{toggleButtonLabel}</span>
        </button>
        <button className="overflow-button" type="button" aria-label="More server actions">
          <MaterialIcon name="more_vert" />
        </button>
      </div>
    </section>
  )
}

export default ServerHeader
