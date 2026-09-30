import os
import sys
import shutil
import asyncio
import subprocess
import json
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel

from engine.core.detector import detect_hardware

class VariantOption(BaseModel):
    id: str
    name: str
    description: str
    size_approx: str
    is_recommended: bool = False

class AccelerationStatus(BaseModel):
    current_mode: str  # "cuda" | "cpu" | "mps"
    torch_version: Optional[str] = None
    cuda_available: bool = False
    has_nvidia_gpu: bool = False
    gpu_names: List[str] = []
    recommended_variant: str = "cu128"
    available_variants: List[VariantOption] = []
    is_installing: bool = False
    install_progress: float = 0.0
    install_status: str = "idle"  # "idle" | "installing" | "completed" | "failed"
    install_step: str = ""
    error: Optional[str] = None

class InstallAccelerationRequest(BaseModel):
    variant: Literal["cu128", "cu124", "cu121", "cu118", "cpu"] = "cu128"

class TestExternalPythonRequest(BaseModel):
    python_path: str

class TestExternalPythonResponse(BaseModel):
    valid: bool
    python_version: Optional[str] = None
    torch_version: Optional[str] = None
    cuda_available: bool = False
    device_name: Optional[str] = None
    error: Optional[str] = None

# 全局安装状态缓存
_install_state = {
    "is_installing": False,
    "progress": 0.0,
    "status": "idle",
    "step": "",
    "error": None
}

AVAILABLE_VARIANTS = [
    VariantOption(id="cu128", name="CUDA 12.8", description="PyTorch 2.8 / TorchAudio 2.8；需要兼容的 NVIDIA 驱动", size_approx="约 3 GB", is_recommended=True),
    VariantOption(
        id="cu124",
        name="CUDA 12.4",
        description="PyTorch 2.6 / TorchAudio 2.6；不适用于 RTX 50 系列",
        size_approx="约 1.5 GB",
        is_recommended=False
    ),
    VariantOption(
        id="cu121",
        name="CUDA 12.1",
        description="兼容性优秀，适配多数稳定版 NVIDIA 显卡驱动",
        size_approx="约 1.5 GB",
        is_recommended=False
    ),
    VariantOption(
        id="cu118",
        name="CUDA 11.8 (经典卡与老驱动)",
        description="适配较老架构显卡（如 GTX 10/16 系或老版系统驱动）",
        size_approx="约 1.4 GB",
        is_recommended=False
    ),
    VariantOption(
        id="cpu",
        name="CPU 基础轻量模式",
        description="纯 CPU 运行，无需下载任何 NVIDIA 库，极速省流",
        size_approx="约 150 MB",
        is_recommended=False
    ),
]

def get_acceleration_status() -> AccelerationStatus:
    hw = detect_hardware()
    
    current_mode = hw.current_mode

    gpu_names = [g.name for g in hw.gpus if g.is_nvidia] or [g.name for g in hw.gpus]

    return AccelerationStatus(
        current_mode=current_mode,
        torch_version=hw.current_torch_version,
        cuda_available=hw.current_torch_cuda,
        has_nvidia_gpu=hw.has_nvidia_cuda,
        gpu_names=gpu_names,
        recommended_variant="cu128" if hw.has_nvidia_cuda else "cpu",
        available_variants=AVAILABLE_VARIANTS,
        is_installing=_install_state["is_installing"],
        install_progress=_install_state["progress"],
        install_status=_install_state["status"],
        install_step=_install_state["step"],
        error=_install_state["error"]
    )

def test_external_python(python_path: str) -> TestExternalPythonResponse:
    p = Path(python_path.strip().strip('"').strip("'"))
    root = Path(__file__).resolve().parents[2]
    trusted = [root / "runtime" / "python.exe", root / ".venv" / "Scripts" / "python.exe",
               root / ".venv" / "bin" / "python"]
    if p.absolute() not in [candidate.absolute() for candidate in trusted]:
        return TestExternalPythonResponse(valid=False, error="只允许检测 Voxera 的 runtime 或 .venv 解释器")
    if not p.is_file():
        return TestExternalPythonResponse(valid=False, error=f"找不到指定的可执行文件: {python_path}")

    test_script = (
        "import engine, sys, platform\n"
        "res = {'py': platform.python_version(), 'torch': None, 'cuda': False, 'dev': None}\n"
        "try:\n"
        "    import torch\n"
        "    res['torch'] = torch.__version__\n"
        "    res['cuda'] = torch.cuda.is_available()\n"
        "    if res['cuda']:\n"
        "        res['dev'] = torch.cuda.get_device_name(0)\n"
        "except Exception as e:\n"
        "    res['err'] = str(e)\n"
        "import json\n"
        "print('JSON_RES:' + json.dumps(res))\n"
    )

    try:
        proc = subprocess.run(
            [str(p), "-c", test_script],
            capture_output=True,
            text=True,
            timeout=8
        )
        if proc.returncode != 0:
            return TestExternalPythonResponse(valid=False, error=f"运行外部 Python 失败: {proc.stderr.strip() or proc.stdout.strip()}")

        for line in proc.stdout.splitlines():
            if line.startswith("JSON_RES:"):
                import json
                data = json.loads(line.replace("JSON_RES:", "").strip())
                return TestExternalPythonResponse(
                    valid=True,
                    python_version=data.get("py"),
                    torch_version=data.get("torch"),
                    cuda_available=data.get("cuda", False),
                    device_name=data.get("dev"),
                    error=data.get("err")
                )

        return TestExternalPythonResponse(valid=False, error="未能解析外部环境检测返回结果")
    except subprocess.TimeoutExpired:
        return TestExternalPythonResponse(valid=False, error="外部 Python 启动超时")
    except Exception as e:
        return TestExternalPythonResponse(valid=False, error=str(e))

