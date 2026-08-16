import type { AgentStatus } from '../core/types'

/**
 * 富化右下角状态点 + 设置弹窗（platform 层，纯 DOM，零 React）。
 * 视觉要求：更大、带光晕、切换更快；只加图形、不加文字。点击状态点
 * 弹出设置弹窗，按事件开关声音。
 */

interface IndicatorLooks {
  color: string
  glow: string
  animation: string
}

const LOOKS: Record<AgentStatus, IndicatorLooks> = {
  idle: { color: '#9aa0a6', glow: '0 0 0 0 rgba(154,160,166,0)', animation: 'none' },
  thinking: {
    color: '#4c8dff',
    glow: '0 0 10px 2px rgba(76,141,255,0.6)',
    animation: 'dsh-bell-thinking 1.5s ease-in-out infinite',
  },
  working: {
    color: '#ff913b',
    glow: '0 0 10px 2px rgba(255,145,59,0.6)',
    animation: 'dsh-bell-working 1.2s ease-in-out infinite',
  },
  waiting: {
    color: '#f5c518',
    glow: '0 0 12px 3px rgba(245,197,24,0.65)',
    animation: 'dsh-bell-waiting 0.5s steps(1) infinite',
  },
  success: {
    color: '#3fb950',
    glow: '0 0 14px 4px rgba(63,185,80,0.7)',
    animation: 'dsh-bell-success 1s ease-out',
  },
  error: {
    color: '#f85149',
    glow: '0 0 14px 4px rgba(248,81,73,0.7)',
    animation: 'dsh-bell-error 0.4s ease-in-out',
  },
}

const CSS = [
  '@keyframes dsh-bell-thinking{0%,100%{transform:scale(1);box-shadow:0 0 10px 2px rgba(76,141,255,.6)}50%{transform:scale(1.35);box-shadow:0 0 18px 6px rgba(76,141,255,.25)}}',
  '@keyframes dsh-bell-working{0%,100%{transform:scale(1);box-shadow:0 0 10px 2px rgba(255,145,59,.6)}50%{transform:scale(1.5);box-shadow:0 0 20px 7px rgba(255,145,59,.25)}}',
  '@keyframes dsh-bell-waiting{0%,100%{opacity:1}50%{opacity:.25}}',
  '@keyframes dsh-bell-success{0%{box-shadow:0 0 0 0 rgba(63,185,80,.7)}70%{box-shadow:0 0 0 14px rgba(63,185,80,0)}100%{box-shadow:0 0 0 0 rgba(63,185,80,0)}}',
  '@keyframes dsh-bell-error{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}',
].join('\n')

/** 富化状态点：可点击，点击回调由调用方注入。 */
export class StatusDot {
  private readonly style: HTMLStyleElement
  private readonly el: HTMLDivElement
  private clickHandler: (() => void) | null = null

  private constructor(style: HTMLStyleElement, el: HTMLDivElement) {
    this.style = style
    this.el = el
  }

  static mount(): StatusDot {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-bell-notify'
    style.textContent = CSS
    const el = document.createElement('div')
    el.dataset.plugin = 'dsh-bell-notify'
    Object.assign(el.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      background: '#9aa0a6',
      zIndex: '2147483000',
      cursor: 'pointer',
      transition: 'background .1s, box-shadow .1s',
    })
    document.head.appendChild(style)
    document.body.appendChild(el)
    return new StatusDot(style, el)
  }

  set onClick(handler: (() => void) | null) {
    if (this.clickHandler !== null) this.el.removeEventListener('click', this.clickHandler)
    this.clickHandler = handler
    if (handler !== null) this.el.addEventListener('click', handler)
  }

  update(status: AgentStatus): void {
    const look = LOOKS[status] ?? LOOKS.idle
    this.el.style.background = look.color
    // 直接写 box-shadow 与动画组合：动画 keyframes 里的 box-shadow 会覆盖此值，
    // 静态态（idle）则用零光晕；瞬态（success/error）由 keyframes 驱动。
    this.el.style.boxShadow = look.glow
    this.el.style.animation = look.animation
  }

  unmount(): void {
    this.onClick = null
    this.style.remove()
    this.el.remove()
  }
}

