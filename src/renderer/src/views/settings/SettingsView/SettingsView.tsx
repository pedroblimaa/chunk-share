import './SettingsView.css'

import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import type { SettingsViewProps } from './SettingsView.model'

const SINGLE_SERVER_DISABLED_REASON = 'Only one server is supported in the MVP.'

function SettingsView({
  serverDisplayState,
  onCreateServer,
  onNavigateToServers,
  onOpenSettings,
  onSignOut
}: SettingsViewProps): React.JSX.Element {
  const serverIsConfigured = serverDisplayState.serverStatus !== 'not-configured'

  return (
    <div className="dashboard-screen settings-screen">
      <AppSidebar
        activeItem="settings"
        addServerDisabled={serverIsConfigured}
        addServerTitle={serverIsConfigured ? SINGLE_SERVER_DISABLED_REASON : undefined}
        onAddServer={serverIsConfigured ? undefined : onCreateServer}
        onOpenServers={onNavigateToServers}
        onOpenSettings={onOpenSettings}
      />

      <div className="dashboard-main">
        <TopBar
          user={serverDisplayState.signedInUser}
          breadcrumbs={[{ label: 'Settings' }]}
          createInstanceDisabled={serverIsConfigured}
          createInstanceTitle={serverIsConfigured ? SINGLE_SERVER_DISABLED_REASON : undefined}
          onCreateInstance={serverIsConfigured ? undefined : onCreateServer}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
        />

        <main className="dashboard-content settings-content"></main>
      </div>
    </div>
  )
}

export default SettingsView
