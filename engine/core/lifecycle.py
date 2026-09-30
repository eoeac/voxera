"""Identify only this project's engine process, never a port's arbitrary owner."""
import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import psutil

from engine.core.config import settings

INSTANCE_ID = secrets.token_hex(16)
PID_FILE = settings.data_dir / "engine-process.json"


def matches_process(record: dict) -> bool:
    try:
        process = psutil.Process(record["pid"])
        command = process.cmdline()
        return (
            abs(process.create_time() - record["created_at"]) < 0.01
            and Path(process.exe()).resolve() == Path(record["executable"]).resolve()
            and any(value in {"engine.server", "engine.desktop"} for value in command)
            and Path(process.cwd()).resolve() == Path(record["project_root"]).resolve()
        )
    except (psutil.Error, KeyError, TypeError, OSError, ValueError):
        return False


@asynccontextmanager
async def lifespan(app):
    process = psutil.Process()
    record = {
        "pid": os.getpid(), "created_at": process.create_time(),
        "executable": process.exe(), "project_root": str(Path(__file__).resolve().parents[2]),
        "instance_id": INSTANCE_ID,
    }
    if PID_FILE.exists():
        try:
            previous = json.loads(PID_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            previous = {}
        if matches_process(previous):
            raise RuntimeError("此数据目录的引擎已经运行，请先关闭已有实例")
    temporary = PID_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(record, indent=2), encoding="utf-8")
    temporary.replace(PID_FILE)
    try:
        yield
    finally:
        try:
            current = json.loads(PID_FILE.read_text(encoding="utf-8"))
            if current.get("instance_id") == INSTANCE_ID:
                PID_FILE.unlink()
        except (OSError, ValueError):
            pass
