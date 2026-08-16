/**
 * Browser half of dsh-bell-notify.
 *
 * Two signal sources feed one event pipeline (rule table → sound scheduler →
 * status machine):
 *
 * 1. List snapshot (ObservableSnapshot over SessionListState): coarse-grained
 *    lifecycle — session/agent start, waiting, done, idle — diffed across all
 *    top-level sessions.
 * 2. Current session's conversation snapshot (ObservableSnapshot over
 *    ConversationSnapshot, reached via `ctx.sessions.binding(currentId)`):
 *    fine-grained events — thinking, tool call, command execution. Only the
 *    current session streams these (non-current sessions stay `cold`), so this
 *    half subscribes to `list.current` and re-wires on selection change.
 *
 * Custom sounds: `SoundAssignments` records per-event `custom:<id>` keys in
 * localStorage; bytes live in IndexedDB (`createIndexedDbSoundStorage`). On
 * startup each assignment's blob is decoded and registered on the player, so
 * `emit` resolves a rule's soundId to the custom key when one is set.
 *
 * Everything is fail-open: any error here degrades to silence and never
 * touches the host runtime.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { readBootConfig } from '../config.ts'
import { EVENTS } from '../events.ts'
import { RuleTable } from '../core/rules.ts'
import { SoundScheduler } from '../core/scheduler.ts'
import { StatusMachine } from '../core/state.ts'
import { SoundToggles, TOGGLEABLE_EVENTS } from '../core/toggles.ts'
import { SoundAssignments, CUSTOM_SOUND_PREFIX } from '../core/sound-assignments.ts'
import { LIFECYCLE_STOPS } from '../core/lifecycle.ts'
import { diffConversation, toConversationSignal, type ConversationSignal } from '../core/conversation-diff.ts'
import type { AgentStatus } from '../core/types.ts'
import { WebAudioPlayer } from '../platform/audio.ts'
import { StatusDot, SettingsPopup } from '../platform/indicator.ts'
import { createIndexedDbSoundStorage } from '../platform/sound-store.ts'

/** Cordis services required by the browser half. */
export const inject = ['sessions']

/** Minimal structural face of the sessions list store (duck-typed at runtime). */
interface SessionSummaryLike {
  running: boolean
  pendingInteraction?: string
  parentId?: string
  origin?: string
}

interface SessionsListStateLike {
  ids: readonly string[]
  byId: Record<string, SessionSummaryLike | undefined>
  current?: string
}

interface SessionsListFace {
  getSnapshot(): SessionsListStateLike
  subscribe(fn: () => void): () => void
}

/** Minimal structural face of the current session's conversation snapshot. */
interface ConversationObservableFace {
  getSnapshot(): import('../core/conversation-diff.ts').ConversationSnapshotLike
  subscribe(fn: () => void): () => void
}

interface SessionBindingLike {
  session?: ConversationObservableFace
}

interface SessionsServiceLike {
  list?: SessionsListFace
  binding?(id: string): SessionBindingLike | undefined
}

interface SessionSignal {
  running: boolean
  pending: string | undefined
}

export function apply(ctx: ClientContext): void {
  if (typeof window === 'undefined') return
  let config
  try {
    config = readBootConfig()
  } catch (error) {
    console.warn('[dsh-bell-notify] disabled:', error)
    return
  }
  if (!config.enabled) return
  const sessions = (ctx as unknown as { sessions?: SessionsServiceLike }).sessions
  if (sessions?.list === undefined) {
    console.warn('[dsh-bell-notify] sessions service unavailable; plugin inactive')
    return
  }
  try {
    const teardown = setup(config, sessions)
    ctx.effect(() => teardown, 'dsh-bell-notify: client teardown')
  } catch (error) {
    console.warn('[dsh-bell-notify] setup failed:', error)
  }
}

