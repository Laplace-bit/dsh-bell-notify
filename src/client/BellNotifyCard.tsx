/** Theme-aware plugin configuration card for bell-notify. */

import { useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { IconChevronDownOutline14, IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BellNotifyCardFace, BellNotifyCardState } from './bell-card-controller.ts'
import type { BellSoundControlsState } from './bell-sound-controls.ts'
import type { BellLocaleKey } from './locales.ts'
import css from './BellNotifyCard.module.css'

export type BellNotifyCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.bellNotify'>
  & InjectFace<BellNotifyCardFace>

const EVENT_LABELS: Record<string, BellLocaleKey> = {
  'session:start': 'eventSessionStart',
  'agent:start': 'eventAgentStart',
  'agent:thinking': 'eventAgentThinking',
  'tool:start': 'eventToolStart',
  'tool:done': 'eventToolDone',
  'command:start': 'eventCommandStart',
  'command:done': 'eventCommandDone',
  'agent:waiting': 'eventAgentWaiting',
  'agent:done': 'eventAgentDone',
  'agent:idle': 'eventAgentIdle',
}

function eventLabel(t: BellNotifyCardProps['t'], event: string): string {
  return t(EVENT_LABELS[event] ?? 'soundEvents')
}

/** Render a card even when its dedicated Host RPC is temporarily unavailable. */
export function BellNotifyCard(props: BellNotifyCardProps) {
  const { t } = props
  const [open, setOpen] = useState(false)
  const uploadEvent = useRef<string | undefined>()
  const fileInput = useRef<HTMLInputElement>(null)
  const state = props.useBellNotifyCard(snapshot => snapshot) as BellNotifyCardState
  const sounds = props.useBellNotifySounds(snapshot => snapshot) as BellSoundControlsState
  const blocked = !state.dirty || state.saving || state.status !== 'ready'
  const versionLabel = state.version === undefined
    ? null
    : t(state.installation === 'development' ? 'developmentVersion' : 'version')
      .replace('{version}', state.version)
  const volume = Math.round(state.masterVolume * 100)

  return (
    <li className={open ? `${css.card} ${css.cardOpen}` : css.card}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        {versionLabel === null ? null : <span className={css.version}>{versionLabel}</span>}
        {state.dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
      </button>
      {open ? (
        <div className={css.body}>
          {state.status === 'loading' ? <p className={css.readOnly} role="status">{t('loading')}</p> : null}
          {state.status === 'unavailable' ? (
            <div className={css.failure}>
              <p className={css.readOnly} role="status">{t('unavailable')}</p>
              <button type="button" className={css.secondaryButton} onClick={props.reload}>{t('retry')}</button>
            </div>
          ) : null}
          {state.status === 'ready' ? (
            <>
              {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
              <label className={css.field}>
                <span className={css.fieldHead}>
                  <span className={css.label}>{t('enabled')}</span>
                  <input
                    type="checkbox"
                    className={css.toggle}
                    checked={state.enabled}
                    disabled={!state.writable}
                    onChange={(event) => { props.edit({ enabled: event.target.checked }) }}
                  />
                </span>
                <span className={css.hint}>{t('enabledHint')}</span>
              </label>
              <label className={css.field}>
                <span className={css.fieldHead}>
                  <span className={css.label}>{t('masterVolume')}</span>
                  <output className={css.volumeValue}>{volume}%</output>
                </span>
                <input
                  type="range"
                  className={css.range}
                  min="0"
                  max="100"
                  step="1"
                  value={volume}
                  disabled={!state.writable}
                  aria-label={t('masterVolume')}
                  onChange={(event) => { props.edit({ masterVolume: Number(event.target.value) / 100 }) }}
                />
                <span className={css.hint}>{t('masterVolumeHint')}</span>
              </label>
              <section className={css.events} aria-labelledby="bell-notify-events">
                <div className={css.sectionHead}>
                  <span id="bell-notify-events" className={css.label}>{t('soundEvents')}</span>
                  <span className={css.hint}>{t('soundEventsHint')}</span>
                </div>
                {sounds.available ? sounds.events.map(entry => {
                  const custom = entry.custom
                  const source = custom
                    ? t('customSound').replace('{name}', entry.customName || t('defaultSound'))
                    : t('defaultSound')
                  return (
                    <div className={css.eventRow} key={entry.event}>
                      <span className={css.eventMain}>
                        <span className={css.eventName}>{eventLabel(t, entry.event)}</span>
                        <span className={css.eventSource}>{source}</span>
                      </span>
                      <div className={css.eventControls}>
                        <input
                          type="checkbox"
                          className={css.toggle}
                          checked={entry.enabled}
                          aria-label={eventLabel(t, entry.event)}
                          onChange={(event) => { props.setSoundEnabled(entry.event, event.target.checked) }}
                        />
                        <button type="button" className={css.textButton} onClick={() => {
                          if (custom) props.previewCustomSound(entry.event)
                          else props.previewDefaultSound(entry.event)
                        }}>{t('preview')}</button>
                        <button type="button" className={css.textButton} onClick={() => {
                          uploadEvent.current = entry.event
                          fileInput.current?.click()
                        }}>{t('changeSound')}</button>
                        {custom ? <button type="button" className={css.textButton} onClick={() => {
                          props.resetSound(entry.event)
                        }}>{t('restoreDefault')}</button> : null}
                      </div>
                    </div>
                  )
                }) : <p className={css.hint}>{t('eventsUnavailable')}</p>}
                <input
                  ref={fileInput}
                  className={css.fileInput}
                  type="file"
                  accept="audio/*"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    const target = uploadEvent.current
                    event.currentTarget.value = ''
                    uploadEvent.current = undefined
                    if (file !== undefined && target !== undefined) props.uploadSound(target, file)
                  }}
                />
              </section>
              <div className={css.updateRow}>
                <span className={css.updateCopy}>
                  <span className={css.label}>{t('updates')}</span>
                  <span className={css.hint}>
                    {state.restartRequired
                      ? t('restartRequired')
                      : state.installation === 'npm' ? t('updateHint')
                        : state.installation === 'development' ? t('developmentBuild') : t('updateUnavailable')}
                  </span>
                </span>
                <button
                  type="button"
                  className={css.update}
                  disabled={!state.canUpgrade || state.upgrading || state.restartRequired}
                  title={state.canUpgrade ? undefined : t('updateUnavailable')}
                  onClick={props.upgrade}
                >
                  <span aria-hidden="true"><IconRefreshOutline14 /></span>
                  {t(state.upgrading ? 'updating' : 'update')}
                </button>
              </div>
              {state.upgradeFailed ? <p className={css.failed} role="status">{t('updateFailed')}</p> : null}
              <div className={css.footer}>
                {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
                <button
                  type="button"
                  className={css.secondaryButton}
                  disabled={!state.dirty || state.saving}
                  onClick={props.discard}
                >
                  {t('discard')}
                </button>
                <button
                  type="button"
                  className={css.save}
                  disabled={blocked}
                  onClick={props.save}
                >
                  {t(state.saving ? 'saving' : 'save')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
