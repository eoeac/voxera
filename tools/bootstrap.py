"""Install the locked project into .venv, with automatic PyPI mirror fallback."""
import concurrent.futures
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
INDEXES = {"official": "https://pypi.org/simple", "tsinghua": "https://pypi.tuna.tsinghua.edu.cn/simple"}


def reachable(url):
    import time
    start = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=3) as response:
            return time.monotonic() - start if response.status < 400 else float("inf")
    except Exception:
        return float("inf")


def main():
    uv = ROOT / "runtime" / ("uv.exe" if os.name == "nt" else "uv")
    uv_command = str(uv) if uv.is_file() else shutil.which("uv")
    if not uv_command:
        raise RuntimeError("请先安装 uv：https://docs.astral.sh/uv/getting-started/installation/")
    # Reuse an existing isolated environment; never recreate it or touch global Python.
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    cache = ROOT / ".uv-cache"
    environment = os.environ.copy()
    environment["UV_CACHE_DIR"] = str(cache)
    environment["UV_PYTHON_INSTALL_DIR"] = str(ROOT / ".python")
    def run(args):
        return subprocess.run([uv_command, *args], cwd=ROOT, env=environment, check=True)
    if not python.is_file():
        run(["venv", "--python", "3.12", str(ROOT / ".venv")])
    requirements = ROOT / ".uv-cache" / "locked-requirements.txt"
    requirements.parent.mkdir(parents=True, exist_ok=True)
    run(["export", "--frozen", "--extra", "inference", "--extra", "desktop", "--extra", "dev",
         "--no-emit-project", "--output-file", str(requirements)])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        times = dict(zip(INDEXES, executor.map(reachable, INDEXES.values())))
    first = "official" if times["official"] < 0.6 else "tsinghua"
    for source in [first, "tsinghua" if first == "official" else "official"]:
        try:
            print("安装源：", INDEXES[source], flush=True)
            run(["pip", "sync", str(requirements), "--python", str(python), "--require-hashes", "--index-url", INDEXES[source]])
            run(["pip", "install", "--no-deps", "--editable", ".", "--python", str(python), "--index-url", INDEXES[source]])
            print("完成。请执行 app 的 npm ci 与 npm run build 后启动引擎。")
            return
        except subprocess.CalledProcessError:
            print("安装源失败，尝试备用源。", flush=True)
    raise RuntimeError("依赖安装失败，请检查上方日志与网络")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
