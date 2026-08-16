import { describe, expect, it } from 'vitest'
import { SoundScheduler } from '../src/core/scheduler'
import type { SoundPlayer } from '../src/core/scheduler'

/** 受控播放器：手动决定每个声音何时“自然结束”，支持并发在飞。 */
class FakePlayer implements SoundPlayer {
  readonly played: string[] = []
  private pending = new Map<number, { soundId: string; resolve: () => void }>()
  private nextId = 0
  private rejectIds = new Set<string>()

  play(soundId: string): Promise<void> {
    this.played.push(soundId)
    return new Promise<void>((resolve, reject) => {
      if (this.rejectIds.has(soundId)) {
        this.rejectIds.delete(soundId)
        reject(new Error('audio unavailable'))
        return
      }
      const id = this.nextId++
      this.pending.set(id, { soundId, resolve })
    })
  }

  /** 当前在飞（未结束）的声音 id，按提交顺序。 */
  get playing(): string[] {
    return [...this.pending.values()].map((p) => p.soundId)
  }

  get playingCount(): number {
    return this.pending.size
  }

  /** 结束指定声音（按 id 找最早一个）。 */
  finish(soundId: string): void {
    const entry = [...this.pending.entries()].find(([, p]) => p.soundId === soundId)
    if (entry) {
      this.pending.delete(entry[0])
      entry[1].resolve()
    }
  }

  failNext(soundId: string): void {
    this.rejectIds.add(soundId)
  }
}

function setup(maxQueue?: number, maxConcurrent?: number) {
  const player = new FakePlayer()
  let clock = 0
  const scheduler = new SoundScheduler({
    player,
    maxQueue,
    maxConcurrent,
    now: () => clock,
  })
  return {
    player,
    scheduler,
    advance: (ms: number) => {
      clock += ms
    },
    clock: () => clock,
  }
}

