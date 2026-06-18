import './DashboardStatCard.css'

import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface DashboardStatCardProps {
  icon: string
  label: string
  value: string
  badge?: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger'
}

function DashboardStatCard({
  icon,
  label,
  value,
  badge,
  badgeTone = 'neutral'
}: DashboardStatCardProps): React.JSX.Element {
  return (
    <section className="dashboard-stat-card">
      <div className="dashboard-stat-card-heading">
        <MaterialIcon name={icon} className="stat-card-icon" />
        <p>{label}</p>
        {badge && (
          <span className={`dashboard-stat-card-badge dashboard-stat-card-badge-${badgeTone}`}>
            {badge}
          </span>
        )}
      </div>
      <strong>{value}</strong>
    </section>
  )
}

export default DashboardStatCard
