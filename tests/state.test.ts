import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REVERT_MS, StatusMachine } from '../src/core/state'
import type { AgentStatus } from '../src/core/types'

describe('StatusMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始状态为 idle', () => {
    expect(new StatusMachine().status).toBe('idle')
  })

  it('稳态切换通知订阅者', () => {
    const machine = new StatusMachine()
    const seen: AgentStatus[] = []
    machine.subscribe((s) => seen.push(s))
    machine.set('thinking')
    machine.set('working')
    expect(seen).toEqual(['thinking', 'working'])
    expect(machine.status).toBe('working')
  })

  it('瞬态状态在 revertMs 后回归最后一个稳态', () => {
    const machine = new StatusMachine()
    machine.set('working')
    machine.set('success')
    expect(machine.status).toBe('success')
    vi.advanceTimersByTime(DEFAULT_REVERT_MS)
    expect(machine.status).toBe('working')
  })

  it('瞬态重复触发会重置回归定时器', () => {
    const machine = new StatusMachine({ revertMs: 1000 })
    machine.set('idle')
    machine.set('success')
    vi.advanceTimersByTime(500)
    machine.set('success') // 重复触发：不通知，但重新计时
    vi.advanceTimersByTime(500)
    expect(machine.status).toBe('success')
    vi.advanceTimersByTime(500)
    expect(machine.status).toBe('idle')
  })

  it('error 同样是瞬态', () => {
    const machine = new StatusMachine()
    machine.set('thinking')
    machine.set('error')
    vi.advanceTimersByTime(DEFAULT_REVERT_MS)
    expect(machine.status).toBe('thinking')
  })

  it('瞬态回归切换到稳态会取消回归定时器', () => {
    const machine = new StatusMachine()
    const seen: AgentStatus[] = []
    machine.subscribe((s) => seen.push(s))
    machine.set('success')
    machine.set('waiting') // 稳态覆盖瞬态，取消回归
    vi.advanceTimersByTime(DEFAULT_REVERT_MS * 2)
    expect(machine.status).toBe('waiting')
    expect(seen).toEqual(['success', 'waiting'])
  })

  it('configure 热更新 revertMs', () => {
    const machine = new StatusMachine({ revertMs: 100 })
    machine.configure({ revertMs: 5000 })
    machine.set('idle')
    machine.set('success')
    vi.advanceTimersByTime(4999)
    expect(machine.status).toBe('success')
    vi.advanceTimersByTime(1)
    expect(machine.status).toBe('idle')
  })

  it('单个订阅者抛错不影响其他订阅者', () => {
    const machine = new StatusMachine()
    const seen: AgentStatus[] = []
    machine.subscribe(() => {
      throw new Error('bad subscriber')
    })
    machine.subscribe((s) => seen.push(s))
    machine.set('working')
    expect(seen).toEqual(['working'])
  })

  it('subscribe 返回退订函数', () => {
    const machine = new StatusMachine()
    const seen: AgentStatus[] = []
    const off = machine.subscribe((s) => seen.push(s))
    machine.set('thinking')
    off()
    machine.set('working')
    expect(seen).toEqual(['thinking'])
  })

  it('dispose 清理定时器与订阅', () => {
    const machine = new StatusMachine()
    const seen: AgentStatus[] = []
    machine.subscribe((s) => seen.push(s))
    machine.set('success')
    machine.dispose()
    vi.advanceTimersByTime(DEFAULT_REVERT_MS * 2)
    expect(machine.status).toBe('success') // 不再回归
    machine.set('working') // 订阅已清空，不通知
    expect(seen).toEqual(['success'])
  })
})
