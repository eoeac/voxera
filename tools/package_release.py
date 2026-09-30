"""Build and verify a clean Windows portable archive without overwriting releases."""
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import time
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    if os.name != "nt":
        raise RuntimeError("此打包入口用于 Windows x64")
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    name = f"Voxera-v{version}-Windows-x64-Portable"
    # Each build has its own checked workspace path; older staging and releases survive.
    stage_root = ROOT / "dist_staging" / str(time.time_ns())
    target = stage_root / name
    if not target.resolve().is_relative_to((ROOT / "dist_staging").resolve()):
        raise RuntimeError("Invalid staging path")
    release = ROOT / "dist_release"
    release.mkdir(exist_ok=True)
    destination = release / (name + ".zip")
    if destination.exists():
        raise RuntimeError("发布包已存在；请更新版本或先将原包另行保存")
    python = ROOT / "runtime/python.exe"
    required = [python, ROOT / "runtime/pythonw.exe", ROOT / "app/dist/index.html", ROOT / "LICENSE", ROOT / "uv.lock"]
    if any(not file.is_file() for file in required):
        raise RuntimeError("缺少运行时、构建资源、许可或锁文件，请先完成安装与构建")
    check = subprocess.run([str(python), "-c", "import fastapi,sqlalchemy,httpx,psutil,torch,torchaudio,qwen_tts,voxcpm,modelscope,webview; import platform; assert platform.python_version().startswith('3.12.'); assert platform.machine() in ('AMD64','x86_64')"], cwd=ROOT)
    check.check_returncode()
    target.mkdir(parents=True)
    compiler = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    subprocess.run([str(compiler), "/target:winexe", "/optimize", f"/win32icon:{ROOT / 'voxera.ico'}",
                    f"/out:{target / 'Voxera.exe'}", str(ROOT / "tools/launcher.cs")], check=True)
    for file in ["voxera.ico", "README_便携版使用说明.txt", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "pyproject.toml", "uv.lock", "start.bat", "stop.bat", "启动Voxera.bat", "停止Voxera.bat"]:
        shutil.copy2(ROOT / file, target / file)
    for file in [ROOT / "README_PORTABLE.txt", *ROOT.glob("*.zh-CN.md")]:
        shutil.copy2(file, target / file.name)
    (target / ".portable").touch()
    frontend_licenses = []
    license_root = target / "third-party-licenses/npm"
    license_root.mkdir(parents=True)
    for metadata_file in (ROOT / "app/node_modules").rglob("package.json"):
        try:
            package = json.loads(metadata_file.read_text(encoding="utf-8"))
            if not package.get("name") or not package.get("version"):
                continue
            label = re.sub(r"[^a-zA-Z0-9_.-]", "_", package["name"] + "-" + package["version"])
            notices = []
            for source in metadata_file.parent.iterdir():
                if source.is_file() and source.name.lower().startswith(("license", "licence", "notice", "copying")):
                    destination_license = license_root / label / source.name
                    destination_license.parent.mkdir(exist_ok=True)
                    shutil.copy2(source, destination_license)
                    notices.append(destination_license.relative_to(target).as_posix())
            frontend_licenses.append({"name": package["name"], "version": package["version"], "license": package.get("license"), "notices": notices})
        except (OSError, ValueError):
            continue
    (target / "frontend-licenses.json").write_text(json.dumps(frontend_licenses, indent=2), encoding="utf-8")
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo", "*.tmp", "*.whl", "*.pdb", "acceleration")
    shutil.copytree(ROOT / "runtime", target / "runtime", ignore=ignore)
    shutil.copytree(ROOT / "engine", target / "engine", ignore=ignore)
    shutil.copytree(ROOT / "app/dist", target / "app/dist")
    shutil.copytree(ROOT / "docs", target / "docs", ignore=ignore)
    (target / "tools").mkdir()
    shutil.copy2(ROOT / "tools/stop_engine.py", target / "tools/stop_engine.py")
    for folder in ["audio", "data", "models"]:
        (target / folder).mkdir()
    inventory = subprocess.check_output([str(python), "-c", "import importlib.metadata,json; print(json.dumps({d.metadata['Name']:d.version for d in importlib.metadata.distributions()},sort_keys=True,indent=2))"], text=True, cwd=ROOT)
    (target / "runtime-packages.json").write_text(inventory, encoding="utf-8")
    files = {file.relative_to(target).as_posix(): {"size": file.stat().st_size, "sha256": sha256(file)}
             for file in sorted(target.rglob("*")) if file.is_file()}
    (target / "release-manifest.json").write_text(json.dumps({"version": version, "files": files}, indent=2), encoding="utf-8")
    temporary = release / (name + ".building.zip")
    sevenzip = shutil.which("7z.exe")
    if sevenzip:
        subprocess.run([sevenzip, "a", "-tzip", "-mx=1", "-mmt=on", str(temporary), name], cwd=stage_root, check=True)
    else:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for file in target.rglob("*"):
                if file.is_file():
                    archive.write(file, arcname=str(file.relative_to(stage_root)))
    with zipfile.ZipFile(temporary) as archive:
        damaged = archive.testzip()
        if damaged:
            raise RuntimeError("压缩包 CRC 校验失败：" + damaged)
        members = archive.namelist()
        if any(part in {".planning", ".test-data", ".git"} for member in members for part in Path(member).parts):
            raise RuntimeError("发布包包含非发布内容")
        for folder in ["audio", "data", "models"]:
            if any(member.startswith(name + "/" + folder + "/") and not member.endswith("/") for member in members):
                raise RuntimeError("发布包意外包含用户数据")
    temporary.rename(destination)
    checksum = sha256(destination)
    destination.with_suffix(".zip.sha256").write_text(checksum + " *" + destination.name + "\n", encoding="utf-8")
    shutil.copy2(target / "Voxera.exe", ROOT / "Voxera.exe")
    print(json.dumps({"archive": str(destination), "staging": str(target), "sha256": checksum,
                      "size_bytes": destination.stat().st_size, "files": len(files)}, indent=2), flush=True)


if __name__ == "__main__":
    main()
