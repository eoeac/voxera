from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# The canonical scripts contain identity checks; aliases must never restore port killing.
if __name__ == "__main__":
    for source, alias in [("start.bat", "启动Voxera.bat"), ("stop.bat", "停止Voxera.bat")]:
        content = (ROOT / source).read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        (ROOT / alias).write_bytes(content)
