import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMELINE_CAPACITY, Timeline } from '../src/core/timeline'

describe('Timeline 环形缓冲', () => {
  it('默认容量 50', () => {
    const timeline = new Timeline()
    for (let i = 0; i < 100; i++) timeline.push(`event:${i}`, i)
    expect(timeline.length).toBe(DEFAULT_TIMELINE_CAPACITY)
    const entries = timeline.toArray()
    expect(entries[0]!.event).toBe('event:50')
    expect(entries[entries.length - 1]!.event).toBe('event:99')
  })

  it('超容量丢弃最旧条目，保持时间正序', () => {
    const timeline = new Timeline(3)
    timeline.push('a', 1)
    timeline.push('b', 2)
    timeline.push('c', 3)
    timeline.push('d', 4)
    timeline.push('e', 5)
    expect(timeline.length).toBe(3)
    expect(timeline.toArray().map((e) => e.event)).toEqual(['c', 'd', 'e'])
  })

  it('未满容量时从头部开始返回', () => {
    const timeline = new Timeline(5)
    timeline.push('a', 1)
    timeline.push('b', 2)
    expect(timeline.toArray().map((e) => e.event)).toEqual(['a', 'b'])
    expect(timeline.length).toBe(2)
  })

  it('seq 严格递增且条目携带元数据', () => {
    const timeline = new Timeline()
    const e1 = timeline.push('tool:execute', 100, { status: 'working', soundId: 'click' })
    const e2 = timeline.push('agent:done', 200, { status: 'success' })
    expect(e2.seq).toBeGreaterThan(e1.seq)
    expect(e1).toMatchObject({ event: 'tool:execute', status: 'working', soundId: 'click' })
    expect(e2.soundId).toBeUndefined()
    expect(Object.isFrozen(e1)).toBe(true)
  })

  it('容量下限为 1', () => {
    const timeline = new Timeline(0)
    timeline.push('a', 1)
    timeline.push('b', 2)
    expect(timeline.toArray().map((e) => e.event)).toEqual(['b'])
  })

  it('clear 清空', () => {
    const timeline = new Timeline(2)
    timeline.push('a', 1)
    timeline.push('b', 2)
    timeline.clear()
    expect(timeline.length).toBe(0)
    expect(timeline.toArray()).toEqual([])
  })
})
