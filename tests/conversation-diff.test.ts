import { describe, expect, it } from 'vitest'
import {
  diffConversation,
  toConversationSignal,
  type ConversationSignal,
} from '../src/core/conversation-diff'

const base: ConversationSignal = {
  hasReasoning: false,
  runningToolIds: [],
  commands: [],
}

describe('toConversationSignal', () => {
  it('折叠 reasoning/runningCalls/commands', () => {
    const sig = toConversationSignal({
      partial: { blocks: [{ kind: 'text' }, { kind: 'reasoning' }] },
      runningCalls: [{ callId: 't1' }, { callId: 't2' }],
      nodes: [
        { kind: 'command', commandId: 'c1', outcome: null },
        { kind: 'command', commandId: 'c2', outcome: { kind: 'success' } },
        { kind: 'assistant' },
      ],
    })
    expect(sig.hasReasoning).toBe(true)
    expect(sig.runningToolIds).toEqual(['t1', 't2'])
    expect(sig.commands).toEqual([
      { id: 'c1', done: false },
      { id: 'c2', done: true },
    ])
  })

  it('缺省字段折叠为空信号，非法 id 被过滤', () => {
    const sig = toConversationSignal({
      runningCalls: [{}, { callId: 42 }, { callId: 'ok' }],
      nodes: [{ kind: 'command', outcome: null }, { kind: 'command', commandId: 'c9' }],
    })
    expect(sig.hasReasoning).toBe(false)
    expect(sig.runningToolIds).toEqual(['ok'])
    expect(sig.commands).toEqual([{ id: 'c9', done: false }])
  })

  it('partial 为 null 时视为无 reasoning', () => {
    expect(toConversationSignal({ partial: null }).hasReasoning).toBe(false)
  })
})

describe('diffConversation', () => {
  it('首帧只建基线，不产出事件', () => {
    const next: ConversationSignal = { ...base, hasReasoning: true, runningToolIds: ['t1'] }
    expect(diffConversation(undefined, next)).toEqual([])
  })

  it('reasoning 块首次出现 → agent:thinking（只触发一次）', () => {
    const prev: ConversationSignal = { ...base, hasReasoning: false }
    const next: ConversationSignal = { ...base, hasReasoning: true }
    expect(diffConversation(prev, next)).toEqual(['agent:thinking'])
    // 持续存在不重复触发
    expect(diffConversation(next, { ...base, hasReasoning: true })).toEqual([])
  })

  it('reasoning 块消失 → agent:thinking:done', () => {
    const prev: ConversationSignal = { ...base, hasReasoning: true }
    const next: ConversationSignal = { ...base, hasReasoning: false }
    expect(diffConversation(prev, next)).toEqual(['agent:thinking:done'])
    // 持续不存在不重复触发
    expect(diffConversation(next, { ...base, hasReasoning: false })).toEqual([])
  })

  it('callId 进入 → tool:start；离开 → tool:done', () => {
    const prev: ConversationSignal = { ...base, runningToolIds: [] }
    const started = diffConversation(prev, { ...base, runningToolIds: ['t1'] })
    expect(started).toEqual(['tool:start'])

    const finished = diffConversation(
      { ...base, runningToolIds: ['t1'] },
      { ...base, runningToolIds: [] },
    )
    expect(finished).toEqual(['tool:done'])
  })

  it('多工具并发时逐 callId diff', () => {
    const prev: ConversationSignal = { ...base, runningToolIds: ['a'] }
    const next: ConversationSignal = { ...base, runningToolIds: ['a', 'b'] }
    expect(diffConversation(prev, next)).toEqual(['tool:start'])

    const both = diffConversation(
      { ...base, runningToolIds: ['a', 'b'] },
      { ...base, runningToolIds: [] },
    )
    expect(both.sort()).toEqual(['tool:done', 'tool:done'])
  })

  it('command 出现（outcome null）→ command:start；outcome 变非空 → command:done', () => {
    const prev: ConversationSignal = { ...base, commands: [] }
    const started = diffConversation(prev, { ...base, commands: [{ id: 'c1', done: false }] })
    expect(started).toEqual(['command:start'])

    const done = diffConversation(
      { ...base, commands: [{ id: 'c1', done: false }] },
      { ...base, commands: [{ id: 'c1', done: true }] },
    )
    expect(done).toEqual(['command:done'])
  })

  it('首次观察时已是 done 的 command 不产出 start/done', () => {
    const prev: ConversationSignal = { ...base, commands: [] }
    // 首次出现即 done：视作基线之后的历史节点，不报 start
    expect(diffConversation(prev, { ...base, commands: [{ id: 'c1', done: true }] })).toEqual([])
  })

  it('多种信号同时变化时按序产出', () => {
    const prev: ConversationSignal = { ...base, hasReasoning: false, commands: [{ id: 'c1', done: false }] }
    const next: ConversationSignal = {
      hasReasoning: true,
      runningToolIds: ['t1'],
      commands: [{ id: 'c1', done: true }],
    }
    expect(diffConversation(prev, next)).toEqual([
      'agent:thinking',
      'tool:start',
      'command:done',
    ])
  })
})
