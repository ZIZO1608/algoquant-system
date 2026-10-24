// Algo Quant control panel: entry point.
//
//   "Algo Quant.exe"                           the window
//   "Algo Quant.exe" --snapshot out.png state  renders the window to a PNG without showing it
//                                              (state: stopped | starting | running)
//   "Algo Quant.exe" --selftest result.txt     headless start -> running -> stop check

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Algo Quant")]
[assembly: AssemblyProduct("Algo Quant")]
[assembly: AssemblyDescription("Start, stop and open the Algo Quant academy system on this computer")]
[assembly: AssemblyCompany("Algo Quant")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

namespace AlgoQuant
{
    internal static class Program
    {
        [DllImport("shcore.dll")]
        private static extern int SetProcessDpiAwareness(int value);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int command);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        [STAThread]
        private static int Main(string[] args)
        {
            // crisp text on scaled displays
            try
            {
                SetProcessDpiAwareness(1);
            }
            catch
            {
                try { SetProcessDPIAware(); } catch { }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero))
            {
                Ui.ScaleFactor = Math.Max(1f, g.DpiX / 96f);
            }

            string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            string root = Controller.FindRoot(exeDir) ?? Controller.FindRoot(Environment.CurrentDirectory);
            string mode = args.Length > 0 ? args[0] : "";

            if (mode == "--snapshot") return Snapshot(root, args);
            if (mode == "--selftest") return SelfTest(root, args);

            if (root == null)
            {
                MessageBox.Show("Keep \"Algo Quant.exe\" inside the algo-quant folder, next to package.json.",
                    "Algo Quant", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            bool createdNew;
            using (var mutex = new Mutex(true, "AlgoQuantLauncher_" + Fnv(root.ToLowerInvariant()), out createdNew))
            {
                if (!createdNew)
                {
                    // already open: bring that window forward instead of opening a second one
                    IntPtr existing = FindWindow(null, MainForm.WindowTitle);
                    if (existing != IntPtr.Zero)
                    {
                        if (IsIconic(existing)) ShowWindow(existing, 9);
                        SetForegroundWindow(existing);
                    }
                    return 0;
                }

                var controller = new Controller(root, Controller.FindNode());
                using (var form = new MainForm(controller, LoadLogo(), false))
                {
                    Application.Run(form);
                }
                GC.KeepAlive(mutex);
            }
            return 0;
        }

        private static Image LoadLogo()
        {
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AlgoQuant.logo.png"))
                {
                    if (stream == null) return null;
                    using (Image image = Image.FromStream(stream))
                    {
                        return new Bitmap(image);
                    }
                }
            }
            catch
            {
                return null;
            }
        }

        private static string Fnv(string text)
        {
            uint hash = 2166136261;
            foreach (char ch in text)
            {
                hash ^= ch;
                hash *= 16777619;
            }
            return hash.ToString("x8");
        }

        private static void ForceHandles(Control control)
        {
            IntPtr unused = control.Handle;
            foreach (Control child in control.Controls) ForceHandles(child);
        }

        private static int Snapshot(string root, string[] args)
        {
            string output = args.Length > 1 ? args[1] : "launcher.png";
            string state = args.Length > 2 ? args[2] : "running";
            var controller = new Controller(root ?? Environment.CurrentDirectory, Controller.FindNode());
            using (var form = new MainForm(controller, LoadLogo(), true))
            {
                form.FormBorderStyle = FormBorderStyle.None;
                form.ShowInTaskbar = false;
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-32000, -32000);
                // optional 4th argument: logical client size, e.g. 1280x650
                var logical = new Size(1104, 801);
                if (args.Length > 3)
                {
                    string[] parts = args[3].Split('x');
                    int w, h;
                    if (parts.Length == 2 && int.TryParse(parts[0], out w) && int.TryParse(parts[1], out h)) logical = new Size(w, h);
                }
                form.MinimumSize = Size.Empty;
                form.ClientSize = new Size(Ui.S(logical.Width), Ui.S(logical.Height));
                ForceHandles(form);
                form.ApplyPreview(state);
                form.DoLayoutNow();
                using (var bitmap = new Bitmap(form.ClientSize.Width, form.ClientSize.Height))
                {
                    form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.ClientSize));
                    bitmap.Save(output, ImageFormat.Png);
                }
            }
            return 0;
        }

        private static int SelfTest(string root, string[] args)
        {
            string output = args.Length > 1 ? args[1] : "selftest.txt";
            var lines = new List<string>();
            Action<string> note = delegate(string message)
            {
                lock (lines)
                {
                    lines.Add(DateTime.Now.ToString("HH:mm:ss") + "  " + message);
                    File.WriteAllLines(output, lines.ToArray());
                }
            };

            if (root == null)
            {
                note("RESULT FAIL: project folder not found");
                return 2;
            }

            var controller = new Controller(root, Controller.FindNode());
            var gate = new object();
            StatusSnapshot latest = null;
            AppState last = (AppState)(-1);
            int logLines = 0;

            controller.StatusChanged += delegate(StatusSnapshot s)
            {
                lock (gate) latest = s;
                if (s.State != last)
                {
                    last = s.State;
                    note("state " + s.State + "  db=" + s.Db + " api=" + s.Api + " web=" + s.Web +
                         (s.Phase.Length > 0 ? "  phase=" + s.Phase : "") + (s.Error.Length > 0 ? "  error=" + s.Error : ""));
                }
            };
            controller.LogAppended += delegate(string[] l) { Interlocked.Add(ref logLines, l.Length); };

            Func<Func<StatusSnapshot, bool>, int, bool> waitFor = delegate(Func<StatusSnapshot, bool> predicate, int seconds)
            {
                DateTime until = DateTime.UtcNow.AddSeconds(seconds);
                while (DateTime.UtcNow < until)
                {
                    StatusSnapshot s;
                    lock (gate) s = latest;
                    if (s != null && predicate(s)) return true;
                    Thread.Sleep(500);
                }
                return false;
            };

            note("node=" + (controller.NodePath ?? "missing") + "  root=" + root);
            LocalInfo info = controller.LoadInfo();
            note("info  lan=" + string.Join(",", info.Lan.ToArray()) + "  wifi=" + info.Wifi +
                 "  qr=" + (info.Qr == null ? "none" : info.Qr.GetLength(0) + "x" + info.Qr.GetLength(0)));

            controller.Begin();
            bool ok = waitFor(delegate(StatusSnapshot s) { return true; }, 15);

            StatusSnapshot first;
            lock (gate) first = latest;
            if (first != null && first.State != AppState.Stopped)
            {
                note("something is already running; stopping it first");
                controller.Stop();
                ok &= waitFor(delegate(StatusSnapshot s) { return s.State == AppState.Stopped; }, 150);
            }

            string problem = controller.Start(false);
            note("start -> " + (problem ?? "ok"));
            if (problem != null) ok = false;

            waitFor(delegate(StatusSnapshot s) { return s.State == AppState.Running || s.State == AppState.Failed; }, 600);
            StatusSnapshot afterStart;
            lock (gate) afterStart = latest;
            bool running = afterStart != null && afterStart.State == AppState.Running;
            ok &= running;
            note("after start: " + (afterStart == null ? "no status" : afterStart.State.ToString()) + "  activity lines=" + logLines);

            Thread.Sleep(5000);
            controller.Stop();
            note("stop requested");
            bool stopped = waitFor(delegate(StatusSnapshot s) { return s.State == AppState.Stopped; }, 150);
            StatusSnapshot afterStop;
            lock (gate) afterStop = latest;
            ok &= stopped;
            note("after stop: " + (afterStop == null ? "no status" : afterStop.State.ToString()));

            controller.Dispose();
            note(ok ? "RESULT PASS" : "RESULT FAIL");
            return ok ? 0 : 2;
        }
    }
}
