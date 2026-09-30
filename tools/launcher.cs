using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;

namespace VoxeraLauncher
{
    public class ErrorDialogForm : Form
    {
        private string logContent;
        private TextBox txtLogs;
        private Button btnToggleLogs;
        private Button btnCopyLogs;
        private bool isExpanded = false;
        private const int COLLAPSED_HEIGHT = 330;
        private const int EXPANDED_HEIGHT = 560;

        public ErrorDialogForm(string title, string friendlyMessage, string rawLog)
        {
            bool isZh = Program.IsChineseSystem();
            this.logContent = rawLog;
            this.Text = isZh ? "VOXERA - 启动诊断与错误报告" : "VOXERA - Startup Diagnostic & Error Report";
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Size = new Size(540, COLLAPSED_HEIGHT);
            this.BackColor = Color.FromArgb(15, 15, 18);
            this.ForeColor = Color.FromArgb(240, 240, 245);
            this.ShowIcon = true;

            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "voxera.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { }
            }

            // 顶部警示标题
            var lblHeader = new Label
            {
                Text = title,
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 12, FontStyle.Bold),
                ForeColor = Color.FromArgb(250, 204, 21),
                Location = new Point(24, 24),
                Size = new Size(480, 28)
            };
            this.Controls.Add(lblHeader);

            // 友好的说明文本与排错建议
            var lblDesc = new Label
            {
                Text = friendlyMessage,
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(160, 160, 175),
                Location = new Point(24, 60),
                Size = new Size(480, 150)
            };
            this.Controls.Add(lblDesc);

