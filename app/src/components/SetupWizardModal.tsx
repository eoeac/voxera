import React, { useState, useEffect, useRef } from 'react';
import { useModal } from '../lib/useModal';
import { Language, translations } from '../i18n/translations';
import { HardwareReport, NetworkProfile, ModelInfo, api } from '../lib/api';
import {
  Cpu,
  Network,
  X,
  AlertCircle,
  Download,
  Box,
  CheckCircle2,
  Moon,
  Sun,
  Globe,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  HardDrive,
  Zap,
  Loader2
} from 'lucide-react';

interface SetupWizardModalProps {
  lang: Language;
  onSetLang: (lang: Language) => void;
  theme: 'dark' | 'light';
  onSetTheme: (theme: 'dark' | 'light') => void;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  hardware: HardwareReport | null;
  network: NetworkProfile | null;
  models: ModelInfo[];
  onDownloadModel: (id: string, source?: string) => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  lang,
  onSetLang,
  theme,
  onSetTheme,
  isOpen,
  onClose,
  onComplete,
  hardware,
  network,
  models,
  onDownloadModel
}) => {
  const t = translations[lang];

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedSource, setSelectedSource] = useState<'auto' | 'modelscope' | 'huggingface'>('auto');
  

  // 核心推荐模型（默认 Qwen3-TTS 1.7B）
  const defaultModel = models.find((m) => m.id.includes('qwen') || m.is_default) || models[0];
  const isModelReady = defaultModel?.is_downloaded;
  const isModelDownloading = defaultModel?.status === 'downloading';
  const downloadPercentage = Math.round(defaultModel?.percentage || 0);

  const [installingCuda, setInstallingCuda] = useState(false);
  const [cudaInstallProgress, setCudaInstallProgress] = useState(0);
  const [cudaInstallStep, setCudaInstallStep] = useState('');
  const [cudaInstallSuccess, setCudaInstallSuccess] = useState(false);

  const modalRef = useModal(isOpen, onClose);
  const installTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (installTimer.current) clearInterval(installTimer.current); }, []);

  const handleInstallCuda = async () => {
    setInstallingCuda(true);
    setCudaInstallProgress(10);
    setCudaInstallStep(t.installingCuda);
    try {
      await api.installAcceleration('cu128');
      const timer = setInterval(async () => {
        try {
          const acc = await api.getAcceleration();
          if (acc.install_progress > 0) {
            setCudaInstallProgress(acc.install_progress);
            if (acc.install_step) setCudaInstallStep(acc.install_step);
          }
          if (acc.install_status === 'completed') {
            clearInterval(timer);
            setInstallingCuda(false);
            setCudaInstallSuccess(true);
          } else if (acc.install_status === 'failed') {
            clearInterval(timer);
            setInstallingCuda(false);
            setCudaInstallStep(acc.error || (lang === 'zh' ? '安装失败' : 'Installation failed'));
          }
        } catch {
          clearInterval(timer);
          setInstallingCuda(false);
        }
      }, 1500);
      installTimer.current = timer;
    } catch {
      setInstallingCuda(false);
    }
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={t.wizardTitle} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md transition-colors animate-fadeIn">
      <div className="w-full max-w-xl rounded-3xl apple-glass border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 1. 顶栏：标题与步骤指示器 (Stepper) */}
        <div className="p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 dark:bg-blue-500/25 border border-blue-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white tracking-tight">{t.wizardTitle}</h3>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300">
                {t.stepIndicator.replace('{current}', String(currentStep)).replace('{total}', '3')} · {
                  currentStep === 1 ? t.wizardStep1 : currentStep === 2 ? t.wizardStep2 : t.wizardStep3
                }
              </p>
            </div>
          </div>

          {/* 步骤胶囊条 */}
          <div className="flex items-center space-x-1.5">
            {[1, 2, 3].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setCurrentStep(step as 1 | 2 | 3)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  currentStep === step
                    ? 'bg-blue-600 text-white shadow-apple-sm scale-105'
                    : currentStep > step
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-black/5 dark:bg-white/10 text-apple-gray-500 dark:text-apple-gray-300 hover:bg-black/10'
                }`}
                title={lang === 'zh' ? `第 ${step} 步` : `Step ${step}`}
              >
                {currentStep > step ? <CheckCircle2 className="w-3.5 h-3.5" /> : step}
              </button>
            ))}

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-apple-gray-400 hover:text-apple-gray-900 dark:hover:text-white transition-colors ml-2"
              title={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. 主体步骤切换区域 */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-[340px]">
          {/* ========== 步骤 1: 视觉与语言偏好 ========== */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              {/* 语言选择 */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>{t.langSectionTitle}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onSetLang('en')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      lang === 'en'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 shadow-apple-card ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">English</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium">
                        {t.themeDefaultBadge}
                      </span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      English Interface & Prompts
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetLang('zh')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      lang === 'zh'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 shadow-apple-card ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">简体中文</span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      {lang === 'zh' ? '中文界面与自然语言音色提示词' : 'Chinese interface & voice prompts'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 颜色主题选择 */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                  <Moon className="w-3.5 h-3.5" />
                  <span>{t.themeSectionTitle}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onSetTheme('dark')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      theme === 'dark'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 shadow-apple-card ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-md bg-[#1C1C1E] border border-white/20 flex items-center justify-center">
                          <Moon className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">{t.themeDark}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium">
                        {t.themeDefaultBadge}
                      </span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      {t.themeDarkDesc}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetTheme('light')}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      theme === 'light'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 shadow-apple-card ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.02] dark:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-md bg-white border border-black/10 flex items-center justify-center shadow-sm">
                          <Sun className="w-3 h-3 text-amber-500" />
                        </div>
                        <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">{t.themeLight}</span>
                      </div>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      {t.themeLightDesc}
                    </span>
                  </button>
                </div>
              </div>

              {/* 绿色便携免安装承诺 */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] border border-emerald-500/25 flex items-start space-x-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs leading-relaxed">
                  {t.portableNotice}
                </span>
              </div>
            </div>
          )}

          {/* ========== 步骤 2: 算力与网络检测 ========== */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fadeIn">
              {/* 硬件探测规格 */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{t.systemSpecs}</span>
                </h4>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.cpuInfo}</span>
                    <p className="font-semibold text-apple-gray-900 dark:text-white truncate" title={hardware?.cpu_model || ''}>
                      {hardware?.cpu_model || 'Detecting...'}
                    </p>
                    <span className="text-xs text-apple-gray-500">
                      {t.cpuCoresHint.replace('{cores}', String(hardware?.cpu_cores || 4))}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.ramInfo}</span>
                    <p className="font-semibold text-apple-gray-900 dark:text-white">
                      {hardware ? `${hardware.ram_total_gb} GB` : '...'}
                    </p>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      {t.ramAvailableHint.replace('{available}', String(hardware?.ram_available_gb || 0))}
                    </span>
                  </div>

                  <div className="col-span-2 p-3.5 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.gpuInfo}</span>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-apple-gray-900 dark:text-white truncate">
                          {hardware?.gpus?.length ? hardware.gpus.map((g) => g.name).join(', ') : t.gpuIntegrated}
                        </p>
                        <span className="text-xs text-apple-gray-500 block truncate">
                          {hardware?.has_nvidia_cuda
                            ? (hardware?.current_mode === 'cuda' ? t.cudaReadyPrompt : t.gpuCudaReady)
                            : t.gpuCpuFallback}
                        </span>
                      </div>
                      <span className={`flex-shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
                        (hardware?.has_nvidia_cuda && (hardware?.current_mode === 'cuda'))
                          ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30'
                      }`}>
                        {(hardware?.has_nvidia_cuda && (hardware?.current_mode === 'cuda')) ? t.badgeCuda : t.badgeCpu}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 若检测到 N 卡但当前为 CPU 模式，提供一键按需启用 CUDA 扩展 */}
                {hardware?.has_nvidia_cuda && !hardware?.current_torch_cuda && (
                  <div className="p-3.5 rounded-2xl bg-blue-500/[0.07] dark:bg-blue-900/20 border border-blue-500/25 space-y-2.5">
                    <div className="flex items-start space-x-2.5">
                      <Zap className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-apple-gray-900 dark:text-white">
                          {t.cudaUpgradePrompt}
                        </p>
                      </div>
                    </div>

                    {installingCuda ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center space-x-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{cudaInstallStep || t.installingCuda}</span>
                          </span>
                          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {Math.round(cudaInstallProgress)}%
                          </span>
                        </div>
                        <div className="w-full bg-black/10 dark:bg-white/15 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${cudaInstallProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : cudaInstallSuccess ? (
                      <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>{t.cudaInstallSuccess}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end space-x-2.5 pt-0.5">
                        <span className="text-xs text-apple-gray-400">
                          {t.btnKeepCpu}
                        </span>
                        <button
                          type="button"
                          onClick={handleInstallCuda}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all active:scale-95 flex items-center space-x-1.5"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{t.btnEnableCuda}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!hardware?.has_nvidia_cuda && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-300/90">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>{t.cpuFallbackNotice}</span>
                  </div>
                )}
              </div>

              {/* 网络探测与源切换 */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                    <Network className="w-3.5 h-3.5" />
                    <span>{t.sourceSelectLabel}</span>
                  </h4>
                  <span className="text-xs text-apple-gray-400">
                    ModelScope: {network?.cn_latency_ms ?? '—'}ms | HF: {network?.hf_latency_ms ?? '—'}ms
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5"><button type="button" onClick={() => setSelectedSource('auto')}
                    aria-pressed={selectedSource === 'auto'}
                    className={`p-3 rounded-2xl border text-left text-sm ${selectedSource === 'auto' ? 'border-blue-500 bg-blue-500/10' : 'border-black/10 dark:border-white/10'}`}>
                    {t.autoDetect}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSource('modelscope')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      selectedSource === 'modelscope'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-apple-gray-900 dark:text-white">{lang === 'zh' ? 'ModelScope (国内源)' : 'ModelScope (CN)'}</span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-1">
                      {t.sourceModelScopeDesc}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSource('huggingface')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      selectedSource === 'huggingface'
                        ? 'border-blue-500 bg-blue-500/[0.08] dark:bg-blue-900/20 ring-1 ring-blue-500'
                        : 'border-black/[0.08] dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-apple-gray-900 dark:text-white">{lang === 'zh' ? 'Hugging Face (官方)' : 'Hugging Face (Official)'}</span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-1">
                      {t.sourceHfDesc}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========== 步骤 3: 核心模型准备 ========== */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fadeIn">
              {!installingCuda && !cudaInstallSuccess && cudaInstallStep && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{cudaInstallStep}</p>}
              <div>
                <h4 className="text-sm font-semibold text-apple-gray-900 dark:text-white tracking-tight flex items-center space-x-2">
                  <Box className="w-4 h-4 text-blue-500" />
                  <span>{t.modelSetupTitle}</span>
                </h4>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-0.5">
                  {t.modelSetupSubtitle}
                </p>
              </div>

              {/* 推荐模型规格卡片 */}
              <div className="p-4 rounded-3xl apple-glass-card border border-black/[0.08] dark:border-white/10 space-y-3 shadow-apple-card">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-apple-gray-900 dark:text-white">
                        {defaultModel?.name || 'Qwen3-TTS 1.7B VoiceDesign'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium">
                        {t.modelBadgeDefault}
                      </span>
                    </div>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-1">
                      {t.modelQwenDesc}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-bold text-apple-gray-900 dark:text-white block">
                      {defaultModel?.size_display || '4.5 GB'}
                    </span>
                    <span className="text-xs text-apple-gray-400">
                      {defaultModel?.vram_gb == null ? (lang === 'zh' ? '显存未实测' : 'VRAM not measured') : (lang === 'zh' ? `参考显存 ${defaultModel.vram_gb}GB` : `Reference VRAM ${defaultModel.vram_gb}GB`)}
                    </span>
                  </div>
                </div>

                {/* 状态分支显示 */}
                {isModelReady ? (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center space-x-2.5 text-xs text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-medium">{t.modelReadyNotice}</span>
                  </div>
                ) : isModelDownloading ? (
                  <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/25 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        <span>{t.modelDownloadingProgress}</span>
                      </span>
                      <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {downloadPercentage}%
                      </span>
                    </div>
                    <div className="w-full bg-black/10 dark:bg-white/15 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${downloadPercentage}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-xs text-apple-gray-500 dark:text-apple-gray-300">
                    {t.modelNotDownloadedNoticeWizard}
                  </div>
                )}
              </div>

              {/* 绿色免安装路径说明 */}
              <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] flex items-center space-x-2 text-xs text-apple-gray-600 dark:text-apple-gray-300">
                <HardDrive className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span>{t.modelDownloadLocationHint}</span>
              </div>

              {/* 动作按钮区 */}
              <div className="pt-2 flex items-center justify-end space-x-3">
                {isModelReady ? (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="px-6 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-apple-glow transition-all active:scale-95 flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.enterStudioBtn}</span>
                  </button>
                ) : isModelDownloading ? (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="px-5 py-2.5 rounded-2xl text-xs font-semibold apple-glass-interactive text-apple-gray-700 dark:text-apple-gray-300 border border-black/10 dark:border-white/10 hover:border-black/20 transition-all active:scale-95"
                  >
                    {t.skipForNowBtn}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onComplete}
                      className="px-4 py-2.5 rounded-2xl text-xs font-medium text-apple-gray-600 hover:text-apple-gray-900 dark:text-apple-gray-300 dark:hover:text-white transition-colors"
                    >
                      {t.skipForNowBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => defaultModel && onDownloadModel(defaultModel.id, selectedSource)}
                      className="px-6 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-apple-glow transition-all active:scale-95 flex items-center space-x-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t.downloadNowBtn} ({defaultModel?.size_display || '4.5 GB'})</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. 弹窗底栏导航 */}
        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-black/20 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-1.5 rounded-xl text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 hover:bg-black/5 dark:hover:bg-white/10 flex items-center space-x-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t.prevStep}</span>
              </button>
            )}
          </div>

          <div>
            {currentStep < 3 && (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-apple-sm transition-transform active:scale-95 flex items-center space-x-1"
              >
                <span>{t.nextStep}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
