import datetime

def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)

from typing import Optional
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Character(Base):
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, index=True)
    avatar = Column(String(255), nullable=True)  # 头像 emoji 或本地图片路径
    voice_description = Column(Text, nullable=False)  # 角色声音 Prompt 描述
    sample_text = Column(Text, nullable=False)        # 默认试听台词
    tags = Column(String(255), default="")            # 标签（如：青年、清冽、动漫）
    pinned_clip_id = Column(Integer, nullable=True)   # 当前选定的正式音色候选 ID
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    clips = relationship("AuditionClip", back_populates="character", cascade="all, delete-orphan")

class GenerationBatch(Base):
    __tablename__ = "generation_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)
    prompt = Column(Text, nullable=False)
    sample_text = Column(Text, nullable=False)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    candidate_count = Column(Integer, default=4)  # 1 ~ 10
    reference_clip_id = Column(Integer, nullable=True)
    status = Column(String(30), default="pending") # pending, generating, completed, failed
    created_at = Column(DateTime, default=utc_now)

    clips = relationship("AuditionClip", back_populates="batch", cascade="all, delete-orphan")

class AuditionClip(Base):
    __tablename__ = "audition_clips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("generation_batches.id"), nullable=False)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)
    candidate_index = Column(Integer, default=1)  # 角色的连续候选编号
    
    file_path = Column(String(500), nullable=False)
    duration_seconds = Column(Float, default=0.0)
    waveform_json = Column(Text, nullable=True)   # 采样点波形数组 JSON，前端无需每次重新全量计算
    
    # 核心元数据（满足用户对模型、版本、复现性的严格要求）
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    seed = Column(Integer, nullable=False)
    generation_time_ms = Column(Integer, default=0) # 耗时毫秒
    
    prompt = Column(Text, nullable=False)
    sample_text = Column(Text, nullable=False)
    
    is_pinned = Column(Boolean, default=False)     # 是否定型为角色的正式音色
    status = Column(String(30), default="completed") # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    character = relationship("Character", back_populates="clips")
    batch = relationship("GenerationBatch", back_populates="clips")

class AppConfigItem(Base):
    __tablename__ = "app_configs"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
