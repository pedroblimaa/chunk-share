import './DashboardStatCard.css'

import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface DashboardStatCardProps {
  icon: string
  label: string
  value: string
}

function DashboardStatCard({ icon, label, value }: DashboardStatCardProps): React.JSX.Element {
  return (
    <section className="dashboard-stat-card">
      <MaterialIcon name={icon} className="stat-card-icon" />
      <p>{label}</p>
      <strong>{value}</strong>
    </section>
  )
}

export default DashboardStatCard