            // 底部操作按钮栏
            var btnOpenDir = new Button
            {
                Text = isZh ? "打开日志文件夹" : "Open Logs Folder",
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 9),
                Location = new Point(24, 230),
                Size = new Size(130, 34),
                BackColor = Color.FromArgb(30, 30, 38),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnOpenDir.FlatAppearance.BorderColor = Color.FromArgb(60, 60, 75);
            btnOpenDir.Click += (s, e) =>
            {
                string logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "data");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                Process.Start("explorer.exe", logDir);
            };
            this.Controls.Add(btnOpenDir);

            var btnExit = new Button
            {
                Text = isZh ? "退出" : "Exit",
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 9),
                Location = new Point(164, 230),
                Size = new Size(80, 34),
                BackColor = Color.FromArgb(30, 30, 38),
                ForeColor = Color.FromArgb(200, 200, 210),
                FlatStyle = FlatStyle.Flat
            };
            btnExit.FlatAppearance.BorderColor = Color.FromArgb(60, 60, 75);
            btnExit.Click += (s, e) => { this.Close(); Application.Exit(); };
            this.Controls.Add(btnExit);

            // 右下角：查看详细日志按钮
            btnToggleLogs = new Button
            {
                Text = isZh ? "查看详细日志 ▼" : "View Detailed Logs ▼",
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 9),
                Location = new Point(370, 230),
                Size = new Size(135, 34),
                BackColor = Color.FromArgb(40, 40, 52),
                ForeColor = Color.FromArgb(147, 197, 253),
                FlatStyle = FlatStyle.Flat
            };
            btnToggleLogs.FlatAppearance.BorderColor = Color.FromArgb(59, 130, 246);
            btnToggleLogs.Click += (s, e) => ToggleLogPanel(isZh);
            this.Controls.Add(btnToggleLogs);

            // 展开后的日志文本框
            txtLogs = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                Font = new Font("Consolas", 8.5f),
                BackColor = Color.FromArgb(9, 9, 11),
                ForeColor = Color.FromArgb(212, 212, 216),
                Location = new Point(24, 280),
                Size = new Size(480, 180),
                Visible = false,
                Text = string.IsNullOrEmpty(logContent) ? (isZh ? "（暂无具体控制台堆栈记录）" : "(No console stack trace available)") : logContent
            };
            this.Controls.Add(txtLogs);

            // 展开后的“一键复制日志”按钮
            btnCopyLogs = new Button
            {
                Text = isZh ? "一键复制完整诊断日志" : "Copy All Diagnostic Logs",
                Font = new Font(isZh ? "Microsoft YaHei" : "Segoe UI", 9, FontStyle.Bold),
                Location = new Point(24, 470),
                Size = new Size(480, 34),
                BackColor = Color.FromArgb(37, 99, 235),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Visible = false
            };
            btnCopyLogs.FlatAppearance.BorderSize = 0;
            btnCopyLogs.Click += (s, e) =>
            {
                string report = "======================================================================\r\n" +
                                "VOXERA - 启动诊断日志报告 (Diagnostic Report)\r\n" +
                                "======================================================================\r\n" +
                                "系统时间 (Time): " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\r\n" +
                                "操作系统 (OS): " + Environment.OSVersion.ToString() + " (" + (Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit") + ")\r\n" +
                                "系统语言 (Culture): " + CultureInfo.CurrentUICulture.Name + "\r\n" +
                                "程序路径 (Path): " + AppDomain.CurrentDomain.BaseDirectory + "\r\n" +
                                ".NET 版本 (Version): " + Environment.Version.ToString() + "\r\n" +
                                "======================================================================\r\n" +
                                "【错误记录 / Traceback】:\r\n" +
                                logContent + "\r\n" +
                                "======================================================================\r\n";
                try
                {
                    Clipboard.SetText(report);
                    btnCopyLogs.Text = isZh ? "✔ 已成功复制到剪贴板！可直接粘贴反馈" : "✔ Successfully copied to clipboard!";
                    btnCopyLogs.BackColor = Color.FromArgb(16, 185, 129);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("复制失败: " + ex.Message);
                }
            };
            this.Controls.Add(btnCopyLogs);
        }

        private void ToggleLogPanel(bool isZh)
        {
            isExpanded = !isExpanded;
            if (isExpanded)
            {
                this.Size = new Size(540, EXPANDED_HEIGHT);
                txtLogs.Visible = true;
                btnCopyLogs.Visible = true;
                btnToggleLogs.Text = isZh ? "收起日志 ▲" : "Collapse Logs ▲";
            }
            else
            {
                this.Size = new Size(540, COLLAPSED_HEIGHT);
                txtLogs.Visible = false;
                btnCopyLogs.Visible = false;
                btnToggleLogs.Text = isZh ? "查看详细日志 ▼" : "View Detailed Logs ▼";
            }
        }
    }

    static class Program
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        const int JobObjectExtendedLimitInformation = 9;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryLimit;
            public UIntPtr PeakJobMemoryLimit;
        }

        public static bool IsChineseSystem()
        {
            try
            {
                return CultureInfo.CurrentUICulture.Name.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        [STAThread]
        static void Main()
        {
            System.Threading.Thread.CurrentThread.CurrentUICulture = CultureInfo.GetCultureInfo("en-US");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isZh = IsChineseSystem();
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string pyExe = Path.Combine(baseDir, "runtime", "pythonw.exe");
            if (!File.Exists(pyExe))
            {
                pyExe = Path.Combine(baseDir, "runtime", "python.exe");
            }

            if (!File.Exists(pyExe))
            {
                ShowFriendlyError(
                    isZh ? "内置 Python 运行环境缺失" : "Embedded Python Runtime Missing",
                    isZh ? "未在当前目录下找到内置 Python 运行环境 (runtime\\pythonw.exe)。\r\n\r\n" +
                           "常见原因排查：\r\n" +
                           "1. 请确认您已将压缩包【完全解压】到独立文件夹中，不要在压缩软件内直接双击运行。\r\n" +
                           "2. 解压过程中可能被安全软件误删除了部分 runtime 文件，可尝试重新解压。"
                         : "Embedded Python runtime not found at runtime\\pythonw.exe.\r\n\r\n" +
                           "Troubleshooting:\r\n" +
                           "1. Please make sure the archive is fully extracted into a folder before running.\r\n" +
                           "2. Anti-virus software may have blocked extracted files; please check your security logs.",
                    "File not found: " + pyExe
                );
                return;
            }

            try
            {
                // 创建 Windows Job Object，绑定子进程生命周期（退出时随之完全关闭）
                IntPtr hJob = CreateJobObject(IntPtr.Zero, null);
                if (hJob != IntPtr.Zero)
                {
                    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                    int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                    IntPtr lpInfo = Marshal.AllocHGlobal(length);
                    Marshal.StructureToPtr(info, lpInfo, false);
                    SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, lpInfo, (uint)length);
                    Marshal.FreeHGlobal(lpInfo);
                }

                // 启动引擎桌面宿主（单窗口架构，所有界面由内部 WebView2 原生统一承载）
                var startInfo = new ProcessStartInfo
                {
                    FileName = pyExe,
                    Arguments = "-m engine.desktop",
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardError = true
                };
                startInfo.EnvironmentVariables["VOXERA_HOME"] = baseDir;
                startInfo.EnvironmentVariables["PYTHONPATH"] = baseDir;
                startInfo.EnvironmentVariables["PYTHONUTF8"] = "1";

                using (var engineProcess = Process.Start(startInfo))
                {
                    if (engineProcess == null)
                    {
                        ShowFriendlyError(
                            isZh ? "无法创建核心引擎进程" : "Failed to create engine process",
                            isZh ? "系统未能创建 Python 引擎进程。\r\n可能原因：安全软件阻止了进程拉起，请添加信任。"
                                 : "Failed to launch Python engine process.\r\nSecurity software may have blocked execution.",
                            "Process.Start returned null handle"
                        );
                        return;
                    }

                    if (hJob != IntPtr.Zero)
                    {
                        AssignProcessToJobObject(hJob, engineProcess.Handle);
                    }

                    // 等待引擎进程结束（当用户点击原生主窗口右上角叉号关闭时，子进程正常退出）
                    var errorBuffer = new StringBuilder();
                    engineProcess.ErrorDataReceived += (sender, args) => {
                        if (args.Data == null) return;
                        lock (errorBuffer) {
                            errorBuffer.AppendLine(args.Data);
                            if (errorBuffer.Length > 65536) errorBuffer.Remove(0, errorBuffer.Length - 65536);
                        }
                    };
                    engineProcess.BeginErrorReadLine();
                    engineProcess.WaitForExit();

                    // 若子进程非正常快速崩溃（退出码非 0），捕获错误信息给用户友好提示
                    if (engineProcess.ExitCode != 0)
                    {
                        string err = "";
                        lock (errorBuffer) { err = errorBuffer.ToString(); }

                        string logDir = Path.Combine(baseDir, "data");
                        if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                        string errLogPath = Path.Combine(logDir, "startup_error.log");
                        if (!string.IsNullOrEmpty(err))
                        {
                            try { File.WriteAllText(errLogPath, err); } catch { }
                        }

                        ShowFriendlyError(
                            isZh ? "本地语音引擎异常退出" : "Voice Engine Exited Prematurely",
                            isZh ? "语音引擎后台进程启动中途非正常退出 (ExitCode: " + engineProcess.ExitCode + ")。\r\n\r\n" +
                                   "常见原因与解决办法：\r\n" +
                                   "• 端口占用冲突：检查端口 28840 是否被其他程序占用。\r\n" +
                                   "• 依赖库被拦截：请检查 Windows Defender 或杀毒软件是否有拦截记录。\r\n" +
                                   "• 请点击右下角【查看详细日志】复制后反馈给我们。"
                                 : "The voice engine process terminated unexpectedly (ExitCode: " + engineProcess.ExitCode + ").\r\n\r\n" +
                                   "Common causes:\r\n" +
                                   "• Port conflict: Check if port 28840 is in use by another application.\r\n" +
                                   "• Security block: Windows Defender or anti-virus may have quarantined modules.\r\n" +
                                   "• Click [View Detailed Logs] below to copy and report.",
                            err
                        );
                    }
                }
            }
            catch (Exception ex)
            {
                ShowFriendlyError(
                    isZh ? "启动过程发生未知系统异常" : "Unknown System Exception",
                    isZh ? "系统抛出了未捕获的全局异常，请点击右下角查看并复制详细日志。" : "An unhandled exception occurred. Please view logs below.",
                    ex.ToString()
                );
            }
        }

        static void ShowFriendlyError(string title, string friendlyMessage, string rawLog)
        {
            var errDlg = new ErrorDialogForm(title, friendlyMessage, rawLog);
            errDlg.ShowDialog();
            Application.Exit();
        }
    }
}
