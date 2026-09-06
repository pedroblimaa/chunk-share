import './ServerHeader.css'

import { useState } from 'react'
import type { ServerStatus } from '../../../../../../shared/dashboard'
import Badge from '../../../../components/shared/Badge/Badge'
import type { BadgeTone } from '../../../../components/shared/Badge/Badge.model'
import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Popover from '../../../../components/shared/Popover/Popover'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import type { ServerHeaderProps } from './ServerHeader.model'

function formatStatus(status: ServerStatus): string {
  if (status === 'publishing') {
    return 'PUBLISHING SAVE'
  }

  return status.replace('-', ' ').toUpperCase()
}

function getStatusTone(status: ServerStatus): BadgeTone {
  if (status === 'stopped') {
    return 'disabled'
  }

  if (status === 'running') {
    return 'active'
  }

  if (status === 'starting' || status === 'stopping' || status === 'publishing' || status === 'updating') {
    return 'warning'
  }

  if (status === 'crashed' || status === 'error') {
    return 'danger'
  }

  return 'default'
}

function isServerRunning(status: ServerStatus): boolean {
  return status === 'running'
}

function getToggleButtonLabel(status: ServerStatus): string {
  const labelByStatus: Partial<Record<ServerStatus, string>> = {
    starting: 'Starting...',
    stopping: 'Stopping...',
    publishing: 'Publishing save...',
    updating: 'Updating...'
  }

  return labelByStatus[status] ?? (isServerRunning(status) ? 'Stop Server' : 'Start Server')
}

function getToggleButtonIcon(status: ServerStatus): string {
  if (['starting', 'stopping', 'publishing', 'updating'].includes(status)) {
    return 'sync'
  }

  return isServerRunning(status) ? 'stop' : 'play_arrow'
}

function ServerHeader({
  server,
  connection,
  primaryAction,
  downloadEula,
  sharingAction
}: ServerHeaderProps): React.JSX.Element {
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const serverIsRunning = isServerRunning(server.status)
  const serverIsBusy =
    server.status === 'starting' ||
    server.status === 'stopping' ||
    server.status === 'publishing' ||
    server.status === 'updating'
  const toggleButtonLabel = primaryAction.label ?? getToggleButtonLabel(server.status)
  const toggleButtonIcon = primaryAction.icon ?? getToggleButtonIcon(server.status)
  const toggleButtonTone = primaryAction.tone ?? 'default'
  const copyConnectionAddressLabel = connection.copyConnectionAddressLabel ?? 'Copy address'
  const copyConnectionAddressStateClass = connection.copyConnectionAddressStateClass ?? ''
  const copyConnectionAddressIcon = copyConnectionAddressStateClass.includes('is-copied')
    ? 'check'
    : copyConnectionAddressStateClass.includes('is-failed')
      ? 'error_outline'
      : 'content_copy'

  function inviteMember(): void {
    setActionsMenuOpen(false)
    sharingAction?.onClick()
  }

  const getPopOverContent = (): React.JSX.Element => {
    return (
      <ul className="connection-address-list">
        {connection.connectionAddresses.map((connectionAddress) => (
          <li
            className="connection-address-row"
            key={`${connectionAddress.label}-${connectionAddress.address}`}
          >
            <span className="connection-address-label">{connectionAddress.label}</span>
            <span className="connection-address-value">{connectionAddress.address}</span>
          </li>
        ))}
      </ul>
    )
  }

  const getActionsMenuContent = (): React.JSX.Element | null => {
    if (!sharingAction) {
      return null
    }

    return (
      <Tooltip content={sharingAction.tooltip} placement="left">
        <button
          className="server-actions-menu-item"
          disabled={sharingAction.disabled}
          role="menuitem"
          type="button"
          onClick={inviteMember}
        >
          <MaterialIcon name="person_add" />
          <span>Invite</span>
        </button>
      </Tooltip>
    )
  }

  return (
    <section className="server-header">
      <div>
        <h2>{server.name}</h2>
        <div className="server-meta-row">
          <Badge
            dot
            className={`server-status-badge status-${server.status}`}
            tone={getStatusTone(server.status)}
          >
            {formatStatus(server.status)}
          </Badge>

          <div className="connection-control">
            <Popover
              ariaLabel="Connection addresses"
              contentClassName="connection-popover is-left"
              isOpen={connection.connectionDetailsOpen === true && connection.connectionAddresses.length > 0}
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
                <span>{connection.connectionAddress ?? 'Connection unavailable'}</span>
                <MaterialIcon name="expand_more" />
              </button>
            </Popover>
            <Tooltip content={copyConnectionAddressLabel} placement="top">
              <button
                aria-label={copyConnectionAddressLabel}
                className={`connection-copy-button${copyConnectionAddressStateClass}`}
                disabled={!connection.connectionAddress}
                type="button"
                onClick={connection.onCopyConnectionAddress}
              >
                <MaterialIcon name={copyConnectionAddressIcon} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="server-actions">
        <div className="server-primary-action">
          <Tooltip content={primaryAction.tooltip}>
            <Button
              aria-label={toggleButtonLabel}
              aria-busy={primaryAction.isAnimating || serverIsBusy}
              className={`server-toggle-button is-${serverIsRunning ? 'running' : 'stopped'} is-tone-${toggleButtonTone}${
                primaryAction.isAnimating ? ' is-animating' : ''
              }${serverIsBusy ? ' is-busy' : ''}`}
              disabled={primaryAction.disabled}
              icon={toggleButtonIcon}
              iconFilled
              size="large"
              onClick={primaryAction.onClick}
            >
              {toggleButtonLabel}
            </Button>
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
                I have read and accept the{' '}
                <a href="https://www.minecraft.net/en-us/eula" rel="noreferrer" target="_blank">
                  Minecraft EULA
                </a>
                .
              </span>
            </label>
          )}
        </div>
        <Popover
          ariaLabel="Server actions"
          className="server-actions-menu"
          contentClassName="server-actions-popover is-right"
          contentRole="menu"
          isOpen={actionsMenuOpen}
          onClose={() => setActionsMenuOpen(false)}
          content={getActionsMenuContent()}
        >
          <Button
            aria-expanded={actionsMenuOpen}
            aria-haspopup="menu"
            aria-label="More server actions"
            className="overflow-button"
            icon="more_vert"
            size="square-large"
            variant="icon"
            onClick={() => setActionsMenuOpen((isOpen) => !isOpen)}
          />
        </Popover>
      </div>
    </section>
  )
}

export default ServerHeader
