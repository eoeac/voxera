# Contributing

**English** | [简体中文](CONTRIBUTING.zh-CN.md)

Read [README](README.md), [AGENTS.md](AGENTS.md), and the [architecture notes (中文)](docs/architecture.md). Windows x64 portable is the primary release target; `src-tauri/` is experimental.

## Development

Use Python 3.12, Node.js 22+, and uv. Run `python tools/bootstrap.py` to install into the project `.venv`, then `npm ci` in `app/`.

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
npm --prefix app run lint
npm --prefix app run build
```

Tests create an isolated `.test-data/` directory and do not use personal databases or audio. Real inference requires model weights and is outside default CI. Add regression tests for specific failures or business constraints.

## Changes and pull requests

Describe reproduction steps, expected/actual behavior, platform, and validation. UI changes should include dark/light screenshots and checks for the 960×640 minimum window, long names, keyboard access, and both languages. English is the first-run default; preserve a user's saved Chinese preference. Keep translation keys paired.

For model changes, provide the device, weight manifest, package versions, elapsed time, and a sample. Prefer simple code, preserve existing assets, keep all 1–10 candidate options, and never install into global Python. Follow [SECURITY](SECURITY.md) for security-sensitive work.

The repository's commit convention is `<emoji> <type>: <concise Chinese description>`. Update lockfiles with dependency changes. Do not commit runtimes, model weights, private audio, databases, releases, credentials, or caches.
