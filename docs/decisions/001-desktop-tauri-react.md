# ADR-001: 桌面宿主与 UI 技术选型

## 状态
历史意向；当前发布链路由 [ADR-004](004-windows-portable-primary.md) 取代（2026-09-30）

## 背景
需要开发一款跨平台一致、拥有像 Apple 那样高级感的纯桌面声音生成应用。

## 决策
采用 **Tauri 2.0 (Rust) + React 18 + Tailwind CSS + Radix UI**。

## 理由
1. **轻量低开销**：Tauri 仅占用 ~50MB 内存，安装包体积仅 10~20MB，将内存最大化留给 Python 模型推理引擎；
2. **Apple 原生质感**：原生支持操作系统级毛玻璃（Vibrancy/Acrylic）与无边框阴影；
3. **Radix UI 原语**：提供极致的无障碍和交互基础，与 TailwindCSS 完美契合；
4. **开发敏捷**：前端保持纯净的 Web 体系，支持 Vite 秒级热重载调试。
