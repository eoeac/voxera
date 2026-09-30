import os
import sys
import platform
import shutil
import subprocess
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from engine.core.device import select_device

class GPUInfo(BaseModel):
    name: str
    driver_version: Optional[str] = None
    vram_mb: Optional[int] = None
    is_nvidia: bool = False
    cuda_supported: bool = False

class HardwareReport(BaseModel):
    os_name: str
    os_version: str
    cpu_model: str
    cpu_cores: int
    ram_total_gb: float
    ram_available_gb: float
    gpus: List[GPUInfo]
    has_nvidia_cuda: bool
    current_torch_cuda: bool = False
    current_torch_version: Optional[str] = None
    recommended_mode: str  # "cuda", "mps", "cpu"
    current_mode: str = "cpu"
    notice: Optional[str] = None

class EnvCheckReport(BaseModel):
    system_python_version: Optional[str] = None
    system_python_path: Optional[str] = None
    system_has_torch: bool = False
    system_torch_cuda: bool = False
    system_torch_version: Optional[str] = None
    can_reuse_system: bool = False
    uv_installed: bool = False
    uv_path: Optional[str] = None

def get_cpu_model_name() -> str:
    """精准探测并返回人类可读的真实处理器型号（例如 13th Gen Intel(R) Core(TM) i7-13700）"""
    system = platform.system()
    if system == "Windows":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            if name and name.strip():
                return name.strip()
        except Exception:
            pass
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
                capture_output=True, text=True, timeout=2
            )
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip().split("\n")[0].strip()
        except Exception:
            pass
    elif system == "Darwin":
        try:
            res = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True, timeout=2)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass
    elif system == "Linux":
        try:
            with open("/proc/cpuinfo", "r", encoding="utf-8") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":", 1)[1].strip()
        except Exception:
            pass

    return platform.processor() or "Unknown CPU"

def detect_hardware() -> HardwareReport:
    os_name = platform.system()
    os_version = platform.version()
    cpu_model = get_cpu_model_name()
    cpu_cores = os.cpu_count() or 4
    
    # 内存检测
    ram_total_gb = 8.0
    ram_available_gb = 4.0
    try:
        import psutil
        mem = psutil.virtual_memory()
        ram_total_gb = round(mem.total / (1024 ** 3), 2)
        ram_available_gb = round(mem.available / (1024 ** 3), 2)
    except Exception:
        pass

    gpus: List[GPUInfo] = []
    has_nvidia_cuda = False

    # Windows WMI / nvidia-smi 显卡探测
    if os_name == "Windows":
        try:
            cmd = "powershell -NoProfile -Command \"Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM | ConvertTo-Json\""
            res = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=5)
            if res.returncode == 0 and res.stdout.strip():
                import json
                try:
                    data = json.loads(res.stdout)
                    if isinstance(data, dict):
                        data = [data]
                    for item in data:
                        name = item.get("Name", "Unknown")
                        driver = item.get("DriverVersion")
                        adapter_ram = item.get("AdapterRAM") or 0
                        ram_mb = int(adapter_ram) // (1024 * 1024) if adapter_ram else None
                        
                        is_nv = "nvidia" in name.lower() or "geforce" in name.lower() or "quadro" in name.lower() or "rtx" in name.lower()
                        if is_nv:
                            has_nvidia_cuda = True
                        
                        gpus.append(GPUInfo(
                            name=name,
                            driver_version=driver,
                            vram_mb=ram_mb,
                            is_nvidia=is_nv,
                            cuda_supported=is_nv
                        ))
                except Exception:
                    pass

                # 若存在真实的物理显示核心 (Intel / NVIDIA / AMD 等)，过滤掉向日葵/远控虚拟显卡适配器 (IDD)
                physical_gpus = [g for g in gpus if not any(k in g.name.lower() for k in ["idd", "virtual", "oray", "gameviewer", "parsec", "spacedesk", "basic display"])]
                if physical_gpus:
                    gpus = physical_gpus
        except Exception:
            pass

    # 若检测不到通过 WMI，测试 nvidia-smi
    if not has_nvidia_cuda:
        try:
            nv_res = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader,nounits"],
                                    capture_output=True, text=True, timeout=3)
            if nv_res.returncode == 0:
                has_nvidia_cuda = True
                for line in nv_res.stdout.strip().split("\n"):
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        gpus.append(GPUInfo(
                            name=parts[0],
                            driver_version=parts[1],
                            vram_mb=int(parts[2]),
                            is_nvidia=True,
                            cuda_supported=True
                        ))
        except Exception:
            pass

    # Apple Silicon 检测
    is_macos_arm = (os_name == "Darwin" and platform.machine() == "arm64")

    current_torch_cuda = False
    current_torch_ver = None
    try:
        import torch
        current_torch_ver = torch.__version__
        current_torch_cuda = torch.cuda.is_available()
    except Exception:
        pass

    # 决策模式
    if has_nvidia_cuda:
        recommended_mode = "cuda"
        if not current_torch_cuda:
            notice = "检测到 NVIDIA 独立显卡，当前运行在 CPU 轻量模式。支持在向导或设置中一键开启 CUDA 加速。"
        else:
            notice = None
    elif is_macos_arm:
        recommended_mode = "mps"
        notice = "Apple Silicon Metal Acceleration Ready"
    else:
        recommended_mode = "cpu"
        notice = "当前未检测到 NVIDIA 独立显卡，将启用 CPU/集显模式。推理速度相对独显较慢，建议生成时耐心等待。"

    return HardwareReport(
        os_name=os_name,
        os_version=os_version,
        cpu_model=cpu_model,
        cpu_cores=cpu_cores,
        ram_total_gb=ram_total_gb,
        ram_available_gb=ram_available_gb,
        gpus=gpus,
        has_nvidia_cuda=has_nvidia_cuda,
        current_torch_cuda=current_torch_cuda,
        current_torch_version=current_torch_ver,
        recommended_mode=recommended_mode,
        current_mode=select_device() if current_torch_ver else "cpu",
        notice=notice
    )

def check_environment() -> EnvCheckReport:
    # 检查当前系统 Python
    sys_py_path = sys.executable
    sys_py_ver = platform.python_version()
    
    system_has_torch = False
    system_torch_cuda = False
    system_torch_ver = None

    try:
        import torch
        system_has_torch = True
        system_torch_ver = torch.__version__
        system_torch_cuda = torch.cuda.is_available()
    except ImportError:
        pass

    # uv 检测
    uv_path = shutil.which("uv")
    uv_installed = uv_path is not None

    # 如果有现成的可运行 torch+cuda，允许复用
    can_reuse = system_has_torch and system_torch_cuda

    return EnvCheckReport(
        system_python_version=sys_py_ver,
        system_python_path=sys_py_path,
        system_has_torch=system_has_torch,
        system_torch_cuda=system_torch_cuda,
        system_torch_version=system_torch_ver,
        can_reuse_system=can_reuse,
        uv_installed=uv_installed,
        uv_path=uv_path
    )