function setup(config: ReturnType<typeof readBootConfig>, sessions: SessionsServiceLike): () => void {
  const list = sessions.list as SessionsListFace
  const player = new WebAudioPlayer({ masterVolume: config.masterVolume })
  player.setMuted(config.muteAll)
  const scheduler = new SoundScheduler({ player, maxQueue: config.maxQueue, maxConcurrent: config.maxConcurrent })
  const machine = new StatusMachine({ revertMs: config.statusRevertMs })
  const rules = new RuleTable(undefined, { defaultCooldown: config.defaultCooldown })
  const toggles = new SoundToggles()
  const assignments = new SoundAssignments()
  const soundStore = createIndexedDbSoundStorage()

  const dot = config.showStatusIndicator ? StatusDot.mount() : null
  let offAssignments: (() => void) | null = null

  const emit = (event: string): void => {
    // 生命周期配对：结束事件先停掉对应开始事件的残留声音（同步、不阻塞），
    // 再派发自身。这样结束音与开始音不会叠加。
    const stops = LIFECYCLE_STOPS[event]
    if (stops) {
      for (const started of stops) {
        const startedRule = rules.get(started)
        if (!startedRule?.soundId) continue
        const startedSoundId = assignments.getKey(started) ?? startedRule.soundId
        scheduler.stop(startedSoundId)
      }
    }

    const rule = rules.get(event)
    if (!rule) return
    if (rule.soundId && toggles.isEnabled(event)) {
      const soundId = assignments.getKey(event) ?? rule.soundId
      scheduler.submit(soundId, { priority: rule.priority, cooldown: rule.cooldown })
    }
    if (rule.uiStatus) machine.set(rule.uiStatus)
  }

  const preview = (soundId: string): void => {
    scheduler.submit(soundId, { priority: 9, cooldown: 0 })
  }

  const popup = config.showStatusIndicator
    ? SettingsPopup.mount(TOGGLEABLE_EVENTS, {
        onToggle: (event, on) => toggles.set(event, on),
        onPreviewDefault: (event) => {
          const rule = rules.get(event)
          if (rule?.soundId) preview(rule.soundId)
        },
        onPreviewCustom: (event) => {
          const key = assignments.getKey(event)
          if (key) preview(key)
        },
        onUpload: (event, file) => {
          if (soundStore === null) {
            console.warn('[dsh-bell-notify] IndexedDB unavailable; custom sound not saved')
            return
          }
          const key = `${CUSTOM_SOUND_PREFIX}${event.replace(/[^a-zA-Z0-9-]/g, '_')}`
          void (async () => {
            try {
              await player.registerCustomSound(key, file)
              await soundStore.put(key, file)
              assignments.set(event, key, file.name || undefined)
            } catch (error) {
              console.warn('[dsh-bell-notify] upload custom sound failed:', error)
            }
          })()
        },
        onReset: (event) => {
          const key = assignments.getKey(event)
          if (!key) return
          player.unregisterCustomSound(key)
          assignments.set(event, null)
          if (soundStore !== null) void soundStore.remove(key).catch(() => {})
        },
      })
    : null

  if (dot !== null && popup !== null) {
    dot.onClick = () => popup.toggle()
  }

  const offStatus = machine.subscribe((status: AgentStatus) => {
    try {
      dot?.update(status)
    } catch {
      /* visual failure never stops audio */
    }
  })
  dot?.update(machine.status)

  // 同步弹窗初始开关显示与自定义来源标注（含文件名）。
  if (popup !== null) {
    const syncRowSource = (): void => {
      for (const entry of TOGGLEABLE_EVENTS) {
        popup.setRowSource(entry.event, assignments.isCustom(entry.event), assignments.getName(entry.event))
      }
    }
    for (const entry of TOGGLEABLE_EVENTS) {
      popup.setRowEnabled(entry.event, toggles.isEnabled(entry.event))
    }
    syncRowSource()
    offAssignments = assignments.subscribe(syncRowSource)
  }

  // 启动时加载既有自定义音源并解码注册（幂等；解码失败静默跳过，保留分配）。
  const loadCustomSounds = (): void => {
    if (soundStore === null) return
    for (const entry of TOGGLEABLE_EVENTS) {
      const key = assignments.getKey(entry.event)
      if (!key) continue
      void (async () => {
        try {
          const blob = await soundStore.get(key)
          if (blob) await player.registerCustomSound(key, blob)
        } catch (error) {
          console.warn('[dsh-bell-notify] load custom sound failed:', error)
        }
      })()
    }
  }
  loadCustomSounds()

  // ---- 粗粒度：全量列表 diff（session/agent 生命周期） ----
  let previous = new Map<string, SessionSignal>()

  const onListChange = (baseline: boolean): void => {
    try {
      const snapshot = list.getSnapshot()
      const next = new Map<string, SessionSignal>()
      for (const id of snapshot.ids) {
        const summary = snapshot.byId[id]
        if (!summary) continue
        if (summary.origin === 'subagent') continue // 子代理单独成会话，跳过避免双重触发
        next.set(id, { running: summary.running, pending: summary.pendingInteraction })
        if (baseline) continue
        const prev = previous.get(id)
        if (prev === undefined) {
          if (summary.parentId === undefined) emit(EVENTS.sessionStart)
          continue
        }
        if (!prev.running && summary.running && prev.pending === undefined && summary.pendingInteraction === undefined) {
          emit(EVENTS.agentStart)
        }
        if (prev.pending === undefined && summary.pendingInteraction !== undefined) {
          emit(EVENTS.agentWaiting)
        }
        if (prev.pending !== undefined && summary.pendingInteraction === undefined && !summary.running) {
          emit(EVENTS.agentIdle)
        }
        if (prev.running && !summary.running && summary.pendingInteraction === undefined) {
          emit(EVENTS.agentDone)
        }
      }
      previous = next
    } catch (error) {
      console.warn('[dsh-bell-notify] list diff failed:', error)
    }
  }

  // ---- 细粒度：当前会话 conversation diff（thinking/tool/command） ----
  let conversationUnsubscribe: (() => void) | null = null
  let conversationBaseline: ConversationSignal | undefined
  let conversationSessionId: string | undefined

  const unsubscribeConversation = (): void => {
    conversationUnsubscribe?.()
    conversationUnsubscribe = null
    conversationBaseline = undefined
    conversationSessionId = undefined
  }

  const onConversationChange = (): void => {
    try {
      if (conversationSessionId === undefined || conversationUnsubscribe === null) return
      const binding = sessions.binding?.(conversationSessionId)
      const face = binding?.session
      if (!face) return
      const next = toConversationSignal(face.getSnapshot())
      const events = diffConversation(conversationBaseline, next)
      conversationBaseline = next
      for (const event of events) emit(event)
    } catch (error) {
      console.warn('[dsh-bell-notify] conversation diff failed:', error)
    }
  }

  const followCurrentSession = (): void => {
    const current = list.getSnapshot().current
    if (current === conversationSessionId) return
    unsubscribeConversation()
    if (current === undefined) return
    const binding = sessions.binding?.(current)
    const face = binding?.session
    if (!face) return
    conversationSessionId = current
    try {
      conversationBaseline = toConversationSignal(face.getSnapshot())
      conversationUnsubscribe = face.subscribe(() => onConversationChange())
    } catch (error) {
      console.warn('[dsh-bell-notify] conversation subscribe failed:', error)
      unsubscribeConversation()
    }
  }

  onListChange(true) // seed list baseline silently; page load is not an event
  followCurrentSession() // seed conversation baseline + subscribe to current
  const offList = list.subscribe(() => {
    onListChange(false)
    followCurrentSession()
  })

  return () => {
    offList()
    offStatus()
    unsubscribeConversation()
    offAssignments?.()
    popup?.unmount()
    dot?.unmount()
    assignments.dispose()
    toggles.dispose()
    machine.dispose()
    scheduler.dispose()
    void player.dispose()
  }
}
