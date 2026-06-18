import './ServerHeader.css'

import { useEffect, useRef } from 'react'
import type { ServerStatus } from '../../../../../../shared/dashboard'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface ServerHeaderProps {
  name: string
  status: ServerStatus
  connectionAddress: string | null
  connectionAddressDetails?: string
  connectionDetailsOpen?: boolean
  isAnimating: boolean
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
  onToggleServer: () => void
}

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
  name,
  status,
  connectionAddress,
  connectionAddressDetails,
  connectionDetailsOpen = false,
  isAnimating,
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
  onToggleServer
}: ServerHeaderProps): React.JSX.Element {
  const connectionMenuRef = useRef<HTMLDivElement | null>(null)
  const serverIsRunning = isServerRunning(status)
  const serverIsBusy = status === 'starting' || status === 'stopping'
  const toggleButtonLabel = toggleButtonLabelOverride ?? getToggleButtonLabel(status)
  const toggleButtonIcon = toggleButtonIconOverride ?? getToggleButtonIcon(status)

  useEffect(() => {
    if (!connectionDetailsOpen) {
      return undefined
    }

    function closeConnectionDetailsOnOutsideClick(event: PointerEvent): void {
      const target = event.target

      if (target instanceof Node && !connectionMenuRef.current?.contains(target)) {
        onCloseConnectionDetails?.()
      }
    }

    document.addEventListener('pointerdown', closeConnectionDetailsOnOutsideClick)

    return () => document.removeEventListener('pointerdown', closeConnectionDetailsOnOutsideClick)
  }, [connectionDetailsOpen, onCloseConnectionDetails])

  return (
    <section className="server-header">
      <div>
        <h2>{name}</h2>
        <div className="server-meta-row">
          <span className={`status-pill status-${status}`}>
            <span />
            {formatStatus(status)}
          </span>

          <div className="connection-menu" ref={connectionMenuRef}>
            <button
              className="connection-menu-button"
              type="button"
              aria-expanded={connectionDetailsOpen}
              aria-label="Show connection addresses"
              disabled={!connectionAddress}
              title={connectionAddress ? 'Show connection addresses' : 'No address yet'}
              onClick={onToggleConnectionDetails}
            >
              <MaterialIcon name="lan" />
              <span>Connection</span>
            </button>
            {connectionDetailsOpen && connectionAddressDetails && (
              <div className="connection-popover" role="dialog" aria-label="Connection addresses">
                <p>{connectionAddressDetails}</p>
                <button
                  aria-label={copyConnectionDetailsLabel}
                  className={`connection-popover-copy${copyConnectionDetailsStateClass}`}
                  title={copyConnectionDetailsLabel}
                  type="button"
                  onClick={onCopyConnectionAddressDetails ?? onCopyConnectionAddress}
                >
                  <MaterialIcon name="content_copy" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="server-actions">
        <button
          aria-label={toggleButtonLabel}
          className={`server-toggle-button is-${serverIsRunning ? 'running' : 'stopped'} is-tone-${toggleButtonTone}${
            isAnimating ? ' is-animating' : ''
          }${serverIsBusy ? ' is-busy' : ''}`}
          disabled={toggleDisabled}
          title={toggleButtonTooltip}
          type="button"
          onClick={onToggleServer}
        >
          <MaterialIcon name={toggleButtonIcon} filled />
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
