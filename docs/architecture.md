# Voxera 架构

## 当前发布链路

0.1.1 的主目标为 Windows x64 便携版：`Voxera.exe`（C#）启动 `runtime/pythonw.exe -m engine.desktop`；pywebview 使用 WebView2 显示窗口；后台线程运行同一个 FastAPI 应用，在 `127.0.0.1:28840` 同源提供前端和接口。C# 持续读取错误输出，保留有界诊断日志。窗口关闭请求 uvicorn 正常退出，30 秒超时则结束进程并由下一次启动恢复任务状态。

开发环境用 uv 管理 `.venv`。React 19、TypeScript、Vite、TailwindCSS 与 Lucide 构成界面，当前没有 Radix。`src-tauri/` 仅实验窗口壳，基础 CSP 和 build.rs 已补齐，尚无引擎集成且禁用 bundle。参见 ADR-004；ADR-001 是历史技术意向。

## 本地数据与访问边界

`VOXERA_HOME` 优先；检测到便携标记、runtime 或 .venv 时默认项目目录，否则 `~/.voxera`。数据库 `data/voxera.db`，音频 `audio/`，权重与下载缓存 `models/`。WebView/系统缓存可能在其他位置。迁移数据库采用增量加列，移动目录后重新绑定已存在的本地音频文件名。

API 和音频通过每次进程新建的 HttpOnly SameSite Cookie 访问；请求检查 Host、Origin 与跨站标记。开发来源限定在明确的本地端口。文件解析后验证仍在允许目录内；解释器检测只接受项目隔离解释器。停止脚本同时验证进程身份和活跃实例，不按端口杀进程。

## 任务与模型

生成前验证角色、文本、候选数、模型与参考音频。批次和候选先入库，最多排队 10 个批次；全局 asyncio 锁保证批次串行，加载模型与推理在工作线程执行。模型实例由适配器拥有，切换前卸载，设备依据 Torch 可用性选择 CPU/CUDA/MPS，`VOXERA_DEVICE` 可显式指定。

Qwen VoiceDesign 用文字指令；音色复用调用独立 Base 权重的 `generate_voice_clone`。VoxCPM2 用括号前缀描述音色，复用调用 `reference_wav_path`。Seed、真实采样率、耗时、推理设备、参数、包版本与权重摘要保存至候选记录。

SSE 每个订阅者独立队列、15 秒心跳；最近 100 个批次保留回放，数据库补齐 completed/partial/failed 终态。UI 持续轮询作为兜底，刷新恢复未完成批次。重启时将中断候选标为 failed，已完成候选保留，批次记为 partial 或 failed。

删除音频先改名暂存，再提交数据库；提交失败恢复文件，成功清除暂存，启动补处理未完成清理。生成期间拒绝修改依赖的角色/资产。ZIP 通过 8 MiB 阈值临时文件和分块输出控制内存。

## 模型、依赖与算力安装

自动网络探测决定优先源，TLS 正常校验，下载失败依次回退。每个来源独立暂存，HF 使用固定提交；ModelScope master 由落地文件 SHA-256 清单标识。校验成功后启用目录；原有不完整目录另行保留。加载前验证清单哈希，旧文字 .ready 兼容但显示 unverified-local。

源码安装由锁文件导出含哈希的依赖，再选择清华/官方源同步隔离环境。Windows 算力切换安装到 runtime 或 .venv 的 acceleration 目录，成功后写激活配置，下次引擎导入前添加该目录。运行中的 Torch DLL 不被覆盖；准备完成不代表当前进程 CUDA 可用。

## 验证边界

默认 CI 不下载多 GB 权重，以受控模型验证接口、状态与资产事务，另做前端 lint/build。真实模型样例、CPU 耗时、发布包及浏览器验证见实现报告。CUDA、MPS、Tauri 与跨平台发布不能从 CPU 测试推断已通过。
