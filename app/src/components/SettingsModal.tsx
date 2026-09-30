import React, { useState, useEffect, useRef } from 'react';
import { useModal } from '../lib/useModal';
import { Language, translations } from '../i18n/translations';
import { HardwareReport, NetworkProfile, ModelInfo, api } from '../lib/api';
import {
  Sliders,
  Cpu,
  Box,
  X,
  Globe,
  Moon,
  Sun,
  ShieldCheck,
  Network,
  AlertCircle,
  Download,
  CheckCircle2,
  HardDrive,
  Zap,
  Loader2,
  Link2
} from 'lucide-react';

interface SettingsModalProps {
  lang: Language;
  onSetLang: (lang: Language) => void;
  theme: 'dark' | 'light';
  onSetTheme: (theme: 'dark' | 'light') => void;
  isOpen: boolean;
  onClose: () => void;
  hardware: HardwareReport | null;
  network: NetworkProfile | null;
  models: ModelInfo[];
  onDownloadModel: (id: string, source?: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  onSetLang,
  theme,
  onSetTheme,
  isOpen,
  onClose,
  hardware,
  network,
  models,
  onDownloadModel
}) => {
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'general' | 'hardware' | 'models'>('general');
  const [selectedSource, setSelectedSource] = useState<'auto' | 'modelscope' | 'huggingface'>('auto');
  

  const [installingCuda, setInstallingCuda] = useState(false);
  const [cudaInstallProgress, setCudaInstallProgress] = useState(0);
  const [cudaInstallStep, setCudaInstallStep] = useState('');
  const [cudaInstallSuccess, setCudaInstallSuccess] = useState(false);

  // 外部环境连接测试状态
  const [externalPath, setExternalPath] = useState('');
  const [testingEnv, setTestingEnv] = useState(false);
  const [envTestResult, setEnvTestResult] = useState<{
    valid?: boolean;
    version?: string;
    cuda?: boolean;
    dev?: string;
    err?: string;
  } | null>(null);

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

  const handleTestExternal = async () => {
    if (!externalPath.trim()) return;
    setTestingEnv(true);
    setEnvTestResult(null);
    try {
      const res = await api.testExternalPython(externalPath.trim());
      setEnvTestResult({
        valid: res.valid,
        version: res.torch_version ? `PyTorch ${res.torch_version}` : `Python ${res.python_version}`,
        cuda: res.cuda_available,
        dev: res.device_name,
        err: res.error
      });
    } catch (e: any) {
      setEnvTestResult({ valid: false, err: e.message || (lang === 'zh' ? '连接外部环境异常' : 'Environment connection failed') });
    } finally {
      setTestingEnv(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label={t.settingsTitle} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md transition-colors animate-fadeIn">
      <div className="w-full max-w-2xl rounded-3xl apple-glass border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* 1. 顶栏：标题与关闭按钮 */}
        <div className="p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 dark:bg-blue-500/25 border border-blue-500/30 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white tracking-tight">{t.settingsTitle}</h3>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300">{t.settingsSubtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-apple-gray-400 hover:text-apple-gray-900 dark:hover:text-white transition-colors"
            title={t.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. 扁平选项卡导航 (Tabs) */}
        <div className="px-6 pt-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-xs font-medium rounded-t-xl transition-all border-b-2 flex items-center space-x-2 ${
                activeTab === 'general'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-black/[0.03] dark:bg-white/[0.04]'
                  : 'border-transparent text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.tabGeneral}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hardware')}
              className={`px-4 py-2 text-xs font-medium rounded-t-xl transition-all border-b-2 flex items-center space-x-2 ${
                activeTab === 'hardware'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-black/[0.03] dark:bg-white/[0.04]'
                  : 'border-transparent text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{t.tabHardware}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('models')}
              className={`px-4 py-2 text-xs font-medium rounded-t-xl transition-all border-b-2 flex items-center space-x-2 ${
                activeTab === 'models'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-black/[0.03] dark:bg-white/[0.04]'
                  : 'border-transparent text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{t.tabModels}</span>
            </button>
          </div>
        </div>

        {/* 3. 选项卡主体内容 */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-[340px]">
          {/* Tab 1: 通用偏好 */}
          {activeTab === 'general' && (
            <div className="space-y-5 animate-fadeIn">
              {/* 语言偏好 */}
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
                    <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">English</span>
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
                    <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">简体中文</span>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      {lang === 'zh' ? '中文界面与自然语言音色提示词' : 'Chinese interface & voice prompts'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 颜色主题偏好 */}
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
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-md bg-[#1C1C1E] border border-white/20 flex items-center justify-center">
                        <Moon className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">{t.themeDark}</span>
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
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-md bg-white border border-black/10 flex items-center justify-center shadow-sm">
                        <Sun className="w-3 h-3 text-amber-500" />
                      </div>
                      <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">{t.themeLight}</span>
                    </div>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-2 block">
                      {t.themeLightDesc}
                    </span>
                  </button>
                </div>
              </div>

              {/* 绿色便携与本地沙盒说明 */}
              <div className="p-4 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
                <div className="flex items-center space-x-2 text-xs font-semibold text-apple-gray-900 dark:text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>{t.storageSandbox}</span>
                </div>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 leading-relaxed">
                  {t.storageSandboxDesc}
                </p>
                <div className="pt-1 flex items-center space-x-1.5 font-mono text-xs text-apple-gray-400">
                  <HardDrive className="w-3 h-3 text-apple-gray-400" />
                  <span>{t.storageSandboxPath}</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: 算力与硬件 */}
          {activeTab === 'hardware' && (
            <div className="space-y-4 animate-fadeIn">
              {!installingCuda && !cudaInstallSuccess && cudaInstallStep && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{cudaInstallStep}</p>}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                  <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.cpuInfo}</span>
                  <p className="font-semibold text-apple-gray-900 dark:text-white truncate" title={hardware?.cpu_model || ''}>
                    {hardware?.cpu_model || 'Detecting...'}
                  </p>
                  <span className="text-xs text-apple-gray-500">
                    {t.cpuCoresHint.replace('{cores}', String(hardware?.cpu_cores || 4))}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                  <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.ramInfo}</span>
                  <p className="font-semibold text-apple-gray-900 dark:text-white">
                    {hardware ? `${hardware.ram_total_gb} GB` : '...'}
                  </p>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {t.ramAvailableHint.replace('{available}', String(hardware?.ram_available_gb || 0))}
                  </span>
                </div>

                <div className="col-span-2 p-4 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08]">
                  <span className="text-xs text-apple-gray-500 dark:text-apple-gray-300 block mb-1">{t.gpuInfo}</span>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-apple-gray-900 dark:text-white truncate">
                        {hardware?.gpus?.length ? hardware.gpus.map((g) => g.name).join(', ') : t.gpuIntegrated}
                      </p>
                      <span className="text-xs text-apple-gray-500 block truncate mt-0.5">
                        {hardware?.has_nvidia_cuda
                          ? (hardware?.current_mode === 'cuda' ? t.cudaReadyPrompt : t.gpuCudaReady)
                          : t.gpuCpuFallback}
                      </span>
                    </div>
                    <span className={`flex-shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold ${
                      (hardware?.has_nvidia_cuda && (hardware?.current_mode === 'cuda'))
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30'
                    }`}>
                      {(hardware?.has_nvidia_cuda && (hardware?.current_mode === 'cuda')) ? t.badgeCuda : t.badgeCpu}
                    </span>
                  </div>
                </div>
              </div>

              {/* 若检测到 N 卡但当前为 CPU 模式，提供一键按需启用 CUDA 扩展 */}
              {hardware?.has_nvidia_cuda && !hardware?.current_torch_cuda && (
                <div className="p-4 rounded-2xl bg-blue-500/[0.07] dark:bg-blue-900/20 border border-blue-500/25 space-y-3">
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
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all active:scale-95 flex items-center space-x-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{t.btnEnableCuda}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!hardware?.has_nvidia_cuda && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-300/90">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>{t.cpuFallbackNotice}</span>
                </div>
              )}

              {/* 链接外部已有环境（高级开发者选项） */}
              <div className="p-4 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
                <div className="flex items-center space-x-2 text-xs font-semibold text-apple-gray-900 dark:text-white">
                  <Link2 className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t.externalEnvTitle}</span>
                </div>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 leading-relaxed">
                  {lang === 'zh' ? '仅检测 Voxera 目录内的 runtime 或 .venv 解释器，不执行其他程序。' : 'Only Voxera runtime or .venv interpreters can be tested.'}
                </p>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    value={externalPath}
                    onChange={(e) => setExternalPath(e.target.value)}
                    placeholder={t.externalEnvPlaceholder}
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/10 text-apple-gray-900 dark:text-white placeholder:text-apple-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleTestExternal}
                    disabled={testingEnv || !externalPath.trim()}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-black/[0.05] dark:bg-white/10 hover:bg-black/[0.08] dark:hover:bg-white/15 text-apple-gray-900 dark:text-white transition-all disabled:opacity-40 flex items-center space-x-1.5 flex-shrink-0"
                  >
                    {testingEnv ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{t.testingConnection}</span>
                      </>
                    ) : (
                      <span>{t.btnTestConnection}</span>
                    )}
                  </button>
                </div>

                {envTestResult && (
                  <div className={`p-2.5 rounded-xl border text-xs ${
                    envTestResult.valid
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400'
                  }`}>
                    {envTestResult.valid ? (
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
                        <span>
                          {t.externalEnvSuccess
                            .replace('{version}', envTestResult.version || '')
                            .replace('{cuda}', envTestResult.cuda ? `${lang === 'zh' ? '已就绪' : 'Ready'} (${envTestResult.dev || 'GPU'})` : (lang === 'zh' ? '不可用 (CPU)' : 'Unavailable (CPU)'))}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-500" />
                        <span>{t.externalEnvFailed.replace('{error}', envTestResult.err || '')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 环境隔离说明 */}
              <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] flex items-start space-x-2.5 text-xs text-apple-gray-500 dark:text-apple-gray-300">
                <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>{t.envSandboxDesc}</span>
              </div>
            </div>
          )}

          {/* Tab 3: 模型与网络 */}
          {activeTab === 'models' && (
            <div className="space-y-4 animate-fadeIn">
              {/* 下载源选择 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                    <Network className="w-3.5 h-3.5" />
                    <span>{t.sourceSelectLabel}</span>
                  </label>
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

              {/* 模型权重列表 */}
              <div className="space-y-2.5 pt-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-apple-gray-600 dark:text-apple-gray-300 flex items-center space-x-1.5">
                  <Box className="w-3.5 h-3.5" />
                  <span>{t.modelWeightsTitle}</span>
                </label>

                <div className="space-y-2">
                  {models.map((m) => (
                    <div key={m.id} className="p-3.5 rounded-2xl apple-glass-card border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-apple-gray-900 dark:text-white truncate">{m.name}</span>
                          {m.is_default && (
                            <span className="text-xs px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium">
                              {t.modelBadgeDefault}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-300 mt-0.5 truncate">
                          {m.is_auxiliary ? (lang === 'zh' ? '复用 Qwen 正式音色时需要的 Base 模型' : 'Base model required for Qwen voice reuse') : m.id.toLowerCase().includes('qwen')
                            ? t.modelQwenDesc
                            : m.id.toLowerCase().includes('voxcpm')
                            ? t.modelVoxCPMDesc
                            : m.description}
                        </p>
                        {m.error && <p role="alert" className="text-sm text-red-600 dark:text-red-300 mt-1 break-words">{m.error}</p>}
                      </div>

                      <div className="flex items-center space-x-3 flex-shrink-0">
                        <div className="text-right text-xs">
                          <span className="text-apple-gray-800 dark:text-white block font-medium">{m.size_display}</span>
                          <span className="text-apple-gray-400 text-xs">
                            {m.vram_gb == null ? (lang === 'zh' ? '显存未实测' : 'VRAM not measured') : (lang === 'zh' ? `参考显存 ${m.vram_gb}GB` : `Reference VRAM ${m.vram_gb}GB`)}
                          </span>
                        </div>

                        {m.is_downloaded ? (
                          <span className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.modelReady}</span>
                          </span>
                        ) : m.status === 'downloading' ? (
                          <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-mono">
                            {m.percentage}%
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDownloadModel(m.id, selectedSource)}
                            className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-apple-sm transition-all active:scale-95"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{t.downloadBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. 弹窗底栏 */}
        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-black/20 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-apple-sm transition-transform active:scale-95"
          >
            {t.doneBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
