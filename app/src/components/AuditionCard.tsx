import React, { useState, useRef } from 'react';
import { Language, translations } from '../i18n/translations';
import { AuditionCandidate, api, reportApiError } from '../lib/api';
import { Play, Pause, CheckCircle2, Cpu, Hash, Clock, Sparkles, Download, Check } from 'lucide-react';

interface AuditionCardProps {
  lang: Language;
  candidate: AuditionCandidate;
  displayIndex?: number;
  onPin: (id: number) => void;
  isPinned: boolean;
  canPin?: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (candidate: AuditionCandidate) => void;
}

export const AuditionCard: React.FC<AuditionCardProps> = ({
  lang,
  candidate,
  displayIndex,
  onPin,
  isPinned,
  canPin = true,
  isSelectionMode = false,
  isSelected,
  onToggleSelect
}) => {
  const t = translations[lang];
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!candidate.id || isExporting) return;
    try {
      setIsExporting(true);
      await api.exportAuditionClip(candidate.id);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      document.querySelectorAll('audio').forEach(audio => {
        if (audio !== audioRef.current) audio.pause();
      });
      audioRef.current.play().then(() => setIsPlaying(true)).catch(reportApiError);
    }
  };

  const handleCardClick = () => {
    if (isSelectionMode && candidate.id && onToggleSelect) {
      onToggleSelect(candidate);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  // 1. 生成中状态 (Processing Skeleton 流光动画)
  if (candidate.status === 'processing' || candidate.status === 'pending') {
    return (
      <div className="relative overflow-hidden rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08] p-4 flex flex-col justify-between h-48">
        {/* 流光渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/[0.04] dark:via-white/[0.05] to-transparent animate-shimmer" />

        <div className="flex items-center justify-between z-10">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 dark:border-blue-500/30 whitespace-nowrap flex-shrink-0">
              #{displayIndex ?? candidate.candidate_index}
            </span>
            <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 flex items-center whitespace-nowrap">
              <Sparkles className="w-3 h-3 mr-1 animate-spin text-blue-500 dark:text-blue-400" />
              {candidate.status === 'processing' ? t.generating : t.waiting}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {candidate.seed && (
              <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500 font-mono whitespace-nowrap">Seed: {candidate.seed}</span>
            )}
          </div>
        </div>

        {/* 骨架波形柱状图 */}
        <div className="flex items-end justify-between space-x-1 h-14 my-auto px-2 z-10 opacity-40">
          {Array.from({ length: 32 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-apple-gray-400 rounded-full animate-pulse"
              style={{
                height: `${20 + (i * 17) % 80}%`,
                animationDelay: `${i * 40}ms`
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between z-10 text-xs text-apple-gray-400">
          <div className="h-3 w-24 bg-black/5 dark:bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-12 bg-black/5 dark:bg-white/10 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (candidate.status === 'failed') {
    return (
      <div role="alert" className="rounded-2xl apple-glass-card p-4 min-h-[196px] border border-red-500/30 space-y-3">
        <p className="text-sm font-semibold text-apple-gray-900 dark:text-white">{t.candidateLabel.replace('{index}', String(displayIndex ?? candidate.candidate_index))}</p>
        <p className="text-sm text-red-700 dark:text-red-300">{t.generationFailed}</p>
        <p className="text-sm break-words text-apple-gray-600 dark:text-apple-gray-300">{candidate.error}</p>
      </div>
    );
  }

  // 2. 完成状态卡片
  return (
    <div
      onClick={handleCardClick}
      className={`rounded-2xl apple-glass-card p-4 flex flex-col justify-between min-h-[196px] transition-all relative ${
        isSelectionMode ? 'cursor-pointer select-none' : ''
      } ${
        isSelected
          ? 'ring-2 ring-blue-500 bg-blue-500/[0.05] dark:bg-blue-900/15 shadow-apple-card'
          : isPinned
          ? 'ring-2 ring-emerald-500 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-apple-glow'
          : isSelectionMode
          ? 'border border-black/[0.08] dark:border-white/10 hover:border-blue-400/60 dark:hover:border-blue-400/60'
          : 'border border-black/[0.06] dark:border-white/[0.08] hover:border-black/20 dark:hover:border-white/20'
      }`}
    >
      {candidate.audio_url && (
        <audio
          ref={audioRef}
          src={api.getAudioUrl(candidate.audio_url)}
          onEnded={handleAudioEnded}
          onPause={() => setIsPlaying(false)}
          onError={() => reportApiError(new Error(lang === 'zh' ? '音频无法播放，请检查文件是否存在。' : 'Audio could not be played. Check that the file exists.'))}
          className="hidden"
        />
      )}

      {/* 顶栏：左侧[勾选圈(管理态) + 候选序号 + 设为音色/正式音色]，右侧[导出右对齐] */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
          {/* 勾选圈（仅在批量管理模式下呈现） */}
          {isSelectionMode && candidate.id && onToggleSelect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(candidate);
              }}
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all flex-shrink-0 animate-fadeIn ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-apple-sm scale-105'
                  : 'border-black/20 dark:border-white/25 hover:border-blue-500 dark:hover:border-blue-400 bg-black/5 dark:bg-white/5'
              }`}
              title={isSelected ? t.deselectAll : t.selectAll}
            >
              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </button>
          )}

          {/* 候选序号标签 */}
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-apple-gray-800 dark:text-white border border-black/10 dark:border-white/10 whitespace-nowrap flex-shrink-0">
            {t.candidateLabel.replace('{index}', String(displayIndex ?? candidate.candidate_index))}
          </span>

          {/* 设为正式音色 紧跟候选标签后面！ */}
          {isPinned ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 dark:border-emerald-500/40 font-medium flex items-center space-x-1 whitespace-nowrap flex-shrink-0 shadow-apple-sm">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>{t.pinned}</span>
            </span>
          ) : candidate.id ? (
            <button
              type="button"
              disabled={!canPin}
              onClick={(e) => {
                e.stopPropagation();
                if (canPin) onPin(candidate.id!);
              }}
              className="text-xs px-2.5 py-0.5 rounded-full apple-glass-interactive text-apple-gray-600 dark:text-apple-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-black/[0.06] dark:border-white/10 transition-all font-medium flex items-center space-x-1 whitespace-nowrap shadow-apple-sm active:scale-95 flex-shrink-0"
              title={t.pinAsActiveVoice}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{t.pinAsActiveVoice}</span>
            </button>
          ) : null}
        </div>

        {/* 导出按钮：纯图标右对齐，轻盈极简 */}
        {candidate.id && (
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="w-7 h-7 rounded-lg apple-glass-interactive text-apple-gray-600 dark:text-apple-gray-300 hover:text-blue-500 dark:hover:text-blue-400 border border-black/[0.06] dark:border-white/10 transition-all flex items-center justify-center shadow-apple-sm active:scale-95 flex-shrink-0 ml-auto"
            title={isExporting ? t.exporting : t.exportAudio}
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-pulse' : ''}`} />
          </button>
        )}
      </div>

      {/* 中部：播放按钮与模拟波形可视化 */}
      <div className="flex items-center space-x-3 my-auto py-2.5">
        <button
          onClick={togglePlay}
          aria-label={lang === 'zh' ? (isPlaying ? '暂停试听' : '播放试听') : (isPlaying ? 'Pause audition' : 'Play audition')}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-apple-sm flex-shrink-0 transition-transform active:scale-95"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        {/* 伪波形条（支持视觉播放动效） */}
        <div className="flex-1 flex items-end space-x-0.5 h-10 overflow-hidden cursor-pointer" onClick={togglePlay}>
          {(candidate.waveform || Array.from({ length: 36 }).map((_, i) => (Math.sin(i) + 1.2) / 2.4)).slice(0, 36).map((val, idx) => (
            <div
              key={idx}
              className={`flex-1 rounded-full transition-all duration-150 ${
                isPlaying ? 'bg-blue-500 dark:bg-blue-400' : isPinned ? 'bg-emerald-500/80 dark:bg-emerald-400/80' : 'bg-apple-gray-300 hover:bg-apple-gray-400 dark:bg-apple-gray-400/60 dark:hover:bg-white'
              }`}
              style={{
                height: isPlaying ? `${Math.max(15, (val * 100 * (1 + Math.sin(Date.now() / 200 + idx)))) % 100}%` : `${Math.max(12, val * 100)}%`
              }}
            />
          ))}
        </div>
      </div>

      {/* 底栏：纯粹元数据展示（两端舒展分布，绝不塞多余按钮） */}
      <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-xs text-apple-gray-500 dark:text-apple-gray-300">
        {/* 左侧：模型标识 */}
        <div className="flex items-center space-x-1.5 truncate min-w-0">
          <Cpu className="w-3 h-3 text-apple-gray-400 dark:text-apple-gray-500 flex-shrink-0" />
          <span className="text-apple-gray-800 dark:text-white/80 font-medium truncate max-w-[140px]">{candidate.model_name || 'Qwen3-TTS'}</span>
        </div>

        {/* 右侧：种子与耗时 */}
        <div className="flex items-center space-x-2.5 flex-shrink-0 font-mono text-xs">
          {candidate.seed && (
            <span className="flex items-center space-x-0.5 text-apple-gray-500 dark:text-apple-gray-300" title={t.seed}>
              <Hash className="w-2.5 h-2.5" />
              <span>{candidate.seed}</span>
            </span>
          )}
          {candidate.generation_time_ms !== undefined && (
            <span className="flex items-center space-x-0.5 text-apple-gray-500 dark:text-apple-gray-300" title={t.elapsedTime}>
              <Clock className="w-2.5 h-2.5" />
              <span>{(candidate.generation_time_ms / 1000).toFixed(1)}s</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
