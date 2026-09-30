# Voxera 0.1.1 实施与验收记录

日期：2026-09-30。范围：当前本地源码与 Windows x64 便携交付。

本轮已落实 [项目评估](project-assessment-2026-09-30.md) 中可在当前环境完成的整改，并验证 CPU 的真实声音设计与正式音色复用。版本为 0.1.1 Alpha。原评估中的漏洞复现描述保留为历史证据，当前状态以本文为准。

## 整改对照

| 评估项 | 实施结果 | 核验 |
| --- | --- | --- |
| P0 静态目录越界 | 解析最终路径并检查目录边界；音频、导出和模型清单同样检查路径 | 编码路径越界与清单越界回归通过 |
| P0 本地高权限 API | 限制 Host / Origin / 跨站请求，使用每实例 HttpOnly、SameSite Strict 会话；解释器仅允许项目 runtime / .venv，安装变体使用白名单 | 无会话 401、不可信来源 403、拒绝任意可执行文件；打包运行也验证 |
| P1 设备检测脱离推理 | 统一选择实际可用 CPU / CUDA / MPS；适配器使用所选设备，切换模型卸载旧实例 | 设备选择分支测试通过，CPU 真实加载；CUDA/MPS 尚无真机证据 |
| P1 源码安装不可复现 | 根 pyproject 声明 API、推理、桌面、测试依赖；Python 3.12、uv.lock、npm 锁文件、隔离 bootstrap 入口 | 两个全新项目虚拟环境安装成功，完整环境完成真实生成 |
| P1 HTTP 错误和状态 | 统一检查 HTTP 响应，提供错误提示、重连；连接与模型就绪分开；失败请求保留草稿与资产 | 浏览器验证真实状态、成功流程；输入与接口失败回归通过 |
| P1 任务恢复与并发 | 单引擎全局串行，排队上限 10 批，单批 1–10 候选；SSE 心跳、终态恢复、有限历史；断线持续轮询，刷新恢复 | 串行不重叠、失败 SSE、丢失历史、中断恢复回归通过；真实生成期间刷新继续追踪 |
| P1 资产生命周期 | 删除文件先暂存，数据库事务失败回滚；启动恢复删除中断；校验正式音色属于角色且已完成；移动便携目录重绑定本地音频 | 删除/失败回滚/绑定/移动目录/运行任务阻止删除回归通过 |
| 角色声音复用 | 正式候选作为参考；Qwen VoiceDesign → Base 克隆，VoxCPM2 使用参考 WAV；保留参考候选关联 | 浏览器中 Qwen 设计、定型、Base 新台词、VoxCPM2 复用同一参考均成功 |
| P2 网络与隔离 | TLS 校验、探测超时、ModelScope/HF/HF Mirror 真实回退、分源缓存；PyPI 自动官方/清华回退；Windows 算力包隔离准备、重启激活 | 三套模型从 HF Mirror 固定 revision 获取；失败来源自动回退，所有模型通过 SHA-256 校验 |
| P2 模型与生成追溯 | HF 固定 revision、逐文件大小/SHA-256、内容版本；保存实际模型名称、Seed、设备、参数、库版本和耗时 | 同大小损坏检测通过；真实音频和清单见下文 |
| P2 桌面与发布 | C# 启动器持续读取 stderr；引擎实例身份、正常退出；停止脚本不按端口杀任意进程；打包排除用户数据、提供清单和校验和 | C# 编译及本机原生 WebView2 启动/关闭通过；打包 runtime 启动/停止通过，ZIP CRC 与文件清单核验通过 |
| P2 开源基础 | MIT LICENSE、第三方许可、SECURITY、CONTRIBUTING、CHANGELOG、CI、忽略规则、真实架构及 ADR | 文档入口补齐；CI 定义覆盖 Windows/Ubuntu 轻量测试及前端检查，尚未在远程运行 |
| 界面与键盘 | 弹窗 Hooks 顺序、dialog 语义、焦点捕获/循环/恢复、Esc、滚动锁；提高文字可读性、单播放器、英文卡片换行、尊重减弱动画 | 1280×720 中英与两主题验证；播放互斥、键盘、长名称/emoji、导出通过，截图留存 |

相关实现位于 engine/core/security.py、lifecycle.py、device.py、acceleration.py、network_probe.py，engine/server.py、desktop.py、models/，app/src/lib/api.ts、lib/useModal.ts、App.tsx、components/，tools/stop_engine.py、launcher.cs、package_release.py、bootstrap.py。架构决策见 [ADR-004](decisions/004-windows-portable-primary.md)。

