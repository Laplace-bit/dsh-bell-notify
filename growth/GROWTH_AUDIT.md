# dsh-bell-notify Growth Audit

Date: 2026-08-21  
Scope: public repository, npm metadata, GitHub ecosystem, and the project's own website. No private analytics were available.

## Baseline (public facts)

| Signal | Value | Source |
|---|---:|---|
| GitHub stars | 2 | [repository](https://github.com/Laplace-bit/dsh-bell-notify) |
| GitHub forks | 1 | repository API, 2026-08-21 |
| Open issues | 2 before today's merge | [issues](https://github.com/Laplace-bit/dsh-bell-notify/issues) |
| npm latest | `0.1.1` | [npm](https://www.npmjs.com/package/dsh-bell-notify) |
| npm versions | 2 (`0.1.0`, `0.1.1`) | npm registry |
| Main language | TypeScript | GitHub |
| Host ecosystem | DeepSeek Harness (`dsh`) | [upstream](https://github.com/deepseek-ai/deepseek-harness) |
| Upstream stars | 176k+ | GitHub API, 2026-08-21 |

The repository was created on 2026-08-16, so the low star count is an early-stage baseline, not evidence of weak product demand. The highest-risk conversion problem is release freshness: the settings-card compatibility fix is merged as PR #2 but is not yet published to npm.

## Positioning

**Core pain:** a DSH Agent can run for minutes while the developer is in another window; page-only state makes attention and completion easy to miss.

**Best-fit users:** developers running long, parallel, or approval-gated DeepSeek Harness tasks in the Web UI.

**Primary promise:** hear only the moments that need attention, with three useful cues enabled by default and ten events available when a user wants finer-grained progress.

**Proof points:** real-time Web Audio synthesis, zero shipped audio assets, offline/browser-local storage, per-event custom audio, queue/concurrency/cooldown controls, MIT license, npm install.

**Do not claim:** official DeepSeek product, OS-level notifications, cross-device sound sync, or measured performance gains. Those are different products or unverified claims.

## Search and GEO vocabulary

High-intent terms to use consistently in headings, descriptions, and external listings:

- `DeepSeek Harness sound notification plugin`
- `dsh completion sound`
- `DeepSeek Harness waiting for input alert`
- `dsh lifecycle notification`
- `open source Agent notification sound`
- `Web Audio Agent lifecycle events`
- `DeepSeek Harness plugin custom sound`
- `dsh-bell-notify alternative`

Answer-shaped topics for future pages and AI retrieval:

1. How to get a sound when a DeepSeek Harness turn finishes
2. How browser autoplay affects DSH plugin audio
3. Web Audio synthesis versus shipping WAV/MP3 assets in a plugin
4. Completion-only notification plugins versus lifecycle notifications
5. How to add a custom sound to a DSH plugin event

## Competitor map

The GitHub search surface contains several completion-only or OS-specific projects: `dsh-notify-sound`, `dsh-notification-sounds`, `dsh-approval-notify`, `dsh-windows-notify`, and `dsh-ui-notify`. Most advertise one or two events. The differentiation to repeat is the combination of ten event rules, three sensible defaults, browser-local custom audio, and synthesized defaults with no audio files. This is a feature comparison, not a quality judgment.

## Today's ten actions (Impact / Effort / Probability)

| Rank | Action | Impact | Effort | Probability | Status |
|---:|---|---|---|---|---|
| 1 | Publish the merged settings-card fix as npm `0.1.2` and add a release note | High | Low | High | **Blocked on npm account** |
| 2 | Submit one verified entry to `awesome-dsh-plugin` under Notifications & Integrations or Voice & Audio | Very high | Low | High | Copy prepared in `distribution-list.md` |
| 3 | Keep GitHub metadata, topics, homepage, and Discussions aligned with the current product | High | Low | High | **Done** |
| 4 | Add `llms.txt`, `robots.txt`, and sitemap to the Pages site | Medium | Low | High | **Done** |
| 5 | Put an install-first, bilingual README with proof badges and precise positioning in the repo root | High | Low | High | **Done** |
| 6 | Publish a technical post about the `settingsScope` / keyed-slot regression and fix | Medium-high | Medium | Medium-high | Draft ready |
| 7 | Publish a problem-led Show HN post after npm `0.1.2` is live | High | Low | Medium | Draft ready |
| 8 | Ask DSH directory maintainers to refresh the stale listing description and ingest the new npm version | Medium | Low | High | Copy prepared |
| 9 | Create one GitHub Discussion asking users which lifecycle cues they want enabled by default | Medium | Low | Medium | Can post after release |
| 10 | Run a 7-day channel log with tagged links and public GitHub/npm deltas | Medium | Low | High | Tracker created |

## Channel decision

Prioritize the DSH-native graph first: GitHub repository/search, `awesome-dsh-plugin`, dsh-market/DSH Get, upstream ecosystem discussions, and a technical HN post. Reddit, Dev.to, Hashnode, X, V2EX, and Indie Hackers are secondary distribution for the same technical artifact, rewritten per community. Product Hunt is low priority until the package has a stable release and a user-visible demo.

## Measurement

Record weekly: GitHub stars, forks, watchers, npm weekly downloads, GitHub issues/PRs, directory listing status, and clicks from tagged links. Do not infer installs from stars. The initial snapshot is in [`metrics.csv`](./metrics.csv).

## Execution log

- 2026-08-21: verified PR #2 with typecheck, 113 tests, and build in an isolated worktree.
- 2026-08-21: merged PR #2 (`6d2786c`) into `main`.
- 2026-08-21: updated GitHub description, homepage, topics, and enabled Discussions.
- 2026-08-21: added `docs/llms.txt`, `docs/robots.txt`, and `docs/sitemap.xml`.
- 2026-08-21: added bilingual README positioning and discovery badges.
- 2026-08-21: opened [awesome-dsh-plugin PR #2533](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/2533) with bilingual factual entries.
- 2026-08-21: opened [GitHub Discussion #3](https://github.com/Laplace-bit/dsh-bell-notify/discussions/3) to collect lifecycle-signal preferences without asking for Stars.