export interface ToggleOption {
  event: string
  label: string
}

/** 设置弹窗各控件回调，由客户端注入（试听/上传/还原都需触达播放器与存储层）。 */
export interface PopupCallbacks {
  onToggle(event: string, on: boolean): void
  /** 试听默认合成音（startup/click/...）。 */
  onPreviewDefault(event: string): void
  /** 试听该事件当前自定义音（未指定时不可达）。 */
  onPreviewCustom(event: string): void
  /** 上传音频文件并指定为某事件的自定义音。 */
  onUpload(event: string, file: File): void
  /** 还原为默认音（清除自定义分配）。 */
  onReset(event: string): void
}

interface RowHandle {
  /** 来源行：默认显示「默认」，自定义显示文件名（ellipsis）。 */
  source: HTMLElement
  previewCustom: HTMLButtonElement
  reset: HTMLButtonElement
}

/** 设置弹窗：每事件一行（开关 + 试听/上传/还原），点击外部或 Esc 关闭。 */
export class SettingsPopup {
  private readonly el: HTMLDivElement
  private readonly fileInput: HTMLInputElement
  private readonly rows = new Map<string, RowHandle>()
  private callbacks: PopupCallbacks | null = null
  private activeUploadEvent: string | null = null
  private readonly onDocPointerDown: (e: MouseEvent) => void
  private readonly onDocKeydown: (e: KeyboardEvent) => void