访问控制的目标是阻止不可信网页和误调用；同一操作系统账号下的恶意程序仍有该账号权限。项目环境隔离不等于操作系统权限沙盒，系统/浏览器/库仍可能使用其他缓存。

## 自动与安装验证

| 检查 | 结果 |
| --- | --- |
| runtime：unittest discover -s tests -v | 30 项通过 |
| 全新轻量 clean-venv：相同测试 | 30 项通过，无需安装大模型推理依赖 |
| 全新完整 inference-venv：相同测试 | 30 项通过，并执行真实 CPU 生成 |
| npm run lint | 通过，max-warnings 0 |
| npm run build | TypeScript 与 Vite 通过；JS 345.95 kB / gzip 99.31 kB，CSS 38.10 kB / gzip 7.15 kB |
| Python compileall：engine / tools | 通过 |
| 新环境 uv sync --locked（dev / inference / desktop） | 成功；完整安装首轮因宿主临时目录权限失败，在获准的项目隔离环境重试后成功 |
| 三个权重清单 | 固定 HF revision、下载后校验；模型加载时校验完整 SHA-256 |
| 打包引擎首次运行 | 自带 runtime 启动空的独立 VOXERA_HOME，版本/实例/会话/来源/角色/模型/SPA 均通过；自身停止脚本正常退出并清理实例记录 |
| 打包原生窗口 | 从便携目录运行 Voxera.exe，确认 C# → runtime/pythonw.exe → WebView2 → 工作台；首次向导关闭成功，点击标题栏关闭后启动器、引擎与窗口退出，实例文件清理 |

构建存在 lucide-react 的非阻断 use client 指令提示；测试存在 Starlette 的 HTTPX 弃用提示。本轮检查均成功退出。CI 配置已提供，因本目录没有 .git，未执行远程 CI、提交或推送。

bootstrap 包装入口未对用户已有 .venv 重装；干净安装使用独立环境的锁文件同步。验证发生在同一台电脑的新虚拟环境，不等同于一台全新 Windows 机器的验收。

## CPU 测量与样例

设备：Windows 10.0.26200 x64；Intel Core i7-13700，24 个逻辑处理器，约 95.7 GiB RAM；本次诊断无可用 CUDA/MPS。适配器最多使用 8 个 Torch CPU 线程。推理环境使用 Torch 2.14.0+cpu、TorchAudio 2.11.0+cpu、qwen-tts 0.1.1、voxcpm 2.0.3；其余版本保存在 JSON 和发布包 runtime-packages.json。

提示词为“温柔、清晰的年轻女声。”。设计台词为“你好，欢迎使用声音工作台。”；复用台词为“这是复用正式音色的新文本。”。每次仅生成 1 个候选；默认 4 候选和最高 10 候选在接口与界面保持，不因 CPU 缩减。

下表为适配器样例的单次记录。elapsed 包括按需模型加载/完整性检查、推理和保存；不包括下载与排队。VoxCPM2 复用在已加载实例上完成；其他项首次加载对应权重。RTF = elapsed / 音频时长。这不是多轮平均或纯推理吞吐，也不能用于推算 GPU 速度。

| 模式 | 音频时长 | 耗时 | RTF | 试听 |
| --- | ---: | ---: | ---: | --- |
| Qwen VoiceDesign | 2.56 s | 34.487 s | 13.471 | [WAV](samples/qwen3_tts_voicedesign.wav) |
| Qwen Base 参考音色 | 2.56 s | 30.889 s | 12.066 | [WAV](samples/qwen3_tts_base.wav) |
| VoxCPM2 设计 | 2.40 s | 80.297 s | 33.457 | [WAV](samples/voxcpm2_2b.wav) |
| VoxCPM2 参考音色 | 2.72 s | 69.403 s | 25.516 | [WAV](samples/voxcpm2_clone.wav) |

详细记录：[CPU 样例参数](samples/cpu-benchmark.json)。Qwen Base 样例在修复展示名称前生成，记录的模型名称已根据实际 Base 权重清单修正，音频未改动。

另一次完整 UI 流程在新推理环境中记录：VoiceDesign 37.610 s / 2.56 s；定型后 Base 新台词 27.110 s / 2.24 s；切换 VoxCPM2、复用同一参考 49.407 s / 3.20 s。两个克隆批次均关联第一个正式候选，见 [UI 流程元数据](samples/cpu-ui-workflow.json)。同时验证 ZIP 导出和最多一个 audio 元素播放。

