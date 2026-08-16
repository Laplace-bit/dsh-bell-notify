import { EVENTS } from '../events'

/**
 * 生命周期配对：结束/切换事件 → 需要立即停止的「开始事件」。
 *
 * 开始事件的声音可能还没自然播完（如思考的 `notify` 0.28s、工具双 tick），
 * 若结束事件到来时不切断，会与新事件的声音叠加、听感拖沓。这里按事件语义
 * 声明式配对：某个结束事件出现，就把对应开始事件的残留声音停掉。
 *
 * 停止只影响播放中/排队中的声音，事件管线本身同步推进、绝不阻塞。
 */
export const LIFECYCLE_STOPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // 思考结束：停掉思考开始音
  [EVENTS.agentThinkingDone]: [EVENTS.agentThinking],
  // 本轮完成：停掉仍在播的思考音
  [EVENTS.agentDone]: [EVENTS.agentThinking],
  // 工具/命令完成：停掉对应开始音
  [EVENTS.toolDone]: [EVENTS.toolStart],
  [EVENTS.commandDone]: [EVENTS.commandStart],
  // 思考被实际动作接管：工具/命令开始、或转入等待，都停掉思考音
  [EVENTS.toolStart]: [EVENTS.agentThinking],
  [EVENTS.commandStart]: [EVENTS.agentThinking],
  [EVENTS.agentWaiting]: [EVENTS.agentThinking],
})
