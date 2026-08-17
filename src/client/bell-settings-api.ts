/** Browser adapter for the Host-owned bell-notify settings RPC. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  BELL_SETTINGS_RPC,
  BELL_SETTINGS_RPC_CHANNEL,
  type BellSettingsView,
  type BellUpgradeView,
} from '../settings-api.ts'
import type { BellSettings } from '../settings.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function settingsView(value: unknown): BellSettingsView {
  const data = record(value)
  if (data === undefined
    || typeof data.version !== 'string'
    || !['npm', 'development', 'unmanaged'].includes(data.installation as string)
    || typeof data.writable !== 'boolean'
    || typeof data.enabled !== 'boolean'
    || typeof data.masterVolume !== 'number'
    || !Number.isFinite(data.masterVolume)
    || data.masterVolume < 0
    || data.masterVolume > 1
    || typeof data.canUpgrade !== 'boolean') {
    throw new Error('dsh-bell-notify: malformed settings response')
  }
  return data as unknown as BellSettingsView
}

function upgradeView(value: unknown): BellUpgradeView {
  const data = record(value)
  if (data?.restartRequired !== true) throw new Error('dsh-bell-notify: malformed update response')
  return { restartRequired: true }
}

function accepted(result: Awaited<ReturnType<ConnectionHandle['rpc']['call']>>): unknown {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Narrow client contract consumed by the staged settings-card controller. */
export interface BellSettingsApi {
  read(): Promise<BellSettingsView>
  write(settings: BellSettings): Promise<BellSettingsView>
  upgrade(): Promise<BellUpgradeView>
}

/** Build the typed facade over the plugin's loopback-only RPC channel. */
export function createBellSettingsApi(connection: ConnectionHandle): BellSettingsApi {
  return {
    async read(): Promise<BellSettingsView> {
      return settingsView(accepted(await connection.rpc.call(BELL_SETTINGS_RPC_CHANNEL, BELL_SETTINGS_RPC.read, {})))
    },
    async write(settings: BellSettings): Promise<BellSettingsView> {
      return settingsView(accepted(await connection.rpc.call(BELL_SETTINGS_RPC_CHANNEL, BELL_SETTINGS_RPC.write, settings)))
    },
    async upgrade(): Promise<BellUpgradeView> {
      return upgradeView(accepted(await connection.rpc.call(BELL_SETTINGS_RPC_CHANNEL, BELL_SETTINGS_RPC.upgrade, {})))
    },
  }
}
