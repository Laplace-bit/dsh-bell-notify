/**
 * Shared plugin configuration contract. The Host half defines the
 * Schemastery schema over this shape (defaults live here so both halves stay
 * symmetric); the client half falls back to the same defaults when the Host
 * boot-config bridge is absent (client-only composition).
 */

/** Boot global carrying the Host-validated config into the browser half. */
export const BELL_BOOT_GLOBAL = '__dshBellNotifyConfig'

export interface BellConfig {
  /** Master switch; false disables all feedback. */
  readonly enabled: boolean
  /** 0-1 master volume applied to every synthesized sound. */
  readonly masterVolume: number
  /** Bounded wait-queue capacity of the sound scheduler. */
  readonly maxQueue: number
  /** Max simultaneously-playing sounds (concurrency), 1 = serial. */
  readonly maxConcurrent: number
  /** Global fallback cooldown (ms) for rules without their own. */
  readonly defaultCooldown: number
}

export const DEFAULT_CONFIG: BellConfig = Object.freeze({
  enabled: true,
  masterVolume: 0.7,
  maxQueue: 8,
  maxConcurrent: 3,
  defaultCooldown: 1000,
})

/** Structural guard for the Host-bridged boot global (fails loud, not half-configured). */
export function readBootConfig(): BellConfig {
  const raw = (globalThis as Record<string, unknown>)[BELL_BOOT_GLOBAL]
  if (raw === undefined) {
    console.info('[dsh-bell-notify] no host config bridge; using defaults')
    return DEFAULT_CONFIG
  }
  const num = (key: keyof BellConfig): boolean =>
    typeof (raw as BellConfig)[key] === 'number' && Number.isFinite((raw as BellConfig)[key] as number)
  if (
    typeof raw !== 'object' || raw === null
    || typeof (raw as BellConfig).enabled !== 'boolean'
    || !num('masterVolume') || !num('maxQueue') || !num('maxConcurrent') || !num('defaultCooldown')
  ) {
    throw new Error(`[dsh-bell-notify] malformed ${BELL_BOOT_GLOBAL} boot global: ${JSON.stringify(raw)}`)
  }
  const legacy = raw as BellConfig & { muteAll?: unknown }
  // Preserve the behaviour of a pre-settings-card profile that still ships
  // the retired mute flag in its boot config.
  return legacy.muteAll === true ? { ...legacy, enabled: false } : legacy
}
