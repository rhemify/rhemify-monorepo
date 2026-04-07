export type { FleetService } from './fleet-service'
export { MockFleetService } from './mock-fleet-service'
export type { WalletService } from './wallet-service'
export { MockWalletService } from './mock-wallet-service'

import { MockFleetService } from './mock-fleet-service'
import { MockWalletService } from './mock-wallet-service'

// Single instances used across the app.
// Replace with real API services when backend is ready.
export const fleetService = new MockFleetService()
export const walletService = new MockWalletService()