/** 等待在飞任务收尾（微任务冲刷 + 一个宏任务），让 finally/pump 推进。 */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('SoundScheduler', () => {
  it('空闲时立即播放', () => {
    const { player, scheduler } = setup()
    expect(scheduler.submit('click')).toBe(true)
    expect(player.played).toEqual(['click'])
    expect(scheduler.activeCount).toBe(1)
    expect(scheduler.isPlaying).toBe(true)
  })

  it('冷却期内的重复提交被丢弃（F8）', () => {
    const { player, scheduler } = setup()
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(true)
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(false)
    expect(player.played).toEqual(['click'])
  })

  it('冷却到期后允许再次播放', async () => {
    const { player, scheduler, advance } = setup()
    scheduler.submit('click', { cooldown: 1000 })
    player.finish('click')
    await settle() // 等 finally 清空 activeIds，排除去重干扰
    advance(1000)
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(true)
    await settle()
    expect(player.played).toEqual(['click', 'click'])
  })

  it('冷却为节流语义：每个冷却窗口最多接受一次（F8）', async () => {
    const { scheduler, advance, player } = setup()
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(true) // t=0 接受
    player.finish('click')
    await settle()
    advance(600)
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(false) // t=600 距上次接受 600ms
    advance(600)
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(true) // t=1200 距上次接受 1200ms
    player.finish('click')
    await settle()
    advance(300)
    expect(scheduler.submit('click', { cooldown: 1000 })).toBe(false) // t=1500 距上次接受 300ms
  })

  it('正在播放的同 soundId 被去重（并发下不与自己重叠）', () => {
    const { player, scheduler } = setup()
    scheduler.submit('a')
    expect(scheduler.submit('a')).toBe(false)
    expect(player.played).toEqual(['a'])
    expect(player.playingCount).toBe(1)
  })

  it('最多 maxConcurrent 个声音并发，超出者排队', () => {
    const { player, scheduler } = setup(undefined, 2)
    expect(scheduler.submit('a')).toBe(true)
    expect(scheduler.submit('b')).toBe(true)
    expect(scheduler.submit('c')).toBe(true) // 进入队列
    expect(player.played).toEqual(['a', 'b'])
    expect(scheduler.activeCount).toBe(2)
    expect(scheduler.pendingCount).toBe(1)
  })

  it('有并发名额空出时按优先级补位出队', async () => {
    const { player, scheduler } = setup(undefined, 2)
    scheduler.submit('a')
    scheduler.submit('b')
    scheduler.submit('low', { priority: 1 })
    scheduler.submit('high', { priority: 9 })
    scheduler.submit('mid', { priority: 5 })
    expect(scheduler.pendingCount).toBe(3)

    player.finish('a')
    await settle()
    expect(player.playing).toEqual(['b', 'high'])
    player.finish('b')
    await settle()
    expect(player.playing).toEqual(['high', 'mid'])
    player.finish('high')
    await settle()
    expect(player.playing).toEqual(['mid', 'low'])
  })

  it('队列中同 soundId 合并，只保留一次（R3）', () => {
    const { scheduler } = setup(undefined, 1)
    scheduler.submit('busy')
    scheduler.submit('a') // 排队
    expect(scheduler.pendingCount).toBe(1)
    scheduler.submit('a') // 与队列中的 a 合并
    scheduler.submit('a')
    expect(scheduler.pendingCount).toBe(1)
  })

  it('同优先级保持 FIFO', async () => {
    const { player, scheduler } = setup(undefined, 1)
    scheduler.submit('busy')
    scheduler.submit('x')
    scheduler.submit('y')
    player.finish('busy')
    await settle()
    expect(player.playing).toEqual(['x'])
    player.finish('x')
    await settle()
    expect(player.playing).toEqual(['y'])
  })

  it('队列满且新任务不高于队内最低优先级时丢弃', () => {
    const { scheduler } = setup(2, 1)
    scheduler.submit('busy')
    scheduler.submit('x', { priority: 1 })
    scheduler.submit('y', { priority: 1 })
    expect(scheduler.pendingCount).toBe(2)
    expect(scheduler.submit('z', { priority: 1 })).toBe(false)
    expect(scheduler.submit('z', { priority: 0 })).toBe(false)
    expect(scheduler.pendingCount).toBe(2)
  })

  it('队列满且新任务优先级更高时挤掉队内最低', async () => {
    const { player, scheduler } = setup(2, 1)
    scheduler.submit('busy')
    scheduler.submit('x', { priority: 1 })
    scheduler.submit('y', { priority: 2 })
    expect(scheduler.submit('urgent', { priority: 9 })).toBe(true)
    expect(scheduler.pendingCount).toBe(2) // x 被挤掉

    player.finish('busy')
    await settle()
    expect(player.playing).toEqual(['urgent'])
    player.finish('urgent')
    await settle()
    expect(player.playing).toEqual(['y'])
  })

  it('播放器抛错被静默吞掉且不影响后续任务（R2）', async () => {
    const { player, scheduler } = setup(undefined, 1)
    player.failNext('bad')
    expect(scheduler.submit('bad')).toBe(true)
    await settle()
    expect(scheduler.submit('good')).toBe(true)
    await settle()
    expect(player.played).toEqual(['bad', 'good'])
    expect(scheduler.isPlaying).toBe(true)
  })

  it('全部播完后回到空闲态', async () => {
    const { player, scheduler } = setup(undefined, 2)
    scheduler.submit('a')
    scheduler.submit('b')
    player.finish('a')
    await settle()
    player.finish('b')
    await settle()
    expect(scheduler.isPlaying).toBe(false)
    expect(scheduler.activeCount).toBe(0)
    expect(scheduler.pendingCount).toBe(0)
  })

  it('dispose 清空队列与冷却记录', () => {
    const { scheduler } = setup(undefined, 1)
    scheduler.submit('busy')
    scheduler.submit('queued')
    scheduler.dispose()
    expect(scheduler.pendingCount).toBe(0)
  })

  it('压力模拟：1000 次重复提交内存有界（队列 + 冷却表不增长）', () => {
    const { scheduler, advance } = setup(8, 3)
    for (let i = 0; i < 1000; i++) {
      scheduler.submit('click', { cooldown: 1000, priority: 3 })
      scheduler.submit(`sound-${i % 4}`, { priority: 2 })
      advance(1)
    }
    expect(scheduler.pendingCount).toBeLessThanOrEqual(9)
  })
})
