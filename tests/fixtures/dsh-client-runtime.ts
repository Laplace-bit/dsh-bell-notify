/** Minimal Harness client runtime facade used only by this package's Vitest specs. */

import { Service, type Context } from '@deepseek-ai/cordis'

export interface SnapshotStore<T> {
  getSnapshot(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    set(next: T): void {
      if (Object.is(value, next)) return
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

interface SlotOptions {
  name: string
  children?: Record<string, unknown>
  inject?: () => unknown
  [key: string]: unknown
}

export interface SlotEntry {
  options: SlotOptions
  component: unknown
  inject?: () => unknown
}

/**
 * Deliberately narrow SlotRegistry implementation. It preserves the card
 * registration/injection lifecycle the plugin owns without requiring a
 * checked-out Harness source tree or its browser ModuleLoader bundles.
 */
export class SlotRegistry extends Service {
  private readonly declarations = new Set<string>()
  private readonly registrations = new Map<string, SlotEntry[]>()
  private readonly declarationListeners = new Map<string, Set<() => void>>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  register(options: SlotOptions, component: unknown): () => void {
    for (const name of Object.keys(options.children ?? {})) this.declare(name)
    const entries = this.registrations.get(options.name) ?? []
    const entry: SlotEntry = { options, component, inject: options.inject }
    entries.push(entry)
    this.registrations.set(options.name, entries)
    return () => {
      const index = entries.indexOf(entry)
      if (index >= 0) entries.splice(index, 1)
    }
  }

  entries(name: string): readonly SlotEntry[] {
    return this.registrations.get(name) ?? []
  }

  inject(name: string, callback: () => (() => void) | void): () => void {
    const ctx = this.ctx
    const dispose = ctx.effect(() => {
      let active = (): void => {}
      const activate = (): void => {
        active()
        active = callback() ?? (() => {})
      }
      const listeners = this.declarationListeners.get(name) ?? new Set<() => void>()
      listeners.add(activate)
      this.declarationListeners.set(name, listeners)
      if (this.declarations.has(name)) activate()
      return () => {
        listeners.delete(activate)
        active()
      }
    }, `test slots.inject(${JSON.stringify(name)})`)
    return () => { void dispose() }
  }

  private declare(name: string): void {
    if (this.declarations.has(name)) return
    this.declarations.add(name)
    for (const listener of [...this.declarationListeners.get(name) ?? []]) listener()
  }
}
