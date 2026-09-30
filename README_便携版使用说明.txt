Voxera 0.1.1 Alpha — Windows x64 Portable

English (default) / 简体中文

1. Extract the full archive and launch Voxera.exe. Windows 10/11 x64 and WebView2 Runtime are required.
2. Download a model in setup/settings. Qwen voice reuse also requires the Base model.
3. Create a character, describe the voice and dialogue, then compare candidates. Default: 4; supported: 1–10.
4. Pin a voice and enable reference reuse for new dialogue. Export WAV or ZIP.
5. Close the window to exit. stop.bat checks process identity and refuses during generation/downloads.

English is the first-run default. Switch to 简体中文 in the header or settings; the choice is remembered.
Keep data/, audio/, and models/ together; close the app before moving/backing up the folder.
CPU works but can be slow. Windows acceleration package changes need a restart; diagnostics show actual availability.
Initial downloads and network diagnostics need connectivity. Inference is local after downloads; OS/WebView/library caches may exist elsewhere.
No global Python installation is needed. Do not expose the engine publicly. Weights and personal audio are excluded from this archive.
See README.md, README.zh-CN.md, SECURITY.md, and THIRD_PARTY_NOTICES.md. Verify the archive .sha256 and release-manifest.json.

简体中文

1. 完整解压后双击 Voxera.exe，需要 Windows 10/11 x64 与 WebView2 Runtime。
2. 首次设置下载模型；Qwen 音色复用另需 Base 权重。模型源按网络自动选择并回退。
3. 创建角色、填写声音描述和台词；默认四候选，支持 1–10 个。
4. 设定正式音色，勾选复用后生成新台词；支持 WAV / ZIP 导出。
5. 关闭窗口退出；stop.bat 验证进程身份，生成和下载期间拒绝停止。

首次使用默认英文，可通过顶栏或设置切换中文并记住偏好。移动/备份前关闭应用，保留 data/、audio/、models/。
CPU 可以运行但较慢；算力包安装后需重启，以实际诊断为准。首次下载需联网，之后推理在本地。
WebView、系统和第三方库可能另有缓存；不向全局 Python 安装包；请勿将引擎暴露到公网。
中文完整说明见 README.zh-CN.md，许可与安全见对应 .zh-CN.md 文档。发布包不含模型权重或个人音频。
