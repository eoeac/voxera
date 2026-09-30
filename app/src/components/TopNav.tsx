import React from 'react';
import { Language, translations } from '../i18n/translations';
import { HardwareReport, NetworkProfile } from '../lib/api';
import { Cpu, Globe, Sliders, Volume2, Sun, Moon } from 'lucide-react';

interface TopNavProps {
  lang: Language;
  onToggleLang: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  hardware: HardwareReport | null;
  network: NetworkProfile | null;
  onOpenSettings: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  hardware,
  network,
  onOpenSettings
}) => {
  const t = translations[lang];

  return (
    <header className="h-14 px-5 border-b border-black/[0.06] dark:border-white/[0.08] apple-glass flex items-center justify-between sticky top-0 z-40">
      {/* 左侧：Logo 与品牌 */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-apple-glow">
          <Volume2 className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-baseline">
          <span className="font-bold text-[13px] tracking-[0.16em] uppercase text-apple-gray-900 dark:text-white">
            {t.appBrandmark}
          </span>
          <span className="hidden md:inline ml-2.5 text-xs text-apple-gray-500 dark:text-apple-gray-300 font-normal">| {t.appSubtitle}</span>
        </div>
      </div>

      {/* 右侧：状态指示器与控制按钮 */}
      <div className="flex items-center space-x-3">
        {/* 算力模式指示灯 */}
        <button
          onClick={onOpenSettings}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs apple-glass-interactive text-apple-gray-700 dark:text-apple-gray-300"
          title={t.clickForDiagnostics}
        >
          <Cpu className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span className="uppercase font-medium">
            {hardware ? (hardware.current_mode || (hardware.current_torch_cuda ? 'cuda' : 'cpu')) : '...'}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${hardware?.current_mode === 'cuda' || hardware?.current_mode === 'mps' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'}`} />
        </button>

        {/* 网络源指示灯 */}
        <div 
          className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs apple-glass-card text-apple-gray-600 dark:text-apple-gray-300"
          title={`${t.networkSource}: ${network?.selected_model_source || 'Auto'}`}
        >
          <Globe className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          <span>{!network ? t.autoDetect : network.selected_model_source === 'modelscope' ? t.modelscopeMirror : network.selected_model_source === 'hf-mirror' ? 'HF Mirror' : t.hfOfficial}</span>
        </div>

        {/* 语言切换 (中 / EN 单按钮，与主题切换保持一致的交互形态) */}
        <button
          type="button"
          onClick={onToggleLang}
          className="w-7 h-7 rounded-lg apple-glass-interactive text-apple-gray-700 dark:text-apple-gray-200 hover:text-apple-gray-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-95 text-xs font-semibold select-none"
          title={lang === 'zh' ? '切换为英文' : 'Switch to Simplified Chinese'}
        >
          <span className="leading-none text-xs tracking-tight">
            {lang === 'zh' ? '中' : 'EN'}
          </span>
        </button>

        {/* 主题外观切换 (深色 / 浅色) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-7 h-7 rounded-lg apple-glass-interactive text-apple-gray-700 dark:text-apple-gray-200 hover:text-apple-gray-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-95"
          title={theme === 'dark' ? t.themeLight : t.themeDark}
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400 transition-transform active:rotate-45" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-indigo-500 transition-transform active:-rotate-45" />
          )}
        </button>

        {/* 系统设置与诊断面板 */}
        <button
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-lg apple-glass-interactive text-apple-gray-700 dark:text-apple-gray-200 hover:text-apple-gray-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-95"
          title={t.settingsTitle}
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
