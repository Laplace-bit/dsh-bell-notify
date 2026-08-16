import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { DEFAULT_CONFIG, type BellConfig } from './config.ts'
import { injectBootConfig } from './boot-config.ts'

/** Display name shown by the Host loader while the plugin is mounted. */
export const name = 'dsh-bell-notify'

/**
 * Plugin configuration accepted from the overlay's `config` section. Cordis
 * validates the value against this schema at load and fills omitted fields
 * from the shared defaults, so an invalid value fails the load loudly.
 */
export interface Config extends BellConfig {}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled),
  masterVolume: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.masterVolume),
  muteAll: Schema.boolean().default(DEFAULT_CONFIG.muteAll),
  maxQueue: Schema.number().min(1).max(64).default(DEFAULT_CONFIG.maxQueue),
  maxConcurrent: Schema.number().min(1).max(16).default(DEFAULT_CONFIG.maxConcurrent),
  defaultCooldown: Schema.number().min(0).max(60_000).default(DEFAULT_CONFIG.defaultCooldown),
  statusRevertMs: Schema.number().min(0).max(60_000).default(DEFAULT_CONFIG.statusRevertMs),
  showStatusIndicator: Schema.boolean().default(DEFAULT_CONFIG.showStatusIndicator),
})

/**
 * Host half: bridge the validated config to the browser half. The web boot
 * graph carries no per-entry config, so the value is injected into every
 * served index response as a boot global the client entry reads at apply
 * time. All notification work (audio, status) happens browser-side; the
 * Host half touches no agent state.
 * @param ctx - Host context carrying the web server service when composed.
 * @param config - Schema-validated configuration with defaults filled.
 */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootConfig(html, config)),
      'dsh-bell-notify: boot config bridge',
    )
  })
}
