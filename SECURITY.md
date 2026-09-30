# Security and privacy

**English** | [简体中文](SECURITY.zh-CN.md)

## Supported scope

The 0.1.x line is an Alpha local application, primarily for Windows x64. Do not expose the engine as a public or shared LAN service.

The engine listens on `127.0.0.1:28840`. APIs and audio require a per-process HttpOnly, SameSite=Strict session cookie. Session initialization accepts trusted local origins, with Host/Origin and cross-site request checks. This boundary targets untrusted webpages; it does not defend against malicious programs running under the same OS account. Interpreter checks only execute the project's runtime or `.venv` Python.

Static files, downloads, and asset operations enforce directory boundaries. Stopping an engine requires matching its PID, start time, executable, working directory, and live instance identity. Close Voxera before copying its portable folder.

## Data and networking

Databases, audio, weights, and model download caches default to the application folder; `VOXERA_HOME` can change their location. Installation, downloads, and network diagnostics need connectivity. Model inference is local; the project implements no audio upload or telemetry. The OS, WebView, and libraries may keep additional caches.

Downloads verify TLS. Hugging Face revisions are pinned; ModelScope master downloads are identified by actual file SHA-256 hashes. Models have separate licenses. Only load trusted weights. Legacy text `.ready` markers are labeled `unverified-local`; back them up and re-download for a verifiable manifest.

## Reporting a vulnerability

Do not post exploit details, private audio, or databases in public issues. If the repository enables private vulnerability reporting, use [Security → Report a vulnerability](https://github.com/eoeac/voxera/security/advisories/new). Otherwise, open an [issue](https://github.com/eoeac/voxera/issues) without exploit details to request a private contact route. No dedicated private reporting address is currently declared.

Include the version, platform, reproducible scope, and impact. Remove private paths, character text, and audio from shared logs.
