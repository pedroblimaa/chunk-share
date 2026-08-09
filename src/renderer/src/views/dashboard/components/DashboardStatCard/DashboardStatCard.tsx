import './DashboardStatCard.css'

import Badge from '../../../../components/shared/Badge/Badge'
import type { BadgeTone } from '../../../../components/shared/Badge/Badge.model'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'

interface DashboardStatCardProps {
  icon: string
  label: string
  value: string
  detail?: string
  badge?: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger'
}

function getBadgeTone(badgeTone: DashboardStatCardProps['badgeTone']): BadgeTone {
  if (!badgeTone || badgeTone === 'neutral') {
    return 'default'
  }

  return badgeTone
}

function DashboardStatCard({
  icon,
  label,
  value,
  detail,
  badge,
  badgeTone = 'neutral'
}: DashboardStatCardProps): React.JSX.Element {
  return (
    <Card className="dashboard-stat-card">
      <div className="dashboard-stat-card-icon">
        <MaterialIcon name={icon} className="stat-card-icon" />
      </div>
      <div className="dashboard-stat-card-content">
        <div className="dashboard-stat-card-heading">
          <p>{label}</p>
          {badge && (
            <Badge size="small" tone={getBadgeTone(badgeTone)}>
              {badge}
            </Badge>
          )}
        </div>
        <strong>
          {value} {detail && <span>{detail}</span>}
        </strong>
      </div>
    </Card>
  )
}

export default DashboardStatCard
