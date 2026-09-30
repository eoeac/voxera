"""Shared inference device selection; imported without loading PyTorch."""
import os


def select_device(requested: str | None = None) -> str:
    import torch
    requested = requested or os.environ.get("VOXERA_DEVICE", "auto")
    if requested not in {"auto", "cpu", "cuda", "mps"}:
        raise ValueError("VOXERA_DEVICE must be auto, cpu, cuda or mps")
    cuda = torch.cuda.is_available()
    mps_backend = getattr(torch.backends, "mps", None)
    mps = bool(mps_backend and mps_backend.is_available())
    if requested == "auto":
        return "cuda" if cuda else ("mps" if mps else "cpu")
    if (requested == "cuda" and not cuda) or (requested == "mps" and not mps):
        raise RuntimeError(f"Requested device {requested} is unavailable")
    return requested


def release_device_cache():
    import gc
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    mps_backend = getattr(torch.backends, "mps", None)
    if hasattr(torch, "mps") and mps_backend and mps_backend.is_available():
        torch.mps.empty_cache()
