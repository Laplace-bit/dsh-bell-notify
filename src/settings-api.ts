/** Shared wire vocabulary for the bell-notify settings RPC channel. */

/** Dedicated, loopback-only RPC channel registered by the Host half. */
export const BELL_SETTINGS_RPC_CHANNEL = '/bell-notify'

/** Endpoints accepted by {@link BELL_SETTINGS_RPC_CHANNEL}. */
export const BELL_SETTINGS_RPC = {
  read: 'settings.read',
  write: 'settings.write',
  upgrade: 'plugin.upgrade',
} as const

/** How the current profile supplied the running plugin package. */
export type BellInstallationKind = 'npm' | 'development' | 'unmanaged'

/** Settings state the Host permits the browser card to observe. */
export interface BellSettingsView {
  version: string
  installation: BellInstallationKind
  writable: boolean
  enabled: boolean
  masterVolume: number
  canUpgrade: boolean
}

/** Successful package-update acknowledgement; new code needs a Host restart. */
export interface BellUpgradeView {
  restartRequired: true
}
