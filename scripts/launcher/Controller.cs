// Algo Quant control panel: starts and stops the local environment and watches its health.
// Everything here is independent of the window, so it can also run headless (--selftest).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace AlgoQuant
{
    internal enum AppState
    {
        Stopped,
        Starting,
        Running,
        Recovering,
        Stopping,
        Failed,
        Partial
    }

    internal sealed class StatusSnapshot
    {
        public AppState State;
        public bool Db;
        public bool Api;
        public bool Web;
        public string Phase = "";
        public string Error = "";
        public string Wifi = "";
    }

    internal sealed class LocalInfo
    {
        public readonly List<string> Lan = new List<string>();
        public string Wifi = "";
        public bool Demo = true;
        public string AdminEmail = "admin@algoquant.local";
        public string AdminPassword = "Admin123!";
        public string QrUrl = "";
        public bool[,] Qr;

        public string WifiUrl
        {
            get { return Lan.Count > 0 ? "http://" + Lan[0] + ":" + Controller.UiPort : ""; }
        }
    }

    internal sealed class Controller : IDisposable
    {
        // The launcher picks free ports at start (another app may own 5173) and records
        // them in .local/ports.json; the panel follows whatever it chose.
        public static volatile int UiPort = 5173;
        public static volatile int ApiPort = 3001;
        public const int DbPort = 5433;
        public static string LocalUrl { get { return "http://localhost:" + UiPort; } }

        public readonly string Root;
        public readonly string NodePath;

        /// <summary>Raised on a background thread roughly once a second.</summary>
        public event Action<StatusSnapshot> StatusChanged;
        /// <summary>New activity lines (protocol lines removed). Background thread.</summary>
        public event Action<string[]> LogAppended;
        /// <summary>The session log restarted (a new start). Background thread.</summary>
        public event Action LogCleared;

        private readonly object gate = new object();
        private volatile bool disposed;
        private Process launcher;
        private bool stopping;
        private bool stopProcessDone;
        private DateTime stopDoneAt;
        private bool wasRunning;
        private string phase = "";
        private string error = "";
        private string wifi = "";
        private bool db;
        private bool api;
        private bool web;
        private long logOffset;
        private bool logDecided;
        private DateTime logFreshAfter = DateTime.MinValue;

        public Controller(string root, string nodePath)
        {
            Root = root;
            NodePath = nodePath;
        }

        public string LocalDir { get { return Path.Combine(Root, ".local"); } }
        public string SessionLogPath { get { return Path.Combine(LocalDir, "session.log"); } }
        private string ScriptPath { get { return Path.Combine(Root, "scripts", "dev-local.mjs"); } }

        public void Begin()
        {
            var worker = new Thread(Loop);
            worker.IsBackground = true;
            worker.Name = "algo-quant-status";
            worker.Start();
        }

        public void Dispose()
        {
            disposed = true;
        }

        public StatusSnapshot Current
        {
            get { lock (gate) return Build(); }
        }

        /// <summary>Start the environment. Returns a user-facing problem, or null on success.</summary>
        public string Start(bool reset)
        {
            if (NodePath == null) return "Node.js is not installed on this computer.";
            lock (gate)
            {
                if (launcher != null && !HasExited(launcher)) return "Algo Quant is already starting.";
                if (stopping) return "Algo Quant is still stopping. Try again in a moment.";
                error = "";
                phase = reset ? "Resetting the demo data" : "Starting";
                wasRunning = false;
            }

            try
            {
                string arguments = Quote(ScriptPath) + " --gui --no-open" + (reset ? " --reset" : "");
                var psi = Hidden(NodePath, arguments);
                psi.EnvironmentVariables["NO_COLOR"] = "1";
                psi.EnvironmentVariables["FORCE_COLOR"] = "0";
                Process process = Process.Start(psi);
                lock (gate)
                {
                    launcher = process;
                    logOffset = 0;
                    logDecided = true;
                    // the launcher empties session.log as it starts; ignore the previous session until then
                    logFreshAfter = DateTime.UtcNow.AddSeconds(-2);
                }
                Raise(LogCleared);
                return null;
            }
            catch (Exception ex)
            {
                lock (gate)
                {
                    phase = "";
                    error = "Could not start Node.js: " + ex.Message;
                }
                return error;
            }
        }

        /// <summary>Stop the environment, whoever started it. Returns immediately.</summary>
        public void Stop()
        {
            if (NodePath == null) return;
            lock (gate)
            {
                if (stopping) return;
                stopping = true;
                stopProcessDone = false;
                phase = "Stopping";
            }

            var thread = new Thread(delegate()
            {
                try
                {
                    using (Process p = Process.Start(Hidden(NodePath, Quote(ScriptPath) + " --stop --gui")))
                    {
                        p.WaitForExit(90000);
                    }
                }
                catch
                {
                    // the status loop reports whatever is still running
                }
                lock (gate)
                {
                    stopProcessDone = true;
                    stopDoneAt = DateTime.UtcNow;
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        /// <summary>LAN addresses, Wi-Fi status, accounts and the QR code, via scripts/local-info.mjs.</summary>
        public LocalInfo LoadInfo()
        {
            var info = new LocalInfo();
            if (NodePath == null) return info;
            try
            {
                var psi = Hidden(NodePath, Quote(Path.Combine(Root, "scripts", "local-info.mjs")));
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                using (Process p = Process.Start(psi))
                {
                    p.ErrorDataReceived += delegate { };
                    p.BeginErrorReadLine();
                    string output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(20000);
                    Parse(output, info);
                }
            }
            catch
            {
                // leave the defaults; the panel still works without the extras
            }
            return info;
        }

        private static void Parse(string output, LocalInfo info)
        {
            var rows = new List<string>();
            int size = 0;
            foreach (string raw in output.Split('\n'))
            {
                string line = raw.TrimEnd('\r');
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string key = line.Substring(0, eq);
                string value = line.Substring(eq + 1);
                switch (key)
                {
                    case "lan": info.Lan.Add(value); break;
                    case "wifi": info.Wifi = value; break;
                    case "demo": info.Demo = value != "false"; break;
                    case "admin.email": info.AdminEmail = value; break;
                    case "admin.password": info.AdminPassword = value; break;
                    case "qr.url": info.QrUrl = value; break;
                    case "qr.size": int.TryParse(value, out size); break;
                    case "qr.row": rows.Add(value); break;
                }
            }
            if (size > 0 && rows.Count == size)
            {
                var matrix = new bool[size, size];
                for (int r = 0; r < size; r++)
                {
                    string row = rows[r];
                    for (int c = 0; c < size && c < row.Length; c++) matrix[r, c] = row[c] == '1';
                }
                info.Qr = matrix;
            }
        }

        private void Loop()
        {
            while (!disposed)
            {
                // connecting to a closed port takes about a second on Windows, so only probe listening ports
                ReadPorts();
                List<int> open = ListeningPorts();
                bool d = (open == null || open.Contains(DbPort)) && Tcp(DbPort);
                bool a = (open == null || open.Contains(ApiPort)) && Http("http://127.0.0.1:" + ApiPort + "/health");
                bool w = (open == null || open.Contains(UiPort)) &&
                         (IsOurApp("http://127.0.0.1:" + UiPort + "/") || IsOurApp("http://[::1]:" + UiPort + "/"));

                bool cleared;
                List<string> lines = ReadLog(d || a || w, out cleared);
                var visible = new List<string>();
                StatusSnapshot snapshot;
                lock (gate)
                {
                    db = d;
                    api = a;
                    web = w;
                    foreach (string line in lines)
                    {
                        if (line.StartsWith("@@", StringComparison.Ordinal)) HandleProtocol(line);
                        else visible.Add(line);
                    }
                    snapshot = Build();
                }

                if (cleared) Raise(LogCleared);
                if (visible.Count > 0)
                {
                    Action<string[]> handler = LogAppended;
                    if (handler != null) handler(visible.ToArray());
                }
                Action<StatusSnapshot> changed = StatusChanged;
                if (changed != null) changed(snapshot);

                Thread.Sleep(900);
            }
        }

        private void HandleProtocol(string line)
        {
            string[] parts = line.Substring(2).Split('|');
            string kind = parts[0];
            string arg = parts.Length > 1 ? parts[1] : "";
            switch (kind)
            {
                case "phase": phase = arg; break;
                case "ports":
                    int ui, apiPort;
                    if (int.TryParse(arg, out ui)) UiPort = ui;
                    if (parts.Length > 2 && int.TryParse(parts[2], out apiPort)) ApiPort = apiPort;
                    break;
                case "ready": phase = ""; error = ""; break;
                case "error": error = arg; break;
                case "wifi": wifi = arg; break;
                case "stopped": phase = ""; break;
                case "already": phase = ""; break;
            }
        }

        private StatusSnapshot Build()
        {
            bool all = db && api && web;
            bool any = db || api || web;
            bool ours = launcher != null && !HasExited(launcher);
            AppState state;

            if (stopping)
            {
                bool settled = stopProcessDone && (!any || (DateTime.UtcNow - stopDoneAt).TotalSeconds > 12);
                if (settled)
                {
                    stopping = false;
                    phase = "";
                    wasRunning = false;
                    if (!any) launcher = null;
                    state = any ? AppState.Partial : AppState.Stopped;
                }
                else
                {
                    state = AppState.Stopping;
                }
            }
            else if (all)
            {
                state = AppState.Running;
                wasRunning = true;
                phase = "";
            }
            else if (ours)
            {
                state = wasRunning ? AppState.Recovering : AppState.Starting;
            }
            else if (launcher != null && ExitCode(launcher) != 0 && !any)
            {
                state = AppState.Failed;
                if (error.Length == 0) error = "Algo Quant stopped while starting. The activity log shows why.";
            }
            else if (any)
            {
                state = AppState.Partial;
            }
            else
            {
                state = AppState.Stopped;
                wasRunning = false;
            }

            var snapshot = new StatusSnapshot();
            snapshot.State = state;
            snapshot.Db = db;
            snapshot.Api = api;
            snapshot.Web = web;
            snapshot.Phase = phase;
            snapshot.Error = state == AppState.Failed || state == AppState.Starting ? error : "";
            snapshot.Wifi = wifi;
            return snapshot;
        }

        private List<string> ReadLog(bool anyUp, out bool cleared)
        {
            cleared = false;
            var lines = new List<string>();
            string path = SessionLogPath;
            try
            {
                if (!File.Exists(path)) return lines;

                long start;
                lock (gate)
                {
                    if (!logDecided)
                    {
                        // Opened the panel: show the running session's log, skip a finished one.
                        logDecided = true;
                        logOffset = anyUp ? 0 : new FileInfo(path).Length;
                    }
                    if (File.GetLastWriteTimeUtc(path) < logFreshAfter) return lines;
                    start = logOffset;
                }

                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (fs.Length < start)
                    {
                        start = 0;
                        cleared = true;
                    }
                    long available = fs.Length - start;
                    if (available <= 0)
                    {
                        lock (gate) logOffset = start;
                        return lines;
                    }
                    if (available > 4 * 1024 * 1024)
                    {
                        // a huge backlog: only the tail is useful
                        start = fs.Length - 4 * 1024 * 1024;
                        available = fs.Length - start;
                    }
                    var buffer = new byte[available];
                    fs.Seek(start, SeekOrigin.Begin);
                    int read = 0;
                    while (read < buffer.Length)
                    {
                        int n = fs.Read(buffer, read, buffer.Length - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    // only consume whole lines, so a multi-byte character is never split
                    int lastNewline = Array.LastIndexOf(buffer, (byte)'\n', read - 1);
                    if (lastNewline < 0)
                    {
                        lock (gate) logOffset = start;
                        return lines;
                    }
                    string text = Encoding.UTF8.GetString(buffer, 0, lastNewline + 1);
                    lock (gate) logOffset = start + lastNewline + 1;
                    foreach (string raw in text.Split('\n'))
                    {
                        string line = raw.TrimEnd('\r');
                        if (line.Length > 0) lines.Add(line);
                    }
                }
            }
            catch
            {
                // the file is being replaced; try again next tick
            }
            return lines;
        }

        private static ProcessStartInfo Hidden(string file, string arguments)
        {
            var psi = new ProcessStartInfo(file, arguments);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            return psi;
        }

        private static bool HasExited(Process p)
        {
            try { return p.HasExited; } catch { return true; }
        }

        private static int ExitCode(Process p)
        {
            try { return p.HasExited ? p.ExitCode : 0; } catch { return 0; }
        }

        private void Raise(Action handler)
        {
            if (handler != null) handler();
        }

        public static string Quote(string value)
        {
            return value.IndexOf(' ') >= 0 ? "\"" + value + "\"" : value;
        }

        private static List<int> ListeningPorts()
        {
            try
            {
                var ports = new List<int>();
                foreach (IPEndPoint endpoint in System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())
                {
                    ports.Add(endpoint.Port);
                }
                return ports;
            }
            catch
            {
                return null;
            }
        }

        private static bool Tcp(int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    IAsyncResult ar = client.BeginConnect("127.0.0.1", port, null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(600)) return false;
                    client.EndConnect(ar);
                    return client.Connected;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Follow the ports the launcher chose (.local/ports.json), keeping the defaults until it writes one.</summary>
        private void ReadPorts()
        {
            try
            {
                string path = Path.Combine(LocalDir, "ports.json");
                if (!File.Exists(path)) return;
                string json = File.ReadAllText(path);
                int ui = JsonInt(json, "ui");
                int apiPort = JsonInt(json, "api");
                if (ui > 0) UiPort = ui;
                if (apiPort > 0) ApiPort = apiPort;
            }
            catch
            {
                // being rewritten; the next tick reads it
            }
        }

        private static int JsonInt(string json, string key)
        {
            var match = System.Text.RegularExpressions.Regex.Match(json, "\"" + key + "\"\\s*:\\s*(\\d+)");
            int value;
            return match.Success && int.TryParse(match.Groups[1].Value, out value) ? value : 0;
        }

        /// <summary>True when the page on this URL is Algo Quant, not another app sharing the port.</summary>
        private static bool IsOurApp(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.Proxy = null;
                request.KeepAlive = false;
                request.AllowAutoRedirect = false;
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    var buffer = new char[8192];
                    int n = reader.ReadBlock(buffer, 0, buffer.Length);
                    return new string(buffer, 0, n).IndexOf("Algo Quant", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool Http(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.Proxy = null;
                request.KeepAlive = false;
                request.AllowAutoRedirect = false;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode < 500;
                }
            }
            catch (WebException ex)
            {
                var response = ex.Response as HttpWebResponse;
                if (response == null) return false;
                int code = (int)response.StatusCode;
                response.Close();
                return code < 500;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>The folder holding package.json and the launcher script: this folder or a parent.</summary>
        public static string FindRoot(string start)
        {
            string dir = start;
            for (int i = 0; i < 4 && dir != null; i++)
            {
                if (File.Exists(Path.Combine(dir, "package.json")) &&
                    File.Exists(Path.Combine(dir, "scripts", "dev-local.mjs")))
                {
                    return dir;
                }
                DirectoryInfo parent = Directory.GetParent(dir);
                dir = parent == null ? null : parent.FullName;
            }
            return null;
        }

        public static string FindNode()
        {
            string pathVar = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string part in pathVar.Split(';'))
            {
                if (part.Length == 0) continue;
                try
                {
                    string candidate = Path.Combine(part.Trim('"'), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch
                {
                    // malformed PATH entry
                }
            }
            string[] common =
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
            };
            foreach (string candidate in common)
            {
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }
    }
}
