import asyncio
from pathlib import Path

from engine.core.device import select_device, release_device_cache
from engine.models.base import VoiceDesignModelBase, GenerationResult, save_generation
from engine.models.downloader import model_ready, model_version


class VoxCPM2Model(VoiceDesignModelBase):
    model_name = "VoxCPM2 2B"
    vram_requirement_gb = 8.0

    def __init__(self, model_dir: Path):
        super().__init__(model_dir)
        self.instance = None
        self.device = None

    @property
    def model_version(self):
        return model_version(self.model_dir / "voxcpm2_2b")

    def is_downloaded(self):
        return model_ready(self.model_dir / "voxcpm2_2b")

    async def download(self, source="auto", progress_callback=None):
        from engine.models.downloader import ModelDownloader
        await ModelDownloader(self.model_dir).start_download("voxcpm2_2b", source)
        return self.is_downloaded()

    def load(self, device="auto"):
        from voxcpm import VoxCPM
        selected = select_device(device)
        if self.instance is not None and selected == self.device:
            return
        self.unload()
        if not model_ready(self.model_dir / "voxcpm2_2b", verify_hashes=True):
            raise RuntimeError("模型未就绪，请在模型管理中完成下载")
        self.instance = VoxCPM.from_pretrained(str(self.model_dir / "voxcpm2_2b"),
                                              device=selected, load_denoiser=False, optimize=False)
        self.device, self.is_loaded = selected, True

    def unload(self):
        if self.instance is not None:
            self.instance = None
            release_device_cache()
        self.device, self.is_loaded = None, False

    async def generate_single(self, prompt: str, text: str, seed: int, output_path: Path,
                              reference_audio=None, reference_text=None) -> GenerationResult:
        def inference():
            import os
            import random
            import time
            import torch
            import numpy as np
            start = time.perf_counter()
            self.load()
            torch.set_num_threads(min(8, os.cpu_count() or 1))
            torch.manual_seed(seed)
            np.random.seed(seed)
            random.seed(seed)
            synthesis_text = f"({prompt.strip().strip('()（）')}){text.strip()}" if prompt.strip() else text.strip()
            kwargs = {"text": synthesis_text, "cfg_value": 2.0, "inference_timesteps": 10}
            if reference_audio:
                kwargs["reference_wav_path"] = reference_audio
            with torch.inference_mode():
                audio = self.instance.generate(**kwargs)
            return save_generation(audio, self.instance.tts_model.sample_rate, output_path, start,
                                   self.model_name, self.model_version, seed, self.device,
                                   "voice_clone" if reference_audio else "voice_design",
                                   {"cfg_value": 2.0, "inference_timesteps": 10, "optimize": False})
        return await asyncio.to_thread(inference)
