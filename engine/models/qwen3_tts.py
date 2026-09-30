import asyncio
from pathlib import Path

from engine.core.device import select_device, release_device_cache
from engine.models.base import VoiceDesignModelBase, GenerationResult, save_generation
from engine.models.downloader import model_version, model_ready


class Qwen3TTSVoiceDesignModel(VoiceDesignModelBase):
    model_name = "Qwen3-TTS 1.7B VoiceDesign"
    vram_requirement_gb = None

    def __init__(self, model_dir: Path):
        super().__init__(model_dir)
        self.instance = None
        self.loaded_key = None
        self.device = None

    @property
    def model_version(self):
        return model_version(self.model_dir / "qwen3_tts_voicedesign")

    def is_downloaded(self):
        return model_ready(self.model_dir / "qwen3_tts_voicedesign")

    async def download(self, source="auto", progress_callback=None):
        from engine.models.downloader import ModelDownloader
        await ModelDownloader(self.model_dir).start_download("qwen3_tts_voicedesign", source)
        return self.is_downloaded()

    def load(self, device="auto", key="qwen3_tts_voicedesign"):
        import torch
        from qwen_tts import Qwen3TTSModel
        selected = select_device(device)
        if self.loaded_key == key and self.device == selected and self.instance is not None:
            return
        self.unload()
        path = self.model_dir / key
        if not model_ready(path, verify_hashes=True):
            raise RuntimeError("模型未就绪，请在模型管理中完成下载")
        self.instance = Qwen3TTSModel.from_pretrained(
            str(path), device_map="cuda:0" if selected == "cuda" else selected,
            dtype=torch.bfloat16 if selected == "cuda" and torch.cuda.is_bf16_supported() else torch.float32,
            attn_implementation="sdpa", local_files_only=True,
        )
        self.loaded_key, self.device, self.is_loaded = key, selected, True

    def unload(self):
        if self.instance is not None:
            self.instance = None
            release_device_cache()
        self.loaded_key, self.device, self.is_loaded = None, None, False

    async def generate_single(self, prompt: str, text: str, seed: int, output_path: Path,
                              reference_audio=None, reference_text=None) -> GenerationResult:
        def inference():
            import os
            import random
            import time
            import torch
            import numpy as np
            start = time.perf_counter()
            key = "qwen3_tts_base" if reference_audio else "qwen3_tts_voicedesign"
            self.load(key=key)
            torch.set_num_threads(min(8, os.cpu_count() or 1))
            torch.manual_seed(seed)
            np.random.seed(seed)
            random.seed(seed)
            with torch.inference_mode():
                if reference_audio:
                    wavs, sr = self.instance.generate_voice_clone(
                        text=text, language="Auto", ref_audio=reference_audio,
                        ref_text=reference_text, x_vector_only_mode=False,
                    )
                else:
                    wavs, sr = self.instance.generate_voice_design(text=text, instruct=prompt, language="Auto")
            return save_generation(wavs[0], sr, output_path, start,
                                   "Qwen3-TTS 1.7B Base" if reference_audio else self.model_name,
                                   model_version(self.model_dir / key), seed,
                                   self.device, "voice_clone" if reference_audio else "voice_design",
                                   {"language": "Auto", "attention": "sdpa", "model_id": key})
        return await asyncio.to_thread(inference)
