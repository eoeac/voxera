from abc import ABC, abstractmethod
from typing import Optional, Callable, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field

class GenerationResult(BaseModel):
    audio_path: str
    duration_seconds: float
    waveform_data: list[float]
    model_name: str
    model_version: str
    seed: int
    elapsed_ms: int
    metadata: dict = Field(default_factory=dict)

class VoiceDesignModelBase(ABC):
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.is_loaded = False

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        pass

    @property
    @abstractmethod
    def vram_requirement_gb(self) -> Optional[float]:
        pass

    @abstractmethod
    def is_downloaded(self) -> bool:
        pass

    @abstractmethod
    async def download(self, source: str = "auto", progress_callback: Optional[Callable[[float, str], None]] = None) -> bool:
        pass

    @abstractmethod
    def load(self, device: str = "auto") -> None:
        pass

    @abstractmethod
    async def generate_single(
        self,
        prompt: str,
        text: str,
        seed: int,
        output_path: Path,
        reference_audio: Optional[str] = None,
        reference_text: Optional[str] = None
    ) -> GenerationResult:
        pass

    def unload(self):
        self.is_loaded = False


def save_generation(audio, sr, output_path, start, model_name, version, seed, device, mode, parameters):
    import time
    import importlib.metadata
    import numpy as np
    import soundfile as sf
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    audio = np.asarray(audio).squeeze()
    if audio.ndim != 1 or audio.size == 0 or not np.isfinite(audio).all() or sr <= 0:
        raise RuntimeError("模型返回了无效音频，请重试或检查模型文件")
    target = output_path.with_suffix(".wav")
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(target), audio, sr)
    peaks = [float(np.max(np.abs(chunk))) if len(chunk) else 0.0
             for chunk in np.array_split(audio, 48)]
    maximum = max(peaks) or 1.0
    versions = {}
    for package in ("torch", "qwen-tts", "voxcpm", "numpy", "soundfile"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            pass
    return GenerationResult(audio_path=str(target), duration_seconds=round(len(audio) / sr, 3),
                            waveform_data=[round(p / maximum, 3) for p in peaks],
                            model_name=model_name, model_version=version, seed=seed,
                            elapsed_ms=int((time.perf_counter() - start) * 1000),
                            metadata={"device": device, "mode": mode, "sample_rate": sr,
                                      "packages": versions, "parameters": parameters})
