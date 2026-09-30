"""Request graceful shutdown only after matching the saved process and live instance."""
import http.cookiejar
import json
import os
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("VOXERA_HOME", str(ROOT))
from engine.core.config import settings
from engine.core.lifecycle import PID_FILE, matches_process


def main():
    if not PID_FILE.exists():
        print("Voxera 引擎未运行。")
        return
    record = json.loads(PID_FILE.read_text(encoding="utf-8"))
    if Path(record.get("project_root", "")).resolve() != ROOT:
        raise RuntimeError("进程来自其他项目目录，拒绝停止")
    if not matches_process(record):
        raise RuntimeError("进程身份不匹配，拒绝停止；可删除失效的 engine-process.json 后重启")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    url = f"http://127.0.0.1:{settings.port}"
    with opener.open(url + "/api/health", timeout=3) as response:
        health = json.load(response)
    if health.get("instance_id") != record["instance_id"]:
        raise RuntimeError("端口服务不属于记录的引擎，拒绝停止")
    opener.open(url + "/api/session", timeout=3).close()
    opener.open(urllib.request.Request(url + "/api/system/shutdown", data=b"", method="POST"), timeout=3).close()
    print("已请求 Voxera 正常关闭。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
