# dsh-bell-notify 🔔

[English](./README.en.md) · [中文](./README.md)

**dsh-bell-notify** is a community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). It turns key Agent lifecycle events into configurable sound cues, so you can follow progress without watching the page.

Every bell is synthesized in real time with the Web Audio API, with no audio assets in the package. Controls live in **Settings → Plugins → Plugin configuration → Bell notifications**; there is no floating workspace panel or corner status dot competing with the conversation UI.

> Not part of the official DeepSeek distribution. An MIT-licensed community plugin.

## What it does

### 🎵 Sound the moments that matter

Each configurable event has its own bell. A new installation enables only the three highest-value cues by default: **Agent start, waiting for input, and turn complete**. The remaining events are preconfigured but silent until you enable them, so routine activity does not become noise.

| Event | Default bell | Initial state |
|-------|-------------|---------------|
| Session start | `startup` | Off |
| Agent start | `click` | On |
| Thinking | `notify` | Off |
| Tool call | `tick` | Off |
| Tool done | `drop` | Off |
| Command run | `beep` | Off |
| Command done | `rise` | Off |
| Waiting for input | `alert` | On |
| Turn complete | `success` | On |
| Back to idle | `confirm` | Off |

### 🎛️ Swap in your own sounds

Open **Settings → Plugins → Plugin configuration → Bell notifications**. For every event you can:

- **Preview** the default sound, or the one you uploaded
- **Upload** your own audio file to replace it
- **Reset** back to default

Your replacement survives reloads and the card shows the uploaded file name. Choose **Reset** whenever you want to return to the built-in recipe.

### 🎼 Sounds that are "alive"

All bells are synthesized on the fly — not recorded files. That means:

- Zero audio assets, a negligible footprint
- Built-in recipes generated at playback; replace any event with your own audio
- Fully offline, no network, no external resources

## Why

When the Agent runs for a while, the page is not always in view. A small set of high-value cues for starting, requesting input, and finishing lets you keep working elsewhere and return to Harness when attention is needed.

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

Open the page, **click anywhere once** (browser autoplay policy — one click unlocks audio), then adjust events in **Settings → Plugins → Plugin configuration → Bell notifications**.

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

Use **Settings → Plugins → Plugin configuration → Bell notifications** for:

- **Enable notification sounds**, the only global sound switch. Turning it off mutes everything.
- Profile-durable enablement and master-volume preferences.
- Browser-local event toggles, custom sound replacements, and file names (`localStorage` + IndexedDB), applied immediately and retained across reloads.

The former corner status dot and floating panel have been removed; all controls now live in the plugin configuration card.

### Version and updates

The card shows the running version from package metadata. Update is enabled only when the active profile is confirmed to use an npm registry dependency; it runs the fixed command `pnpm update dsh-bell-notify` in that profile, then reconciles `dsh.profile.bundles` with Harness' bundle rules before requiring a Harness restart. `link:` and `file:` development installs show as a development version and keep Update disabled so local source links are never replaced.

## Development

```sh
pnpm install
pnpm build          # builds lib/index.js (host) + lib/client.js (browser)
pnpm test           # unit tests
pnpm typecheck
```

Want to hear the built-in bells? Open [preview.html](preview.html) from the repository, or visit the [live preview](https://laplace-bit.github.io/dsh-bell-notify/).

## FAQ

**Is this an official DeepSeek plugin?**
No. It's a community plugin for DeepSeek Harness (`dsh`), MIT-licensed, not part of the official distribution.

**Why is there no sound?**
Most likely the browser autoplay policy — after the plugin loads you need to click the page once to unlock audio. After that, event sounds work normally.

**Where do I configure notification sounds?**
Open **Settings → Plugins → Plugin configuration → Bell notifications**. It manages enablement, volume, event toggles, custom sounds, and updates for npm-installed versions.

**Why is there no corner status dot or floating panel?**
They were removed to keep the workspace unobstructed. All controls are now consolidated in Plugin configuration.

**Where are custom sounds stored?**
Bytes in browser IndexedDB, event-to-file mapping in `localStorage`. All local — nothing is uploaded anywhere.

## License

[MIT](LICENSE)
