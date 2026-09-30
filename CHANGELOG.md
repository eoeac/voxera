# Changelog

**English** | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.1 — 2026-09-30 (Alpha)

- Local Host/Origin/session/path boundaries, interpreter allowlisting, installation parameter validation, and process identity checks.
- Actual CPU/CUDA/MPS selection, serial generation, model unloading, and pinned reference reuse through Qwen Base and VoxCPM2.
- Validated input and 1–10 candidates; additive storage migrations, interruption recovery, failure states, SSE heartbeat, and polling.
- Asset/file deletion with rollback and startup recovery, valid reference binding, portable path recovery, and bounded-memory ZIP export.
- Download source fallback, isolated caches, TLS, pinned HF revisions, SHA-256 manifests, and load-time verification.
- Locked dependencies and isolated setup; Windows acceleration packages staged for activation after restart.
- Visible errors/reconnection, refresh recovery, one active player, keyboard/focus handling, English and Chinese UI, and English as the first-run default.
- Native Windows startup/shutdown, continuously drained launcher errors, verified portable packaging, licenses, contribution/security guides, and CI.
- English-first README and core documentation with corresponding Simplified Chinese versions.

CPU inference and the native Windows host have been exercised on the maintainer's machine. CUDA/MPS, fresh-machine setup, and cross-platform/Tauri distribution still need dedicated validation. See [validation notes (中文)](docs/implementation-2026-09-30.md).
