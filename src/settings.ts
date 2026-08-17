/** Durable, user-owned notification preferences. */

/** Namespace deliberately exposed only through the plugin's loopback RPC. */
export const BELL_SETTINGS_NS = 'bell-notify'

/** The preferences users edit from the Settings plugin-configuration card. */
export interface BellSettings {
  enabled: boolean
  masterVolume: number
}

/** Defaults used when the Host has no persisted user settings yet. */
export const DEFAULT_BELL_SETTINGS: Readonly<BellSettings> = Object.freeze({
  enabled: true,
  masterVolume: 0.7,
})

/** Keep the overlay's user-facing defaults when a profile first registers the namespace. */
export function bellSettingsDefaults(config: BellSettings & { muteAll?: boolean }): BellSettings {
  return {
    // Older composition entries used muteAll. Fold it into the one remaining
    // global sound switch so upgrading does not unexpectedly restore audio.
    enabled: config.enabled && config.muteAll !== true,
    masterVolume: config.masterVolume,
  }
}
