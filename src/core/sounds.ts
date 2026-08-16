import type { SoundRecipe } from './types'

/**
 * 预置 12 种音效，全部为纯数据 Recipe（零 DOM、零引擎耦合）。
 * 前 10 种按事件一一对应、去重（不再出现多个事件共用同一铃声）；
 * `error` / `failure` 为保留音（默认规则未引用，可供 config 里 soundId 覆盖）。
 *
 * 音色区分维度：波形（sine/triangle/square）、音高、方向（上行/下行扫频）、
 * 节奏（单音/双音/三连/和弦）。
 */
export const SOUND_RECIPES: Readonly<Record<string, SoundRecipe>> = Object.freeze({
  // 会话启动：上行扫频，温暖「开机」音
  startup: Object.freeze({
    id: 'startup',
    notes: [Object.freeze({ wave: 'sine', from: 300, to: 900, start: 0, duration: 0.35, gain: 0.6 })],
  }),
  // 开始执行：短促高频「go」单击
  click: Object.freeze({
    id: 'click',
    notes: [Object.freeze({ wave: 'sine', from: 1200, start: 0, duration: 0.045, gain: 0.5 })],
  }),
  // 开始思考：柔和低音单音（与 notify 语义对应）
  notify: Object.freeze({
    id: 'notify',
    notes: [Object.freeze({ wave: 'sine', from: 392, start: 0, duration: 0.28, gain: 0.45 })],
  }),
  // 工具调用：金属质感双 tick（triangle 波形更脆）
  tick: Object.freeze({
    id: 'tick',
    notes: [
      Object.freeze({ wave: 'triangle', from: 1600, start: 0, duration: 0.03, gain: 0.4 }),
      Object.freeze({ wave: 'triangle', from: 2000, start: 0.045, duration: 0.03, gain: 0.4 }),
    ],
  }),
  // 工具完成：低音下滑「settle」
  drop: Object.freeze({
    id: 'drop',
    notes: [Object.freeze({ wave: 'sine', from: 440, to: 330, start: 0, duration: 0.18, gain: 0.5 })],
  }),
  // 命令执行：短方波 beep（终端感）
  beep: Object.freeze({
    id: 'beep',
    notes: [Object.freeze({ wave: 'square', from: 520, start: 0, duration: 0.07, gain: 0.35 })],
  }),
  // 命令完成：上行双音 confirm
  rise: Object.freeze({
    id: 'rise',
    notes: [
      Object.freeze({ wave: 'sine', from: 520, start: 0, duration: 0.08, gain: 0.5 }),
      Object.freeze({ wave: 'sine', from: 780, start: 0.09, duration: 0.12, gain: 0.5 }),
    ],
  }),
  // 等待确认：高频三连（alert）
  alert: Object.freeze({
    id: 'alert',
    notes: [0, 0.12, 0.24].map((start) =>
      Object.freeze({ wave: 'sine' as const, from: 880, start, duration: 0.08, gain: 0.6 }),
    ),
  }),
  // 本轮完成：C-E-G 上行大三和弦
  success: Object.freeze({
    id: 'success',
    notes: [
      Object.freeze({ wave: 'sine', from: 523.25, start: 0, duration: 0.11, gain: 0.6 }),
      Object.freeze({ wave: 'sine', from: 659.25, start: 0.11, duration: 0.11, gain: 0.6 }),
      Object.freeze({ wave: 'sine', from: 783.99, start: 0.22, duration: 0.11, gain: 0.6 }),
    ],
  }),
  // 回到空闲：单音下滑「settle down」
  confirm: Object.freeze({
    id: 'confirm',
    notes: [Object.freeze({ wave: 'sine', from: 660, to: 440, start: 0, duration: 0.22, gain: 0.5 })],
  }),
  // 保留：错误（默认规则未引用，可供 config 覆盖）
  error: Object.freeze({
    id: 'error',
    notes: [Object.freeze({ wave: 'square', from: 150, start: 0, duration: 0.4, gain: 0.5 })],
  }),
  // 保留：失败（默认规则未引用，可供 config 覆盖）
  failure: Object.freeze({
    id: 'failure',
    notes: [Object.freeze({ wave: 'sine', from: 400, to: 200, start: 0, duration: 0.35, gain: 0.6 })],
  }),
})

export function getRecipe(id: string): SoundRecipe | undefined {
  return SOUND_RECIPES[id]
}

/** 声音总时长（秒），驱动调度器的出队节奏。 */
export function recipeDuration(recipe: SoundRecipe): number {
  return recipe.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0)
}
