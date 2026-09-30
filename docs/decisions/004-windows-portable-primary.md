# ADR-004：以现有 Windows 便携宿主为主发布链路

状态：已采纳，2026-09-30；替代 ADR-001 对当前已交付架构的描述。

现有可执行入口实际是 C# → Python `engine.desktop` → pywebview / WebView2，并在同进程后台运行 FastAPI。Tauri 目录只有窗口壳，没有 sidecar、环境引导和服务生命周期实现；React 依赖实际为 19，也没有 Radix。不能将预期技术栈描述成已交付能力。

0.1.x 优先维护 Windows x64 便携链路；开发使用项目 `.venv`，发行使用 `runtime`。浏览器从同源 FastAPI 静态资源读取 UI，避免默认跨站 Cookie 问题。Tauri 保留实验目录并禁用发行 bundle；新增 build.rs 和 CSP 仅补齐基础配置，不代表集成完毕。

单引擎全局串行排队保障全局随机状态与模型资源；多模型切换先卸载旧适配器。CPU 可运行但不承诺实时。CUDA/MPS 基于 Torch 的实际可用性自动选择，真机覆盖单独记录。Windows GPU 包先下载到隔离目录，重启前不改已加载 DLL。

后续跨平台宿主迁移需独立完成引擎打包、同源通信、安全授权、生命周期和首次生成验收，再更新发布范围。
