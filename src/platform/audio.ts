import { getRecipe, recipeDuration } from '../core/sounds'
import type { SoundPlayer } from '../core/scheduler'
import type { Wave } from '../core/types'

// 用最小结构接口而非 DOM 类型描述 AudioContext，
// 一方面 core/platform 不产生真实 DOM 耦合，另一方面测试可注入 fake。

interface AudioParamLike {
  value: number
  setValueAtTime(value: number, startTime: number): void
  linearRampToValueAtTime(value: number, endTime: number): void
}

interface GainNodeLike {
  gain: AudioParamLike
  connect(target: unknown): unknown
}

interface OscillatorLike {
  type: Wave
  frequency: AudioParamLike
  connect(target: unknown): unknown
  start(when?: number): void
  stop(when?: number): void
}

interface AudioBufferLike {
  readonly duration: number
}

interface AudioBufferSourceNodeLike {
  buffer: unknown
  connect(target: unknown): unknown
  start(when?: number): void
}

interface AudioContextLike {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  resume(): Promise<void>
  close(): Promise<void>
  createOscillator(): OscillatorLike
  createGain(): GainNodeLike
  createBufferSource(): AudioBufferSourceNodeLike
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
}

export interface AudioPlayerOptions {
  masterVolume?: number
  /** 注入式 AudioContext 工厂，默认使用 window 上的 Web Audio API */
  createContext?: () => AudioContextLike
  /** 注入式延时（等待声音自然结束），默认 setTimeout */
  delay?: (ms: number) => Promise<void>
}

const ATTACK_SECONDS = 0.005
const TAIL_SECONDS = 0.02

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function defaultCreateContext(): AudioContextLike {
  if (typeof window === 'undefined') throw new Error('window unavailable')
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.AudioContext ?? w.webkitAudioContext) as (new () => AudioContextLike) | undefined
  if (!Ctor) throw new Error('Web Audio API unavailable')
  return new Ctor()
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * WebAudio 播放器（platform 层）：
 * - AudioContext 惰性创建，规避浏览器自动播放策略下入口即挂起的问题；
 * - 创建/resume/渲染任一步失败即抛错，由调度器静默吞掉（R2 fail-open）；
 * - 一旦创建失败则标记不可用，后续直接短路，避免反复尝试的 CPU 浪费；
 * - muteAll 时播放直接短路（F4）。
 */
export class WebAudioPlayer implements SoundPlayer {
  private masterVolume: number
  private muted = false
  private ctx: AudioContextLike | null = null
  private master: GainNodeLike | null = null
  private unavailable = false
  private warnedSuspended = false
  private gestureUnlockRegistered = false
  private readonly createContext: () => AudioContextLike
  private readonly delay: (ms: number) => Promise<void>
  private readonly customBuffers = new Map<string, AudioBufferLike>()
  private readonly pendingCustom = new Map<string, Promise<void>>()

  constructor(options: AudioPlayerOptions = {}) {
    this.masterVolume = clampVolume(options.masterVolume ?? 0.7)
    this.createContext = options.createContext ?? defaultCreateContext
    this.delay = options.delay ?? defaultDelay
    this.registerGestureUnlock()
  }

