import os
import sys
import time
import threading
import urllib.request
import json
from pathlib import Path

# 确保便携根目录配置正确
ROOT_DIR = Path(__file__).resolve().parent.parent
os.environ.setdefault("VOXERA_HOME", str(ROOT_DIR))
os.environ["PYTHONPATH"] = str(ROOT_DIR)
os.environ["PYTHONUTF8"] = "1"
sys.path.insert(0, str(ROOT_DIR))

import webview

SPLASH_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Voxera</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #09090b;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    overflow: hidden;
    user-select: none;
  }
  .bg-glow {
    position: absolute;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 50%, transparent 70%);
    filter: blur(50px);
    pointer-events: none;
    animation: pulse 4s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    0% { transform: scale(0.9); opacity: 0.5; }
    100% { transform: scale(1.15); opacity: 1; }
  }
  .splash-card {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: rgba(18, 18, 22, 0.75);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 24px;
    padding: 48px 56px;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    max-width: 460px;
    width: 90%;
  }
  .logo-icon {
    width: 58px;
    height: 58px;
    margin-bottom: 22px;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(39, 39, 42, 0.9), rgba(24, 24, 27, 0.9));
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  }
  .logo-icon svg {
    width: 28px;
    height: 28px;
    stroke: #f4f4f5;
  }
  h1.title {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 0.22em;
    color: #ffffff;
    margin-bottom: 8px;
    margin-left: 0.22em;
  }
  p.subtitle {
    font-size: 13px;
    color: #828291;
    letter-spacing: 0.02em;
    margin-bottom: 32px;
  }
  .progress-container {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
    margin-bottom: 18px;
  }
  .progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 40%;
    background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
    border-radius: 999px;
    animation: indeterminate 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes indeterminate {
    0% { left: -40%; width: 40%; }
    50% { left: 30%; width: 50%; }
    100% { left: 100%; width: 40%; }
  }
  .status-text {
    font-size: 12px;
    color: #a1a1aa;
    height: 20px;
    line-height: 20px;
    transition: opacity 0.3s ease;
  }
</style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="splash-card">
    <div class="logo-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="22"></line>
      </svg>
    </div>
    <h1 class="title">VOXERA</h1>
    <p class="subtitle" id="sub-title">Voice Design & Character Audio Studio</p>
    <div class="progress-container">
      <div class="progress-bar"></div>
    </div>
    <div class="status-text" id="status-text">Initializing local engine core...</div>
  </div>

  <script>
    var isZh = false;
    try { isZh = localStorage.getItem('voxera_lang') === 'zh'; } catch (e) {}
    document.documentElement.lang = isZh ? 'zh-CN' : 'en';
    if (isZh) document.getElementById('sub-title').innerText = '声音设计与角色音色工作台';

    var stages = isZh ? [
      { t: 0, msg: "正在启动本地语音引擎核心..." },
      { t: 1400, msg: "正在加载声学与诊断组件..." },
      { t: 3000, msg: "正在初始化工作台图形界面..." }
    ] : [
      { t: 0, msg: "Initializing local engine core..." },
      { t: 1400, msg: "Loading acoustic & diagnostic components..." },
      { t: 3000, msg: "Initializing studio interface..." }
    ];

    stages.forEach(function(s) {
      setTimeout(function() {
        var el = document.getElementById('status-text');
        if (el) el.innerText = s.msg;
      }, s.t);
    });

    window.updateSplash = function(msg) {
      var el = document.getElementById('status-text');
      if (el) el.innerText = msg;
    };
    window.updateSplashReady = function() {
      window.updateSplash(isZh ? '引擎就绪，正在呈现工作台...' : 'Engine ready. Opening the studio...');
    };
  </script>
