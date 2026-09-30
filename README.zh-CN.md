# Voxera

[English](README.md) | **简体中文**


界面首次使用默认英文，不跟随操作系统语言；手动切换中文后会记住选择。

[下载 v0.1.1](https://github.com/eoeac/voxera/releases/tag/v0.1.1) · [试听样例](docs/samples/README.md)

本地声音设计与角色音色管理工作台。通过文字描述生成声音，默认 4 个候选，支持 1–10 个；试听后可绑定正式音色，并用参考音频生成新台词。

当前版本 **0.1.1 Alpha**，主发布目标是 **Windows x64 便携版**。CPU 可运行；CUDA / MPS 按 Torch 的实际能力选择，未经真机验证的平台见 [验证记录](docs/implementation-2026-09-30.md)。音质、速度与音色一致性受模型、文本和设备影响。

## 使用便携版

完整解压发布包后双击 `Voxera.exe`。需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Runtime。首次在设置中下载 Qwen VoiceDesign 或 VoxCPM2；Qwen 音色复用另需 Base 权重。自动探测 ModelScope / Hugging Face / HF Mirror，失败尝试备用源。模型下载约 4.5–5 GB/个，建议为运行时、模型和下载缓存留出至少 25 GB；CPU 建议至少 16 GB RAM。

关闭窗口会请求正常退出；运行中的不可中断推理超时退出后，会在下次启动标记为失败。`stop.bat` 核对进程身份后停止空闲引擎，生成期间拒绝停止。先关闭应用再移动目录；备份 `data/`、`audio/`、`models/`。

Windows 算力包在独立目录准备，重启后加载；实际可用性以诊断为准。依赖原生 NVIDIA 驱动，无需修改全局 Python。初次安装/下载/网络诊断需要联网，下载完成后推理在本地；浏览器、系统和库仍可能产生其他缓存。

## 从源码运行

需要 Python **3.12**、Node.js **22+** 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。依赖以根 `pyproject.toml`、`uv.lock` 和 `app/package-lock.json` 为准。PowerShell：

```powershell
python tools/bootstrap.py
cd app
npm ci
npm run build
cd ..
.venv\Scripts\python.exe -m engine.server
```

打开 `http://127.0.0.1:28840`。`bootstrap.py` 只同步项目 `.venv`，根据网络选择清华/官方 PyPI，失败回退；通过锁文件导出含哈希的依赖进行安装。也可用 `uv sync --locked --extra inference --extra desktop --extra dev` 从官方源安装。Windows 原生窗口：`.venv\Scripts\python.exe -m engine.desktop`。

开发热更新时在另一个终端运行 `npm --prefix app run dev`，打开 `http://localhost:5173`。引擎仍须单独启动。Linux/macOS 可尝试源码的浏览器模式；本轮没有这些系统或 MPS 的实测证据，尚无对应发行包。

## 工作流程

1. 创建角色，填写声音描述和台词，选择模型及候选数。
2. 生成逐张显示进度；失败会保留错误信息。刷新后从数据库恢复并继续追踪运行中的任务。
3. 试听满意的候选并设为正式音色；勾选“复用正式音色”后生成新文本。Qwen 调用 Base 的参考音频克隆，VoxCPM2 使用参考音频模式。
4. 导出 WAV 或 ZIP，或删除候选/角色。删除同时清理对应音频，失败时保留数据库记录并恢复已移动文件。

多个批次在同一个引擎中串行执行；最多排队 10 个批次，单批仍可选 10 个候选。模型切换先卸载旧适配器。版本由本地权重清单生成，记录 Seed、设备、依赖版本、参数和耗时；相同 Seed 不保证跨设备逐样本一致。

## 架构与交付

- React **19** + TypeScript + Vite + TailwindCSS；原生 HTML 交互，目前没有 Radix 依赖。
- Windows 宿主：C# 启动器 → Python `engine.desktop` → pywebview / WebView2 + FastAPI。
- 引擎：Python 3.12 / FastAPI / SQLite / SQLAlchemy；端口仅监听本地回环。
- `src-tauri/`：实验窗口壳，尚未集成引擎守护、sidecar 和发行；不是当前便携包宿主。
- 数据位置：`VOXERA_HOME` 优先；便携/源码隔离环境默认项目目录，否则为 `~/.voxera`。详见 [架构](docs/architecture.md) 与 [ADR-004](docs/decisions/004-windows-portable-primary.md)。

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
npm --prefix app run lint
npm --prefix app run build
# 需准备完整 runtime，已有同版本发布包时拒绝覆盖
runtime\python.exe tools\package_release.py
```

发布包带实际依赖版本清单、逐文件 SHA-256、ZIP 校验和与第三方许可，排除用户数据和权重。CI 覆盖轻量引擎测试与前端 lint/build，真实模型推理单独验收。

[参与贡献](CONTRIBUTING.zh-CN.md) · [安全与隐私](SECURITY.zh-CN.md) · [更新记录](CHANGELOG.zh-CN.md) · [实现与验证](docs/implementation-2026-09-30.md)

自有代码使用 [MIT](LICENSE)，模型和第三方组件遵循各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.zh-CN.md)。