这些结果证明真实音频输出与参考流程已接通。本轮没有开展多人盲听、说话人相似度或跨语言一致性测评，因此不承诺所有文本都保持相同音色，也不作客观音质排名。

权重来源、revision、内容摘要与逐文件哈希：[Qwen VoiceDesign](samples/qwen3_tts_voicedesign-manifest.json)、[Qwen Base](samples/qwen3_tts_base-manifest.json)、[VoxCPM2](samples/voxcpm2_2b-manifest.json)。本次新下载的已验证权重保存在项目 models/，未覆盖任何已有权重；发行 ZIP 不包含模型。

## 界面证据

- [深色中文主界面](screenshots/ui-dark.png)
- [浅色英文主界面](screenshots/ui-light-en.png)
- [模型与网络设置](screenshots/ui-models.png)

1280×720 下无页面水平溢出，长角色名称正常截断，英文“设为正式音色”在卡片内换行。弹窗打开聚焦关闭按钮，Shift+Tab 循环至完成，Esc 关闭并恢复触发按钮焦点。CPU 标识来自真实运行模式，Qwen 显存标注“未实测”，VoxCPM2 8 GB 仅为上游参考。

本轮未进行读屏器或 WCAG 正式审计；浏览器工具未提供调整视口能力，960×640 最小窗口未视觉验证。

## 交付和边界

发行文件：dist_release/Voxera-v0.1.1-Windows-x64-Portable.zip，配套 .zip.sha256。包内有 MIT/第三方许可、实际运行依赖清单、逐文件 release-manifest.json、使用说明、本文、截图和试听样例。ZIP 检查 CRC、文档入口及源码/资源清单，audio/data/models 保持空目录，不包含用户资料、测试目录或下载缓存；原 0.1.0 包保留。

本轮实际验证了 Windows x64 自带运行时和引擎、浏览器 UI，以及本机 C# 启动器→原生 WebView2→工作台→关闭窗口的链路。原生窗口首次定位超时，刷新后成功找到目标并完成验证；启动器与 pythonw.exe 均退出、实例文件清理。原生测试使用本轮独有的打包暂存目录，未读取用户数据库。尚未在全新 Windows 机器上完成双击、下载与首次生成验收。安装 NVIDIA 算力包、真实 CUDA/MPS 推理、不同驱动、Linux/macOS、Tauri 完整构建/发行需要相应环境。Tauri 仅保留实验壳并禁用 bundle，已纠正文档，不将其列为已交付宿主。

以上缺口是验收范围，不是已通过结论。继续扩大公开分发前，应完成目标 Windows 真机的“解压→双击→下载→首次生成→关闭→移动目录再打开”，并在至少一个 CUDA 设备上记录相同文本的结果。无需为当前主链路增加更多模型或跨平台抽象。

## 双语公开发布补充

用户随后配置仓库 https://github.com/eoeac/voxera 并授权发布。英文 README.md 为项目首页，README.zh-CN.md 提供中文入口；贡献、安全、第三方和更新记录均提供双语。首次界面、向导、启动提示默认英文，不随系统语言切换；手动选择中文后保留偏好。三个语言切换入口统一处理默认提示词，保留用户自定义输入。

本轮双语构建通过 lint / TypeScript / Vite；JS 345.81 kB / gzip 99.40 kB，CSS 38.10 kB / gzip 7.15 kB。30 项引擎测试通过。修正 Git 忽略规则的目录范围，防止引擎模型源码被误排除；保留远程最初的许可提交与 eoeac 署名。此前关于目录无 .git、未提交/未执行远程 CI 的描述属于初次评估阶段，发布阶段结果另行记录。

## 上游依据

- [Qwen3-TTS 官方实现与复用流程](https://github.com/QwenLM/Qwen3-TTS)
- [VoxCPM2 官方模型卡与参考配置](https://huggingface.co/openbmb/VoxCPM2)
- [PyTorch 官方历史安装配对](https://pytorch.org/get-started/previous-versions/)
- [TorchAudio 官方安装与 ABI 说明](https://docs.pytorch.org/audio/main/installation.html)
- 模型与项目许可见 [第三方说明](../THIRD_PARTY_NOTICES.md)；运行库随包提供原许可。
