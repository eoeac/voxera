import os
from pathlib import Path
from pydantic import BaseModel

def resolve_base_dir() -> Path:
    # 1. 优先使用环境变量 VOXERA_HOME
    if "VOXERA_HOME" in os.environ and os.environ["VOXERA_HOME"].strip():
        return Path(os.environ["VOXERA_HOME"]).resolve()
    
    # 2. 检查是否在便携包环境运行（工作区根目录含 .portable、runtime 或 .venv）
    project_root = Path(__file__).resolve().parent.parent.parent
    if (project_root / ".portable").exists() or (project_root / "runtime").exists() or (project_root / ".venv").exists():
        return project_root
    
    # 3. 回退至用户主目录
    return (Path.home() / ".voxera").resolve()

class AppSettings(BaseModel):
    app_name: str = "Voxera"
    version: str = "0.1.1"
    host: str = "127.0.0.1"
    port: int = 28840  # 专用本地端口
    
    # 基础目录
    base_dir: Path = resolve_base_dir()
    
    @property
    def data_dir(self) -> Path:
        p = self.base_dir / "data"
        p.mkdir(parents=True, exist_ok=True)
        return p
        
    @property
    def audio_dir(self) -> Path:
        p = self.base_dir / "audio"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def models_dir(self) -> Path:
        p = self.base_dir / "models"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def env_dir(self) -> Path:
        p = self.base_dir / "env"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def db_path(self) -> Path:
        return self.data_dir / "voxera.db"

settings = AppSettings()
