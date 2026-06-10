import './ServersView.css'

import type { DashboardSnapshot } from '../../../../../shared/dashboard'
import AppSidebar from '../../../components/shared/AppSidebar/AppSidebar'
import Button from '../../../components/shared/Button/Button'
import MaterialIcon from '../../../components/shared/MaterialIcon/MaterialIcon'
import TopBar from '../../dashboard/components/TopBar/TopBar'
import ServerCard, { type ServerCardSummary } from '../components/ServerCard/ServerCard'

interface ServersViewProps {
  snapshot: DashboardSnapshot
  onOpenServer: () => void
}

const SINGLE_SERVER_DISABLED_REASON = 'Only one server is supported in the MVP.'

function ServersView({ snapshot, onOpenServer }: ServersViewProps): React.JSX.Element {
  const servers: ServerCardSummary[] = []
  const hasServers = servers.length > 0

  return (
    <div className="dashboard-screen servers-screen">
      <AppSidebar
        addServerDisabled={hasServers}
        addServerTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
      />

      <div className="dashboard-main">
        <TopBar
          user={snapshot.signedInUser}
          breadcrumbs={[{ label: 'Servers' }]}
          createInstanceDisabled={hasServers}
          createInstanceTitle={hasServers ? SINGLE_SERVER_DISABLED_REASON : undefined}
        />

        <main className="dashboard-content servers-content">
          {hasServers ? (
            <section className="servers-grid" aria-label="Servers">
              {servers.map((server, index) => (
                <ServerCard
                  animationDelayMs={index * 80}
                  key={server.id}
                  server={server}
                  onOpen={onOpenServer}
                />
              ))}
            </section>
          ) : (
            <section className="servers-empty-state">
              <MaterialIcon name="dns" />
              <h3>No servers yet</h3>
              <p>Create your first managed Minecraft server to start sharing a world.</p>
              <Button icon="add" className="servers-empty-action">
                Create Instance
              </Button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default ServersView
