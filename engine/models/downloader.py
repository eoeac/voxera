import os
import asyncio
import time
import json
import hashlib
from pathlib import Path
from typing import Optional, Callable, Dict, Any
from pydantic import BaseModel

class DownloadProgress(BaseModel):
    model_id: str
    downloaded_bytes: int
    total_bytes: int
    percentage: float
    speed_kbps: float
    status: str  # "idle" | "downloading" | "completed" | "failed"
    error: Optional[str] = None

# 模型元数据定义（体积、默认源仓库 ID、推荐精度）
SUPPORTED_MODELS: Dict[str, Dict[str, Any]] = {
    "qwen3_tts_voicedesign": {
        "id": "qwen3_tts_voicedesign",
        "name": "Qwen3-TTS 1.7B VoiceDesign",
        "version": "v1.0",
        "size_bytes": 4_500_000_000,  # 约 4.5 GB
        "size_display": "4.5 GB",
        "vram_gb": None,
        "is_default": True,
        "is_available": True,
        "modelscope_id": "qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "hf_id": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "description": "基于自然语言精准描述音色、性格与语气特征的声音设计大模型。"
    },
    "voxcpm2_2b": {
        "id": "voxcpm2_2b",
        "name": "VoxCPM2 2B",
        "version": "v1.0",
        "size_bytes": 4_950_000_000,  # 约 4.95 GB
        "size_display": "4.9 GB",
        "vram_gb": 8.0,
        "is_default": False,
        "is_available": True,  # 现已全面开放支持与切换
        "modelscope_id": "openbmb/VoxCPM2",
        "hf_id": "openbmb/VoxCPM2",
        "description": "基于连续声学表征生成与自回归的高表现力端到端声音大模型。"
    }
}
SUPPORTED_MODELS["qwen3_tts_base"] = {
    "id": "qwen3_tts_base", "name": "Qwen3-TTS 1.7B Base",
    "version": "local-manifest", "size_bytes": 4_500_000_000, "size_display": "4.5 GB",
    "vram_gb": None, "is_default": False, "is_available": True, "is_auxiliary": True,
    "modelscope_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "hf_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    "description": "复用 Qwen 正式音色时使用的参考音频克隆模型。"
}
for key, revision in {
    "qwen3_tts_voicedesign": "5ecdb67327fd37bb2e042aab12ff7391903235d3",
    "qwen3_tts_base": "fd4b254389122332181a7c3db7f27e918eec64e3",
    "voxcpm2_2b": "32279effe8c19989596f05d353d1447f51d9e915",
}.items():
    SUPPORTED_MODELS[key]["hf_revision"] = revision

def weight_files(path: Path):
    return [p for p in path.rglob("*") if p.is_file() and p.suffix in {".safetensors", ".bin", ".pt", ".pth"}
            and not any(part.startswith(".") for part in p.relative_to(path).parts)]