  setMasterVolume(value: number): void {
    this.masterVolume = clampVolume(value)
    if (this.master) this.master.gain.value = this.masterVolume
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  get isMuted(): boolean {
    return this.muted
  }

  async play(soundId: string): Promise<void> {
    if (this.muted) return
    const custom = this.customBuffers.get(soundId)
    if (custom) {
      await this.playBuffer(custom)
      return
    }
    const recipe = getRecipe(soundId)
    if (!recipe) return

    const ctx = this.ensureContext()
    if (!ctx) throw new Error(`bell-notify: audio unavailable, skip sound "${soundId}"`)
    if (ctx.state === 'suspended') {
      await ctx.resume()
      // 浏览器自动播放策略：无用户手势时 resume 仍会停留在 suspended。
      // 这里不阻断播放（振荡器照常调度），只提示一次真正的原因，避免静默排查困难。
      if (ctx.state === 'suspended' && !this.warnedSuspended) {
        this.warnedSuspended = true
        console.warn('[dsh-bell-notify] AudioContext still suspended after resume (autoplay policy). Sounds stay silent until the user interacts with the page.')
      }
    }

    const master = this.master!
    const t0 = ctx.currentTime + 0.01
    for (const note of recipe.notes) {
      const osc = ctx.createOscillator()
      const envelope = ctx.createGain()
      osc.type = note.wave
      osc.frequency.setValueAtTime(note.from, t0 + note.start)
      if (note.to !== undefined) {
        osc.frequency.linearRampToValueAtTime(note.to, t0 + note.start + note.duration)
      }
      // 5ms attack 防 click 爆音，线性衰减到 0
      const attack = Math.min(ATTACK_SECONDS, note.duration / 2)
      envelope.gain.setValueAtTime(0, t0 + note.start)
      envelope.gain.linearRampToValueAtTime(note.gain, t0 + note.start + attack)
      envelope.gain.linearRampToValueAtTime(0, t0 + note.start + note.duration)
      osc.connect(envelope)
      envelope.connect(master)
      osc.start(t0 + note.start)
      osc.stop(t0 + note.start + note.duration + 0.005)
    }
    await this.delay(Math.ceil((recipeDuration(recipe) + TAIL_SECONDS) * 1000))
  }

  /**
   * 解码音频 blob（File 亦满足 Blob 结构）为可播放 buffer，并以 `key`
   * 注册到播放器。之后 `play(key)` 直接播放该 buffer。解码失败抛错，由调用方
   * 决定降级策略（保持原分配不变）。同 key 重复解码会覆盖旧值。
   */
  async registerCustomSound(key: string, blob: Blob): Promise<void> {
    const previous = this.pendingCustom.get(key)
    if (previous) await previous
    const ctx = this.ensureContext()
    if (!ctx) throw new Error('bell-notify: audio unavailable, cannot decode custom sound')
    const task = (async () => {
      const data = await blob.arrayBuffer()
      const buffer = await ctx.decodeAudioData(data)
      this.customBuffers.set(key, buffer)
    })()
    this.pendingCustom.set(key, task)
    try {
      await task
    } finally {
      if (this.pendingCustom.get(key) === task) this.pendingCustom.delete(key)
    }
  }

  /** 移除自定义 buffer（对应分配被还原为默认时调用）。 */
  unregisterCustomSound(key: string): void {
    this.customBuffers.delete(key)
  }

  private async playBuffer(buffer: AudioBufferLike): Promise<void> {
    const ctx = this.ensureContext()
    if (!ctx) throw new Error('bell-notify: audio unavailable')
    if (ctx.state === 'suspended') await ctx.resume()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = 1 // master 已含 masterVolume
    source.buffer = buffer
    source.connect(gain)
    gain.connect(this.master!)
    source.start()
    await this.delay(Math.ceil((buffer.duration + TAIL_SECONDS) * 1000))
  }

  /**
   * 在首个用户手势上预热 AudioContext：浏览器的自动播放策略要求
   * AudioContext 必须在用户手势的调用栈内 resume 才能发声。否则首次声音
   * 触发发生在异步回包回调里，ctx 会一直停在 suspended，振荡器静默。
   * 这里提前创建并 resume 一次，后续事件声音即可正常播放。
   */
  private registerGestureUnlock(): void {
    if (this.gestureUnlockRegistered) return
    if (typeof window === 'undefined') return
    const unlock = (): void => {
      const ctx = this.ensureContext()
      if (ctx !== null && ctx.state === 'suspended') void ctx.resume()
    }
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('keydown', unlock, { once: true, passive: true })
    this.gestureUnlockRegistered = true
  }

  async dispose(): Promise<void> {
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    this.unavailable = false
    this.warnedSuspended = false
    this.customBuffers.clear()
    this.pendingCustom.clear()
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close()
      } catch {
        /* 关闭失败不影响宿主 */
      }
    }
  }

  private ensureContext(): AudioContextLike | null {
    if (this.unavailable) return null
    if (this.ctx) return this.ctx
    try {
      const ctx = this.createContext()
      const master = ctx.createGain()
      master.gain.value = this.masterVolume
      master.connect(ctx.destination)
      this.ctx = ctx
      this.master = master
      return ctx
    } catch {
      this.unavailable = true
      this.ctx = null
      this.master = null
      return null
    }
  }
}
