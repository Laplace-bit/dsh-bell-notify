import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_CONFIG, type BellConfig } from './config.ts'
import { injectBootConfig } from './boot-config.ts'
import { BELL_PACKAGE_NAME, BELL_PACKAGE_VERSION } from './package-meta.ts'
import { inspectProfileInstallation, updateNpmProfilePackage } from './profile-installation.ts'
import { BELL_SETTINGS_RPC, BELL_SETTINGS_RPC_CHANNEL, type BellSettingsView } from './settings-api.ts'
import { bellSettingsDefaults, BELL_SETTINGS_NS, type BellSettings } from './settings.ts'

/** Display name shown by the Host loader while the plugin is mounted. */
export const name = 'dsh-bell-notify'

/**
 * Plugin configuration accepted from the overlay's `config` section. Cordis
 * validates the value against this schema at load and fills omitted fields
 * from the shared defaults, so an invalid value fails the load loudly.
 */
export interface Config extends BellConfig {
  /** @deprecated Folded into enabled so legacy profiles remain silent when upgraded. */
  readonly muteAll?: boolean
  /** @deprecated Accepted only so existing profiles can remove the retired status UI fields gradually. */
  readonly statusRevertMs?: number
  /** @deprecated Accepted only so existing profiles can remove the retired status UI fields gradually. */
  readonly showStatusIndicator?: boolean
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled),
  masterVolume: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.masterVolume),
  muteAll: Schema.boolean().required(false),
  maxQueue: Schema.number().min(1).max(64).default(DEFAULT_CONFIG.maxQueue),
  maxConcurrent: Schema.number().min(1).max(16).default(DEFAULT_CONFIG.maxConcurrent),
  defaultCooldown: Schema.number().min(0).max(60_000).default(DEFAULT_CONFIG.defaultCooldown),
  // The floating status indicator was retired in favour of Plugin settings.
  // These fields remain parse-only compatibility shims for older profiles.
  statusRevertMs: Schema.number().min(0).max(60_000).required(false),
  showStatusIndicator: Schema.boolean().required(false),
})

/** Schema for the user-owned preferences shown in plugin configuration. */
function settingsSchema(defaults: BellSettings): Schema<BellSettings> {
  return Schema.object({
    enabled: Schema.boolean().default(defaults.enabled),
    masterVolume: Schema.number().min(0).max(1).default(defaults.masterVolume),
  })
}

function parseBellSettings(value: unknown): BellSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const settings = value as Partial<BellSettings>
  if (Object.keys(settings).some(key => key !== 'enabled' && key !== 'masterVolume')) return undefined
  if (typeof settings.enabled !== 'boolean'
    || typeof settings.masterVolume !== 'number'
    || !Number.isFinite(settings.masterVolume)
    || settings.masterVolume < 0
    || settings.masterVolume > 1) {
    return undefined
  }
  return {
    enabled: settings.enabled,
    masterVolume: settings.masterVolume,
  }
}

/** Fold the retired durable mute flag into the remaining global sound switch. */
function effectiveSettings(settings: BellSettings): BellSettings {
  const legacy = settings as BellSettings & { muteAll?: unknown }
  return {
    enabled: settings.enabled && legacy.muteAll !== true,
    masterVolume: settings.masterVolume,
  }
}

/**
 * Host half: bridge the validated config to the browser half. The web boot
 * graph carries no per-entry config, so the value is injected into every
 * served index response as a boot global the client entry reads at apply
 * time. All notification work happens browser-side; the
 * Host half touches no agent state.
 * @param ctx - Host context carrying the web server service when composed.
 * @param config - Schema-validated configuration with defaults filled.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootConfig(html, config)),
      'dsh-bell-notify: boot config bridge',
    )
  })
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      settingsNamespace(BELL_SETTINGS_NS),
      settingsSchema(bellSettingsDefaults(config)),
      { applies: 'live' },
    )
    settingsCtx.inject(['connection'], (connectionCtx) => {
      let upgrade: Promise<void> | undefined
      const view = (): BellSettingsView => {
        const installation = inspectProfileInstallation(connectionCtx.baseUrl, BELL_PACKAGE_NAME)
        const settings = effectiveSettings(scope.get())
        return {
          version: BELL_PACKAGE_VERSION,
          installation: installation.kind,
          writable: connectionCtx.settings.writable,
          enabled: settings.enabled,
          masterVolume: settings.masterVolume,
          canUpgrade: installation.kind === 'npm',
        }
      }
      const handler: ConnectionRpcHandler = async (endpoint, payload) => {
        if (endpoint === BELL_SETTINGS_RPC.read) return { ok: true, value: view() }
        if (endpoint === BELL_SETTINGS_RPC.write) {
          const settings = parseBellSettings(payload)
          if (settings === undefined) {
            return {
              ok: false,
              error: { code: 'settings-rejected', message: 'bell-notify settings are invalid', details: { ns: BELL_SETTINGS_NS } },
            }
          }
          if (!connectionCtx.settings.writable) {
            return {
              ok: false,
              error: { code: 'settings-rejected', message: 'bell-notify settings are read-only', details: { ns: BELL_SETTINGS_NS } },
            }
          }
          try {
            // A complete card form owns this namespace. Replacing rather than
            // merging also removes any pre-0.1.0 muteAll user setting.
            await scope.replace(settings)
          } catch {
            return {
              ok: false,
              error: { code: 'settings-rejected', message: 'bell-notify settings update failed', details: { ns: BELL_SETTINGS_NS } },
            }
          }
          return { ok: true, value: view() }
        }
        if (endpoint === BELL_SETTINGS_RPC.upgrade) {
          const installation = inspectProfileInstallation(connectionCtx.baseUrl, BELL_PACKAGE_NAME)
          if (installation.kind !== 'npm') {
            return { ok: false, error: { code: 'internal', message: 'bell-notify is not an npm profile dependency', details: {} } }
          }
          if (upgrade !== undefined) {
            return { ok: false, error: { code: 'internal', message: 'bell-notify update is already running', details: {} } }
          }
          upgrade = updateNpmProfilePackage(installation.profileDir, BELL_PACKAGE_NAME)
          try {
            await upgrade
          } catch {
            return { ok: false, error: { code: 'internal', message: 'bell-notify update failed', details: {} } }
          } finally {
            upgrade = undefined
          }
          return { ok: true, value: { restartRequired: true } }
        }
        return { ok: false, error: { code: 'internal', message: `unknown bell-notify endpoint ${JSON.stringify(endpoint)}`, details: {} } }
      }
      connectionCtx.effect(
        () => connectionCtx.connection.rpc.handle(BELL_SETTINGS_RPC_CHANNEL, handler, { authority: 'loopback' }),
        'dsh-bell-notify: settings RPC',
      )
    })
  })
}
