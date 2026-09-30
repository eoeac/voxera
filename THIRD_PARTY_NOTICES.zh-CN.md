# 第三方组件与模型

[English](THIRD_PARTY_NOTICES.md) | **简体中文**

Voxera 自有代码适用根目录 MIT LICENSE。第三方库和下载的模型分别适用其原始许可，Voxera 的许可不替代它们。

| 组件 | 上游及许可依据 |
| --- | --- |
| Qwen3-TTS 代码 | [QwenLM/Qwen3-TTS LICENSE](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE)，Apache-2.0 |
| Qwen VoiceDesign / Base 权重 | [VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign)、[Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base)，模型卡 Apache-2.0 |
| VoxCPM 代码与 VoxCPM2 权重 | [OpenBMB/VoxCPM LICENSE](https://github.com/OpenBMB/VoxCPM/blob/main/LICENSE)、[VoxCPM2 模型卡](https://huggingface.co/openbmb/VoxCPM2)，Apache-2.0 |
| PyTorch / TorchAudio | [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE)、[TorchAudio](https://github.com/pytorch/audio/blob/main/LICENSE)，保留随包许可和 notices |
| Python 与其他 Python 依赖 | 发行包中的 `runtime/` 保留库及其 `.dist-info` 许可；实际版本记录在 `runtime-packages.json` |
| React、Vite、Tailwind、Lucide 等前端依赖 | 依赖版本锁定于 `app/package-lock.json`；发行包另带 `frontend-licenses.json` 的包名、版本及许可元数据 |
| WebView2 | 系统提供或单独安装的 Microsoft 运行组件，适用 Microsoft 条款，不随 Voxera 打包 |

发布包不包含模型权重或用户音频。二次分发加入权重时，应保留上游 LICENSE、NOTICE 和模型卡，并遵守适用许可。第三方 GPU 二进制组件也适用各自条款。

上游许可核对日期：2026-09-30。这里只列出主要组件，不将 npm 元数据替代各库的完整许可文本；打包同时保留 `third-party-licenses/` 的前端许可文件。
