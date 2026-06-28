import './ServerHeader.css'

import type { ServerStatus } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Popover from '../../../../components/shared/Popover/Popover'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'

interface ServerHeaderProps {
  name: string
  status: ServerStatus
  connectionAddress: string | null
  connectionAddressDetails?: string
  connectionDetailsOpen?: boolean
  isAnimating: boolean
  isLoading?: boolean
  downloadEulaAccepted?: boolean
  showDownloadEula?: boolean
  toggleDisabled?: boolean
  toggleButtonTooltip?: string
  toggleButtonLabel?: string
  toggleButtonIcon?: string
  toggleButtonTone?: 'default' | 'sync'
  copyConnectionDetailsLabel?: string
  copyConnectionDetailsStateClass?: string
  onCopyConnectionAddress: () => void
  onCopyConnectionAddressDetails?: () => void
  onCloseConnectionDetails?: () => void
  onToggleConnectionDetails?: () => void
  onDownloadEulaChange?: (accepted: boolean) => void
  onToggleServer: () => void
}

function formatStatus(status: ServerStatus): string {
  return status.replace('-', ' ').toUpperCase()
}

function isServerRunning(status: ServerStatus): boolean {
  return status === 'running'
}

function getToggleButtonLabel(status: ServerStatus): string {
  if (status === 'initializing') {
    return 'Initializing...'
  }

  if (status === 'starting') {
    return 'Starting...'
  }

  if (status === 'stopping') {
    return 'Stopping...'
  }

  if (status === 'recovering') {
    return 'Recovering...'
  }

  if (status === 'recovery-required') {
    return 'Recovery Required'
  }

  return isServerRunning(status) ? 'Stop Server' : 'Start Server'
}

function getToggleButtonIcon(status: ServerStatus): string {
  if (
    status === 'initializing' ||
    status === 'starting' ||
    status === 'stopping' ||
    status === 'recovering'
  ) {
    return 'sync'
  }

  return isServerRunning(status) ? 'stop' : 'play_arrow'
}

function ServerHeader({
  name,
  status,
  connectionAddress,
  connectionAddressDetails,
  connectionDetailsOpen = false,
  isAnimating,
  isLoading = false,
  downloadEulaAccepted = false,
  showDownloadEula = false,
  toggleDisabled = false,
  toggleButtonTooltip,
  toggleButtonLabel: toggleButtonLabelOverride,
  toggleButtonIcon: toggleButtonIconOverride,
  toggleButtonTone = 'default',
  copyConnectionDetailsLabel = 'Copy Connection',
  copyConnectionDetailsStateClass = '',
  onCopyConnectionAddress,
  onCopyConnectionAddressDetails,
  onCloseConnectionDetails,
  onToggleConnectionDetails,
  onDownloadEulaChange,
  onToggleServer
}: ServerHeaderProps): React.JSX.Element {
  const serverIsRunning = isServerRunning(status)
  const serverIsBusy =
    status === 'initializing' || status === 'starting' || status === 'stopping' || status === 'recovering'
  const toggleButtonLabel = toggleButtonLabelOverride ?? getToggleButtonLabel(status)
  const toggleButtonIcon = toggleButtonIconOverride ?? getToggleButtonIcon(status)

  return (
    <section className="server-header">
      <div>
        <h2>{name}</h2>
        <div className="server-meta-row">
          <span className={`status-pill status-${status}`}>
            <span />
            {formatStatus(status)}
          </span>

          <Popover
            ariaLabel="Connection addresses"
            className="connection-menu"
            contentClassName="connection-popover is-left"
            isOpen={connectionDetailsOpen && Boolean(connectionAddressDetails)}
            onClose={() => onCloseConnectionDetails?.()}
            content={
              <>
                <p>{connectionAddressDetails}</p>
                <button
                  aria-label={copyConnectionDetailsLabel}
                  className={`connection-popover-copy${copyConnectionDetailsStateClass}`}
                  type="button"
                  onClick={onCopyConnectionAddressDetails ?? onCopyConnectionAddress}
                >
                  <MaterialIcon name="content_copy" />
                </button>
              </>
            }
          >
            <button
              className="connection-menu-button"
              type="button"
              aria-expanded={connectionDetailsOpen}
              aria-label="Show connection addresses"
              disabled={!connectionAddress}
              onClick={onToggleConnectionDetails}
            >
              <MaterialIcon name="lan" />
              <span>Connection</span>
            </button>
          </Popover>
        </div>
      </div>

      <div className="server-actions">
        <div className="server-primary-action">
          <Tooltip content={toggleButtonTooltip}>
            <button
              aria-label={toggleButtonLabel}
              aria-busy={isLoading}
              className={`server-toggle-button is-${serverIsRunning ? 'running' : 'stopped'} is-tone-${toggleButtonTone}${
                isAnimating ? ' is-animating' : ''
              }${serverIsBusy ? ' is-busy' : ''}${isLoading ? ' is-loading' : ''}`}
              disabled={toggleDisabled}
              type="button"
              onClick={onToggleServer}
            >
              <MaterialIcon name={toggleButtonIcon} filled />
              <span>{toggleButtonLabel}</span>
            </button>
          </Tooltip>

          {showDownloadEula ? (
            <label className="server-download-eula">
              <input
                checked={downloadEulaAccepted}
                disabled={isLoading}
                type="checkbox"
                onChange={(event) => onDownloadEulaChange?.(event.target.checked)}
              />
              <span>
                I agree to the{' '}
                <a href="https://www.minecraft.net/en-us/eula" rel="noreferrer" target="_blank">
                  Minecraft EULA
                </a>
              </span>
            </label>
          ) : null}
        </div>
        <button className="overflow-button" type="button" aria-label="More server actions">
          <MaterialIcon name="more_vert" />
        </button>
      </div>
    </section>
  )
}

export default ServerHeader