</body>
</html>
"""

ERROR_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Voxera - Connection Error</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #09090b;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px;
    user-select: none;
  }
  .card {
    background: rgba(24, 24, 27, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 36px 32px;
    max-width: 520px;
    width: 100%;
    text-align: center;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  }
  .icon-wrap {
    width: 56px;
    height: 56px;
    background: rgba(234, 179, 8, 0.12);
    border: 1px solid rgba(234, 179, 8, 0.25);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    color: #eab308;
    font-size: 26px;
  }
  h2 { font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #fff; }
  p { font-size: 13px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
  .btn-group { display: flex; gap: 12px; }
  .btn {
    flex: 1;
    padding: 11px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  .btn-primary { background: #f4f4f5; color: #18181b; }
  .btn-primary:hover { background: #fff; }
  
  .log-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #121216;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    padding: 12px 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    max-width: 480px;
    width: calc(100vw - 40px);
    z-index: 100;
    display: none;
    text-align: left;
  }
  .log-panel.open { display: block; }
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #93c5fd;
  }
  .btn-copy {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
  }
  .btn-copy:hover { background: rgba(59, 130, 246, 0.25); }
  pre {
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 10px;
    font-family: Consolas, monospace;
    font-size: 11px;
    color: #d4d4d8;
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
    user-select: text;
  }
  .toggle-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #18181b;
    border: 1px solid #3f3f46;
    color: #93c5fd;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">⚠</div>
    <h2 id="error-title">Local engine connection timed out</h2>
    <p>
      Voxera could not connect to the local voice engine on port 28840.<br><br>
      Check whether another application is using the port or security software is blocking the local connection.<br><br>
      Voxera 无法连接本地引擎（端口 28840）。请检查端口占用或本地连接是否被拦截。
    </p>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="window.pywebview.api.reconnect()">Reconnect / 重新连接</button>
    </div>
  </div>

  <button class="toggle-btn" id="toggle-btn" onclick="toggleLog()">View logs / 查看日志</button>

  <div class="log-panel" id="log-panel">
    <div class="log-header">
      <span>Diagnostic Info / 诊断日志</span>
      <button class="btn-copy" id="btn-copy" onclick="copyLog()">Copy logs / 复制日志</button>
    </div>
    <pre id="log-content">Port: 127.0.0.1:28840
Status: No engine response
Time: __TIME__
Client: pywebview single-window host</pre>
  </div>

  <script>
    document.getElementById('log-content').innerText = document.getElementById('log-content').innerText.replace('__TIME__', new Date().toISOString());
    function toggleLog() {
      var p = document.getElementById('log-panel');
      var b = document.getElementById('toggle-btn');
      if (p.classList.contains('open')) {
        p.classList.remove('open');
        b.style.display = 'block';
      } else {
        p.classList.add('open');
        b.style.display = 'none';
      }
    }
    function copyLog() {
      var text = document.getElementById('log-content').innerText;
      navigator.clipboard.writeText(text).then(function() {
        var btn = document.getElementById('btn-copy');
        btn.innerText = 'Copied / 已复制';
        btn.style.color = '#34d399';
      });
    }
  </script>
</body>
</html>
"""

def is_engine_ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:28840/api/health", timeout=1) as resp:
            health = json.load(resp)
        from engine.core.config import settings
        record = json.loads((settings.data_dir / "engine-process.json").read_text(encoding="utf-8"))
        return health.get("app") == "Voxera" and health.get("instance_id") == record["instance_id"] and Path(record["project_root"]).resolve() == ROOT_DIR
    except Exception:
        return False

def start_backend():
    if is_engine_ready():
        return
    import uvicorn
    from engine.server import app
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=28840,
        log_level="warning",
        access_log=False
    )
    server = uvicorn.Server(config)
    app.state.server = server
    server.run()

def apply_window_icon(window, ico_path):
    if not os.path.exists(ico_path):
        return
    try:
        import clr
        clr.AddReference('System.Drawing')
        from System.Drawing import Icon
        if hasattr(window, 'native') and window.native:
            window.native.Icon = Icon(str(ico_path))
    except Exception:
        pass

def health_poller(window, ico_path):
    # 尝试设置窗口原生高精图标
    time.sleep(0.1)
    apply_window_icon(window, ico_path)

    # 1. 轮询直至后端 FastAPI 完全就绪（最多等待 15 秒）
    is_ready = False
    for i in range(60):
        if is_engine_ready():
            is_ready = True
            break
        time.sleep(0.25)
    
    if not is_ready:
        try:
            window.load_html(ERROR_PAGE_HTML)
        except Exception:
            pass
        return

    # 2. 后端已 100% 确认就绪，通知前端平滑过渡
    try:
        window.evaluate_js("window.updateSplashReady && window.updateSplashReady();")
    except Exception:
        pass
    
    # 视觉停留 300ms，确保用户体验顺畅
    time.sleep(0.3)

    # 3. 单窗口内直接平滑导航至工作台前端，杜绝多窗重叠与无法访问页面
    window.load_url("http://127.0.0.1:28840")

def main():
    # 1. 启动后台 FastAPI 服务线程
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # 2. 单窗口架构：创建主窗口并立即显示加载过渡界面（避免双窗口打架与残留）
    window = webview.create_window(
        title="Voxera",
        html=SPLASH_HTML,
        width=1280,
        height=840,
        min_size=(960, 640),
        background_color="#09090b",
        text_select=False,
        js_api=DesktopBridge(),
    )

    # 3. 启动健康检查与单窗口内无缝切换线程
    ico_path = ROOT_DIR / "voxera.ico"
    poller_thread = threading.Thread(target=health_poller, args=(window, ico_path), daemon=True)
    poller_thread.start()

    # 4. 绑定项目专属图标并进入桌面原生消息循环
    webview.start(
        icon=str(ico_path) if ico_path.exists() else None,
        private_mode=False
    )

    # 5. 用户点击右上角叉号关闭窗口后退出
    from engine.server import app
    server = getattr(app.state, "server", None)
    if server:
        server.should_exit = True
        backend_thread.join(timeout=30)
        if backend_thread.is_alive():
            # A non-interruptible inference is recovered as failed on next boot.
            os._exit(0)

class DesktopBridge:
    def reconnect(self):
        if webview.windows:
            threading.Thread(target=health_poller, args=(webview.windows[0], ROOT_DIR / "voxera.ico"), daemon=True).start()

if __name__ == "__main__":
    main()
