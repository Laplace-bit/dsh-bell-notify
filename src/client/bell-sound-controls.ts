/** Runtime bridge for the card's browser-local sound controls. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { SoundAssignments, CUSTOM_SOUND_PREFIX, type SoundFileStorage } from '../core/sound-assignments.ts'
import { RuleTable } from '../core/rules.ts'
import { SoundScheduler } from '../core/scheduler.ts'
import { SoundToggles, TOGGLEABLE_EVENTS } from '../core/toggles.ts'
import { WebAudioPlayer } from '../platform/audio.ts'

/** Browser-local state for one configurable notification event. */
export interface BellSoundEventState {
  event: string
  enabled: boolean
  custom: boolean
  customName: string | undefined
}

/** What the card sees from the active browser sound runtime. */
export interface BellSoundControlsState {
  available: boolean
  events: readonly BellSoundEventState[]
}

/** Runtime operations that remain local because custom audio blobs live in IndexedDB. */
export interface BellSoundControls {
  getSnapshot(): BellSoundControlsState
  subscribe(listener: () => void): () => void
  setEnabled(event: string, enabled: boolean): void
  previewDefault(event: string): void
  previewCustom(event: string): void
  upload(event: string, file: File): void
  reset(event: string): void
  dispose(): void
}

interface BellSoundControlsOptions {
  toggles: SoundToggles
  assignments: SoundAssignments
  rules: RuleTable
  scheduler: SoundScheduler
  player: WebAudioPlayer
  soundStore: SoundFileStorage | null
}

function eventIsConfigurable(event: string): boolean {
  return TOGGLEABLE_EVENTS.some(entry => entry.event === event)
}

/** Owns localStorage/IndexedDB-backed controls for one active browser runtime. */
class BrowserBellSoundControls implements BellSoundControls {
  private readonly subscribers = new Set<() => void>()
  private readonly offToggles: () => void
  private readonly offAssignments: () => void

  constructor(private readonly options: BellSoundControlsOptions) {
    this.offToggles = options.toggles.subscribe(() => { this.notify() })
    this.offAssignments = options.assignments.subscribe(() => { this.notify() })
  }

  getSnapshot(): BellSoundControlsState {
    return {
      available: true,
      events: TOGGLEABLE_EVENTS.map(entry => ({
        event: entry.event,
        enabled: this.options.toggles.isEnabled(entry.event),
        custom: this.options.assignments.isCustom(entry.event),
        customName: this.options.assignments.getName(entry.event),
      })),
    }
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => { this.subscribers.delete(listener) }
  }

  setEnabled(event: string, enabled: boolean): void {
    if (!eventIsConfigurable(event)) return
    this.options.toggles.set(event, enabled)
  }

  previewDefault(event: string): void {
    if (!eventIsConfigurable(event)) return
    const soundId = this.options.rules.get(event)?.soundId
    if (soundId !== undefined) this.options.scheduler.submit(soundId, { priority: 9, cooldown: 0 })
  }

  previewCustom(event: string): void {
    if (!eventIsConfigurable(event)) return
    const soundId = this.options.assignments.getKey(event)
    if (soundId !== undefined) this.options.scheduler.submit(soundId, { priority: 9, cooldown: 0 })
  }

  upload(event: string, file: File): void {
    if (!eventIsConfigurable(event) || this.options.soundStore === null) return
    const key = `${CUSTOM_SOUND_PREFIX}${event.replace(/[^a-zA-Z0-9-]/g, '_')}`
    void (async () => {
      try {
        await this.options.player.registerCustomSound(key, file)
        await this.options.soundStore?.put(key, file)
        this.options.assignments.set(event, key, file.name || undefined)
      } catch (error) {
        console.warn('[dsh-bell-notify] upload custom sound failed:', error)
      }
    })()
  }

  reset(event: string): void {
    if (!eventIsConfigurable(event)) return
    const key = this.options.assignments.getKey(event)
    if (key === undefined) return
    this.options.player.unregisterCustomSound(key)
    this.options.assignments.set(event, null)
    if (this.options.soundStore !== null) void this.options.soundStore.remove(key).catch(() => {})
  }

  dispose(): void {
    this.offToggles()
    this.offAssignments()
    this.subscribers.clear()
  }

  private notify(): void {
    for (const listener of [...this.subscribers]) {
      try {
        listener()
      } catch {
        /* A card listener must not interrupt the notification runtime. */
      }
    }
  }
}

/** Create the local controls once the sessions/browser runtime is active. */
export function createBellSoundControls(options: BellSoundControlsOptions): BellSoundControls {
  return new BrowserBellSoundControls(options)
}

/** Stable slot-facing cell that remains usable while the sessions service reconnects. */
export class BellSoundControlsCell {
  private readonly store: SnapshotStore<BellSoundControlsState> = createSnapshotStore({ available: false, events: [] })
  private controls: BellSoundControls | undefined
  private unsubscribe: (() => void) | undefined

  getSnapshot(): BellSoundControlsState {
    return this.store.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  attach(controls: BellSoundControls): () => void {
    this.detach()
    this.controls = controls
    const refresh = (): void => { this.store.set(controls.getSnapshot()) }
    refresh()
    this.unsubscribe = controls.subscribe(refresh)
    return () => {
      if (this.controls !== controls) return
      this.detach()
    }
  }

  setEnabled(event: string, enabled: boolean): void { this.controls?.setEnabled(event, enabled) }
  previewDefault(event: string): void { this.controls?.previewDefault(event) }
  previewCustom(event: string): void { this.controls?.previewCustom(event) }
  upload(event: string, file: File): void { this.controls?.upload(event, file) }
  reset(event: string): void { this.controls?.reset(event) }

  private detach(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.controls = undefined
    this.store.set({ available: false, events: [] })
  }
}
