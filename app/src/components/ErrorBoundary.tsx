import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showLogs: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showLogs: false,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Voxera Studio:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyLogs = () => {
    const { error, errorInfo } = this.state;
    const diagnosticReport = [
      '======================================================================',
      'VOXERA STUDIO - 错误诊断报告 (Error Diagnostic Report)',
      '======================================================================',
      `时间 (Time): ${new Date().toISOString()}`,
      `应用版本 (Version): 0.1.0`,
      `用户代理 (User Agent): ${navigator.userAgent}`,
      `当前地址 (URL): ${window.location.href}`,
      '',
      '【异常信息 / Error Message】',
      error ? `${error.name}: ${error.message}` : '未知错误 (Unknown Error)',
      '',
      '【堆栈轨迹 / Stack Trace】',
      error?.stack || '无堆栈信息 (No stack trace)',
      '',
      '【组件渲染轨迹 / Component Stack】',
      errorInfo?.componentStack || '无组件信息 (No component stack)',
      '======================================================================',
    ].join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(diagnosticReport).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    }
  };

  public render() {
    if (this.state.hasError) {
      const { error, showLogs, copied } = this.state;

      return (
        <div className="min-h-screen w-full bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
          {/* Subtle gradient glow in background */}
          <div className="absolute w-[500px] h-[500px] bg-red-500/5 rounded-full blur-3xl pointer-events-none -top-20 -left-20" />
          <div className="absolute w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20" />

          {/* Error Card */}
          <div className="w-full max-w-lg bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-7 shadow-2xl backdrop-blur-xl relative z-10 flex flex-col items-center text-center">
            {/* Warning Icon Badge */}
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5 text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white mb-2">
              工作台遇到了一点状况
            </h1>

            <p className="text-sm text-zinc-400 leading-relaxed mb-6">
              别担心，您的角色资产与已生成的音频均安全保存在本地沙盒中。
              <br />
              这通常是由于本地引擎临时响应延迟或界面数据偶发异常引起的。
            </p>

            {/* Error Message Pill */}
            {error && (
              <div className="w-full bg-zinc-950/60 border border-zinc-800/60 rounded-lg py-2.5 px-4 text-xs font-mono text-zinc-400 text-left truncate mb-6">
                <span className="text-red-400 font-semibold mr-2">{error.name}:</span>
                {error.message}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-medium rounded-xl transition-all shadow-sm active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                重新加载工作台
              </button>

              <button
                onClick={() => this.setState((prev) => ({ showLogs: !prev.showLogs }))}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-sm font-medium rounded-xl transition-all active:scale-[0.98]"
              >
                <Terminal className="w-4 h-4 text-zinc-400" />
                <span>日志</span>
                {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Bottom Right Floating Log Viewer / Overlay */}
          {showLogs && (
            <div className="fixed bottom-6 right-6 w-full max-w-md bg-zinc-900/95 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>异常诊断日志 (Diagnostic Logs)</span>
                </div>
                <button
                  onClick={this.handleCopyLogs}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors border border-blue-500/20"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">已复制到剪贴板</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>一键复制日志</span>
                    </>
                  )}
                </button>
              </div>

              {/* Log Content Area */}
              <pre className="p-4 text-xs font-mono text-zinc-300 max-h-56 overflow-y-auto whitespace-pre-wrap break-all select-text leading-relaxed bg-[#0a0a0c]">
                {error?.stack || error?.message || '暂无更多详细日志'}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
