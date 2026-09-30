import asyncio
import time
from typing import Dict, Any, Optional
import httpx
from pydantic import BaseModel

class ProbeResult(BaseModel):
    name: str
    url: str
    latency_ms: Optional[float] = None
    is_available: bool = False
    error: Optional[str] = None

class NetworkProfile(BaseModel):
    region: str  # "cn" (中国大陆) 或 "global" (海外)
    selected_model_source: str  # "modelscope" 或 "huggingface" 或 "hf-mirror"
    selected_pypi_index: str    # "tsinghua" 或 "official"
    hf_latency_ms: Optional[float] = None
    cn_latency_ms: Optional[float] = None
    details: Dict[str, ProbeResult] = {}

PROBE_TARGETS = {
    "huggingface": "https://huggingface.co",
    "hf_mirror": "https://hf-mirror.com",
    "modelscope": "https://www.modelscope.cn",
    "pypi_official": "https://pypi.org/simple",
    "pypi_tsinghua": "https://pypi.tuna.tsinghua.edu.cn/simple",
}

async def _ping_target(name: str, url: str, client: httpx.AsyncClient) -> ProbeResult:
    start = time.perf_counter()
    try:
        resp = await client.head(url, timeout=3.0, follow_redirects=True)
        latency = round((time.perf_counter() - start) * 1000, 2)
        return ProbeResult(name=name, url=url, latency_ms=latency, is_available=(resp.status_code < 500))
    except Exception as e:
        return ProbeResult(name=name, url=url, latency_ms=None, is_available=False, error=str(e))

async def probe_network_environment() -> NetworkProfile:
    results: Dict[str, ProbeResult] = {}
    async with httpx.AsyncClient() as client:
        tasks = [
            _ping_target(name, url, client)
            for name, url in PROBE_TARGETS.items()
        ]
        probe_outputs = await asyncio.gather(*tasks)
        for res in probe_outputs:
            results[res.name] = res

    hf = results.get("huggingface")
    hf_mirror = results.get("hf_mirror")
    ms = results.get("modelscope")
    
    # 判定规则：若官方 Hugging Face 不可用或延迟明显高于国内镜像，则判定为中国大陆网络环境
    is_hf_fast = hf and hf.is_available and (hf.latency_ms is not None and hf.latency_ms < 600)
    
    if is_hf_fast:
        region = "global"
        selected_model_source = "huggingface"
        selected_pypi_index = "official"
    else:
        region = "cn"
        # 优先 ModelScope，如果镜像可用也可选用
        selected_model_source = "modelscope" if (ms and ms.is_available) else "hf-mirror"
        selected_pypi_index = "tsinghua"

    return NetworkProfile(
        region=region,
        selected_model_source=selected_model_source,
        selected_pypi_index=selected_pypi_index,
        hf_latency_ms=hf.latency_ms if hf else None,
        cn_latency_ms=ms.latency_ms if ms else (hf_mirror.latency_ms if hf_mirror else None),
        details=results
    )

if __name__ == "__main__":
    profile = asyncio.run(probe_network_environment())
    print("Network Profile:", profile.model_dump_json(indent=2))
