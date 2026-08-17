/**
 * Browser half of dsh-bell-notify.
 *
 * Two signal sources feed one event pipeline (rule table → sound scheduler):
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
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { DEFAULT_CONFIG, readBootConfig, type BellConfig } from '../config.ts'
import { EVENTS } from '../events.ts'
import { RuleTable } from '../core/rules.ts'
import { SoundScheduler } from '../core/scheduler.ts'
import { SoundToggles, TOGGLEABLE_EVENTS } from '../core/toggles.ts'
import { SoundAssignments } from '../core/sound-assignments.ts'
import { LIFECYCLE_STOPS } from '../core/lifecycle.ts'
import { diffConversation, toConversationSignal, type ConversationSignal } from '../core/conversation-diff.ts'
import { WebAudioPlayer } from '../platform/audio.ts'
import { createIndexedDbSoundStorage } from '../platform/sound-store.ts'
import { BellNotifyCard } from './BellNotifyCard.tsx'
import { BellNotifyCardController } from './bell-card-controller.ts'
import { createBellSettingsApi } from './bell-settings-api.ts'
import { BellSoundControlsCell, createBellSoundControls } from './bell-sound-controls.ts'
import { NS as SETTINGS_NS, en, zh } from './locales.ts'
import { bellSettingsDefaults, type BellSettings } from '../settings.ts'

/** The card stays available even while the optional sessions service reconnects. */
export const inject: string[] = []

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

/** Publishes only Host-accepted preferences to the live audio runtime. */
class BellPreferencesCell {
  private readonly listeners = new Set<() => void>()
  private controller: BellNotifyCardController | undefined
  private value: BellSettings

  constructor(defaults: BellSettings) {
    this.value = defaults
  }

  attach(controller: BellNotifyCardController): () => void {
    this.controller = controller
    this.refresh()
    const unsubscribe = controller.subscribe(() => { this.refresh() })
    return () => {
      unsubscribe()
      if (this.controller !== controller) return
      this.controller = undefined
      this.refresh()
    }
  }

  getSnapshot = (): BellSettings => this.value

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private refresh(): void {
    const next = this.controller?.getAppliedSettings() ?? this.value
    if (sameSettings(next, this.value)) return
    this.value = next
    for (const listener of [...this.listeners]) listener()
  }
}

function sameSettings(left: BellSettings, right: BellSettings): boolean {
  return left.enabled === right.enabled
    && left.masterVolume === right.masterVolume
}

export function apply(ctx: ClientContext): void {
  if (typeof window === 'undefined') return
  let runtimeConfig: BellConfig | undefined
  try {
    runtimeConfig = readBootConfig()
  } catch (error) {
    // The card can still read and repair its own durable settings through the
    // protected RPC. Avoid starting audio with an untrusted Host snapshot.
    console.warn('[dsh-bell-notify] audio runtime disabled by malformed boot config:', error)
  }
  const cardDefaults = bellSettingsDefaults(runtimeConfig ?? DEFAULT_CONFIG)
  const preferences = new BellPreferencesCell(cardDefaults)
  const soundControls = new BellSoundControlsCell()

  // This card deliberately uses our loopback RPC rather than the core
  // settings.describe endpoint, whose third-party namespace allowlist would
  // otherwise hide a successfully loaded plugin.
  ctx.inject(['slots', 'locale', 'connection'], (settingsCtx) => {
    const card = new BellNotifyCardController(
      createBellSettingsApi(settingsCtx.get('connection') as unknown as ConnectionHandle),
      soundControls,
      cardDefaults,
    )
    const detachPreferences = preferences.attach(card)
    card.start()
    settingsCtx.effect(() => settingsCtx.locale.register(SETTINGS_NS, { zh, en }), 'dsh-bell-notify: settings dictionaries')
    settingsCtx.slots.inject('settings.plugin.item', () => settingsCtx.slots.register({
      name: 'settings.plugin.item',
      id: 'bell-notify',
      order: 40,
      locale: SETTINGS_NS,
      inject: () => card.inject(),
    }, BellNotifyCard))
    return () => {
      card.stop()
      detachPreferences()
    }
  })

  ctx.inject(['sessions'], (sessionsCtx) => {
    if (runtimeConfig === undefined) return
    const sessions = (sessionsCtx as unknown as { sessions?: SessionsServiceLike }).sessions
    if (sessions?.list === undefined) {
      console.warn('[dsh-bell-notify] sessions service unavailable; audio runtime inactive')
      return
    }
    try {
      return setup(runtimeConfig, sessions, preferences, soundControls)
    } catch (error) {
      console.warn('[dsh-bell-notify] setup failed:', error)
      return
    }
  })
}

function setup(
  config: ReturnType<typeof readBootConfig>,
  sessions: SessionsServiceLike,
  preferences: BellPreferencesCell,
  soundControls: BellSoundControlsCell,
): () => void {
  const list = sessions.list as SessionsListFace
  const player = new WebAudioPlayer({ masterVolume: config.masterVolume })
  let currentPreferences = preferences.getSnapshot()
  const applyPreferences = (): void => {
    currentPreferences = preferences.getSnapshot()
    player.setMasterVolume(currentPreferences.masterVolume)
    player.setMuted(!currentPreferences.enabled)
  }
  applyPreferences()
  const offPreferences = preferences.subscribe(applyPreferences)
  const scheduler = new SoundScheduler({ player, maxQueue: config.maxQueue, maxConcurrent: config.maxConcurrent })
  const rules = new RuleTable(undefined, { defaultCooldown: config.defaultCooldown })
  const toggles = new SoundToggles()
  const assignments = new SoundAssignments()
  const soundStore = createIndexedDbSoundStorage()
  const controls = createBellSoundControls({ toggles, assignments, rules, scheduler, player, soundStore })
  const detachControls = soundControls.attach(controls)

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
    if (currentPreferences.enabled && rule.soundId && toggles.isEnabled(event)) {
      const soundId = assignments.getKey(event) ?? rule.soundId
      scheduler.submit(soundId, { priority: rule.priority, cooldown: rule.cooldown })
    }
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
    offPreferences()
    unsubscribeConversation()
    detachControls()
    controls.dispose()
    assignments.dispose()
    toggles.dispose()
    scheduler.dispose()
    void player.dispose()
  }
}
