# dsh-bell-notify 🔔

[English](./README.en.md) · [中文](./README.md)

**dsh-bell-notify** is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that adds notification sounds to key Agent lifecycle events.

No audio files — every bell is synthesized in real time with the Web Audio API. And every single event can be swapped for your own sound file. It's a small thing that builds a little bit of unspoken rapport between you and your Agent.

> Not part of the official DeepSeek distribution. An MIT-licensed community plugin.

## What it does

### 🎵 A distinct bell for every step

Every move the Agent makes rings once, and each one sounds different:

| Event | Default bell | Feels like |
|-------|-------------|-----------|
| Session start | `startup` | A soft upward sweep, like powering on |
| Agent start | `click` | A short "ding", we're off |
| Thinking | `notify` | A gentle single note, settling in |
| Tool call | `tick` | A crisp metallic "ta-ta" |
| Tool done | `drop` | A low settle, wrapping up |
| Command run | `beep` | A short beep, terminal-flavored |
| Command done | `rise` | A rising two-note "done" |
| Waiting for you | `alert` | A high triple-chirp, look here |
| Turn complete | `success` | A rising major chord, satisfying |
| Back to idle | `confirm` | A single note drifting down, quiet again |

> `error` and `failure` are built in too, off by default — wire them up in config if you like.

### 🎛️ Swap in your own sounds

Don't like a bell? Open **Settings → Plugins → Plugin configuration → Bell notifications**. For every event you can:

- **Preview** the default sound, or the one you uploaded
- **Upload** your own audio file to replace it
- **Reset** back to default

Your replacement sticks (survives reload) and the panel even shows the **file name** you uploaded. Synthesized bells that grow into your own.

### 🎼 Sounds that are "alive"

All bells are synthesized on the fly — not recorded files. That means:

- Zero audio assets, a negligible footprint
- Pitch, rhythm, and length tunable through config
- Fully offline, no network, no external resources

## Why

You stare at a terminal waiting for the Agent; your eyes get tired while your ears sit idle. Give each step a soft sound and you can **keep tabs on progress with your ears while you do something else** — and when it needs you (waiting, errors), it'll call you over itself.

It's not a heavy productivity feature; it is a small set of well-timed notifications for your Agent.

## Install

From a DeepSeek Harness source checkout:

```sh
pnpm dsh plugin --profile bell add dsh-bell-notify
```

If `dsh` is already on your `PATH`:

```sh
dsh plugin --profile bell add dsh-bell-notify
```

> The npm package ships prebuilt `lib/`, so no pnpm ≥10 build-script allowance is needed.

Start it:

```sh
pnpm dsh --profile bell
```

Open the page, **click anywhere once** (browser autoplay policy — one click unlocks audio), then run any task to hear notification sounds.

Remove it:

```sh
pnpm dsh plugin --profile bell remove dsh-bell-notify
```

## Configuration

Tune regular runtime parameters in the profile's `cordis.patch.yml` (Cordis validates and fills defaults at load):

```yaml
maxQueue: 8            # wait-queue capacity
maxConcurrent: 3       # simultaneous sounds (1 = serial, higher = more overlap)
defaultCooldown: 1000  # global cooldown fallback (ms)
```

Manage enablement, mute, and volume in **Settings → Plugins → Plugin configuration → Bell notifications**; those values are durable profile settings. Per-event toggles, custom sound replacements, and file names remain browser-local (`localStorage` + IndexedDB), apply immediately, and survive reloads.

### Version and updates

The card shows the running version from package metadata. Update is enabled only when the active profile is confirmed to use an npm registry dependency; it runs the fixed command `pnpm update dsh-bell-notify` in that profile, then reconciles `dsh.profile.bundles` with Harness' bundle rules before requiring a Harness restart. `link:` and `file:` development installs show as a development version and keep Update disabled so local source links are never replaced.

## Development

```sh
pnpm install
pnpm build          # builds lib/index.js (host) + lib/client.js (browser)
pnpm test           # unit tests
pnpm typecheck
```

Want to hear every built-in bell? Open [preview.html](preview.html), or try the [project page](https://laplace-bit.github.io/dsh-bell-notify/) to listen live.

## FAQ

**Is this an official DeepSeek plugin?**
No. It's a community plugin for DeepSeek Harness (`dsh`), MIT-licensed, not part of the official distribution.

**Why is there no sound?**
Most likely the browser autoplay policy — after the plugin loads you need to click the page once to unlock audio. After that, event sounds work normally.

**Where do I configure notification sounds?**
Open **Settings → Plugins → Plugin configuration → Bell notifications**. It manages enablement, mute, volume, event toggles, custom sounds, and updates for npm-installed versions.

**Where are custom sounds stored?**
Bytes in browser IndexedDB, event-to-file mapping in `localStorage`. All local — nothing is uploaded anywhere.

## License

[MIT](LICENSE)
