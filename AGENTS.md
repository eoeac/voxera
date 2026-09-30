# AGENTS.md

> AI Pair Programming Guidelines & Project Map for Voxera.

## Overview
Voxera is an open-source desktop studio for voice design (Prompt-to-Voice) and character audio management with an Apple-grade minimalist aesthetic.

## Architecture Map
- `app/`: Desktop Frontend (React 19 + TypeScript + Vite + TailwindCSS).
- `src-tauri/`: Experimental Tauri window shell; not the current release host.
- `engine/desktop.py`, `tools/launcher.cs`: Windows portable host (pywebview / WebView2 + C# launcher).
- `engine/`: Local Voice & Diagnostics Engine (Python 3.12 / FastAPI / SQLite / uv).
- `docs/`: Durable project knowledge and specifications.
- `.planning/`: Ephemeral local working memory (Git-ignored).

## Non-Negotiable Rules
1. **Design Quality**: Apple-like dark glassmorphism, refined typography, zero-clutter interface.
2. **Sampling Rule**: Default candidate count is 4 for side-by-side audition, with user customization supported up to 10 candidates. Never cut UI options due to hardware limits; use streaming progress skeletons instead.
3. **Environment Safety**: Never install packages to the host global Python. Use the isolated `.venv` managed by `uv` while passing through native GPU driver acceleration (`nvcuda.dll` / Metal).
4. **Network Adaptation**: China users must automatically route to ModelScope & Tsinghua PyPI mirrors without requiring manual proxy setup.
5. **Durable Knowledge**: When reaching architectural conclusions, update `docs/` rather than relying on ephemeral chat context.
6. **Brand Typography**: Use `VOXERA` (uppercase with wide tracking) for visual logo wordmarks; use `Voxera` (capitalized) for product name, documentation, and body copy.

## Common Workflows
```bash
# 1. Start Python engine (port 28840)
.venv\Scripts\python.exe -m engine.server

# 2. Frontend development server
cd app && npm run dev

# 3. Type check & production build
cd app && npm run build
```
