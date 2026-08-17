// @vitest-environment jsdom

/** The plugin configuration card uses its own RPC, not core settings.describe. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { BellNotifyCard, type BellNotifyCardProps } from '../src/client/BellNotifyCard.tsx'
import type { BellNotifyCardFace } from '../src/client/bell-card-controller.ts'
import { en } from '../src/client/locales.ts'
import { BELL_BOOT_GLOBAL, DEFAULT_CONFIG } from '../src/config.ts'
import { BELL_SETTINGS_RPC, BELL_SETTINGS_RPC_CHANNEL } from '../src/settings-api.ts'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const developmentView = {
  version: '0.1.0',
  installation: 'development' as const,
  writable: true,
  enabled: true,
  muteAll: false,
  masterVolume: 0.7,
  canUpgrade: false,
}

interface BenchOptions {
  view?: typeof developmentView
  failRead?: boolean
}

function sessions() {
  return {
    list: {
      getSnapshot: () => ({ ids: [], byId: {}, current: undefined }),
      subscribe: () => () => {},
    },
  }
}

function declareCardSlot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.plugin.item': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

function cardFace(slots: SlotRegistry): BellNotifyCardFace {
  const entry = slots.entries('settings.plugin.item')[0]
  if (entry === undefined) throw new Error('bell-notify card was not registered')
  return (entry.inject as unknown as () => BellNotifyCardFace)()
}

function cardProps(face: BellNotifyCardFace): BellNotifyCardProps {
  return {
    ...face,
    t: (key: keyof typeof en) => en[key],
    useBellNotifyCard: (selector: (state: ReturnType<typeof face.hooks.bellNotifyCard.getSnapshot>) => unknown) => (
      selector(face.hooks.bellNotifyCard.getSnapshot())
    ),
    useBellNotifySounds: (selector: (state: ReturnType<typeof face.hooks.bellNotifySounds.getSnapshot>) => unknown) => (
      selector(face.hooks.bellNotifySounds.getSnapshot())
    ),
  } as unknown as BellNotifyCardProps
}

describe('bell-notify settings card', () => {
  it('uses the standard theme-aware card surface tokens', () => {
    const styles = readFileSync(join(process.cwd(), 'src/client/BellNotifyCard.module.css'), 'utf8')

    expect(styles).toContain('border: 1px solid var(--dsw-alias-border-l2)')
    expect(styles).toContain('background: var(--dsw-alias-bg-layer-3)')
    expect(styles).toContain('background: var(--dsw-alias-bg-layer-2)')
  })

  it('does not require sessions to begin registering the settings card', () => {
    expect(inject).toEqual([])
  })

  it('ignores a legacy status-indicator flag instead of mounting a corner overlay', async () => {
    const boot = globalThis as Record<string, unknown>
    const previous = boot[BELL_BOOT_GLOBAL]
    boot[BELL_BOOT_GLOBAL] = { ...DEFAULT_CONFIG, showStatusIndicator: true }
    try {
      const ctx = new Context()
      await ctx.plugin(SlotRegistry).await()
      const slots = ctx.get('slots') as SlotRegistry
      ctx.provide('locale', { register: () => () => {} } as never)
      ctx.provide('connection', { rpc: { call: vi.fn(() => Promise.resolve({ ok: true, value: developmentView })) } } as never)
      ctx.provide('sessions', sessions() as never)
      declareCardSlot(slots)

      await ctx.plugin({ inject: [...inject], apply }).await()

      expect(document.body.querySelector('[data-plugin="dsh-bell-notify"]')).toBeNull()
    } finally {
      if (previous === undefined) delete boot[BELL_BOOT_GLOBAL]
      else boot[BELL_BOOT_GLOBAL] = previous
    }
  })

  it('keeps the plugin card available when the boot config is malformed', async () => {
    const boot = globalThis as Record<string, unknown>
    const previous = boot[BELL_BOOT_GLOBAL]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    boot[BELL_BOOT_GLOBAL] = { enabled: 'not-a-boolean' }
    try {
      const ctx = new Context()
      await ctx.plugin(SlotRegistry).await()
      const slots = ctx.get('slots') as SlotRegistry
      ctx.provide('locale', { register: () => () => {} } as never)
      ctx.provide('connection', { rpc: { call: vi.fn(() => Promise.resolve({ ok: true, value: developmentView })) } } as never)
      ctx.provide('sessions', sessions() as never)
      declareCardSlot(slots)

      await ctx.plugin({ inject: [...inject], apply }).await()

      expect(slots.entries('settings.plugin.item').map(entry => entry.options.id)).toEqual(['bell-notify'])
    } finally {
      warn.mockRestore()
      if (previous === undefined) delete boot[BELL_BOOT_GLOBAL]
      else boot[BELL_BOOT_GLOBAL] = previous
    }
  })

  it('registers despite the core API filtering third-party settings namespaces', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    const coreDescribe = vi.fn(() => Promise.resolve({
      rpcId: 'settings',
      result: { ok: false, error: { code: 'settings-not-exposed' } },
    }))
    let view = developmentView
    const call = vi.fn(async (channel: string, endpoint: string, payload: unknown) => {
      if (channel === BELL_SETTINGS_RPC_CHANNEL && endpoint === BELL_SETTINGS_RPC.read) {
        return { ok: true as const, value: view }
      }
      if (channel === BELL_SETTINGS_RPC_CHANNEL && endpoint === BELL_SETTINGS_RPC.write) {
        view = { ...view, ...(payload as Partial<typeof view>) }
        return { ok: true as const, value: view }
      }
      return { ok: false as const, error: { code: 'internal', message: 'unexpected RPC' } }
    })
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('connection', { api: { settings: { describe: coreDescribe } }, rpc: { call } } as never)
    ctx.provide('sessions', sessions() as never)
    declareCardSlot(slots)

    await ctx.plugin({ inject: [...inject], apply }).await()

    expect(slots.entries('settings.plugin.item').map(entry => entry.options.id)).toEqual(['bell-notify'])
    expect(call).toHaveBeenCalledWith(BELL_SETTINGS_RPC_CHANNEL, BELL_SETTINGS_RPC.read, {})
    expect(coreDescribe).not.toHaveBeenCalled()
  })

  it('labels a linked installation as a development version and disables updates', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('connection', {
      rpc: { call: vi.fn(() => Promise.resolve({ ok: true, value: developmentView })) },
    } as never)
    ctx.provide('sessions', sessions() as never)
    declareCardSlot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const face = cardFace(slots)
    await vi.waitFor(() => expect(face.hooks.bellNotifyCard.getSnapshot().status).toBe('ready'))
    render(<BellNotifyCard {...cardProps(face)} />)

    fireEvent.click(screen.getByRole('button', { name: /bell notifications/i }))
    expect(screen.getByText('Development version 0.1.0')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.update }).getAttribute('disabled')).not.toBeNull()
  })

  it('wires every editable card control to its feature-owned action', () => {
    const actions = {
      edit: vi.fn(), save: vi.fn(), discard: vi.fn(), reload: vi.fn(), upgrade: vi.fn(),
      setSoundEnabled: vi.fn(), previewDefaultSound: vi.fn(), previewCustomSound: vi.fn(),
      uploadSound: vi.fn(), resetSound: vi.fn(),
    }
    const card = {
      status: 'ready' as const,
      writable: true,
      dirty: true,
      saving: false,
      failed: false,
      enabled: true,
      muteAll: false,
      masterVolume: 0.7,
      version: '0.1.0',
      installation: 'npm' as const,
      canUpgrade: true,
      upgrading: false,
      upgradeFailed: false,
      restartRequired: false,
    }
    const sounds = {
      available: true,
      events: [
        { event: 'agent:start', enabled: true, custom: false, customName: undefined },
        { event: 'agent:done', enabled: true, custom: true, customName: 'done.mp3' },
      ],
    }
    const props = {
      ...actions,
      t: (key: keyof typeof en) => en[key],
      useBellNotifyCard: (selector: (state: typeof card) => unknown) => selector(card),
      useBellNotifySounds: (selector: (state: typeof sounds) => unknown) => selector(sounds),
    } as unknown as BellNotifyCardProps
    render(<BellNotifyCard {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /bell notifications/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /enable notification sounds/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /mute all sounds/i }))
    fireEvent.change(screen.getByRole('slider', { name: en.masterVolume }), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('checkbox', { name: en.eventAgentStart }))
    fireEvent.click(screen.getAllByRole('button', { name: en.preview })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: en.preview })[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: en.changeSound })[0]!)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bell'], 'notice.mp3', { type: 'audio/mpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: en.restoreDefault }))
    fireEvent.click(screen.getByRole('button', { name: en.update }))
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(actions.edit).toHaveBeenCalledWith({ enabled: false })
    expect(actions.edit).toHaveBeenCalledWith({ muteAll: true })
    expect(actions.edit).toHaveBeenCalledWith({ masterVolume: 0.35 })
    expect(actions.setSoundEnabled).toHaveBeenCalledWith('agent:start', false)
    expect(actions.previewDefaultSound).toHaveBeenCalledWith('agent:start')
    expect(actions.previewCustomSound).toHaveBeenCalledWith('agent:done')
    expect(actions.uploadSound).toHaveBeenCalledWith('agent:start', file)
    expect(actions.resetSound).toHaveBeenCalledWith('agent:done')
    expect(actions.upgrade).toHaveBeenCalledOnce()
    expect(actions.discard).toHaveBeenCalledOnce()
    expect(actions.save).toHaveBeenCalledOnce()
  })

  it('writes staged notification preferences through the plugin-owned RPC', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    const call = vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
      if (endpoint === BELL_SETTINGS_RPC.read) return { ok: true as const, value: developmentView }
      if (endpoint === BELL_SETTINGS_RPC.write) return { ok: true as const, value: { ...developmentView, ...(payload as object) } }
      return { ok: true as const, value: { restartRequired: true } }
    })
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('connection', { rpc: { call } } as never)
    ctx.provide('sessions', sessions() as never)
    declareCardSlot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const face = cardFace(slots)
    await vi.waitFor(() => expect(face.hooks.bellNotifyCard.getSnapshot().status).toBe('ready'))

    face.edit({ enabled: false, muteAll: true, masterVolume: 0.35 })
    expect(face.hooks.bellNotifyCard.getSnapshot()).toMatchObject({ dirty: true, enabled: false, masterVolume: 0.35 })
    face.save()
    await vi.waitFor(() => expect(face.hooks.bellNotifyCard.getSnapshot()).toMatchObject({
      dirty: false, enabled: false, muteAll: true, masterVolume: 0.35,
    }))
    expect(call).toHaveBeenCalledWith(BELL_SETTINGS_RPC_CHANNEL, BELL_SETTINGS_RPC.write, {
      enabled: false,
      muteAll: true,
      masterVolume: 0.35,
    })
  })

  it('moves the browser-local event toggle controls into the card face', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    ctx.provide('locale', { register: () => () => {} } as never)
    ctx.provide('connection', { rpc: { call: vi.fn(() => Promise.resolve({ ok: true, value: developmentView })) } } as never)
    ctx.provide('sessions', sessions() as never)
    declareCardSlot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const face = cardFace(slots)

    await vi.waitFor(() => expect(face.hooks.bellNotifySounds.getSnapshot().available).toBe(true))
    expect(face.hooks.bellNotifySounds.getSnapshot().events.find(entry => entry.event === 'agent:start'))
      .toMatchObject({ enabled: true, custom: false })
    face.setSoundEnabled('agent:start', false)
    expect(face.hooks.bellNotifySounds.getSnapshot().events.find(entry => entry.event === 'agent:start'))
      .toMatchObject({ enabled: false, custom: false })
  })
})
