import { describe, expect, it, vi } from 'vitest'
import { SoundToggles, TOGGLEABLE_EVENTS, type ToggleStorage } from '../src/core/toggles'

function fakeStorage(initial?: Record<string, string>): ToggleStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('SoundToggles 默认种子', () => {
  it('默认开启的事件默认 on，tool/command 完成默认 off', () => {
    const toggles = new SoundToggles(null)
    expect(toggles.isEnabled('tool:start')).toBe(true)
    expect(toggles.isEnabled('command:start')).toBe(true)
    expect(toggles.isEnabled('agent:thinking')).toBe(true)
    expect(toggles.isEnabled('tool:done')).toBe(false)
    expect(toggles.isEnabled('command:done')).toBe(false)
  })

  it('未知事件默认视为开启（fail-open）', () => {
    const toggles = new SoundToggles(null)
    expect(toggles.isEnabled('unknown:event')).toBe(true)
  })
})

describe('SoundToggles set/isEnabled', () => {
  it('set 后立即生效并通知订阅者，退订后不再通知', () => {
    const toggles = new SoundToggles(null)
    const seen: number[] = []
    const off = toggles.subscribe(() => seen.push(1))
    toggles.set('tool:start', false)
    expect(toggles.isEnabled('tool:start')).toBe(false)
    off()
    toggles.set('tool:start', true)
    expect(seen).toEqual([1])
  })

  it('相同值重复 set 不触发通知', () => {
    const toggles = new SoundToggles(null)
    const fn = vi.fn()
    toggles.subscribe(fn)
    toggles.set('tool:start', true) // 默认已 true
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('SoundToggles 持久化', () => {
  it('set 写入注入的 storage', () => {
    const storage = fakeStorage()
    const toggles = new SoundToggles(storage)
    toggles.set('tool:done', true)
    const raw = storage.data.get('dsh.bell-notify.sound-toggles')
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!) as Record<string, boolean>
    expect(parsed['tool:done']).toBe(true)
  })

  it('构造时从 storage 读回并覆盖默认', () => {
    const storage = fakeStorage({
      'dsh.bell-notify.sound-toggles': JSON.stringify({ 'tool:done': true, 'tool:start': false }),
    })
    const toggles = new SoundToggles(storage)
    expect(toggles.isEnabled('tool:done')).toBe(true)
    expect(toggles.isEnabled('tool:start')).toBe(false)
  })

  it('损坏数据静默回退默认种子', () => {
    const storage = fakeStorage({ 'dsh.bell-notify.sound-toggles': 'not-json' })
    const toggles = new SoundToggles(storage)
    expect(toggles.isEnabled('tool:done')).toBe(false) // 默认 off 未受影响
    expect(toggles.isEnabled('tool:start')).toBe(true)
  })

  it('storage 为 null 时（SSR）只读默认、set 不抛错', () => {
    const toggles = new SoundToggles(null)
    expect(() => toggles.set('tool:start', false)).not.toThrow()
    expect(toggles.isEnabled('tool:start')).toBe(false)
  })

  it('getItem 抛错时静默回退默认', () => {
    const storage = fakeStorage()
    storage.getItem = () => {
      throw new Error('storage blocked')
    }
    const toggles = new SoundToggles(storage)
    expect(toggles.isEnabled('tool:done')).toBe(false)
  })

  it('setItem 抛错时 set 仍在本会话生效', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('quota exceeded')
    }
    const toggles = new SoundToggles(storage)
    expect(() => toggles.set('tool:done', true)).not.toThrow()
    expect(toggles.isEnabled('tool:done')).toBe(true)
  })

  it('持久化数据非对象时静默回退默认', () => {
    const storage = fakeStorage({ 'dsh.bell-notify.sound-toggles': '"just-a-string"' })
    const toggles = new SoundToggles(storage)
    expect(toggles.isEnabled('tool:done')).toBe(false)
  })

  it('dispose 后订阅者不再被通知', () => {
    const toggles = new SoundToggles(null)
    const fn = vi.fn()
    toggles.subscribe(fn)
    toggles.dispose()
    toggles.set('tool:start', false)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('TOGGLEABLE_EVENTS 目录', () => {
  it('覆盖全部 10 个事件且无重复', () => {
    const events = TOGGLEABLE_EVENTS.map((e) => e.event)
    expect(new Set(events).size).toBe(events.length)
    expect(events).toHaveLength(10)
  })
})
