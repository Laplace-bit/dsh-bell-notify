/** Locale bundles for the bell-notify plugin configuration card. */

export const NS = 'settings.bellNotify'

export type BellLocaleKey =
  | 'title' | 'description'
  | 'enabled' | 'enabledHint' | 'muteAll' | 'muteAllHint' | 'masterVolume' | 'masterVolumeHint'
  | 'soundEvents' | 'soundEventsHint' | 'eventsUnavailable'
  | 'eventSessionStart' | 'eventAgentStart' | 'eventAgentThinking' | 'eventToolStart' | 'eventToolDone'
  | 'eventCommandStart' | 'eventCommandDone' | 'eventAgentWaiting' | 'eventAgentDone' | 'eventAgentIdle'
  | 'defaultSound' | 'customSound' | 'preview' | 'changeSound' | 'restoreDefault'
  | 'readOnly' | 'loading' | 'unavailable' | 'retry'
  | 'version' | 'developmentVersion'
  | 'updates' | 'updateHint' | 'developmentBuild' | 'updateUnavailable'
  | 'update' | 'updating' | 'restartRequired' | 'updateFailed'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'

export const en: Record<BellLocaleKey, string> = {
  title: 'Bell notifications',
  description: 'Lifecycle sounds and custom notification tones.',
  enabled: 'Enable notification sounds',
  enabledHint: 'Play sounds for enabled lifecycle events.',
  muteAll: 'Mute all sounds',
  muteAllHint: 'Keep event preferences without playing audio.',
  masterVolume: 'Volume',
  masterVolumeHint: 'Applies to built-in and custom sounds.',
  soundEvents: 'Sound events',
  soundEventsHint: 'These preferences are stored in this browser.',
  eventsUnavailable: 'Sound event controls appear after the session service is ready.',
  eventSessionStart: 'Session started',
  eventAgentStart: 'Agent started',
  eventAgentThinking: 'Thinking started',
  eventToolStart: 'Tool started',
  eventToolDone: 'Tool completed',
  eventCommandStart: 'Command started',
  eventCommandDone: 'Command completed',
  eventAgentWaiting: 'Waiting for input',
  eventAgentDone: 'Turn completed',
  eventAgentIdle: 'Back to idle',
  defaultSound: 'Default sound',
  customSound: 'Custom: {name}',
  preview: 'Preview',
  changeSound: 'Change sound',
  restoreDefault: 'Restore default',
  readOnly: 'This deployment stores settings read-only.',
  loading: 'Loading plugin settings…',
  unavailable: 'Plugin settings are unavailable in this connection.',
  retry: 'Retry',
  version: 'Version {version}',
  developmentVersion: 'Development version {version}',
  updates: 'Updates',
  updateHint: 'Install the newest npm version, then restart Harness.',
  developmentBuild: 'Linked source; updates are managed in the checkout.',
  updateUnavailable: 'Updates are available only for an npm profile installation.',
  update: 'Update',
  updating: 'Updating…',
  restartRequired: 'Updated. Restart Harness to load the new version.',
  updateFailed: 'The package update failed; your current version is unchanged.',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

export const zh: Record<BellLocaleKey, string> = {
  title: '铃声通知',
  description: 'Agent 生命周期提示音与自定义铃声。',
  enabled: '启用提示音',
  enabledHint: '为已启用的生命周期事件播放声音。',
  muteAll: '静音全部声音',
  muteAllHint: '保留事件偏好，但不播放音频。',
  masterVolume: '音量',
  masterVolumeHint: '同时作用于内置和自定义声音。',
  soundEvents: '铃声事件',
  soundEventsHint: '这些偏好保存在当前浏览器中。',
  eventsUnavailable: '会话服务就绪后可配置铃声事件。',
  eventSessionStart: '会话启动',
  eventAgentStart: '开始执行',
  eventAgentThinking: '开始思考',
  eventToolStart: '工具调用',
  eventToolDone: '工具完成',
  eventCommandStart: '命令执行',
  eventCommandDone: '命令完成',
  eventAgentWaiting: '等待确认',
  eventAgentDone: '本轮完成',
  eventAgentIdle: '回到空闲',
  defaultSound: '默认提示音',
  customSound: '自定义：{name}',
  preview: '试听',
  changeSound: '更换铃声',
  restoreDefault: '还原默认',
  readOnly: '本部署的设置为只读。',
  loading: '正在加载插件设置…',
  unavailable: '当前连接无法访问插件设置。',
  retry: '重试',
  version: '版本 {version}',
  developmentVersion: '开发版本 {version}',
  updates: '更新',
  updateHint: '安装最新 npm 版本后重启 Harness。',
  developmentBuild: '当前为本地链接版本，请在源码目录管理更新。',
  updateUnavailable: '只有 profile 使用 npm 包时才能更新。',
  update: '更新',
  updating: '更新中…',
  restartRequired: '已更新；重启 Harness 后加载新版本。',
  updateFailed: '包更新失败，当前版本未改变。',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.bellNotify': BellLocaleKey
  }
}
