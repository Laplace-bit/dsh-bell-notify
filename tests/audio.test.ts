import { describe, expect, it, vi } from 'vitest'
import type { Wave } from '../src/core/types'
import { WebAudioPlayer } from '../src/platform/audio'

class FakeParam {
  value = 1
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
}

class FakeGain {
  gain = new FakeParam()
  connect = vi.fn()
}

class FakeOscillator {
  type: Wave = 'sine'
  frequency = new FakeParam()
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeBufferSource {
  buffer: unknown = null
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeContext {
  currentTime = 10
  state: string = 'running'
  destination = {}
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []
  sources: FakeBufferSource[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  decodeAudioData = vi.fn(async () => ({ duration: 0.5 }))
  createOscillator() {
    const osc = new FakeOscillator()
    this.oscillators.push(osc)
    return osc
  }
  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }
  createBufferSource() {
    const src = new FakeBufferSource()
    this.sources.push(src)
    return src
  }
}

const noDelay = async () => {}

function makePlayer(ctxFactory: () => FakeContext, options: { masterVolume?: number } = {}) {
  const player = new WebAudioPlayer({
    ...options,
    createContext: ctxFactory,
    delay: noDelay,
  })
  return { player, ctxFactory }
}

describe('WebAudioPlayer', () => {
  it('静音时直接短路，不创建 AudioContext（F4）', async () => {
    const create = vi.fn(() => new FakeContext())
    const { player } = makePlayer(create)
    player.setMuted(true)
    await player.play('click')
    expect(create).not.toHaveBeenCalled()
    expect(player.isMuted).toBe(true)
  })

  it('未知声音直接返回，不创建 AudioContext', async () => {
    const create = vi.fn(() => new FakeContext())
    const { player } = makePlayer(create)
    await player.play('nope')
    expect(create).not.toHaveBeenCalled()
  })

  it('首次播放才惰性创建 AudioContext（自动播放策略兼容）', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    await player.play('click')
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.oscillators[0]!.type).toBe('sine')
    expect(ctx.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(1200, expect.any(Number))
  })

  it('多音符 Recipe 为每个音符创建 oscillator 并按时序调度', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    await player.play('success')
    expect(ctx.oscillators).toHaveLength(3)
    const freqs = ctx.oscillators.map((osc) => {
      const call = osc.frequency.setValueAtTime.mock.calls[0]!
      return call[0]
    })
    expect(freqs.map((f) => Math.round(f))).toEqual([523, 659, 784])
  })

  it('每个音符有 attack/衰减包络且连接到 master', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    await player.play('click')
    const master = ctx.gains[0]! // master 在 ensureContext 中最先创建
    const envelope = ctx.gains[1]!
    expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalled()
    expect(envelope.connect).toHaveBeenCalledWith(master)
    expect(ctx.oscillators[0]!.connect).toHaveBeenCalledWith(envelope)
  })

