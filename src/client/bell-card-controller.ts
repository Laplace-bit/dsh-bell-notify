/** Staged form state for the plugin-owned bell-notify settings RPC. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_BELL_SETTINGS, type BellSettings } from '../settings.ts'
import type { BellInstallationKind, BellSettingsView } from '../settings-api.ts'
import type { BellSettingsApi } from './bell-settings-api.ts'
import type { BellSoundControlsCell, BellSoundControlsState } from './bell-sound-controls.ts'

/** What the bell-notify card renders while it loads and stages settings. */
export interface BellNotifyCardState extends BellSettings {
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
  dirty: boolean
  saving: boolean
  failed: boolean
  version: string | undefined
  installation: BellInstallationKind
  canUpgrade: boolean
  upgrading: boolean
  upgradeFailed: boolean
  restartRequired: boolean
}

/** The registration-side face injected into the settings slot renderer. */
export interface BellNotifyCardFace {
  hooks: {
    bellNotifyCard: SnapshotStore<BellNotifyCardState>
    bellNotifySounds: BellSoundControlsCell
  }
  edit: (patch: Partial<BellSettings>) => void
  save: () => void
  discard: () => void
  reload: () => void
  upgrade: () => void
  setSoundEnabled: (event: string, enabled: boolean) => void
  previewDefaultSound: (event: string) => void
  previewCustomSound: (event: string) => void
  uploadSound: (event: string, file: File) => void
  resetSound: (event: string) => void
}

/** Bridges the protected Host interface and local sound controls onto one settings card. */
export class BellNotifyCardController {
  private readonly store = createSnapshotStore<BellNotifyCardState>(this.projection())
  private loaded: BellSettingsView | undefined
  private staged: BellSettings | undefined
  private saving = false
  private failed = false
  private upgrading = false
  private upgradeFailed = false
  private restartRequired = false
  private loadGeneration = 0
  private loadStatus: 'loading' | 'ready' | 'unavailable' = 'loading'

  constructor(
    private readonly api: BellSettingsApi,
    private readonly sounds: BellSoundControlsCell,
    private readonly defaults: BellSettings = DEFAULT_BELL_SETTINGS,
  ) {}

  start(): void { void this.load() }

  stop(): void { this.loadGeneration += 1 }

  getSnapshot(): BellNotifyCardState { return this.store.getSnapshot() }

  subscribe(listener: () => void): () => void { return this.store.subscribe(listener) }

  /** Settings that have reached the Host and should affect the live audio runtime. */
  getAppliedSettings(): BellSettings {
    if (this.loaded === undefined) return this.defaults
    return pickSettings(this.loaded)
  }

  inject(): BellNotifyCardFace {
    return {
      hooks: { bellNotifyCard: this.store, bellNotifySounds: this.sounds },
      edit: (patch) => {
        this.staged = { ...(this.staged ?? this.formSettings()), ...patch }
        this.failed = false
        this.publish()
      },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged === undefined && !this.failed) return
        this.staged = undefined
        this.failed = false
        this.publish()
      },
      reload: () => { void this.load() },
      upgrade: () => { void this.upgrade() },
      setSoundEnabled: (event, enabled) => { this.sounds.setEnabled(event, enabled) },
      previewDefaultSound: (event) => { this.sounds.previewDefault(event) },
      previewCustomSound: (event) => { this.sounds.previewCustom(event) },
      uploadSound: (event, file) => { this.sounds.upload(event, file) },
      resetSound: (event) => { this.sounds.reset(event) },
    }
  }

  private formSettings(): BellSettings {
    return this.staged ?? (this.loaded === undefined ? this.defaults : pickSettings(this.loaded))
  }

  private projection(): BellNotifyCardState {
    const settings = this.formSettings()
    return {
      status: this.loadStatus,
      writable: this.loaded?.writable ?? false,
      dirty: this.staged !== undefined,
      saving: this.saving,
      failed: this.failed,
      ...settings,
      version: this.loaded?.version,
      installation: this.loaded?.installation ?? 'unmanaged',
      canUpgrade: this.loaded?.canUpgrade ?? false,
      upgrading: this.upgrading,
      upgradeFailed: this.upgradeFailed,
      restartRequired: this.restartRequired,
    }
  }

  private async load(): Promise<void> {
    const generation = ++this.loadGeneration
    this.loadStatus = 'loading'
    this.publish()
    try {
      const view = await this.api.read()
      if (generation !== this.loadGeneration) return
      this.loaded = view
      this.loadStatus = 'ready'
    } catch {
      if (generation !== this.loadGeneration) return
      // Preserve a prior Host-accepted value for the live audio runtime if a
      // later retry fails. First-load failures still resolve to defaults.
      this.loadStatus = 'unavailable'
    }
    this.publish()
  }

  private async save(): Promise<void> {
    if (this.staged === undefined || this.saving || this.loaded?.writable !== true) return
    const settings = this.staged
    this.saving = true
    this.failed = false
    this.publish()
    try {
      this.loaded = await this.api.write(settings)
      this.staged = undefined
    } catch {
      this.failed = true
    }
    this.saving = false
    this.publish()
  }

  private async upgrade(): Promise<void> {
    if (this.loaded?.canUpgrade !== true || this.upgrading) return
    this.upgrading = true
    this.upgradeFailed = false
    this.restartRequired = false
    this.publish()
    try {
      const result = await this.api.upgrade()
      this.restartRequired = result.restartRequired
    } catch {
      this.upgradeFailed = true
    }
    this.upgrading = false
    this.publish()
  }

  private publish(): void { this.store.set(this.projection()) }
}

function pickSettings(view: BellSettingsView): BellSettings {
  return { enabled: view.enabled, muteAll: view.muteAll, masterVolume: view.masterVolume }
}

export type { BellSoundControlsState }
