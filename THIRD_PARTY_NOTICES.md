# Third-party components and models

**English** | [简体中文](THIRD_PARTY_NOTICES.zh-CN.md)

Voxera's own code uses the root MIT LICENSE. Dependencies and downloaded models keep their own licenses; MIT does not replace those terms.

| Component | Upstream and license reference |
| --- | --- |
| Qwen3-TTS code | [QwenLM/Qwen3-TTS LICENSE](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE), Apache-2.0 |
| Qwen VoiceDesign / Base weights | [VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign), [Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base), Apache-2.0 model cards |
| VoxCPM code / VoxCPM2 weights | [OpenBMB/VoxCPM LICENSE](https://github.com/OpenBMB/VoxCPM/blob/main/LICENSE), [VoxCPM2 model card](https://huggingface.co/openbmb/VoxCPM2), Apache-2.0 |
| PyTorch / TorchAudio | [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE), [TorchAudio](https://github.com/pytorch/audio/blob/main/LICENSE); preserve shipped licenses/notices |
| Python and Python packages | Original runtime and `.dist-info` licenses are included; installed versions are listed in `runtime-packages.json` |
| React, Vite, Tailwind, Lucide, and npm dependencies | Versions are locked in `app/package-lock.json`; `frontend-licenses.json` lists package/license metadata and `third-party-licenses/` preserves license texts |
| WebView2 | A Microsoft system runtime installed separately, subject to Microsoft terms; not bundled |

Portable releases exclude model weights and personal audio. If redistributing weights, retain upstream LICENSE, NOTICE, and model cards and comply with their terms. GPU binary components also retain their own terms.

License references were checked on 2026-09-30. This lists major components, rather than substituting metadata for complete third-party license texts. Generated public samples are included under `docs/samples/`.
