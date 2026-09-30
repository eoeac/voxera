"""Voxera local engine."""
import json
import os
from pathlib import Path
import sys

# GPU packages are staged separately, so a running Windows process never has its
# loaded Torch DLLs overwritten. Activation happens before any engine imports.
_project_root = Path(__file__).resolve().parents[1]
_activation_file = _project_root / "acceleration.json"
if _activation_file.is_file():
    try:
        _variant = json.loads(_activation_file.read_text(encoding="utf-8"))["variant"]
        if _variant in {"cu128", "cu124", "cu121", "cu118", "cpu"}:
            _env_root = _project_root / ("runtime" if (_project_root / "runtime").is_dir() else ".venv")
            _packages = _env_root / "acceleration" / _variant
            if (_packages / "torch" / "__init__.py").is_file():
                sys.path.insert(0, str(_packages))
    except (OSError, ValueError, KeyError, TypeError):
        pass  # An invalid activation file leaves the base environment usable.

_data_root = Path(os.environ.get("VOXERA_HOME", str(_project_root))).resolve()
os.environ.setdefault("MODELSCOPE_CACHE", str(_data_root / "models" / ".cache" / "modelscope"))
os.environ.setdefault("HF_HOME", str(_data_root / "models" / ".cache" / "huggingface"))
