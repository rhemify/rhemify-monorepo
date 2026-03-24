export type { FleetService } from './fleet-service'
export { MockFleetService } from './mock-fleet-service'

import { MockFleetService } from './mock-fleet-service'

// Single instance used across the app.
// Replace with real API service when backend is ready.
export const fleetService = new MockFleetService()
