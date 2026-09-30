# CPU audio samples and parameter records

English / 简体中文

These are actual CPU outputs from 2026-09-30. See the [validation notes (中文)](../implementation-2026-09-30.md) for the environment and method. Each mode was run once; no objective quality or speaker similarity score is claimed.

- qwen3_tts_voicedesign.wav: voice design from a text description.
- qwen3_tts_base.wav: Qwen Base generation using the VoiceDesign sample as a reference.
- voxcpm2_2b.wav: voice design from a text description.
- voxcpm2_clone.wav: new dialogue using the preceding VoxCPM2 sample as a reference.

cpu-benchmark.json contains sample parameters and elapsed time. cpu-ui-workflow.json captures three separate UI jobs. Model manifests contain source, revision, and SHA-256 hashes; weights are not distributed here. CPU elapsed time includes model loading when needed and does not estimate GPU performance.

## 简体中文

本目录为 2026-09-30 的真实生成样例，方法与环境见 [实施报告](../implementation-2026-09-30.md)。每种模式仅一次，未做音质或说话人相似度评分。

- qwen3_tts_voicedesign.wav：文字描述设计。
- qwen3_tts_base.wav：用前一项作为参考的 Qwen Base 克隆。
- voxcpm2_2b.wav：文字描述设计。
- voxcpm2_clone.wav：用前一项作为参考，生成新台词。

cpu-benchmark.json 保存样例参数与耗时；cpu-ui-workflow.json 保存独立浏览器验收的三个批次元数据。*-manifest.json 保存下载来源、revision 和资源 SHA-256；权重不随本目录发行。CPU 耗时包含按需加载，不能作为 GPU 性能估计。
