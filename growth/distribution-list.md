# Open Source Distribution List

Prepared 2026-08-21 for `dsh-bell-notify`. Submit only after npm `0.1.2` is published; until then the current npm card can still reproduce the settings-card issue on DSH rc.8.

| Priority | Channel | URL | Free | Account / method | Open-source fit | Recommended title / description |
|---:|---|---|---|---|---|---|
| P0 | Awesome DSH Plugin | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin | Yes | GitHub account; open a PR with one list entry | Explicitly accepts installable `dsh.bundle` plugins | **Title:** `dsh-bell-notify` **Description:** `Web Audio lifecycle cues for DeepSeek Harness: ten configurable events, three low-noise defaults, per-event custom sounds, and no shipped audio assets.` Category: Notifications & Integrations (or Voice & Audio). |
| P0 | dsh-market | https://github.com/dsh-market/dsh-market#submit-your-plugin | Yes | No separate submission; it ingests the curated Awesome list | Yes, automatic after list merge | Use the same one-line description; verify screenshot and npm version after ingestion. |
| P0 | DSH Get | https://www.dshget.com/ | Yes | Directory form or maintainer contact; verify current form before submitting | DSH-specific and highly relevant | `dsh-bell-notify — DeepSeek Harness lifecycle sound notifications` plus source, npm, live preview, and install command. |
| P0 | GitHub topic search | https://github.com/topics/dsh-plugin | Yes | Repository metadata | Yes | Already applied: `deepseek-harness`, `dsh`, `dsh-plugin`, `notification`, `web-audio`, `open-source`, `productivity`. |
| P1 | npm | https://www.npmjs.com/package/dsh-bell-notify | Yes | npm publish from maintainer account | Native distribution | Publish `0.1.2` with the README and changelog; keep the description in sync with GitHub. |
| P1 | Hacker News | https://news.ycombinator.com/submit | Yes | Account; submit a technical Show HN | Open source welcome | `Show HN: I added low-noise lifecycle sounds to DeepSeek Harness` (use the draft in `community-content.md`; do not ask for votes). |
| P1 | Reddit | https://www.reddit.com/ | Yes | Account; read each subreddit rule first | Yes, problem-led posts only | Start with a question about missing completion/approval cues in AI coding agents; disclose maintainer relationship and link the technical write-up. |
| P1 | Dev.to | https://dev.to/new | Yes | Account; Markdown article | Open source welcome | `How I designed low-noise lifecycle notifications for an AI coding agent` |
| P1 | Hashnode | https://hashnode.com/create | Yes | Account; Markdown article | Open source welcome | `Web Audio synthesis for DeepSeek Harness plugin notifications` |
| P1 | V2EX | https://www.v2ex.com/go/create | Yes | Account and relevant node/rules | Chinese developer audience; avoid ad copy | `分享一个给 DeepSeek Harness 加生命周期提示音的开源插件` |
| P2 | Indie Hackers | https://www.indiehackers.com/post/new | Yes | Account; build-in-public post | Better for process than direct install | Share the compatibility fix, npm release checklist, and what users choose to hear. |
| P2 | Product Hunt | https://www.producthunt.com/posts/new | Yes | Maker account and launch assets | Technically allowed, but low fit before usage proof | `dsh-bell-notify — Hear when your DeepSeek agent needs you` |
| P2 | AlternativeTo | https://alternativeto.net/submit/ | Yes | Account; product submission | Better for end-user apps than plugins; verify acceptance | Only submit if the directory accepts browser extensions/plugins; do not force a mismatch. |

## Directory PR for `awesome-dsh-plugin`

Submit one line under **Notifications & Integrations**:

```md
- [Laplace-bit/dsh-bell-notify](https://github.com/Laplace-bit/dsh-bell-notify) - Web Audio lifecycle cues for DeepSeek Harness: ten configurable events, three low-noise defaults, per-event custom sounds, and no shipped audio assets.
```

Maintainer note:

```md
Verified with `dsh plugin add` and npm package `0.1.2`. The live preview demonstrates all ten synthesized tones without loading audio files. The repository documents the browser autoplay requirement and local-only custom sound storage.
```

## Submission rules

- Never submit the same copy unchanged to every community.
- Disclose that the maintainer is submitting their own project.
- Do not ask for Stars, upvotes, or reviews.
- Record the accepted URL and first-week clicks in `metrics.csv`.