  private constructor(el: HTMLDivElement, fileInput: HTMLInputElement) {
    this.el = el
    this.fileInput = fileInput
    this.onDocPointerDown = (e: MouseEvent) => {
      if (!this.el.contains(e.target as Node)) this.close()
    }
    this.onDocKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close()
    }
    document.addEventListener('pointerdown', this.onDocPointerDown)
    document.addEventListener('keydown', this.onDocKeydown)
  }

  static mount(options: readonly ToggleOption[], callbacks: PopupCallbacks): SettingsPopup {
    const el = document.createElement('div')
    el.dataset.plugin = 'dsh-bell-notify'
    Object.assign(el.style, {
      position: 'fixed',
      right: '16px',
      bottom: '44px',
      width: '300px',
      maxWidth: 'calc(100vw - 32px)',
      background: '#1b2027',
      border: '1px solid #333a42',
      borderRadius: '12px',
      padding: '10px 14px',
      boxShadow: '0 8px 28px rgba(0,0,0,.5)',
      zIndex: '2147483001',
      fontFamily: 'system-ui, sans-serif',
      color: '#e6e6e6',
      fontSize: '13px',
      display: 'none',
    })

    const head = document.createElement('div')
    Object.assign(head.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '4px',
    })
    const title = document.createElement('div')
    title.textContent = '声音通知'
    Object.assign(title.style, { fontWeight: '600', color: '#9aa0a6', fontSize: '12px' })
    head.appendChild(title)
    el.appendChild(head)

    // 共享一个隐藏文件输入，避免每行各挂一个 input。
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'audio/*'
    Object.assign(fileInput.style, { display: 'none' })
    el.appendChild(fileInput)

    const popup = new SettingsPopup(el, fileInput)
    popup.callbacks = callbacks

    const close = document.createElement('button')
    close.textContent = '✕'
    close.type = 'button'
    Object.assign(close.style, {
      width: '22px',
      height: '22px',
      background: 'transparent',
      border: 'none',
      borderRadius: '6px',
      color: '#9aa0a6',
      cursor: 'pointer',
      fontSize: '13px',
      lineHeight: '1',
      padding: '0',
    })
    close.addEventListener('click', () => popup.close())
    head.appendChild(close)

    for (const opt of options) popup.addRow(opt)
    fileInput.addEventListener('change', () => {
      const event = popup.activeUploadEvent
      popup.activeUploadEvent = null
      const file = fileInput.files?.[0]
      if (event !== null && file) popup.callbacks?.onUpload(event, file)
      fileInput.value = ''
    })
    document.body.appendChild(el)
    return popup
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none'
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  open(): void {
    this.el.style.display = 'block'
  }

  close(): void {
    this.el.style.display = 'none'
  }

  /** 外部状态（toggles）变化时同步某行的开关显示。 */
  setRowEnabled(event: string, on: boolean): void {
    const input = this.el.querySelector<HTMLInputElement>(
      `input[type="checkbox"][data-event="${event.replace(/["\\]/g, '\\$&')}"]`,
    )
    if (input) input.checked = on
  }

  /** 同步某行的来源显示（默认 / 自定义文件名），并启停「试听我的 / 还原」。 */
  setRowSource(event: string, custom: boolean, name?: string): void {
    const row = this.rows.get(event)
    if (!row) return
    if (custom) {
      row.source.textContent = name && name.length > 0 ? name : '自定义音频'
      row.source.style.color = '#4c8dff'
      row.source.title = name && name.length > 0 ? name : ''
    } else {
      row.source.textContent = '默认'
      row.source.style.color = '#9aa0a6'
      row.source.title = ''
    }
    row.previewCustom.disabled = !custom
    row.reset.disabled = !custom
  }

  unmount(): void {
    document.removeEventListener('pointerdown', this.onDocPointerDown)
    document.removeEventListener('keydown', this.onDocKeydown)
    this.el.remove()
  }

  private addRow(opt: ToggleOption): void {
    const block = document.createElement('div')
    Object.assign(block.style, {
      padding: '7px 0',
      borderBottom: '1px solid #232830',
    })
    block.addEventListener('mouseenter', () => {
      block.style.background = '#1e242c'
    })
    block.addEventListener('mouseleave', () => {
      block.style.background = 'transparent'
    })

    const head = document.createElement('div')
    Object.assign(head.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    })

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.dataset.event = opt.event
    input.checked = true
    Object.assign(input.style, { flexShrink: '0', cursor: 'pointer', margin: '0' })
    input.addEventListener('change', () => {
      this.callbacks?.onToggle(opt.event, input.checked)
    })

    const name = document.createElement('span')
    name.textContent = opt.label
    Object.assign(name.style, {
      flex: '1',
      minWidth: '0',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      cursor: 'pointer',
    })
    name.addEventListener('click', () => {
      input.checked = !input.checked
      this.callbacks?.onToggle(opt.event, input.checked)
    })

    const actions = document.createElement('div')
    Object.assign(actions.style, { display: 'flex', gap: '2px', flexShrink: '0' })

    const previewDefault = this.makeIconButton('▶', '试听默认', () => this.callbacks?.onPreviewDefault(opt.event))
    const previewCustom = this.makeIconButton('♪', '试听自定义', () => this.callbacks?.onPreviewCustom(opt.event))
    previewCustom.disabled = true
    const upload = this.makeIconButton('⬆', '上传音频替换', () => {
      this.activeUploadEvent = opt.event
      this.fileInput.click()
    })
    const reset = this.makeIconButton('↺', '还原默认', () => this.callbacks?.onReset(opt.event))
    reset.disabled = true

    actions.appendChild(previewDefault)
    actions.appendChild(previewCustom)
    actions.appendChild(upload)
    actions.appendChild(reset)
    head.appendChild(input)
    head.appendChild(name)
    head.appendChild(actions)
    block.appendChild(head)

    const source = document.createElement('div')
    source.textContent = '默认'
    Object.assign(source.style, {
      marginLeft: '22px',
      marginTop: '2px',
      fontSize: '11px',
      color: '#9aa0a6',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })
    block.appendChild(source)
    this.el.appendChild(block)

    this.rows.set(opt.event, { source, previewCustom, reset })
  }

  private makeIconButton(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = glyph
    btn.type = 'button'
    btn.title = title
    Object.assign(btn.style, {
      width: '24px',
      height: '24px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      background: 'transparent',
      border: 'none',
      borderRadius: '6px',
      color: '#9aa0a6',
      fontSize: '13px',
      lineHeight: '1',
      cursor: 'pointer',
    })
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) btn.style.background = '#2a313a'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent'
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    return btn
  }
}
