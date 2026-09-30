# 参与贡献

[English](CONTRIBUTING.md) | **简体中文**

先阅读 [README](README.zh-CN.md)、[架构](docs/architecture.md) 和 [AGENTS.md](AGENTS.md)。主发布目标是 Windows x64 便携版；`src-tauri/` 是实验目录。

## 开发与检查

Python 3.12、Node.js 22+、uv。运行 `python tools/bootstrap.py` 安装到项目 `.venv`，再在 `app/` 执行 `npm ci`。

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
cd app
npm run lint
npm run build
```

测试会自动创建独立 `.test-data/`，不使用用户的数据库或音频。真实推理需要额外下载权重，不属于默认 CI。新增回归测试应覆盖具体故障或业务约束，避免只重复实现。

## 提交变更

在 issue 或 PR 中写清楚可复现步骤、期望与实际结果、平台和验证方式。界面变更附暗色/亮色截图，检查 960×640 最小窗口、长名称、键盘和中英文。模型变更附设备、权重清单、依赖版本、耗时及样例。

遵循 KISS，保留已有数据，不安装依赖到全局 Python，不移除 1–10 个候选选项。安全相关变更遵循 [SECURITY.md](SECURITY.zh-CN.md)。提交格式：`<emoji> <type>: <简洁中文描述>`。锁文件应与依赖声明一起更新；不要提交 runtime、权重、用户音频、数据库、打包产物和缓存。
