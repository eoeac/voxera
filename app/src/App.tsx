import React, { useState, useEffect, useRef, useCallback } from 'react';
import { translations, Language } from './i18n/translations';
import { api, HardwareReport, NetworkProfile, CharacterItem, AuditionCandidate, ModelInfo } from './lib/api';
import { TopNav } from './components/TopNav';
import { CharacterSidebar } from './components/CharacterSidebar';
import { AuditionCard } from './components/AuditionCard';
import { SetupWizardModal } from './components/SetupWizardModal';
import { SettingsModal } from './components/SettingsModal';
import { Sparkles, Wand2, Volume2, Trash2, ChevronUp, ChevronDown, Download, Check, CheckSquare } from 'lucide-react';

export const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('voxera_lang');
      if (saved === 'zh' || saved === 'en') return saved;
    } catch {}
    return 'en';
  });
  const t = translations[lang];
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [reusePinnedVoice, setReusePinnedVoice] = useState(false);
  const subscriptions = useRef(new Map<number, () => void>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const watchers = subscriptions.current;
    const onError = (event: Event) => setErrorMessage((event as CustomEvent<string>).detail);
    window.addEventListener('voxera-error', onError);
    return () => {
      mounted.current = false;
      window.removeEventListener('voxera-error', onError);
      watchers.forEach(close => close());
      watchers.clear();
    };
  }, []);

  // 主题状态：默认暗色模式，支持持久化存储记忆
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('voxera_theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    }
    return 'dark';
  });

  // 同步主题至 document.documentElement 的 class 属性及 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('voxera_theme', theme);
    } catch {}
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 硬件与网络状态
  const [hardware, setHardware] = useState<HardwareReport | null>(null);
  const [network, setNetwork] = useState<NetworkProfile | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);

  // 首次运行专属欢迎向导 (Onboarding)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    try {
      const completed = localStorage.getItem('voxera_onboarding_completed');
      return !completed;
    } catch {
      return false;
    }
  });

  // 日常系统设置与诊断面板 (Settings)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleCompleteOnboarding = () => {
    try {
      localStorage.setItem('voxera_onboarding_completed', 'true');
    } catch {}
    setIsOnboardingOpen(false);
  };

  // 角色列表与选定
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharacterItem | null>(null);

  // 表单状态（优先读取本地持久化草稿，无缓存时基于多语言字典优雅初始化）
  const [voiceDescription, setVoiceDescription] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('voxera_voice_description');
      if (cached !== null) return cached;
    } catch {}
    return translations[lang].defaultVoiceDescription;
  });

  const [sampleText, setSampleText] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('voxera_sample_text');
      if (cached !== null) return cached;
    } catch {}
    return translations[lang].defaultSampleText;
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('voxera_selected_model');
      if (cached) return cached;
    } catch {}
    return 'Qwen3-TTS 1.7B VoiceDesign';
  });

  const [candidateCount, setCandidateCount] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('voxera_candidate_count');
      if (cached) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) return parsed;
      }
    } catch {}
    return 4; // 默认 4 个候选
  });

  // 监听表单与配置变更，实时自动持久化草稿到本地存储，避免刷新时丢失
  useEffect(() => {
    try {
      localStorage.setItem('voxera_voice_description', voiceDescription);
    } catch {}
  }, [voiceDescription]);

  useEffect(() => {
    try {
      localStorage.setItem('voxera_sample_text', sampleText);
    } catch {}
  }, [sampleText]);

  useEffect(() => {
    try {
      localStorage.setItem('voxera_selected_model', selectedModel);
    } catch {}
  }, [selectedModel]);

  useEffect(() => {
    try {
      localStorage.setItem('voxera_candidate_count', candidateCount.toString());
    } catch {}
  }, [candidateCount]);

  // 当前选定模型的离线就绪与下载状态
  const currentModel = models.find((m) => m.name === selectedModel || m.id === selectedModel);
  const isModelReady = isConnected && Boolean(currentModel?.is_downloaded);
  const isModelDownloading = currentModel?.status === 'downloading';

  // 确保当前选中的模型始终为已上线的可用状态
  useEffect(() => {
    if (models.length > 0 && (!currentModel || currentModel.is_available === false || currentModel.is_auxiliary)) {
      setSelectedModel('Qwen3-TTS 1.7B VoiceDesign');
    }
  }, [currentModel, models.length]);

  // 生成状态与候选卡片列表
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<number>>(new Set());
  const [currentStepInfo, setCurrentStepInfo] = useState<{ current: number; total: number } | null>(null);
  const [candidates, setCandidates] = useState<AuditionCandidate[]>([]);

  // 响应语言变化，持久化并更新 HTML 网页标题与语言属性
  useEffect(() => {
    try {
      localStorage.setItem('voxera_lang', lang);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = `${t.appTitle} - ${t.appSubtitle}`;
    }
  }, [lang, t]);

  const watchBatch = useCallback((batchId: number) => {
    if (!mounted.current) return;
    if (subscriptions.current.has(batchId)) return;
    setIsGenerating(true);
    const close = api.subscribeGenerationEvents(batchId, event => {
      if (event.event !== 'batch_status') return;
      const clips: AuditionCandidate[] = event.clips.map((clip: AuditionCandidate) => ({ ...clip, batch_id: batchId }));
      setCandidates(previous => [...previous.filter(clip => clip.batch_id !== batchId), ...clips]);
      const complete = clips.filter(clip => ['completed', 'failed'].includes(clip.status)).length;
      setCurrentStepInfo({ current: Math.min(complete + 1, event.candidate_count), total: event.candidate_count });
    }, () => {
      subscriptions.current.delete(batchId);
      setIsGenerating(subscriptions.current.size > 0);
      setCurrentStepInfo(null);
    });
    subscriptions.current.set(batchId, close);
  }, []);

  const fetchInitialData = useCallback(async () => {
    setIsConnecting(true);
    setErrorMessage('');
    try {
      const [chars, mdl] = await Promise.all([api.getCharacters(), api.getModels()]);
      if (!mounted.current) return;
      setCharacters(chars);
      setModels(mdl);
      setIsConnected(true);
      void Promise.all([api.getHardware(), api.getNetwork()]).then(([hw, net]) => {
        if (!mounted.current) return;
        setHardware(hw); setNetwork(net);
      }).catch(() => {});
      let savedId: string | null = null;
      try { savedId = localStorage.getItem('voxera_selected_char_id'); } catch {}
      const character = chars.find(item => String(item.id) === savedId) || chars[0] || null;
      setSelectedChar(character);
      const clips = await api.getAuditions(character?.id);
      if (!mounted.current) return;
      setCandidates(clips);
      const batches = new Set(clips.filter(clip => ['pending', 'processing'].includes(clip.status))
        .map(clip => clip.batch_id).filter((id): id is number => id !== undefined));
      batches.forEach(watchBatch);
    } catch {
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [watchBatch]);

  useEffect(() => { void fetchInitialData(); }, [fetchInitialData]);

  const hasActiveDownloads = models.some(model => model.status === 'downloading');
  useEffect(() => {
    if (!hasActiveDownloads) return;
    let stopped = false;
    const timer = setInterval(() => {
      void api.getModels().then(updated => {
        if (!stopped) {
          setModels(updated);
          const failed = updated.find(model => model.status === 'failed' && model.error);
          if (failed?.error) setErrorMessage(failed.error);
        }
      }).catch(() => {});
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [hasActiveDownloads]);

  const handleDownloadModel = async (modelKey: string, source?: string) => {
    try {
      await api.downloadModel(modelKey, source);
      setModels(prev => prev.map(m => m.id === modelKey ? { ...m, status: 'downloading', percentage: 0 } : m));
      
    } catch (e) {
      console.error('Failed to trigger model download', e);
    }
  };

  const handleSetLang = (nextLang: Language) => {
    const oldT = translations[lang];
    const newT = translations[nextLang];

    // 若当前未选定特定角色，且文本属于系统默认值，智能同步为新语言对应文本
    if (!selectedChar) {
      const isDefaultPrompt = voiceDescription === oldT.defaultVoiceDescription;
      const isDefaultSample = sampleText === oldT.defaultSampleText;

      if (isDefaultPrompt) {
        setVoiceDescription(newT.defaultVoiceDescription);
      }
      if (isDefaultSample) {
        setSampleText(newT.defaultSampleText);
      }
    }

    setLang(nextLang);
  };

  const handleToggleLang = () => handleSetLang(lang === 'zh' ? 'en' : 'zh');

  const handleSelectCharacter = async (char: CharacterItem) => {
    if (isGenerating) return;
    setReusePinnedVoice(false);
    setSelectedChar(char);
    setVoiceDescription(char.voice_description);
    setSampleText(char.sample_text);
    try {
      localStorage.setItem('voxera_selected_char_id', char.id.toString());
      localStorage.setItem('voxera_voice_description', char.voice_description);
      localStorage.setItem('voxera_sample_text', char.sample_text);
    } catch {}
    try {
      const clips = await api.getAuditions(char.id);
      setCandidates(clips);
      setSelectedClipIds(new Set());
      setIsSelectionMode(false);
    } catch (e) {
      console.error('Failed to load auditions for character', e);
    }
  };

  const handleCreateCharacter = async (data: { name: string; voice_description: string; sample_text: string; tags: string }) => {
    try {
      await api.createCharacter(data);
      const chars = await api.getCharacters();
      setCharacters(chars);
      if (chars.length > 0) {
        const created = chars[0];
        handleSelectCharacter(created);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDeleteCharacter = async (id: number) => {
    try {
      await api.deleteCharacter(id);
      const updated = characters.filter((c) => c.id !== id);
      setCharacters(updated);
      if (selectedChar?.id === id) {
        if (updated[0]) await handleSelectCharacter(updated[0]);
        else { setSelectedChar(null); setCandidates([]); setReusePinnedVoice(false); }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 自定义候选数量上下步进微调（支持键盘上下键与外置微型 Stepper）
  const stepCustomCandidateCount = (delta: number) => {
    setCandidateCount((prev) => {
      if (delta > 0) {
        // 向上步进：从 <=4 直接跳入 5，最高至 10
        if (prev <= 4) return 5;
        return Math.min(10, prev + 1);
      } else {
        // 向下步进：降到 5 以下时自动安全回退至默认 4
        if (prev <= 5) return 4;
        return Math.max(4, prev - 1);
      }
    });
  };

  const handleCustomCountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepCustomCandidateCount(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepCustomCandidateCount(-1);
    }
  };

  // 触发 1~4 候选声音设计生成（严格保留历史生成的声音，新批次前置展示）
  const handleStartGeneration = async () => {
    if (isGenerating || !isModelReady || !voiceDescription.trim() || !sampleText.trim()) return;
    setErrorMessage('');
    setIsGenerating(true);
    try {
      const resp = await api.startGeneration({
        character_id: selectedChar?.id, prompt: voiceDescription, sample_text: sampleText,
        model_name: selectedModel, candidate_count: candidateCount, reuse_pinned_voice: reusePinnedVoice,
      });
      watchBatch(resp.batch_id);
    } catch {
      setIsGenerating(false);
    }
  };

  const handlePinClip = async (clipId: number) => {
    try {
      await api.pinClip(clipId);
      setCandidates((prev) =>
        prev.map((c) => ({
          ...c,
          is_pinned: c.id === clipId
        }))
      );
      // 刷新角色状态
      const chars = await api.getCharacters();
      setCharacters(chars);
      setSelectedChar(current => chars.find(char => char.id === current?.id) || null);
    } catch (e) {
      console.error(e);
    }
  };

  const completedCandidates = candidates.filter((c) => c.id && c.status === 'completed');
  const completedIds = completedCandidates.map((c) => c.id as number);
  const isAllSelected = completedIds.length > 0 && selectedClipIds.size === completedIds.length;

  const handleToggleSelectCandidate = (cand: AuditionCandidate) => {
    if (!cand.id) return;
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(cand.id!)) {
        next.delete(cand.id!);
      } else {
        next.add(cand.id!);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (completedIds.length === 0) return;
    if (isAllSelected) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(completedIds));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedClipIds.size === 0 || isDeletingBatch) return;
    const count = selectedClipIds.size;
    const isClearingAll = count === completedIds.length;
    const confirmMsg = isClearingAll
      ? t.confirmBatchClearAll.replace('{total}', String(count))
      : t.confirmDeleteSelected.replace('{count}', String(count));

    if (!window.confirm(confirmMsg)) return;
    const idsToDelete = Array.from(selectedClipIds);
    try {
      setIsDeletingBatch(true);
      await api.batchDeleteAuditionClips(idsToDelete);
      setCandidates((prev) => prev.filter((c) => !c.id || !selectedClipIds.has(c.id)));
      setSelectedClipIds(new Set());
      if (isClearingAll) {
        setIsSelectionMode(false);
      }
      const chars = await api.getCharacters();
      setCharacters(chars);
    } catch (e) {
      console.error('Batch delete error', e);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleExportSelected = async () => {
    if (selectedClipIds.size === 0 || isExportingAll) return;
    const idsToExport = Array.from(selectedClipIds);
    try {
      setIsExportingAll(true);
      await api.exportAuditionZip(idsToExport, selectedChar?.id);
    } catch (e) {
      console.error('Export selected error', e);
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportAll = async () => {
    const completedIds = candidates
      .filter((c) => c.id && c.status === 'completed')
      .map((c) => c.id as number);
    if (completedIds.length === 0 || isExportingAll) return;
    try {
      setIsExportingAll(true);
      await api.exportAuditionZip(completedIds, selectedChar?.id);
    } catch (e) {
      console.error('Export all error', e);
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F7] dark:bg-[#0A0A0C] text-apple-gray-900 dark:text-white select-none transition-colors duration-200">
      {/* 顶部导航 */}
      <TopNav
        lang={lang}
        onToggleLang={handleToggleLang}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        hardware={hardware}
        network={network}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 主界面二分布局：左侧角色列表，右侧主工作台 */}
      <div className="flex flex-1 overflow-hidden">
        <CharacterSidebar
          lang={lang}
          characters={characters}
          selectedChar={selectedChar}
          onSelectCharacter={handleSelectCharacter}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          disabled={isGenerating}
        />

        {/* 核心工作台 */}
        <main className="flex-1 min-w-0 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3 text-sm text-red-700 dark:text-red-300">
              <p className="flex-1 break-words">{errorMessage}</p>
              <button onClick={fetchInitialData} disabled={isGenerating || isConnecting} className="px-3 py-2 rounded-lg apple-glass-interactive">{t.reconnect}</button>
              <button onClick={() => setErrorMessage('')} aria-label={t.dismissError} className="px-3 py-2">×</button>
            </div>
          )}
          {!isConnected && <p role="status" className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{isConnecting ? t.connectingEngine : t.engineDisconnected}</p>}
          {selectedChar?.pinned_clip && (
            <label className="flex items-center gap-3 text-sm text-apple-gray-800 dark:text-apple-gray-200">
              <input type="checkbox" checked={reusePinnedVoice} disabled={isGenerating} onChange={event => setReusePinnedVoice(event.target.checked)} />
              <span>{t.reusePinnedVoice}</span>
            </label>
          )}
          {/* 1. 声音设计面板 (Prompt & Sample Script) */}
          <div className="apple-glass rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-apple-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-apple-gray-900 dark:text-white">{t.generateTitle}</h2>
                  <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300">
                    {selectedChar ? t.exploringForCharacter.replace('{name}', selectedChar.name) : t.designingVoicePrompt}
                  </p>
                </div>
              </div>

              {/* 模型选择器与状态药丸徽标 */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300">{t.modelEngine}:</span>
                <div className="flex items-center space-x-2">
                  <select
                    aria-label={t.modelEngine}
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-xs px-3 py-1.5 rounded-xl apple-glass-interactive text-apple-gray-900 dark:text-white border border-black/[0.08] dark:border-white/10 focus:outline-none cursor-pointer"
                  >
                    {models.length > 0 ? (
                      models.filter(m => !m.is_auxiliary).map((m) => (
                        <option
                          key={m.id}
                          value={m.name}
                          disabled={m.is_available === false}
                          className="bg-white dark:bg-[#1C1C1E] text-apple-gray-900 dark:text-white disabled:text-apple-gray-400 dark:disabled:text-apple-gray-500"
                        >
                          {m.name}{m.is_available === false ? ` (${t.modelComingSoon})` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Qwen3-TTS 1.7B VoiceDesign" className="bg-white dark:bg-[#1C1C1E] text-apple-gray-900 dark:text-white">
                          Qwen3-TTS 1.7B VoiceDesign
                        </option>
                        <option value="VoxCPM2 2B" className="bg-white dark:bg-[#1C1C1E] text-apple-gray-900 dark:text-white">
                          VoxCPM2 2B
                        </option>
                      </>
                    )}
                  </select>

                  {/* 状态指示 Badge */}
                  {!isConnected ? (<span className="text-sm text-apple-gray-500 dark:text-apple-gray-300">{isConnecting ? t.connectingEngine : t.engineDisconnected}</span>) : currentModel?.is_available === false ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-apple-gray-600 dark:text-apple-gray-300 border border-black/10 dark:border-white/10 flex items-center space-x-1 whitespace-nowrap">
                      <span>{t.modelComingSoon}</span>
                    </span>
                  ) : isModelReady ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center space-x-1 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                      <span>{t.modelReady}</span>
                    </span>
                  ) : isModelDownloading ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center space-x-1 whitespace-nowrap animate-pulse">
                      <Sparkles className="w-3 h-3 animate-spin" />
                      <span>{t.modelDownloading} {Math.round(currentModel?.percentage || 0)}%</span>
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center space-x-1 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                      <span>{t.modelNotDownloaded}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 输入区：声音特征描述 (Prompt) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">
                  {t.voiceDescriptionLabel}
                </label>
                <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300">
                  {t.promptLangHint}
                </span>
              </div>
              <textarea
                aria-label={t.voiceDescriptionLabel}
                maxLength={2000}
                rows={3}
                value={voiceDescription}
                onChange={(e) => setVoiceDescription(e.target.value)}
                placeholder={t.voiceDescriptionPlaceholder}
                className="w-full text-xs px-3.5 py-2.5 rounded-2xl bg-white/60 dark:bg-black/40 border border-black/[0.08] dark:border-white/10 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 dark:placeholder-apple-gray-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40 transition-all leading-relaxed resize-none shadow-apple-sm dark:shadow-none"
              />
            </div>

            {/* 输入区：试听台词 (Sample Text) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">
                {t.sampleTextLabel}
              </label>
              <input
                type="text"
                aria-label={t.sampleTextLabel}
                maxLength={5000}
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder={t.sampleTextPlaceholder}
                className="w-full text-xs px-3.5 py-2 rounded-xl bg-white/60 dark:bg-black/40 border border-black/[0.08] dark:border-white/10 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 dark:placeholder-apple-gray-500 focus:outline-none focus:border-blue-500/60 transition-all shadow-apple-sm dark:shadow-none"
              />
            </div>

            {/* 底栏：候选数量选择器 (1~4) 与生成主按钮 */}
            <div className="pt-2 flex items-center justify-between border-t border-black/[0.06] dark:border-white/[0.06]">
              {/* 候选数量 Pills (1-4) 及自定义输入 (5-10) */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">{t.candidateCountLabel}:</span>
                <div className="flex items-center p-1 rounded-xl apple-glass-card border border-black/[0.06] dark:border-white/10 space-x-1">
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCandidateCount(num)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                        candidateCount === num
                          ? 'bg-blue-600 text-white shadow-apple-sm'
                          : 'text-apple-gray-600 hover:text-apple-gray-900 dark:text-apple-gray-300 dark:hover:text-white'
                      }`}
                    >
                      {lang === 'zh'
                        ? `${num} ${t.candidateUnitSingular}`
                        : `${num} ${num === 1 ? t.candidateUnitSingular : t.candidateUnitPlural}`}
                    </button>
                  ))}

                  <div className="h-3.5 w-[1px] bg-black/10 dark:bg-white/10 mx-1" />

                  {/* 自定义数量输入框 (5~10) 搭配微型 Stepper 与键盘上下键响应 */}
                  <div className="flex items-center space-x-1.5 px-1">
                    <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 whitespace-nowrap">{t.customCandidateLabel}:</span>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        aria-label={t.customCandidateLabel}
                        min={1}
                        max={10}
                        step={1}
                        value={candidateCount > 4 ? candidateCount : ''}
                        placeholder="5-10"
                        onKeyDown={handleCustomCountKeyDown}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setCandidateCount(Math.min(10, Math.max(1, val)));
                          } else if (e.target.value === '') {
                            setCandidateCount(4);
                          }
                        }}
                        className={`w-16 text-left pl-2.5 pr-5 text-xs py-1 rounded-lg transition-all ${
                          candidateCount > 4
                            ? 'border-blue-500/80 text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/10'
                            : 'border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/40 text-apple-gray-800 dark:text-apple-gray-300 focus:border-blue-500/60'
                        } border focus:outline-none`}
                      />
                      {/* 微型上下微调按钮组 (点击灵敏，完美支持暗黑/明亮双模式) */}
                      <div className="absolute right-1 flex flex-col justify-center space-y-0.5 pointer-events-auto">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => stepCustomCandidateCount(1)}
                          className="text-apple-gray-500 hover:text-apple-gray-900 hover:bg-black/5 dark:text-apple-gray-300 dark:hover:text-white dark:hover:bg-white/10 rounded transition-colors p-0.5"
                          title={lang === 'zh' ? '增加候选' : 'Increase candidates'}
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => stepCustomCandidateCount(-1)}
                          className="text-apple-gray-500 hover:text-apple-gray-900 hover:bg-black/5 dark:text-apple-gray-300 dark:hover:text-white dark:hover:bg-white/10 rounded transition-colors p-0.5"
                          title={lang === 'zh' ? '减少候选' : 'Decrease candidates'}
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 whitespace-nowrap">{t.candidateUnitSingular}</span>
                  </div>
                </div>
              </div>

              {/* 主操作按钮：模型未就绪时引导下载，已就绪时允许生成 */}
              {!isModelReady ? (
                <button
                  type="button"
                  onClick={() => { if (!isConnected) void fetchInitialData(); else if (currentModel) void handleDownloadModel(currentModel.id); }}
                  disabled={isModelDownloading || isConnecting}
                  className={`px-6 py-2.5 rounded-2xl text-xs font-semibold flex items-center space-x-2 transition-all shadow-apple-sm active:scale-95 ${
                    isModelDownloading
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 cursor-wait'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-apple-glow'
                  }`}
                >
                  {isModelDownloading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin text-blue-400" />
                      <span>{t.downloadingModel} {Math.round(currentModel?.percentage || 0)}%</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>{!isConnected ? (isConnecting ? t.connectingEngine : t.reconnect) : `${t.downloadModelWeights} (${currentModel?.size_display})`}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleStartGeneration}
                  disabled={isConnecting || isGenerating || !isConnected || !voiceDescription.trim() || !sampleText.trim()}
                  className={`px-6 py-2.5 rounded-2xl text-xs font-semibold flex items-center space-x-2 transition-all shadow-apple-sm active:scale-95 ${
                    isGenerating || !isConnected || !voiceDescription.trim() || !sampleText.trim()
                      ? 'bg-black/10 dark:bg-apple-gray-700 text-apple-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-apple-glow'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>
                    {isGenerating
                      ? currentStepInfo
                        ? t.generatingStep.replace('{current}', String(currentStepInfo.current)).replace('{total}', String(currentStepInfo.total))
                        : t.generating
                      : t.startGeneration}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 2. 候选比对与试听区域 (自适应响应式网格) */}
          <div className="space-y-3">
            {isSelectionMode ? (
              /* 批量管理专用工具栏 (Apple 风格轻盈胶囊条) */
              <div className="flex items-center justify-between p-2 px-3.5 rounded-2xl apple-glass-card border border-blue-500/30 bg-blue-500/[0.04] dark:bg-blue-900/10 shadow-apple-sm animate-fadeIn">
                {/* 左侧：全选与计数比例 */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleSelectAll}
                    className="text-xs font-medium text-apple-gray-700 hover:text-blue-600 dark:text-apple-gray-200 dark:hover:text-white flex items-center space-x-1.5 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap active:scale-95"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                        isAllSelected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-apple-sm'
                          : 'border-black/30 dark:border-white/40 bg-white/50 dark:bg-black/20'
                      }`}
                    >
                      {isAllSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span>{isAllSelected ? t.deselectAll : t.selectAll}</span>
                  </button>

                  <div className="h-3 w-px bg-black/10 dark:bg-white/15" />

                  {/* 选区计数比例提示 */}
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {t.selectedCountFraction
                      .replace('{current}', String(selectedClipIds.size))
                      .replace('{total}', String(completedIds.length))}
                  </span>
                </div>

                {/* 右侧：批量动作与完成退出按钮 */}
                <div className="flex items-center space-x-2">
                  {/* 导出所选 */}
                  <button
                    onClick={handleExportSelected}
                    disabled={selectedClipIds.size === 0 || isExportingAll}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                      selectedClipIds.size > 0
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-apple-sm active:scale-95'
                        : 'bg-black/5 dark:bg-white/5 text-apple-gray-400 dark:text-apple-gray-500 cursor-not-allowed border border-transparent'
                    }`}
                    title={t.exportSelected}
                  >
                    <Download className={`w-3 h-3 ${isExportingAll ? 'animate-pulse' : ''}`} />
                    <span>{isExportingAll ? t.exporting : `${t.exportSelected} (${selectedClipIds.size})`}</span>
                  </button>

                  {/* 删除所选（全选时为清空全部） */}
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedClipIds.size === 0 || isDeletingBatch}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                      selectedClipIds.size > 0
                        ? 'bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white dark:text-red-400 dark:hover:text-white border border-red-500/30 shadow-apple-sm active:scale-95'
                        : 'bg-black/5 dark:bg-white/5 text-apple-gray-400 dark:text-apple-gray-500 cursor-not-allowed border border-transparent'
                    }`}
                    title={t.deleteSelected}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>
                      {selectedClipIds.size === completedIds.length && completedIds.length > 1
                        ? t.clearAllAuditions
                        : `${t.deleteSelected} (${selectedClipIds.size})`}
                    </span>
                  </button>

                  <div className="h-3 w-px bg-black/10 dark:bg-white/15" />

                  {/* 完成管理按钮 */}
                  <button
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedClipIds(new Set());
                    }}
                    className="text-xs font-semibold px-3 py-1 rounded-lg bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 text-apple-gray-800 dark:text-white border border-black/10 dark:border-white/15 transition-all active:scale-95 whitespace-nowrap shadow-apple-sm"
                  >
                    {t.doneManage}
                  </button>
                </div>
              </div>
            ) : (
              /* 日常浏览态：纯净标题与批量管理/导出入口，彻底移除常驻垃圾桶 */
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-apple-gray-500 dark:text-apple-gray-300" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300">
                    {t.auditionTitle}
                  </h3>
                  {candidates.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-apple-gray-600 dark:text-apple-gray-300 font-mono">
                      {t.auditionCountBadge.replace('{count}', String(candidates.length))}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {/* 打包导出全部 */}
                  {completedIds.length > 0 && !isGenerating && (
                    <button
                      onClick={handleExportAll}
                      disabled={isExportingAll}
                      className="text-xs font-medium text-apple-gray-600 hover:text-blue-500 dark:text-apple-gray-300 dark:hover:text-blue-400 flex items-center space-x-1 px-2.5 py-1 rounded-xl apple-glass-interactive border border-black/[0.06] dark:border-white/10 transition-all shadow-apple-sm active:scale-95 whitespace-nowrap"
                      title={t.exportAll}
                    >
                      <Download className={`w-3.5 h-3.5 ${isExportingAll ? 'animate-pulse' : ''}`} />
                      <span>{isExportingAll ? t.exporting : t.exportAll}</span>
                    </button>
                  )}

                  {/* 批量管理入口 */}
                  {completedIds.length > 0 && !isGenerating && (
                    <button
                      onClick={() => setIsSelectionMode(true)}
                      className="text-xs font-medium text-apple-gray-700 hover:text-blue-600 dark:text-apple-gray-200 dark:hover:text-white flex items-center space-x-1.5 px-3 py-1 rounded-xl apple-glass-interactive border border-black/[0.06] dark:border-white/10 transition-all shadow-apple-sm active:scale-95 whitespace-nowrap"
                      title={t.batchManage}
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span>{t.batchManage}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-black/10 dark:border-white/10 p-12 text-center apple-glass-card flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-apple-gray-500 dark:text-apple-gray-300">
                  <Wand2 className="w-5 h-5" />
                </div>
                <p className="text-xs text-apple-gray-700 dark:text-apple-gray-300 font-medium">{t.emptyAuditionTitle}</p>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 max-w-sm">
                  {t.emptyAuditionDesc}
                </p>
              </div>
            ) : (
              <div className="audition-grid">
                {candidates.map((cand, idx) => (
                  <AuditionCard
                    key={cand.id ? `clip-${cand.id}` : cand.clientId || `cand-${cand.candidate_index}-${cand.seed || ''}`}
                    lang={lang}
                    candidate={cand}
                    displayIndex={idx + 1}
                    onPin={handlePinClip}
                    canPin={Boolean(selectedChar) && !isGenerating}
                    isPinned={!!cand.is_pinned}
                    isSelectionMode={isSelectionMode}
                    isSelected={cand.id ? selectedClipIds.has(cand.id) : false}
                    onToggleSelect={handleToggleSelectCandidate}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 1. 首次使用设置向导 (仅首次打开自动呈现，引导启程) */}
      <SetupWizardModal
        lang={lang}
        onSetLang={handleSetLang}
        theme={theme}
        onSetTheme={(newTheme) => {
          setTheme(newTheme);
          try { localStorage.setItem('voxera_theme', newTheme); } catch {}
        }}
        isOpen={isOnboardingOpen}
        onClose={handleCompleteOnboarding}
        onComplete={handleCompleteOnboarding}
        hardware={hardware}
        network={network}
        models={models}
        onDownloadModel={handleDownloadModel}
      />

      {/* 2. 日常系统设置与诊断面板 (顶栏设置唤起，选项卡即用即走) */}
      <SettingsModal
        lang={lang}
        onSetLang={handleSetLang}
        theme={theme}
        onSetTheme={(newTheme) => {
          setTheme(newTheme);
          try { localStorage.setItem('voxera_theme', newTheme); } catch {}
        }}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        hardware={hardware}
        network={network}
        models={models}
        onDownloadModel={handleDownloadModel}
      />
    </div>
  );
};

export default App;
