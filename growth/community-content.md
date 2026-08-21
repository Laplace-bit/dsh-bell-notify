# Community Content Pack

All drafts are problem-led and disclose the maintainer relationship. Replace `{RELEASE_URL}` after npm `0.1.2` is live.

## Hacker News — Show HN

**Title**

`Show HN: dsh-bell-notify – Web Audio lifecycle cues for DeepSeek Harness`

**Body**

I kept missing the end of long DeepSeek Harness (dsh) runs when the browser tab was behind another window, so I built a small MIT-licensed plugin: https://github.com/Laplace-bit/dsh-bell-notify

It listens to Agent lifecycle events and plays a small cue when the Agent starts, needs input, or completes a turn. There are ten configurable events, but only those three are enabled on a new install to avoid turning every tool call into noise. The defaults are synthesized with the Web Audio API, so the package ships no WAV/MP3 assets and works offline. Each event can be replaced with a local audio file from the plugin settings card.

The live preview is here: https://laplace-bit.github.io/dsh-bell-notify/en.html

The interesting engineering constraint was making this a normal DSH bundle while keeping browser audio local and bounded: a queue, concurrency limit, cooldown rules, and an explicit autoplay-unlock path. A real compatibility bug in the settings-card registration was also found and fixed for the current host contract; the fix is in `main` and released as `{RELEASE_URL}`.

I am the maintainer. Feedback I am looking for: which lifecycle moments are useful enough to hear, and which should always stay silent?

## Reddit — problem-led discussion

**Title:** What is your signal that a long-running AI coding agent needs you?

**Post**

When I run a long DeepSeek Harness task in another window, the two moments I care about are “the Agent needs input” and “the turn is complete”. Browser-only status is easy to miss, but a sound on every tool call is unbearable.

I wrote an open-source DSH plugin around that trade-off: ten lifecycle events, only three enabled by default, Web Audio tones generated at playback, and per-event local custom sounds. The preview lets you hear the recipes before installing: https://laplace-bit.github.io/dsh-bell-notify/en.html

I maintain it, so this is a project link rather than a neutral recommendation. I would value real workflows more than Stars: do you want a sound for approval, completion, errors, or something else?

## Dev.to / Hashnode technical article

**Title:** How I designed low-noise lifecycle notifications for an AI coding agent

**Outline:** missed attention boundary -> event taxonomy -> three safe defaults -> Web Audio synthesis -> browser autoplay -> queue/cooldown/concurrency -> local custom sound storage -> compatibility regression and test strategy -> install and live preview.

## V2EX 中文帖

**标题：** 给 DeepSeek Harness 加生命周期提示音的开源插件，默认只提醒需要介入和完成

**正文：**

长时间跑 DSH 任务时，页面切到别处很容易错过“需要确认”或“本轮完成”。我做了一个 MIT 开源社区插件 [dsh-bell-notify](https://github.com/Laplace-bit/dsh-bell-notify)：支持 10 个 Agent 生命周期事件，但新安装只打开“开始执行 / 等待确认 / 本轮完成”三项；内置声音由 Web Audio 实时合成，不带音频资源，也可以在插件配置里给每个事件上传自己的声音。

可以先在[在线试听页](https://laplace-bit.github.io/dsh-bell-notify/)试听，再用 `pnpm dsh plugin --profile bell add dsh-bell-notify` 安装。项目正在维护中，我更想收集实际工作流反馈：你最希望听到哪个事件？

## X / Bluesky short post

Long-running AI agent tasks need an attention boundary, not another dashboard.

I built `dsh-bell-notify` for DeepSeek Harness: 10 lifecycle cues, 3 quiet defaults, Web Audio synthesis, local custom sounds, no audio assets.

Hear them: https://laplace-bit.github.io/dsh-bell-notify/en.html
Source: https://github.com/Laplace-bit/dsh-bell-notify
