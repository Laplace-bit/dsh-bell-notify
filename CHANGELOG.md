# Changelog

## 0.1.2 - 2026-08-21

- Fix the plugin settings card on DeepSeek Harness hosts using the rc.7+ `settingsScope` and keyed settings-slot contract.
- Keep older hosts without `settingsScope` gracefully card-free while lifecycle sounds continue to work.
- Add regression coverage for the Host settings namespace key and the older-host fallback.

The source fix is merged in `main` as [PR #2](https://github.com/Laplace-bit/dsh-bell-notify/pull/2). The next npm release should include this fix before broad promotion.