async def run_acceleration_install(variant: str = "cu128"):
    """后台调用 uv 或 pip 安装/切换指定的 PyTorch CUDA/CPU 版本"""
    global _install_state
    if variant not in {"cu128", "cu124", "cu121", "cu118", "cpu"}:
        raise ValueError("Unsupported acceleration variant")
    if _install_state["is_installing"]:
        return

    _install_state["is_installing"] = True
    _install_state["progress"] = 5.0
    _install_state["status"] = "installing"
    _install_state["step"] = f"准备安装 PyTorch ({variant}) 算力扩展..."
    _install_state["error"] = None

    def _do_install():
        global _install_state
        try:
            # 找到项目根目录与内置 runtime
            project_root = Path(__file__).resolve().parent.parent.parent
            runtime_uv = project_root / "runtime" / "uv.exe"
            uv_exe = str(runtime_uv) if runtime_uv.exists() else (shutil.which("uv") or "uv")
            
            runtime_py = project_root / "runtime" / "python.exe"
            venv_py = project_root / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            py_target = str(runtime_py if runtime_py.exists() else venv_py)
            if not Path(py_target).is_file():
                raise RuntimeError("未找到隔离解释器，请先执行项目安装脚本")
            if os.name != "nt":
                raise RuntimeError("图形界面的算力包安装目前支持 Windows；其他系统请使用隔离环境的 uv pip 命令")
            env_root = project_root / ("runtime" if runtime_py.exists() else ".venv")
            target = env_root / "acceleration" / variant
            stage = target.with_name(variant + ".staging-" + str(time.time_ns()))
            stage.mkdir(parents=True)

            # 确定索引地址
            if variant == "cpu":
                index_url = "https://download.pytorch.org/whl/cpu"
            else:
                index_url = f"https://download.pytorch.org/whl/{variant}"

            _install_state["progress"] = 15.0
            _install_state["step"] = f"正在从 PyTorch 镜像拉取 {variant} 架构权重库..."

            # 优先使用内置 uv 执行加速安装，直接部署到内置 runtime 环境
            from engine.core.network_probe import probe_network_environment
            network = asyncio.run(probe_network_environment())
            cmd = [
                uv_exe,
                "pip",
                "install",
                "torch==" + {"cu128": "2.8.0", "cu124": "2.6.0", "cu121": "2.5.1", "cu118": "2.6.0", "cpu": "2.8.0"}[variant],
                "torchaudio==" + {"cu128": "2.8.0", "cu124": "2.6.0", "cu121": "2.5.1", "cu118": "2.6.0", "cpu": "2.8.0"}[variant],
                "--python",
                py_target,
                "--index-url",
                index_url,
                "--extra-index-url",
                "https://pypi.tuna.tsinghua.edu.cn/simple" if network.selected_pypi_index == "tsinghua" else "https://pypi.org/simple",
                "--target", str(stage), "--no-deps",
            ]

            process = subprocess.Popen(
                cmd,
                cwd=str(project_root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            log_tail = []
            for line in process.stdout:
                line_str = line.strip()
                log_tail = (log_tail + [line_str])[-20:]
                if "Downloading" in line_str:
                    _install_state["progress"] = min(85.0, _install_state["progress"] + 3.0)
                    _install_state["step"] = f"正在极速下载: {line_str[:50]}..."
                elif "Installing" in line_str or "Installed" in line_str:
                    _install_state["progress"] = 92.0
                    _install_state["step"] = "正在部署并校验 GPU 动态链接库..."

            process.wait()
            if process.returncode != 0:
                raise RuntimeError(f"安装退出码: {process.returncode}\n" + "\n".join(log_tail))
            validation_env = os.environ.copy()
            validation_env["PYTHONPATH"] = str(stage)
            subprocess.run([py_target, "-c", "import torch,torchaudio; print(torch.__version__,torchaudio.__version__)"],
                           cwd=str(stage), env=validation_env, check=True, timeout=60,
                           capture_output=True, text=True)
            if target.exists():
                target.rename(target.with_name(variant + ".previous-" + str(time.time_ns())))
            stage.rename(target)
            activation = project_root / "acceleration.json.tmp"
            activation.write_text(json.dumps({"variant": variant}), encoding="utf-8")
            activation.replace(project_root / "acceleration.json")

            _install_state["progress"] = 100.0
            _install_state["status"] = "completed"
            _install_state["step"] = f"PyTorch ({variant}) 已准备完成。请重启后检查实际算力。"
        except Exception as exc:
            _install_state["status"] = "failed"
            _install_state["error"] = str(exc)
            _install_state["step"] = f"安装失败: {exc}"
        finally:
            _install_state["is_installing"] = False

    await asyncio.to_thread(_do_install)
