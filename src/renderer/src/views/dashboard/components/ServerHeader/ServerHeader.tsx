import './ServerHeader.css'

import type { ServerStatus } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Popover from '../../../../components/shared/Popover/Popover'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import type { ServerHeaderProps } from './ServerHeader.model'

function formatStatus(status: ServerStatus): string {
  return status.replace('-', ' ').toUpperCase()
}

function isServerRunning(status: ServerStatus): boolean {
  return status === 'running'
}

function getToggleButtonLabel(status: ServerStatus): string {
  if (status === 'starting') {
    return 'Starting...'
  }

  if (status === 'stopping') {
    return 'Stopping...'
  }

  return isServerRunning(status) ? 'Stop Server' : 'Start Server'
}

function getToggleButtonIcon(status: ServerStatus): string {
  if (status === 'starting' || status === 'stopping') {
    return 'sync'
  }

  return isServerRunning(status) ? 'stop' : 'play_arrow'
}

function ServerHeader({
  server,
  connection,
  primaryAction,
  downloadEula
}: ServerHeaderProps): React.JSX.Element {
  const serverIsRunning = isServerRunning(server.status)
  const serverIsBusy = server.status === 'starting' || server.status === 'stopping'
  const toggleButtonLabel = primaryAction.label ?? getToggleButtonLabel(server.status)
  const toggleButtonIcon = primaryAction.icon ?? getToggleButtonIcon(server.status)
  const toggleButtonTone = primaryAction.tone ?? 'default'
  const copyConnectionDetailsLabel = connection.copyConnectionDetailsLabel ?? 'Copy Connection'
  const copyConnectionDetailsStateClass = connection.copyConnectionDetailsStateClass ?? ''

  const getPopOverContent = (): React.JSX.Element => {
    return (
      <>
        <p>{connection.connectionAddressDetails}</p>
        <button
          aria-label={copyConnectionDetailsLabel}
          className={`connection-popover-copy${copyConnectionDetailsStateClass}`}
          type="button"
          onClick={connection.onCopyConnectionAddressDetails ?? connection.onCopyConnectionAddress}
        >
          <MaterialIcon name="content_copy" />
        </button>
      </>
    )
  }

  return (
    <section className="server-header">
      <div>
        <h2>{server.name}</h2>
        <div className="server-meta-row">
          <span className={`status-pill status-${server.status}`}>
            <span />
            {formatStatus(server.status)}
          </span>

          <Popover
            ariaLabel="Connection addresses"
            className="connection-menu"
            contentClassName="connection-popover is-left"
            isOpen={connection.connectionDetailsOpen === true && Boolean(connection.connectionAddressDetails)}
            onClose={() => connection.onCloseConnectionDetails?.()}
            content={getPopOverContent()}
          >
            <button
              className="connection-menu-button"
              type="button"
              aria-expanded={connection.connectionDetailsOpen}
              aria-label="Show connection addresses"
              disabled={!connection.connectionAddress}
              onClick={connection.onToggleConnectionDetails}
            >
              <MaterialIcon name="lan" />
              <span>Connection</span>
            </button>
          </Popover>
        </div>
      </div>

      <div className="server-actions">
        <div className="server-primary-action">
          <Tooltip content={primaryAction.tooltip}>
            <button
              aria-label={toggleButtonLabel}
              aria-busy={primaryAction.isAnimating}
              className={`server-toggle-button is-${serverIsRunning ? 'running' : 'stopped'} is-tone-${toggleButtonTone}${
                primaryAction.isAnimating ? ' is-animating' : ''
              }${serverIsBusy ? ' is-busy' : ''}`}
              disabled={primaryAction.disabled}
              type="button"
              onClick={primaryAction.onClick}
            >
              <MaterialIcon name={toggleButtonIcon} filled />
              <span>{toggleButtonLabel}</span>
            </button>
          </Tooltip>

          {downloadEula?.isVisible && (
            <label className="server-download-eula">
              <input
                checked={downloadEula.accepted}
                disabled={primaryAction.isAnimating}
                type="checkbox"
                onChange={(event) => downloadEula.onChange(event.target.checked)}
              />
              <span>
                I agree to the{' '}
                <a href="https://www.minecraft.net/en-us/eula" rel="noreferrer" target="_blank">
                  Minecraft EULA
                </a>
              </span>
            </label>
          )}
        </div>
        <button className="overflow-button" type="button" aria-label="More server actions">
          <MaterialIcon name="more_vert" />
        </button>
      </div>
    </section>
  )
}

export default ServerHeader
