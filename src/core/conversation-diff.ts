import { EVENTS } from '../events'

/**
 * 当前会话 ConversationSnapshot 折叠后的最小信号。core 层不依赖真实 DSH
 * 类型，客户端负责把 snapshot 映射成这个结构（与 SessionSummaryLike 的
 * duck-typing 手法一致），本模块只做纯 diff。
 */
export interface ConversationSignal {
  /** partial.blocks 中是否已出现 reasoning 块。 */
  hasReasoning: boolean
  /** runningCalls 的 callId 集合。 */
  runningToolIds: readonly string[]
  /** nodes 中的命令节点，done = outcome !== null。 */
  commands: readonly { id: string; done: boolean }[]
}

/**
 * 当前会话 ConversationSnapshot 的最小结构面（duck-typed）。客户端把真实
 * snapshot 交给 toConversationSignal 折叠，core 不依赖真实 DSH 类型。
 */
export interface ConversationSnapshotLike {
  partial?: { blocks?: readonly { kind?: string }[] } | null
  runningCalls?: readonly { callId?: unknown }[]
  nodes?: readonly { kind?: string; commandId?: unknown; outcome?: unknown }[]
}

/** 把真实 ConversationSnapshot 折叠成 core diff 输入。 */
export function toConversationSignal(snapshot: ConversationSnapshotLike): ConversationSignal {
  const blocks = snapshot.partial?.blocks ?? []
  const hasReasoning = blocks.some((b) => b.kind === 'reasoning')
  const runningToolIds = (snapshot.runningCalls ?? [])
    .map((c) => c.callId)
    .filter((id): id is string => typeof id === 'string')
  const commands = (snapshot.nodes ?? [])
    .filter((n) => n.kind === 'command' && typeof n.commandId === 'string')
    .map((n) => ({ id: n.commandId as string, done: n.outcome !== null && n.outcome !== undefined }))
  return { hasReasoning, runningToolIds, commands }
}

/**
 * 对相邻两帧当前会话信号做 diff，返回新产出的生命周期事件名。
 * 首帧（prev === undefined）只建立基线、不产出事件（页面加载不是事件）。
 *
 * 派生规则（与 DSH 运行时 snapshot 语义对齐）：
 * - reasoning 块首次出现 → agent:thinking（流式，仅触发一次）
 * - callId 进入 runningToolIds → tool:start
 * - callId 离开 runningToolIds → tool:done
 * - 出现 outcome 为空的 command 节点 → command:start
 * - 同一 commandId 的 outcome 变为非空 → command:done
 */
export function diffConversation(
  prev: ConversationSignal | undefined,
  next: ConversationSignal,
): string[] {
  const events: string[] = []
  if (prev === undefined) return events

  if (!prev.hasReasoning && next.hasReasoning) events.push(EVENTS.agentThinking)

  const prevTools = new Set(prev.runningToolIds)
  const nextTools = new Set(next.runningToolIds)
  for (const id of nextTools) {
    if (!prevTools.has(id)) events.push(EVENTS.toolStart)
  }
  for (const id of prevTools) {
    if (!nextTools.has(id)) events.push(EVENTS.toolDone)
  }

  const prevCommands = new Map(prev.commands.map((c) => [c.id, c.done]))
  const nextCommands = new Map(next.commands.map((c) => [c.id, c.done]))
  for (const [id, done] of nextCommands) {
    const wasDone = prevCommands.get(id)
    if (wasDone === undefined) {
      if (!done) events.push(EVENTS.commandStart)
      continue
    }
    if (!wasDone && done) events.push(EVENTS.commandDone)
  }

  return events
}
