import './ServerStatePanel.css'

import type { ServerDisplayState } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import { getServerSyncView } from '../../../../utils/server-sync-ui'

interface ServerStatePanelProps {
  lastActiveLabel: string
  snapshot: ServerDisplayState
  toggleDisabled?: boolean
  toggleButtonAriaLabel?: string | undefined
  toggleButtonTooltip?: string | undefined
  onToggleServer: () => void
}

function formatState(status: ServerDisplayState['serverStatus']): string {
  if (status === 'not-configured') {
    return 'Not Configured'
  }

  if (status === 'publishing') {
    return 'Publishing save'
  }

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStateIcon(status: ServerDisplayState['serverStatus']): string {
  const iconByStatus: Partial<Record<ServerDisplayState['serverStatus'], string>> = {
    crashed: 'error',
    error: 'error',
    running: 'dns',
    starting: 'sync',
    stopped: 'cloud_off',
    stopping: 'sync',
    publishing: 'sync',
    updating: 'sync'
  }

  return iconByStatus[status] ?? 'power_settings_new'
}

function ServerStatePanel({
  lastActiveLabel,
  snapshot,
  toggleDisabled = false,
  toggleButtonAriaLabel,
  toggleButtonTooltip,
  onToggleServer
}: ServerStatePanelProps): React.JSX.Element {
  const syncView = getServerSyncView(snapshot.syncStatus)

  return (
    <section className={`server-state-panel server-state-panel-${snapshot.serverStatus}`} aria-live="polite">
      <div className="server-state-pattern" />
      <MaterialIcon className="server-state-watermark" name={getStateIcon(snapshot.serverStatus)} />
      <div className="server-state-content">
        <div className="server-state-summary">
          <Tooltip content={toggleButtonTooltip}>
            <button
              className="power-indicator"
              type="button"
              aria-label={
                toggleButtonAriaLabel ??
                (snapshot.serverStatus === 'running'
                  ? 'Stop server'
                  : snapshot.serverStatus === 'publishing'
                    ? 'Publishing save'
                    : 'Start server')
              }
              disabled={toggleDisabled}
              onClick={onToggleServer}
            >
              <MaterialIcon name="power_settings_new" />
            </button>
          </Tooltip>
          <div>
            <h3>{formatState(snapshot.serverStatus)}</h3>
            <p className="server-last-active">
              <MaterialIcon name="schedule" />
              Last active: {lastActiveLabel}
            </p>
            <p className={`server-sync-status server-sync-status-${syncView.tone}`}>
              <MaterialIcon name="sync" />
              <span>{syncView.label}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ServerStatePanel
