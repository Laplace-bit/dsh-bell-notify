import { describe, expect, it, vi } from 'vitest'
import { SoundAssignments, CUSTOM_SOUND_PREFIX, type AssignmentStorage } from '../src/core/sound-assignments'

function fakeStorage(initial?: Record<string, string>): AssignmentStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

const KEY = 'dsh.bell-notify.sound-assignments'

describe('SoundAssignments 默认态', () => {
  it('无持久化记录时所有事件无自定义', () => {
    const a = new SoundAssignments({ storage: null })
    expect(a.get('tool:start')).toBeUndefined()
    expect(a.getKey('tool:start')).toBeUndefined()
    expect(a.getName('tool:start')).toBeUndefined()
    expect(a.isCustom('tool:start')).toBe(false)
  })
})

describe('SoundAssignments set/get', () => {
  it('set 后 getKey 返回自定义键，getName 返回文件名，isCustom 为 true', () => {
    const a = new SoundAssignments({ storage: null })
    a.set('tool:start', 'custom:tool_start', 'my sound.mp3')
    expect(a.getKey('tool:start')).toBe('custom:tool_start')
    expect(a.getName('tool:start')).toBe('my sound.mp3')
    expect(a.isCustom('tool:start')).toBe(true)
  })

  it('set 可省略文件名', () => {
    const a = new SoundAssignments({ storage: null })
    a.set('tool:start', 'custom:x')
    expect(a.getKey('tool:start')).toBe('custom:x')
    expect(a.getName('tool:start')).toBeUndefined()
  })

  it('set(null) 还原默认', () => {
    const a = new SoundAssignments({ storage: null })
    a.set('tool:start', 'custom:x', 'x.mp3')
    a.set('tool:start', null)
    expect(a.getKey('tool:start')).toBeUndefined()
    expect(a.getName('tool:start')).toBeUndefined()
    expect(a.isCustom('tool:start')).toBe(false)
  })

  it('相同值重复 set 不通知订阅者', () => {
    const a = new SoundAssignments({ storage: null })
    const fn = vi.fn()
    a.subscribe(fn)
    a.set('tool:start', 'custom:x', 'x.mp3')
    fn.mockClear()
    a.set('tool:start', 'custom:x', 'x.mp3')
    expect(fn).not.toHaveBeenCalled()
  })

  it('set 变化通知订阅者，退订后不再通知', () => {
    const a = new SoundAssignments({ storage: null })
    const seen: number[] = []
    const off = a.subscribe(() => seen.push(1))
    a.set('tool:start', 'custom:x')
    off()
    a.set('tool:start', null)
    expect(seen).toEqual([1])
  })

  it('dispose 后订阅者不再被通知', () => {
    const a = new SoundAssignments({ storage: null })
    const fn = vi.fn()
    a.subscribe(fn)
    a.dispose()
    a.set('tool:start', 'custom:x')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('SoundAssignments 持久化', () => {
  it('set 写入注入的 storage（含文件名）', () => {
    const storage = fakeStorage()
    const a = new SoundAssignments({ storage })
    a.set('tool:start', 'custom:tool_start', 'boom.wav')
    const parsed = JSON.parse(storage.data.get(KEY)!) as Record<string, { key: string; name?: string }>
    expect(parsed['tool:start']).toEqual({ key: 'custom:tool_start', name: 'boom.wav' })
  })

  it('构造时读回 storage 并覆盖（含文件名）', () => {
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ 'tool:start': { key: 'custom:abc', name: 'a.mp3' } }),
    })
    const a = new SoundAssignments({ storage })
    expect(a.getKey('tool:start')).toBe('custom:abc')
    expect(a.getName('tool:start')).toBe('a.mp3')
  })

  it('兼容旧版纯字符串格式', () => {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ 'tool:start': 'custom:old' }) })
    const a = new SoundAssignments({ storage })
    expect(a.getKey('tool:start')).toBe('custom:old')
    expect(a.getName('tool:start')).toBeUndefined()
  })

  it('损坏数据静默回退「无自定义」', () => {
    const storage = fakeStorage({ [KEY]: 'not-json' })
    const a = new SoundAssignments({ storage })
    expect(a.isCustom('tool:start')).toBe(false)
  })

  it('非对象持久化数据静默回退', () => {
    const storage = fakeStorage({ [KEY]: '"just-a-string"' })
    const a = new SoundAssignments({ storage })
    expect(a.isCustom('tool:start')).toBe(false)
  })

  it('过滤掉非 custom: 前缀的键（脏数据防护）', () => {
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ 'tool:start': 'evil-key', 'tool:done': { key: 'custom:ok' } }),
    })
    const a = new SoundAssignments({ storage })
    expect(a.isCustom('tool:start')).toBe(false)
    expect(a.getKey('tool:done')).toBe('custom:ok')
  })

  it('name 非字符串时忽略文件名但仍保留键', () => {
    const storage = fakeStorage({
      [KEY]: JSON.stringify({ 'tool:start': { key: 'custom:x', name: 42 } }),
    })
    const a = new SoundAssignments({ storage })
    expect(a.getKey('tool:start')).toBe('custom:x')
    expect(a.getName('tool:start')).toBeUndefined()
  })

  it('getItem 抛错时静默回退', () => {
    const storage = fakeStorage()
    storage.getItem = () => {
      throw new Error('blocked')
    }
    const a = new SoundAssignments({ storage })
    expect(a.isCustom('tool:start')).toBe(false)
  })

  it('setItem 抛错时 set 仍在本会话生效', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('quota exceeded')
    }
    const a = new SoundAssignments({ storage })
    expect(() => a.set('tool:start', 'custom:x', 'x.mp3')).not.toThrow()
    expect(a.getKey('tool:start')).toBe('custom:x')
  })
})

describe('CUSTOM_SOUND_PREFIX', () => {
  it('前缀为 custom:', () => {
    expect(CUSTOM_SOUND_PREFIX).toBe('custom:')
  })
})
