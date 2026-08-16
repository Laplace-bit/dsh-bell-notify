import { describe, expect, it } from 'vitest'
import { StatusMachine } from '../src/core/state'
import { Timeline } from '../src/core/timeline'
import { UIManager } from '../src/platform/ui'
import type { UiComponentHost } from '../src/platform/ui'

function setup() {
  return { machine: new StatusMachine(), timeline: new Timeline(3), ui: null }
}

describe('UIManager', () => {
  it('快照包含状态与时间线', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    timeline.push('tool:execute', 100, { status: 'working', soundId: 'click' })
    const snapshot = manager.getSnapshot()
    expect(snapshot.status).toBe('idle')
    expect(snapshot.timeline).toHaveLength(1)
    expect(snapshot.timeline[0]!.event).toBe('tool:execute')
  })

  it('状态机变更时通知订阅者，退订后不再通知', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    const seen: string[] = []
    const off = manager.subscribe((s) => seen.push(s.status))
    machine.set('working')
    off()
    machine.set('thinking')
    expect(seen).toEqual(['working'])
  })

  it('时间线推送不触发快照通知（只有状态变化通知）', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    const seen: string[] = []
    manager.subscribe((s) => seen.push(s.status))
    timeline.push('agent:thinking', 1, { status: 'thinking' })
    expect(seen).toEqual([])
  })

  it('向 DSH UI 注册状态指示器与事件时间线组件', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    const registered = new Map<string, unknown>()
    const host: UiComponentHost = {
      registerComponent: (name, component) => registered.set(name, component),
    }
    manager.registerComponents(host)
    expect([...registered.keys()].sort()).toEqual(['bell-status', 'bell-timeline'])

    timeline.push('agent:done', 5, { status: 'success', soundId: 'success' })
    const status = registered.get('bell-status') as { getStatus(): string }
    const timelineComp = registered.get('bell-timeline') as { getEntries(): Array<{ event: string }> }
    machine.set('success')
    expect(status.getStatus()).toBe('success')
    expect(timelineComp.getEntries()[0]!.event).toBe('agent:done')
  })

  it('单个订阅者抛错不影响其他订阅者', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    const seen: string[] = []
    manager.subscribe(() => {
      throw new Error('bad ui')
    })
    manager.subscribe((s) => seen.push(s.status))
    machine.set('working')
    expect(seen).toEqual(['working'])
  })

  it('dispose 后状态机不再传导到 UI 订阅者', () => {
    const { machine, timeline } = setup()
    const manager = new UIManager(machine, timeline)
    const seen: string[] = []
    manager.subscribe((s) => seen.push(s.status))
    manager.dispose()
    machine.set('working')
    // 订阅者不再被通知；manager.status 仍可透读状态机（只读查询不构成传导）
    expect(seen).toEqual([])
    expect(machine.status).toBe('working')
  })
})