def model_ready(path: Path, verify_hashes: bool = False) -> bool:
    if not (path / ".ready").is_file() or not (path / "config.json").is_file():
        return False
    weights = weight_files(path)
    if not weights or any(p.stat().st_size == 0 for p in weights):
        return False
    try:
        manifest = json.loads((path / ".ready").read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return True  # Existing installations remain usable, marked as unverified-local.
    try:
        entries = manifest["files"]
        if not entries:
            return False
        for name, entry in entries.items():
            file = (path / name).resolve()
            if not file.is_relative_to(path.resolve()) or not file.is_file() or file.stat().st_size != entry["size"]:
                return False
            if verify_hashes:
                digest = hashlib.sha256()
                with file.open("rb") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != entry["sha256"]:
                    return False
        return True
    except (AttributeError, TypeError, KeyError, OSError):
        return False

def model_version(path: Path) -> str:
    try:
        manifest = json.loads((path / ".ready").read_text(encoding="utf-8"))
        return "sha256:" + manifest["digest"][:16]
    except (ValueError, OSError, KeyError, TypeError):
        return "unverified-local"

def write_manifest(path: Path, model_key: str, source: str, revision: str):
    if not (path / "config.json").is_file() or not weight_files(path):
        raise RuntimeError("下载文件缺少模型配置或权重，请重试")
    entries = {}
    for file in sorted(path.rglob("*")):
        if not file.is_file() or any(part.startswith(".") for part in file.relative_to(path).parts):
            continue
        if file.suffix not in {".safetensors", ".bin", ".pt", ".pth", ".json", ".txt", ".model", ".tiktoken"}:
            continue
        digest = hashlib.sha256()
        with file.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        entries[file.relative_to(path).as_posix()] = {"size": file.stat().st_size, "sha256": digest.hexdigest()}
    content_digest = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()
    temporary = path / ".ready.tmp"
    temporary.write_text(json.dumps({"model": model_key, "source": source, "revision": revision,
                                    "digest": content_digest, "files": entries}, indent=2), encoding="utf-8")
    temporary.replace(path / ".ready")

# 全局下载进度跟踪字典
download_states: Dict[str, DownloadProgress] = {}

def _calculate_dir_size(path: Path) -> int:
    """计算指定目录内所有文件的总字节数"""
    total = 0
    if not path.exists():
        return 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total

class ModelDownloader:
    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def is_model_downloaded(self, model_key: str) -> bool:
        """检查模型目录和权重标记文件是否存在"""
        return model_key in SUPPORTED_MODELS and model_ready(self.models_dir / model_key)

    def get_progress(self, model_key: str) -> DownloadProgress:
        if model_key in download_states:
            return download_states[model_key]
        is_ready = self.is_model_downloaded(model_key)
        meta = SUPPORTED_MODELS.get(model_key, {})
        total = meta.get("size_bytes", 0)
        return DownloadProgress(
            model_id=model_key,
            downloaded_bytes=total if is_ready else 0,
            total_bytes=total,
            percentage=100.0 if is_ready else 0.0,
            speed_kbps=0.0,
            status="completed" if is_ready else "idle"
        )

    async def start_download(self, model_key: str, source: str = "auto"):
        """后台通过 ModelScope 执行真实模型权重拉取，并实时计算实际下载进度"""
        if model_key not in SUPPORTED_MODELS:
            raise ValueError(f"Unknown model key: {model_key}")
        if source not in {"auto", "modelscope", "huggingface", "hf-mirror"}:
            raise ValueError("Unsupported download source")
        if self.get_progress(model_key).status == "downloading":
            return
        if self.is_model_downloaded(model_key):
            return

        meta = SUPPORTED_MODELS[model_key]
        target_dir = self.models_dir / model_key
        staging_root = self.models_dir / ".downloads" / model_key
        staging_root.mkdir(parents=True, exist_ok=True)

        total_bytes = meta["size_bytes"]
        state = DownloadProgress(
            model_id=model_key,
            downloaded_bytes=0,
            total_bytes=total_bytes,
            percentage=0.0,
            speed_kbps=0.0,
            status="downloading"
        )
        download_states[model_key] = state
        active_stage = {"path": staging_root}
        from engine.core.network_probe import probe_network_environment
        if source == "auto":
            source = (await probe_network_environment()).selected_model_source

        import concurrent.futures

        def _do_snapshot_download():
            errors = []
            sources = [source] + [s for s in ("modelscope", "hf-mirror", "huggingface") if s != source]
            for selected in sources:
                try:
                    stage = staging_root / selected
                    stage.mkdir(parents=True, exist_ok=True)
                    active_stage["path"] = stage
                    revision = "master"
                    if selected in {"huggingface", "hf-mirror"}:
                        from huggingface_hub import snapshot_download
                        endpoint = "https://hf-mirror.com" if selected == "hf-mirror" else "https://huggingface.co"
                        revision = meta["hf_revision"]
                        snapshot_download(repo_id=meta["hf_id"], revision=revision,
                                          local_dir=str(stage), endpoint=endpoint, max_workers=4)
                    else:
                        from modelscope.hub.snapshot_download import snapshot_download
                        snapshot_download(model_id=meta["modelscope_id"], revision=revision,
                                          local_dir=str(stage), cache_dir=str(staging_root / ".cache"))
                    state.percentage = 99.0
                    write_manifest(stage, model_key, selected, revision)
                    if not model_ready(stage, verify_hashes=True):
                        raise RuntimeError("模型文件校验失败")
                    if target_dir.exists():
                        target_dir.rename(self.models_dir / f".{model_key}.backup-{time.time_ns()}")
                    stage.rename(target_dir)
                    return
                except Exception as exc:
                    errors.append(f"{selected}: {exc}")
            raise RuntimeError("所有下载源均失败：" + "; ".join(errors))

        loop = asyncio.get_running_loop()
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = loop.run_in_executor(executor, _do_snapshot_download)

        start_time = time.perf_counter()
        last_bytes = 0
        last_check_t = start_time

        try:
            while not future.done():
                await asyncio.sleep(0.5)
                current_bytes = _calculate_dir_size(active_stage["path"])
                now = time.perf_counter()
                time_delta = max(0.001, now - last_check_t)
                speed = max(0.0, (current_bytes - last_bytes) / 1024 / time_delta)
                last_bytes = current_bytes
                last_check_t = now

                pct = min(99.0, round((current_bytes / total_bytes) * 100, 1))
                state.downloaded_bytes = current_bytes
                state.percentage = pct
                state.speed_kbps = round(speed, 1)

            # 等待下载线程返回并抛出潜在异常
            await future

            # 校验权重落盘
            final_bytes = _calculate_dir_size(target_dir)
            state.status = "completed"
            state.downloaded_bytes = final_bytes
            state.percentage = 100.0
            state.speed_kbps = 0.0
        except Exception as e:
            state.status = "failed"
            state.error = str(e)
            print(f"[ModelDownloader] Download {model_key} failed: {e}")
        finally:
            executor.shutdown(wait=False)
