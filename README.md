# dsh-bell-notify 🔔

[中文](./README.md) · [English](./README.en.md)

**dsh-bell-notify** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的社区插件——给 Agent 装上提示音：工作过程中的关键生命周期事件会用轻快的铃声提示你。

不用任何音频文件，所有铃声都是 Web Audio 实时合成出来的；每一个环节都可以换成你自己的声音文件。这是一个让你和 Agent 之间「有点默契」的小东西。

> 它不是 DeepSeek 官方发行的一部分，是一个 MIT 协议开源的社区插件。

## 它能干什么

### 🎵 每个环节都有专属铃声

Agent 的一举一动都会「响一声」，而且**每个环节的声音都不一样**：

| 环节 | 默认铃声 | 听起来像 |
|------|---------|---------|
| 会话启动 | `startup` | 一声轻柔的上扬，像开机 |
| 开始执行 | `click` | 短促的一声「叮」，出发了 |
| 开始思考 | `notify` | 温柔的单音，进入状态 |
| 工具调用 | `tick` | 清脆的「哒哒」两声，金属质感 |
| 工具完成 | `drop` | 低低地落定，收尾 |
| 命令执行 | `beep` | 一声短促的哔，有终端味 |
| 命令完成 | `rise` | 上扬的双音，搞定 |
| 等待确认 | `alert` | 高频三连，叫你看一眼 |
| 本轮完成 | `success` | 上行大三和弦，成就感拉满 |
| 回到空闲 | `confirm` | 单音缓缓落下，安静了 |

> `error` / `failure` 两个音效也内置好了，默认没启用，你可以在配置里按需接上。

### 🎛️ 每个声音都能自己换

觉得某个铃声不合胃口？打开 **设置 → 插件 → 插件配置 → 铃声通知**，对每一个事件：

- **试听**默认音，或者试听你上传的音
- **上传**自己的音频文件替换默认音
- **还原**回默认

换上去的音会记住（刷新后还在），界面上还会显示你上传的**文件名**。铃声明明是合成的，却能长成你自己的样子。

### 🎼 声音是「活」的

所有铃声都是**实时合成的**——不是一段段录好的音频文件。这意味着：

- 零音频资源，包体轻到可以忽略
- 声音可以随时通过配置调音高、节奏、时长
- 离线可用，不联网、不加载外部资源

## 为什么做这个

你盯着终端等 Agent 跑，眼睛看累了，耳朵其实还闲着。给每个环节配一个轻轻的声音，你就能**一边做别的事、一边用耳朵掌握进度**——该看屏幕的时候（等确认、出错了），它自己会叫你。

这不是什么严肃的功能插件，更像是给 Agent 配了一组恰到好处的提示音。

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

打开页面后**先点一下页面任意位置**（这是浏览器的音频自动播放策略，点一次即可解锁声音），然后随便跑一个任务即可听到提示音。

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

在 **设置 → 插件 → 插件配置 → 铃声通知** 中管理启用状态和总音量；关闭“启用提示音”即完全静音。它们持久化在当前 profile。每个事件的开关、自定义音源和文件名保存在浏览器本地（`localStorage` + IndexedDB），改完立即生效、刷新不丢。

### 版本与更新

卡片会显示包元数据中的运行版本。只有当前 profile 能确认使用 npm registry 包时，才会启用“更新”；更新会在该 profile 内执行固定的 `pnpm update dsh-bell-notify`，随后按 Harness 规则同步 `dsh.profile.bundles`，完成后重启 Harness 生效。`link:` / `file:` 本地开发安装会显示为“开发版本”，更新按钮保持禁用，避免覆盖你的源码链接。

## 开发

```sh
pnpm install
pnpm build          # 产出 lib/index.js（Host）+ lib/client.js（浏览器）
pnpm test           # 单元测试
pnpm typecheck
```

想快速试听所有内置铃声？直接打开 [preview.html](preview.html)，或访问[项目主页](https://laplace-bit.github.io/dsh-bell-notify/)在线试听全部铃声。

## 常见问题

**这是 DeepSeek 官方插件吗？**
不是。它是 DeepSeek Harness（`dsh`）的社区插件，MIT 协议开源，不属于官方发行。

**为什么点了没声音？**
大概率是浏览器的自动播放策略——插件首次加载后需要你先在页面上点击一次，声音才会解锁。这之后事件声音就能正常响了。

**在哪里配置提示音？**
在 Web 设置的 **插件 → 插件配置 → 铃声通知** 中。这里可以设置启用状态、音量、事件开关与自定义铃声，也能查看并更新 npm 安装的版本。

**自定义的声音存在哪？**
文件字节存在浏览器 IndexedDB，事件到文件的映射存在 `localStorage`。都在你本地，不会上传到任何地方。

## 许可证

[MIT](LICENSE)
