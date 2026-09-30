import os
import random
import time
import json
import asyncio
import tempfile
import re
import zipfile
import urllib.parse
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict, model_validator
from sqlalchemy.orm import Session

from engine.core.config import settings
from engine.core.lifecycle import lifespan, INSTANCE_ID
from engine.core.security import TRUSTED_ORIGINS, contained_path, local_access_control, create_session
from engine.core.detector import detect_hardware, check_environment, HardwareReport, EnvCheckReport
from engine.core.acceleration import (
    AccelerationStatus,
    InstallAccelerationRequest,
    TestExternalPythonRequest,
    TestExternalPythonResponse,
    get_acceleration_status,
    run_acceleration_install,
    test_external_python
)
from engine.core.network_probe import probe_network_environment, NetworkProfile
from engine.storage.database import init_db, get_db, SessionLocal
from engine.storage.models import Character, GenerationBatch, AuditionClip, AppConfigItem
from engine.models.downloader import SUPPORTED_MODELS, ModelDownloader, model_version, download_states
from engine.models.qwen3_tts import Qwen3TTSVoiceDesignModel
from engine.models.voxcpm2 import VoxCPM2Model

# 初始化数据库结构
init_db()

def cleanup_zombie_clips():
    """Recover interrupted jobs without discarding their error history."""
    db = SessionLocal()
    try:
        zombies = db.query(AuditionClip).filter(
            (AuditionClip.status.in_(["pending", "processing"])) & 
            ((AuditionClip.file_path == "") | (AuditionClip.file_path.is_(None)))
        ).all()
        if zombies:
            print(f"[ServerStartup] Cleaning up {len(zombies)} interrupted zombie clips...")
            for z in zombies:
                z.status = "failed"
                z.error_message = "引擎已重启，任务被中断。请重新生成。"
        for batch in db.query(GenerationBatch).filter(GenerationBatch.status.in_(["pending", "queued", "generating"])).all():
            successes = any(c.status == "completed" for c in batch.clips)
            batch.status = "partial" if successes else "failed"
        db.commit()
    except Exception as e:
        print(f"[ServerStartup] Error cleaning zombie clips: {e}")
    finally:
        db.close()

# 初始化模型适配器注册表
model_downloader = ModelDownloader(settings.models_dir)
model_registry = {
    "Qwen3-TTS 1.7B VoiceDesign": Qwen3TTSVoiceDesignModel(settings.models_dir),
    "VoxCPM2 2B": VoxCPM2Model(settings.models_dir)
}

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Voxera Voice Generation & Character Management Backend",
    lifespan=lifespan,
)

# 允许跨域（供 Tauri 前端及本地开发调试使用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(TRUSTED_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)
app.middleware("http")(local_access_control)

# 静态音频文件服务
app.mount("/static/audio", StaticFiles(directory=str(settings.audio_dir)), name="audio")

# ==================== DTO 数据传输模型 ====================
class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

class CharacterCreate(InputModel):
    name: str = Field(min_length=1, max_length=100)
    voice_description: str = Field(min_length=1, max_length=2000)
    sample_text: str = Field(min_length=1, max_length=5000)
    avatar: Optional[str] = Field("🎙️", max_length=255)
    tags: Optional[str] = Field("", max_length=255)

