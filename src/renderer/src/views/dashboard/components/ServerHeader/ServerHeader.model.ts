import type { ServerStatus } from '../../../../../../shared/dashboard'

export interface ServerHeaderServer {
  name: string
  status: ServerStatus
}

export interface ServerHeaderConnection {
  connectionAddress: string | null
  connectionAddressDetails?: string
  connectionDetailsOpen?: boolean
  copyConnectionDetailsLabel?: string
  copyConnectionDetailsStateClass?: string
  onCopyConnectionAddress: () => void
  onCopyConnectionAddressDetails?: () => void
  onCloseConnectionDetails?: () => void
  onToggleConnectionDetails?: () => void
}

export interface ServerHeaderPrimaryAction {
  isAnimating: boolean
  disabled?: boolean
  tooltip?: string | undefined
  label?: string | undefined
  icon?: string | undefined
  tone?: 'default' | 'sync'
  onClick: () => void
}

export interface ServerHeaderDownloadEula {
  accepted: boolean
  isVisible: boolean
  onChange: (accepted: boolean) => void
}

export interface ServerHeaderSharingAction {
  disabled: boolean
  tooltip?: string | undefined
  onClick: () => void
}

export interface ServerHeaderProps {
  server: ServerHeaderServer
  connection: ServerHeaderConnection
  primaryAction: ServerHeaderPrimaryAction
  downloadEula?: ServerHeaderDownloadEula
  sharingAction?: ServerHeaderSharingAction
}
