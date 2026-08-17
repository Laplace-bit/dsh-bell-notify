# dsh-bell-notify 🔔

[中文](./README.md) · [English](./README.en.md)

**dsh-bell-notify** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的社区插件。它把关键 Agent 生命周期事件变成可配置的声音提示，让你在不盯着页面时仍能掌握进度。

所有铃声均由 Web Audio 实时合成，不携带音频资源。配置集中在 **设置 → 插件 → 插件配置 → 铃声通知**：不再提供工作区悬浮面板或右下角状态点，避免占用会话界面。

> 它不是 DeepSeek 官方发行的一部分，是一个 MIT 协议开源的社区插件。

## 它能干什么

### 🎵 需要时才响

每个可配置事件都有独立铃声。首次安装默认只开启三个最需要注意的节点：**开始执行、等待确认、本轮完成**；其余事件预置为关闭，避免过程细节持续打断你。

| 环节 | 默认铃声 | 首次状态 |
|------|---------|---------|
| 会话启动 | `startup` | 关闭 |
| 开始执行 | `click` | 开启 |
| 开始思考 | `notify` | 关闭 |
| 工具调用 | `tick` | 关闭 |
| 工具完成 | `drop` | 关闭 |
| 命令执行 | `beep` | 关闭 |
| 命令完成 | `rise` | 关闭 |
| 等待确认 | `alert` | 开启 |
| 本轮完成 | `success` | 开启 |
| 回到空闲 | `confirm` | 关闭 |

### 🎛️ 每个声音都能自己换

打开 **设置 → 插件 → 插件配置 → 铃声通知**，可对每一个事件：

- **试听**默认音，或者试听你上传的音
- **上传**自己的音频文件替换默认音
- **还原**回默认

换上的声音会记住（刷新后仍在），界面会显示上传的文件名。需要回到原始配方时，直接选择“还原默认”。

### 🎼 声音是「活」的

所有铃声都是**实时合成的**——不是一段段录好的音频文件。这意味着：

- 零音频资源，包体轻到可以忽略
- 内置配方在播放时实时生成；每个事件都可以替换成自己的音频
- 离线可用，不联网、不加载外部资源

## 为什么做这个

当 Agent 运行较久时，页面并不总在视野里。用少量高价值提示音标记开始、需要确认和完成，你可以把注意力留给别的工作，需要介入时再回到 Harness。

## 安装

从 DeepSeek Harness 源码仓库里：

```sh
pnpm dsh plugin --profile bell add dsh-bell-notify
```

如果 `PATH` 上已经有 `dsh`：

```sh
dsh plugin --profile bell add dsh-bell-notify
```

> npm 包带预构建产物，无需 pnpm ≥10 的构建脚本授权，直接可装。

启动：

```sh
pnpm dsh --profile bell
```

打开页面后**先点一下页面任意位置**（浏览器的音频自动播放策略，点一次即可解锁声音），然后在 **设置 → 插件 → 插件配置 → 铃声通知** 中按需要调整事件。

卸载：

```sh
pnpm dsh plugin --profile bell remove dsh-bell-notify
```

## 配置

常规运行参数仍可在 profile 的 `cordis.patch.yml` 中调整（Cordis 加载时会校验并补默认值）：

```yaml
maxQueue: 8            # 等待队列容量
maxConcurrent: 3       # 同时播放的声音数（1 = 串行，值越大越能重叠）
defaultCooldown: 1000  # 规则默认节流窗口（毫秒）
```

在 **设置 → 插件 → 插件配置 → 铃声通知** 中：

- “启用提示音”是唯一的总开关；关闭即完全静音。
- 总音量与启用状态持久化在当前 profile。
- 每个事件的开关、自定义音源和文件名保存在浏览器本地（`localStorage` + IndexedDB），改完立即生效、刷新不丢。

旧版的右下角状态点和浮层设置已移除；现有配置都在插件配置卡中完成。

### 版本与更新

卡片会显示包元数据中的运行版本。只有当前 profile 能确认使用 npm registry 包时，才会启用“更新”；更新会在该 profile 内执行固定的 `pnpm update dsh-bell-notify`，随后按 Harness 规则同步 `dsh.profile.bundles`，完成后重启 Harness 生效。`link:` / `file:` 本地开发安装会显示为“开发版本”，更新按钮保持禁用，避免覆盖你的源码链接。

## 开发

```sh
pnpm install
pnpm build          # 产出 lib/index.js（Host）+ lib/client.js（浏览器）
pnpm test           # 单元测试
pnpm typecheck
```

想快速试听内置铃声？在仓库中打开 [preview.html](preview.html)，或访问[在线试听页](https://laplace-bit.github.io/dsh-bell-notify/)。

## 常见问题

**这是 DeepSeek 官方插件吗？**
不是。它是 DeepSeek Harness（`dsh`）的社区插件，MIT 协议开源，不属于官方发行。

**为什么点了没声音？**
大概率是浏览器的自动播放策略——插件首次加载后需要你先在页面上点击一次，声音才会解锁。这之后事件声音就能正常响了。

**在哪里配置提示音？**
在 Web 设置的 **插件 → 插件配置 → 铃声通知** 中。这里可以设置启用状态、音量、事件开关与自定义铃声，也能查看并更新 npm 安装的版本。

**为什么不再有右下角状态点或浮层？**
它们已被移除，避免遮挡工作区。所有控制项现在统一放在插件配置中。

**自定义的声音存在哪？**
文件字节存在浏览器 IndexedDB，事件到文件的映射存在 `localStorage`。都在你本地，不会上传到任何地方。

## 许可证

[MIT](LICENSE)
