import { networkInterfaces } from 'os'
import type { ServerConnectionAddress } from '../../../shared/server-runtime'

export function getConnectionAddresses(port: number): ServerConnectionAddress[] {
  const addresses = Object.entries(networkInterfaces()).flatMap(([interfaceName, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({
        label: interfaceName,
        address: `${entry.address}:${port}`
      }))
  )

  if (addresses.length === 0) {
    return [
      {
        label: 'Localhost',
        address: `localhost:${port}`,
        isPrimary: true
      }
    ]
  }

  return addresses.map((address, index) => ({
    ...address,
    isPrimary: index === 0
  }))
}