class CharacterUpdate(InputModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    voice_description: Optional[str] = Field(None, min_length=1, max_length=2000)
    sample_text: Optional[str] = Field(None, min_length=1, max_length=5000)
    avatar: Optional[str] = Field(None, max_length=255)
    tags: Optional[str] = Field(None, max_length=255)
    pinned_clip_id: Optional[int] = None

    @model_validator(mode="after")
    def require_present_text(self):
        for field in ("name", "voice_description", "sample_text"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

class GenerateRequest(InputModel):
    character_id: Optional[int] = Field(None, gt=0)
    prompt: str = Field(min_length=1, max_length=2000)
    sample_text: str = Field(min_length=1, max_length=5000)
    model_name: str = "Qwen3-TTS 1.7B VoiceDesign"
    candidate_count: int = Field(4, ge=1, le=10)
    reuse_pinned_voice: bool = False

class ExportZipRequest(InputModel):
    clip_ids: Optional[List[int]] = Field(None, min_length=1, max_length=1000)
    character_id: Optional[int] = Field(None, gt=0)

class BatchDeleteRequest(BaseModel):
    clip_ids: List[int] = Field(max_length=1000)

# ==================== 系统与安装向导 API ====================
@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": settings.app_name, "version": settings.version, "instance_id": INSTANCE_ID}

@app.post("/api/system/shutdown")
def shutdown_engine():
    if any(state.status == "downloading" for state in download_states.values()):
        raise HTTPException(409, "模型正在下载，请等待完成后再停止引擎")
    with SessionLocal() as db:
        ensure_no_active_jobs(db)
    server = getattr(app.state, "server", None)
    if server is None:
        raise HTTPException(409, "当前宿主不支持通过接口停止")
    server.should_exit = True
    return {"status": "stopping"}

@app.get("/api/session")
def session_bootstrap(response: Response):
    return create_session(response)

@app.get("/api/system/hardware", response_model=HardwareReport)
def get_hardware():
    return detect_hardware()

@app.get("/api/system/network", response_model=NetworkProfile)
async def get_network_profile():
    return await probe_network_environment()

@app.get("/api/system/env-check", response_model=EnvCheckReport)
def get_env_check():
    return check_environment()

@app.get("/api/system/acceleration", response_model=AccelerationStatus)
def get_acceleration():
    return get_acceleration_status()

@app.post("/api/system/acceleration/install")
async def install_acceleration(req: InstallAccelerationRequest, background_tasks: BackgroundTasks):
    if generation_lock.locked() or get_acceleration_status().is_installing:
        raise HTTPException(409, "请等待生成或安装任务结束后再切换算力环境")
    with SessionLocal() as db:
        ensure_no_active_jobs(db)
    background_tasks.add_task(run_acceleration_install, req.variant)
    return {"message": "Acceleration package installation started", "variant": req.variant}

@app.post("/api/system/acceleration/test-external", response_model=TestExternalPythonResponse)
def check_external_env(req: TestExternalPythonRequest):
    return test_external_python(req.python_path)

# ==================== 模型与离线管理 API ====================
@app.get("/api/models")
def list_models():
    models_list = []
    for key, meta in SUPPORTED_MODELS.items():
        is_ready = model_downloader.is_model_downloaded(key)
        progress = model_downloader.get_progress(key)
        models_list.append({
            "id": meta["id"],
            "name": meta["name"],
            "version": model_version(settings.models_dir / key),
            "size_display": meta["size_display"],
            "vram_gb": meta["vram_gb"],
            "is_default": meta["is_default"],
            "is_available": meta.get("is_available", True),
            "is_auxiliary": meta.get("is_auxiliary", False),
            "description": meta["description"],
            "is_downloaded": is_ready,
            "status": progress.status,
            "percentage": progress.percentage,
            "error": progress.error,
        })
    return models_list

@app.post("/api/models/{model_key}/download")
async def download_model(model_key: str, background_tasks: BackgroundTasks, source: Optional[str] = Query(None)):
    if model_key not in SUPPORTED_MODELS:
        raise HTTPException(status_code=404, detail="Model not supported")
    if source not in {None, "auto", "modelscope", "huggingface", "hf-mirror"}:
        raise HTTPException(422, "Unsupported model source")
    if model_downloader.get_progress(model_key).status == "downloading":
        raise HTTPException(409, "Model download is already running")
    background_tasks.add_task(model_downloader.start_download, model_key, source or "auto")
    return {"message": "Download started", "model_key": model_key, "source": source or "auto"}

@app.get("/api/models/{model_key}/progress")
def get_model_download_progress(model_key: str):
    if model_key not in SUPPORTED_MODELS:
        raise HTTPException(status_code=404, detail="Model not supported")
    return model_downloader.get_progress(model_key)

# ==================== 角色管理 API ====================
@app.get("/api/characters")
def list_characters(db: Session = Depends(get_db)):
    chars = db.query(Character).order_by(Character.updated_at.desc()).all()
    result = []
    for c in chars:
        # 查询绑定的正式音色 clip
        pinned_clip = None
        if c.pinned_clip_id:
            clip = db.query(AuditionClip).filter(AuditionClip.id == c.pinned_clip_id).first()
            if clip:
                pinned_clip = {
                    "id": clip.id,
                    "audio_url": f"/static/audio/{os.path.basename(clip.file_path)}",
                    "model_name": clip.model_name,
                    "model_version": clip.model_version,
                    "seed": clip.seed,
                    "duration_seconds": clip.duration_seconds
                }
        result.append({
            "id": c.id,
            "name": c.name,
            "avatar": c.avatar,
            "voice_description": c.voice_description,
            "sample_text": c.sample_text,
            "tags": c.tags.split(",") if c.tags else [],
            "pinned_clip": pinned_clip,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    return result

@app.post("/api/characters")
def create_character(req: CharacterCreate, db: Session = Depends(get_db)):
    char = Character(
        name=req.name,
        voice_description=req.voice_description,
        sample_text=req.sample_text,
        avatar=req.avatar or "🎙️",
        tags=req.tags or ""
    )
    db.add(char)
    db.commit()
    db.refresh(char)
    return {"id": char.id, "message": "Character created successfully"}

@app.put("/api/characters/{char_id}")
def update_character(char_id: int, req: CharacterUpdate, db: Session = Depends(get_db)):
    char = db.query(Character).filter(Character.id == char_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    if req.name is not None:
        char.name = req.name
    if req.voice_description is not None:
        char.voice_description = req.voice_description
    if req.sample_text is not None:
        char.sample_text = req.sample_text
    if req.avatar is not None:
        char.avatar = req.avatar
    if req.tags is not None:
        char.tags = req.tags
    if "pinned_clip_id" in req.model_fields_set:
        ensure_no_active_jobs(db, char_id)
        if req.pinned_clip_id is None:
            db.query(AuditionClip).filter(AuditionClip.character_id == char_id).update({"is_pinned": False})
            char.pinned_clip_id = None
        else:
            clip = validate_pin(db, req.pinned_clip_id, char_id)
            db.query(AuditionClip).filter(AuditionClip.character_id == char_id).update({"is_pinned": False})
            clip.is_pinned = True
            char.pinned_clip_id = clip.id
    db.commit()
    return {"message": "Character updated"}

@app.delete("/api/characters/{char_id}")
def delete_character(char_id: int, db: Session = Depends(get_db)):
    char = db.query(Character).filter(Character.id == char_id).first()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    ensure_no_active_jobs(db, char_id)
    delete_clip_records(db, list(char.clips), character=char)
    return {"message": "Character deleted"}

# ==================== 声音生成与试听 API ====================
# 生成事件订阅缓存与历史记录（用于 SSE 推送与断线防丢回放）
generation_subscribers: dict[int, list[asyncio.Queue]] = {}
generation_event_history: dict[int, list[dict]] = {}
generation_lock = asyncio.Lock()
active_model = None
TERMINAL_STATUSES = {"completed", "partial", "failed"}

def ensure_no_active_jobs(db: Session, character_id: Optional[int] = None):
    query = db.query(GenerationBatch).filter(GenerationBatch.status.in_(["queued", "generating"]))
    if character_id is not None:
        query = query.filter(GenerationBatch.character_id == character_id)
    if query.first():
        raise HTTPException(409, "请等待当前生成任务结束后再删除或更改正式音色")

def delete_clip_records(db: Session, clips, character=None):
    """Stage local files, commit records, then remove the staged files."""
    import uuid
    staged = []
    try:
        for clip in clips:
            if clip.file_path:
                path = contained_path(settings.audio_dir, clip.file_path)
                if path.exists():
                    temporary = path.with_name(f".deleting-{clip.id}-{uuid.uuid4().hex}-{path.name}")
                    path.rename(temporary)
                    staged.append((path, temporary))
            if clip.character_id:
                char = db.get(Character, clip.character_id)
                if char and char.pinned_clip_id == clip.id:
                    char.pinned_clip_id = None
            db.delete(clip)
        if character:
            db.query(GenerationBatch).filter(GenerationBatch.character_id == character.id).delete()
            db.delete(character)
        db.commit()
    except Exception as exc:
        db.rollback()
        for original, temporary in reversed(staged):
            if temporary.exists():
                temporary.rename(original)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(500, "无法删除资产，请检查音频文件占用和目录权限") from exc
    for _, temporary in staged:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            print(f"[AssetCleanup] Deferred file cleanup: {temporary.name}")

def recover_staged_deletions(db: Session):
    for file in settings.audio_dir.glob(".deleting-*"):
        try:
            clip_id = int(file.name.split("-", 3)[1])
            clip = db.get(AuditionClip, clip_id)
            if clip:
                target = contained_path(settings.audio_dir, clip.file_path)
                if not target.exists():
                    file.rename(target)
                else:
                    file.unlink(missing_ok=True)
            else:
                file.unlink(missing_ok=True)
        except (ValueError, OSError, HTTPException) as exc:
            print(f"[AssetCleanup] Recovery failed: {exc}")

def recover_portable_paths(db: Session):
    for clip in db.query(AuditionClip).filter(AuditionClip.file_path.isnot(None)).all():
        if not clip.file_path:
            continue
        old = Path(clip.file_path)
        if not old.resolve().is_relative_to(settings.audio_dir.resolve()):
            local = contained_path(settings.audio_dir, old.name)
            if local.is_file():
                clip.file_path = str(local)
    db.commit()


def validate_pin(db: Session, clip_id: int, character_id: int):
    clip = db.query(AuditionClip).filter(AuditionClip.id == clip_id).first()
    if not clip or clip.character_id != character_id:
        raise HTTPException(404, "Candidate does not belong to this character")
    if clip.status != "completed" or not contained_path(settings.audio_dir, clip.file_path).is_file():
        raise HTTPException(409, "Only completed audio can be pinned")
    return clip

@app.post("/api/generate")
async def start_generation(req: GenerateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    character = db.get(Character, req.character_id) if req.character_id else None
    if req.character_id and not character:
        raise HTTPException(404, "Character not found")
    reference = None
    if req.reuse_pinned_voice:
        if not character or not character.pinned_clip_id:
            raise HTTPException(409, "请先为角色选择正式音色")
        reference = validate_pin(db, character.pinned_clip_id, character.id)
        if "Qwen3" in req.model_name and not model_downloader.is_model_downloaded("qwen3_tts_base"):
            raise HTTPException(409, "复用 Qwen 正式音色需要先下载 Qwen3-TTS Base 模型")
    if db.query(GenerationBatch).filter(GenerationBatch.status.in_(["queued", "generating"])).count() >= 10:
        raise HTTPException(429, "生成队列已满，请稍后重试")
    # 1. 前置严格检查模型是否存在且已下载就绪
    model_adapter = model_registry.get(req.model_name)
    if not model_adapter:
        raise HTTPException(status_code=400, detail=f"不支持的声音大模型: {req.model_name}")
    
    if not model_adapter.is_downloaded():
        raise HTTPException(
            status_code=400,
            detail=f"模型 '{req.model_name}' 权重尚未就绪，请先在向导中完成下载后再生成试听。"
        )

    # 候选数量约束在 1~10（默认 4 个，支持自定义 5~10 个）
    count = req.candidate_count

    batch = GenerationBatch(
        character_id=req.character_id,
        prompt=req.prompt,
        sample_text=req.sample_text,
        model_name=req.model_name,
        model_version=model_version(settings.models_dir / "qwen3_tts_base") if reference and "Qwen3" in req.model_name else model_adapter.model_version,
        candidate_count=count,
        status="queued",
        reference_clip_id=reference.id if reference else None
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # 预先创建各候选 clip 占位，状态为 pending
    clips = []
    from sqlalchemy import func
    existing_count = db.query(func.max(AuditionClip.candidate_index)).filter(
        AuditionClip.character_id == req.character_id).scalar() or 0

    for i in range(1, count + 1):
        seed = random.SystemRandom().randint(100000, 999999)
        clip = AuditionClip(
            batch_id=batch.id,
            character_id=req.character_id,
            candidate_index=existing_count + i,
            file_path="",
            model_name=req.model_name,
            model_version=model_adapter.model_version,
            seed=seed,
            prompt=req.prompt,
            sample_text=req.sample_text,
            status="pending"
        )
        db.add(clip)
        clips.append(clip)
    db.commit()

    # 初始化事件历史容器
    generation_event_history[batch.id] = []

    # 启动后台任务逐个生成候选
    background_tasks.add_task(run_generation_task, batch.id, count)

    return {
        "batch_id": batch.id,
        "candidate_count": count,
        "status": "started"
    }

async def run_generation_task(batch_id: int, count: int):
    async with generation_lock:
        await run_generation_serial(batch_id, count)

async def run_generation_serial(batch_id: int, count: int):
    global active_model
    db = SessionLocal()
    try:
        batch = db.query(GenerationBatch).filter(GenerationBatch.id == batch_id).first()
        if not batch:
            return
        batch.status = "generating"
        db.commit()
        reference = db.get(AuditionClip, batch.reference_clip_id) if batch.reference_clip_id else None
        clips = db.query(AuditionClip).filter(AuditionClip.batch_id == batch_id).order_by(AuditionClip.candidate_index.asc()).all()

        for idx, clip in enumerate(clips):
            # 广播：正在生成第 idx+1 个候选（口径：当前批次内的第 idx+1 个，总共 count 个）
            clip.status = "processing"
            db.commit()
            await notify_subscribers(batch_id, {
                "event": "clip_start",
                "batch_id": batch_id,
                "candidate_index": clip.candidate_index,
                "current": idx + 1,
                "total": count,
                "seed": clip.seed,
                "status": "processing"
            })

            audio_base = f"audition_{batch_id}_{clip.candidate_index}_{clip.seed}"
            output_path = settings.audio_dir / audio_base

            # 检索注册的声音模型适配器
            model = model_registry.get(clip.model_name)

            # 执行真实多候选语音生成（严禁模板 TTS 介入）
            try:
                if model is None:
                    raise RuntimeError("Unsupported generation model")
                if active_model is not None and active_model is not model:
                    await asyncio.to_thread(active_model.unload)
                active_model = model
                gen_res = await model.generate_single(
                    prompt=clip.prompt,
                    text=clip.sample_text,
                    seed=clip.seed,
                    output_path=output_path,
                    reference_audio=reference.file_path if reference else None,
                    reference_text=reference.sample_text if reference else None
                )

                actual_filename = os.path.basename(gen_res.audio_path)
                clip.file_path = gen_res.audio_path
                clip.duration_seconds = gen_res.duration_seconds
                clip.waveform_json = json.dumps(gen_res.waveform_data)
                clip.generation_time_ms = gen_res.elapsed_ms
                clip.status = "completed"
                clip.model_version = gen_res.model_version
                clip.model_name = gen_res.model_name
                batch.model_version = gen_res.model_version
                batch.model_name = gen_res.model_name
                clip.metadata_json = json.dumps(gen_res.metadata, ensure_ascii=False)
                db.commit()

                # 广播：第 idx+1 个候选生成完毕
                await notify_subscribers(batch_id, {
                    "event": "clip_complete",
                    "batch_id": batch_id,
                    "clip_id": clip.id,
                    "candidate_index": clip.candidate_index,
                    "current": idx + 1,
                    "total": count,
                    "audio_url": f"/static/audio/{actual_filename}",
                    "duration": clip.duration_seconds,
                    "waveform": gen_res.waveform_data,
                    "seed": clip.seed,
                    "model_name": clip.model_name,
                    "model_version": clip.model_version,
                    "generation_time_ms": gen_res.elapsed_ms,
                    "status": "completed"
                })
            except Exception as exc:
                print(f"[GenerationTask] Clip {clip.candidate_index} inference error: {exc}")
                clip.status = "failed"
                clip.error_message = str(exc)
                db.commit()
                await notify_subscribers(batch_id, {
                    "event": "clip_error",
                    "batch_id": batch_id,
                    "clip_id": clip.id,
                    "candidate_index": clip.candidate_index,
                    "current": idx + 1,
                    "total": count,
                    "error": str(exc),
                    "status": "failed"
                })

        # 检查批次完成状态
        any_success = db.query(AuditionClip).filter(
            AuditionClip.batch_id == batch_id,
            AuditionClip.status == "completed"
        ).first() is not None

        failures = any(c.status == "failed" for c in clips)
        batch.status = ("partial" if failures else "completed") if any_success else "failed"
        db.commit()
        await notify_subscribers(batch_id, {
            "event": "batch_complete",
            "batch_id": batch_id,
            "status": batch.status
        })
    except Exception as exc:
        db.rollback()
        batch = db.get(GenerationBatch, batch_id)
        if batch:
            batch.status = "failed"
            for clip in batch.clips:
                if clip.status in {"pending", "processing"}:
                    clip.status = "failed"
                    clip.error_message = str(exc)
            db.commit()
            await notify_subscribers(batch_id, {"event": "batch_complete", "batch_id": batch_id, "status": "failed"})
    finally:
        db.close()

async def notify_subscribers(batch_id: int, payload: dict):
    # 存入历史事件缓存，杜绝客户端建立连接稍晚导致的丢失
    if batch_id not in generation_event_history:
        generation_event_history[batch_id] = []
    generation_event_history[batch_id].append(payload)
    if len(generation_event_history) > 100:
        for old_id in list(generation_event_history):
            if old_id != batch_id and not generation_subscribers.get(old_id):
                del generation_event_history[old_id]
                if len(generation_event_history) <= 100:
                    break

    queues = generation_subscribers.get(batch_id, [])
    for q in queues:
        if not q.full():
            q.put_nowait(payload)

@app.get("/api/generate/{batch_id}/events")
async def generate_events_sse(batch_id: int):
    """Progress events with durable terminal-state recovery and heartbeat."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=64)

    # 1. 先即时回放所有已发生的历史事件
    history = generation_event_history.get(batch_id, [])
    for event in history:
        await queue.put(event)

    # 2. 数据库一致性检查：若 batch 已经处于 completed，补发 batch_complete
    db = SessionLocal()
    try:
        b = db.query(GenerationBatch).filter(GenerationBatch.id == batch_id).first()
        if not b:
            raise HTTPException(404, "Batch not found")
        if b.status in TERMINAL_STATUSES and not any(e.get("event") == "batch_complete" for e in history):
            await queue.put({"event": "batch_complete", "batch_id": batch_id, "status": b.status})
    finally:
        db.close()

    if batch_id not in generation_subscribers:
        generation_subscribers[batch_id] = []
    generation_subscribers[batch_id].append(queue)

    async def event_generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                yield f"data: {json.dumps(data)}\n\n"
                if data.get("event") == "batch_complete":
                    break
        finally:
            if batch_id in generation_subscribers and queue in generation_subscribers[batch_id]:
                generation_subscribers[batch_id].remove(queue)
                if not generation_subscribers[batch_id]:
                    del generation_subscribers[batch_id]

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})

@app.get("/api/generate/{batch_id}/status")
def get_batch_status(batch_id: int, db: Session = Depends(get_db)):
    """主动轮询批次状态接口，作为 SSE 的坚固双保险"""
    batch = db.query(GenerationBatch).filter(GenerationBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    clips = db.query(AuditionClip).filter(AuditionClip.batch_id == batch_id).order_by(AuditionClip.candidate_index.asc()).all()
    return {
        "batch_id": batch.id,
        "status": batch.status,
        "candidate_count": batch.candidate_count,
        "clips": [
            {
                "id": c.id,
                "candidate_index": c.candidate_index,
                "status": c.status,
                "audio_url": f"/static/audio/{os.path.basename(c.file_path)}" if c.file_path else "",
                "duration": c.duration_seconds,
                "waveform": json.loads(c.waveform_json) if c.waveform_json else [],
                "seed": c.seed,
                "model_name": c.model_name,
                "model_version": c.model_version,
                "generation_time_ms": c.generation_time_ms,
                "is_pinned": c.is_pinned,
                "error": c.error_message, "metadata": json.loads(c.metadata_json) if c.metadata_json else {}
            }
            for c in clips
        ]
    }

@app.get("/api/auditions")
def list_audition_clips(character_id: Optional[int] = Query(None), include_all: bool = Query(False), db: Session = Depends(get_db)):
    """获取试听音频列表（按生成时间正序排列，早期在前，最新在后）"""
    query = db.query(AuditionClip)
    if not include_all:
        if character_id is not None:
            query = query.filter(AuditionClip.character_id == character_id)
        else:
            query = query.filter(AuditionClip.character_id.is_(None))
    # 仅查询已完成且文件存在的有效试听候选，杜绝未完成占位污染历史列表
    query = query.filter(AuditionClip.status.in_(["completed", "failed", "pending", "processing"]))
    
    clips = query.order_by(AuditionClip.id.asc()).all()
    return [
        {
            "id": c.id,
            "batch_id": c.batch_id,
            "candidate_index": c.candidate_index,
            "status": c.status,
            "audio_url": f"/static/audio/{os.path.basename(c.file_path)}" if c.file_path else "",
            "duration": c.duration_seconds,
            "waveform": json.loads(c.waveform_json) if c.waveform_json else [],
            "seed": c.seed,
            "model_name": c.model_name,
            "model_version": c.model_version,
            "generation_time_ms": c.generation_time_ms,
            "is_pinned": c.is_pinned,
            "prompt": c.prompt,
            "sample_text": c.sample_text,
            "error": c.error_message, "metadata": json.loads(c.metadata_json) if c.metadata_json else {}
        }
        for c in clips
    ]

@app.delete("/api/auditions/{clip_id}")
def delete_audition_clip(clip_id: int, db: Session = Depends(get_db)):
    ensure_no_active_jobs(db)
    clip = db.get(AuditionClip, clip_id)
    if not clip:
        raise HTTPException(404, "Audition clip not found")
    delete_clip_records(db, [clip])
    return {"message": "Clip deleted successfully", "clip_id": clip_id}

@app.post("/api/auditions/batch-delete")
def batch_delete_auditions(req: BatchDeleteRequest, db: Session = Depends(get_db)):
    ensure_no_active_jobs(db)
    clips = db.query(AuditionClip).filter(AuditionClip.id.in_(req.clip_ids)).all()
    count = len(clips)
    delete_clip_records(db, clips)
    return {"message": "Clips deleted", "deleted_count": count}

@app.delete("/api/auditions")
def clear_auditions(character_id: Optional[int] = Query(None), include_all: bool = Query(False), db: Session = Depends(get_db)):
    ensure_no_active_jobs(db)
    query = db.query(AuditionClip)
    if not include_all:
        query = query.filter(AuditionClip.character_id == character_id)
    clips = query.all()
    count = len(clips)
    delete_clip_records(db, clips)
    return {"message": "Clips cleared", "deleted_count": count}


@app.post("/api/auditions/{clip_id}/pin")
def pin_audition_clip(clip_id: int, db: Session = Depends(get_db)):
    clip = db.query(AuditionClip).filter(AuditionClip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Audition clip not found")
    
    if not clip.character_id:
        raise HTTPException(409, "请先选择角色再设定正式音色")
    ensure_no_active_jobs(db, clip.character_id)
    validate_pin(db, clip.id, clip.character_id)
    # 找到关联角色
    if clip.character_id:
        char = db.query(Character).filter(Character.id == clip.character_id).first()
        if char:
            char.pinned_clip_id = clip.id
    
    # 将此 batch 内其他 clip 取消 pin，此 clip 设为 pin
    db.query(AuditionClip).filter(AuditionClip.character_id == clip.character_id).update({"is_pinned": False})
    clip.is_pinned = True
    db.commit()
    return {"message": "Clip pinned as active voice", "clip_id": clip.id}

@app.get("/api/auditions/{clip_id}/export")
def export_audition_clip(clip_id: int, db: Session = Depends(get_db)):
    """导出单个候选音频文件"""
    clip = db.query(AuditionClip).filter(AuditionClip.id == clip_id).first()
    if not clip or not clip.file_path or not os.path.exists(clip.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # 获取关联角色名，构造友好文件名
    char_name = "Voxera"
    if clip.character_id:
        char = db.query(Character).filter(Character.id == clip.character_id).first()
        if char and char.name:
            char_name = char.name

    safe_char_name = re.sub(r'[\\/*?:"<>|]', '_', char_name.strip())
    model_tag = "Qwen3" if "qwen" in (clip.model_name or "").lower() else ("VoxCPM2" if "cpm" in (clip.model_name or "").lower() else "Model")
    seed_tag = f"_seed{clip.seed}" if clip.seed is not None else ""
    idx_tag = f"candidate_{clip.candidate_index}" if clip.candidate_index else "clip"

    export_filename = f"{safe_char_name}_{idx_tag}_{model_tag}{seed_tag}.wav".replace("__", "_")
    return FileResponse(
        path=contained_path(settings.audio_dir, clip.file_path),
        filename=export_filename,
        media_type="audio/wav"
    )

@app.post("/api/auditions/export-zip")
def export_auditions_zip(req: ExportZipRequest, db: Session = Depends(get_db)):
    """将多个试听音频批量打包为 ZIP 文件流式导出"""
    query = db.query(AuditionClip).filter(
        (AuditionClip.status == "completed") & 
        (AuditionClip.file_path.isnot(None)) & 
        (AuditionClip.file_path != "")
    )

    if req.clip_ids and len(req.clip_ids) > 0:
        query = query.filter(AuditionClip.id.in_(req.clip_ids))
    elif req.character_id is not None:
        query = query.filter(AuditionClip.character_id == req.character_id)

    clips = query.all()
    valid_clips = [c for c in clips if os.path.exists(c.file_path)]

    if not valid_clips:
        raise HTTPException(status_code=404, detail="No audio files available to export")

    char_name = "Voxera_Batch"
    if req.character_id:
        char = db.query(Character).filter(Character.id == req.character_id).first()
        if char and char.name:
            char_name = f"Voxera_{re.sub(r'[\\/*?:\"<>|]', '_', char.name.strip())}"

    zip_buffer = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        used_names = set()
        for idx, c in enumerate(valid_clips):
            c_char_name = "Voxera"
            if c.character_id:
                ch = db.query(Character).filter(Character.id == c.character_id).first()
                if ch and ch.name:
                    c_char_name = ch.name
            safe_c_name = re.sub(r'[\\/*?:"<>|]', '_', c_char_name.strip())
            model_tag = "Qwen3" if "qwen" in (c.model_name or "").lower() else ("VoxCPM2" if "cpm" in (c.model_name or "").lower() else "Model")
            seed_tag = f"_seed{c.seed}" if c.seed is not None else ""
            
            entry_name = f"{safe_c_name}_cand_{idx + 1}_{model_tag}{seed_tag}.wav"
            dup_counter = 1
            final_entry_name = entry_name
            while final_entry_name in used_names:
                final_entry_name = f"{safe_c_name}_cand_{idx + 1}_{model_tag}{seed_tag}_{dup_counter}.wav"
                dup_counter += 1
            used_names.add(final_entry_name)

            zip_file.write(contained_path(settings.audio_dir, c.file_path), arcname=final_entry_name)

    zip_buffer.seek(0)
    zip_filename = f"{char_name}_{time.strftime('%Y%m%d_%H%M%S')}.zip"
    quoted_filename = urllib.parse.quote(zip_filename)

    def chunks():
        try:
            while chunk := zip_buffer.read(64 * 1024):
                yield chunk
        finally:
            zip_buffer.close()

    return StreamingResponse(
        chunks(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=\"{quoted_filename}\"; filename*=UTF-8''{quoted_filename}"
        }
    )

@app.get("/api/history")
def get_recent_batches(db: Session = Depends(get_db)):
    batches = db.query(GenerationBatch).order_by(GenerationBatch.created_at.desc()).limit(20).all()
    result = []
    for b in batches:
        clips = db.query(AuditionClip).filter(AuditionClip.batch_id == b.id).order_by(AuditionClip.candidate_index.asc()).all()
        result.append({
            "id": b.id,
            "character_id": b.character_id,
            "prompt": b.prompt,
            "sample_text": b.sample_text,
            "model_name": b.model_name,
            "model_version": b.model_version,
            "candidate_count": b.candidate_count,
            "status": b.status,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "clips": [
                {
                    "id": c.id,
                    "candidate_index": c.candidate_index,
                    "audio_url": f"/static/audio/{os.path.basename(c.file_path)}" if c.file_path else "",
                    "duration_seconds": c.duration_seconds,
                    "waveform": json.loads(c.waveform_json) if c.waveform_json else [],
                    "model_name": c.model_name,
                    "model_version": c.model_version,
                    "seed": c.seed,
                    "generation_time_ms": c.generation_time_ms,
                    "is_pinned": c.is_pinned,
                    "status": c.status
                }
                for c in clips
            ]
        })
    return result

# ==================== 前端静态资源服务 (便携版直接支持单端口) ====================
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "app" / "dist"

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    async def serve_index():
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Index file not found")

    @app.get("/{full_path:path}")
    async def serve_spa_or_file(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("static/"):
            raise HTTPException(status_code=404, detail="Endpoint not found")

        target_file = contained_path(FRONTEND_DIST, full_path)
        if target_file.is_file():
            return FileResponse(target_file)

        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

        raise HTTPException(status_code=404, detail="Page not found")

cleanup_zombie_clips()
with SessionLocal() as recovery_db:
    recover_portable_paths(recovery_db)
    recover_staged_deletions(recovery_db)

if __name__ == "__main__":
    import uvicorn
    app.state.server = uvicorn.Server(uvicorn.Config(app, host=settings.host, port=settings.port))
    app.state.server.run()