  it('suspended 状态下先 resume 再播放（自动播放策略）', async () => {
    const ctx = new FakeContext()
    ctx.state = 'suspended'
    const { player } = makePlayer(() => ctx)
    await player.play('click')
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.oscillators).toHaveLength(1)
  })

  it('AudioContext 创建失败时 play 抛错（由调度器吞掉），并短路后续尝试', async () => {
    let fail = true
    const { player } = makePlayer(() => {
      if (fail) throw new Error('no webaudio')
      return new FakeContext()
    })
    await expect(player.play('click')).rejects.toThrow(/unavailable/)
    fail = false
    await expect(player.play('click')).rejects.toThrow(/unavailable/)
  })

  it('默认工厂在无 window 环境下不可用（node 环境）', async () => {
    const player = new WebAudioPlayer({ delay: noDelay })
    await expect(player.play('click')).rejects.toThrow(/unavailable/)
  })

  it('masterVolume 生效并夹紧到 0–1，热更新即时生效', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx, { masterVolume: 2 })
    await player.play('click')
    const master = ctx.gains[0]! // master 在 ensureContext 中最先创建
    expect(master.gain.value).toBe(1) // 2 夹紧为 1
    player.setMasterVolume(-1)
    expect(master.gain.value).toBe(0)
    player.setMasterVolume(0.5)
    expect(master.gain.value).toBe(0.5)
  })

  it('dispose 关闭 AudioContext 并允许重建', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    await player.play('click')
    await player.dispose()
    expect(ctx.close).toHaveBeenCalledTimes(1)
    const ctx2 = new FakeContext()
    const player2 = new WebAudioPlayer({ createContext: () => ctx2, delay: noDelay })
    await player2.play('click')
    expect(ctx2.oscillators).toHaveLength(1)
  })

  it('自定义 buffer 注册后 play 优先走 buffer（不再合成 oscillator）', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob
    await player.registerCustomSound('custom:tool_start', blob)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)

    await player.play('custom:tool_start')
    expect(ctx.sources).toHaveLength(1)
    expect(ctx.oscillators).toHaveLength(0) // 未走合成路径
    expect(ctx.sources[0]!.connect).toHaveBeenCalled()
    expect(ctx.sources[0]!.start).toHaveBeenCalled()
  })

  it('unregisterCustomSound 后 play 不再命中 buffer（未知 key 静默返回）', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob
    await player.registerCustomSound('custom:x', blob)
    player.unregisterCustomSound('custom:x')
    await player.play('custom:x')
    expect(ctx.sources).toHaveLength(0)
  })

  it('registerCustomSound 解码失败时抛错（不注册）', async () => {
    const ctx = new FakeContext()
    ctx.decodeAudioData = vi.fn(async () => {
      throw new Error('decode failed')
    })
    const { player } = makePlayer(() => ctx)
    const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob
    await expect(player.registerCustomSound('custom:x', blob)).rejects.toThrow(/decode failed/)
    await player.play('custom:x')
    expect(ctx.sources).toHaveLength(0)
  })

  it('AudioContext 不可用时 registerCustomSound 抛错', async () => {
    let fail = true
    const { player } = makePlayer(() => {
      if (fail) throw new Error('no webaudio')
      return new FakeContext()
    })
    const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob
    await expect(player.registerCustomSound('custom:x', blob)).rejects.toThrow(/unavailable/)
  })

  it('stop 在声音自然结束前切断其 oscillator 并使 play 提前 resolve', async () => {
    const ctx = new FakeContext()
    // 用“永不结束”的 delay 保持声音在播，验证 stop 主动切断并 resolve
    const hanging = new WebAudioPlayer({
      createContext: () => ctx,
      delay: () => new Promise<void>(() => {}),
    })
    const pending = hanging.play('startup') // 0.35s 上行扫频
    await Promise.resolve()
    expect(ctx.oscillators).toHaveLength(1)
    const osc = ctx.oscillators[0]!
    hanging.stop('startup')
    await expect(pending).resolves.toBeUndefined()
    expect(osc.stop).toHaveBeenCalled()
  })

  it('stop 自定义 buffer 声音会 stop 其 source 节点', async () => {
    const ctx = new FakeContext()
    const hanging = new WebAudioPlayer({
      createContext: () => ctx,
      delay: () => new Promise<void>(() => {}),
    })
    const blob = { arrayBuffer: async () => new ArrayBuffer(0) } as Blob
    await hanging.registerCustomSound('custom:x', blob)
    const pending = hanging.play('custom:x')
    await Promise.resolve()
    expect(ctx.sources).toHaveLength(1)
    hanging.stop('custom:x')
    await expect(pending).resolves.toBeUndefined()
    expect(ctx.sources[0]!.stop).toHaveBeenCalled()
  })

  it('stop 未播放的声音无副作用且不抛错', async () => {
    const ctx = new FakeContext()
    const { player } = makePlayer(() => ctx)
    expect(() => player.stop('nothing')).not.toThrow()
    await player.play('click')
    expect(ctx.oscillators).toHaveLength(1)
  })
})
