// Algo Quant control panel: the main window.

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace AlgoQuant
{
    /// <summary>The area between the status strip and the footer. Scrolls only when the window is too short.</summary>
    internal class ScrollBody : Panel
    {
        public ScrollBody()
        {
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
            BackColor = Ui.Ground;
            AutoScroll = true;
        }
    }

    internal class MainForm : Form
    {
        public const string WindowTitle = "Algo Quant Launcher";

        private static readonly Color PillSuccess = Ui.Hex("#4EC58A");
        private static readonly Color PillWarning = Ui.Hex("#E5B45A");
        private static readonly Color PillDanger = Ui.Hex("#F08A7A");

        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
        private static extern int SetWindowTheme(IntPtr hWnd, string appName, string idList);

        private readonly Controller ctl;
        private readonly bool preview;

        private readonly HeaderPanel header = new HeaderPanel();
        private readonly StatusPill pill = new StatusPill();
        private readonly FlatBtn mainBtn = new FlatBtn();
        private readonly FlatBtn openAppBtn = new FlatBtn();

        private readonly StripPanel strip = new StripPanel();
        private readonly ServiceChip chipDb = new ServiceChip();
        private readonly ServiceChip chipApi = new ServiceChip();
        private readonly ServiceChip chipWeb = new ServiceChip();

        private readonly ScrollBody body = new ScrollBody();

        private readonly Card linksCard = new Card();
        private readonly UrlRow localRow = new UrlRow();
        private readonly UrlRow wifiRow = new UrlRow();
        private readonly NoticeBar wifiNotice = new NoticeBar();

        private readonly Card qrCard = new Card();
        private readonly QrView qr = new QrView();

        private readonly Card accountsCard = new Card();
        private readonly AccountsView accounts = new AccountsView();

        private readonly Card activityCard = new Card();
        private readonly Panel logFrame = new Panel();
        private readonly TextBox log = new TextBox();

        private readonly FooterPanel footer = new FooterPanel();
        private readonly FlatBtn resetBtn = new FlatBtn();
        private readonly FlatBtn folderBtn = new FlatBtn();
        private readonly FlatBtn logBtn = new FlatBtn();

        private readonly ToolTip tip = new ToolTip();
        private readonly System.Windows.Forms.Timer flashTimer = new System.Windows.Forms.Timer();

        private LocalInfo info = new LocalInfo();
        private StatusSnapshot status = new StatusSnapshot();
        private AppState lastState = (AppState)(-1);
        private bool gotStatus;
        private string flash = "";
        private Color flashColor = Ui.Success;
        private bool infoLoading;
        private bool pendingReset;
        private bool closeAfterStop;
        private bool openWhenReady;
        private bool allowClose;
        private string accountsKey = "";
        private string tipText = "";
        private bool showOpenApp;
        private bool showNotice;
        private bool layingOut;

        public MainForm(Controller controller, Image logo, bool preview)
        {
            ctl = controller;
            this.preview = preview;

            Text = WindowTitle;
            BackColor = Ui.Ground;
            Font = Ui.Body;
            AutoScaleMode = AutoScaleMode.None;
            DoubleBuffered = true;
            StartPosition = FormStartPosition.CenterScreen;
            Icon appIcon = LoadIcon();
            if (appIcon != null) Icon = appIcon;

            Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
            MinimumSize = new Size(Math.Min(Ui.S(920), area.Width), Math.Min(Ui.S(560), area.Height));
            Size = new Size(Math.Min(Ui.S(1120), area.Width - Ui.S(16)), Math.Min(Ui.S(840), area.Height - Ui.S(16)));

            // header
            header.Logo = logo;
            mainBtn.Kind = BtnKind.Accent;
            mainBtn.Backdrop = Ui.Navy;
            mainBtn.Glyph = Ui.GPlay;
            mainBtn.Text = "Start";
            mainBtn.Click += delegate { OnMainButton(); };
            openAppBtn.Kind = BtnKind.OnDark;
            openAppBtn.Backdrop = Ui.Navy;
            openAppBtn.Glyph = Ui.GOpen;
            openAppBtn.Text = "Open app";
            openAppBtn.Visible = false;
            openAppBtn.Click += delegate { OpenUrl(Controller.LocalUrl); };
            header.Controls.Add(pill);
            header.Controls.Add(openAppBtn);
            header.Controls.Add(mainBtn);

            // status strip
            chipDb.Label = "Database";
            chipDb.Detail = "port " + Controller.DbPort;
            chipApi.Label = "API";
            chipApi.Detail = "port " + Controller.ApiPort;
            chipWeb.Label = "Web app";
            chipWeb.Detail = "port " + Controller.UiPort;
            strip.Controls.Add(chipDb);
            strip.Controls.Add(chipApi);
            strip.Controls.Add(chipWeb);

            // links
            linksCard.Title = "Open Algo Quant";
            linksCard.Subtitle = "On this laptop, or from any phone or laptop on the same Wi-Fi";
            localRow.Glyph = Ui.GMonitor;
            localRow.Caption = "On this laptop";
            wifiRow.Glyph = Ui.GWifi;
            wifiRow.Caption = "On phones and other devices on the same Wi-Fi";
            localRow.OpenRequested += OpenUrl;
            wifiRow.OpenRequested += OpenUrl;
            localRow.CopyRequested += delegate(string url) { Copy(url, "Link copied"); };
            wifiRow.CopyRequested += delegate(string url) { Copy(url, "Wi-Fi link copied"); };
            wifiNotice.Action.Text = "Allow Wi-Fi access";
            wifiNotice.Action.Click += delegate { FixWifi(); };
            wifiNotice.Visible = false;
            linksCard.Controls.Add(localRow);
            linksCard.Controls.Add(wifiRow);
            linksCard.Controls.Add(wifiNotice);

            // QR
            qrCard.Title = "Scan with your phone";
            qrCard.Subtitle = "Opens the Wi-Fi link on your phone";
            qr.Logo = logo;
            qrCard.Controls.Add(qr);

            // accounts
            accountsCard.Title = "Sign-in accounts";
            accountsCard.Subtitle = "Click an email or a password to copy it";
            accounts.CopyRequested += delegate(string value, string what) { Copy(value, what == "email" ? "Email copied" : "Password copied"); };
            accountsCard.Controls.Add(accounts);

            // activity
            activityCard.Title = "Activity";
            activityCard.Subtitle = "Live output from the database, the API and the web app";
            logFrame.BackColor = Ui.LogBg;
            log.Multiline = true;
            log.ReadOnly = true;
            log.BorderStyle = BorderStyle.None;
            log.ScrollBars = ScrollBars.Vertical;
            log.WordWrap = true;
            log.BackColor = Ui.LogBg;
            log.ForeColor = Ui.LogInk;
            log.Font = Ui.MonoSmall;
            log.TabStop = false;
            log.HandleCreated += delegate
            {
                // dark scrollbar to match the log (Windows 10 1809 and later; ignored elsewhere)
                try { SetWindowTheme(log.Handle, "DarkMode_Explorer", null); } catch { }
            };
            logFrame.Controls.Add(log);
            activityCard.Controls.Add(logFrame);

            // footer
            resetBtn.Kind = BtnKind.Ghost;
            resetBtn.Glyph = Ui.GRefresh;
            resetBtn.Text = "Reset demo data";
            resetBtn.Click += delegate { ResetDemoData(); };
            folderBtn.Kind = BtnKind.Ghost;
            folderBtn.Glyph = Ui.GFolder;
            folderBtn.Text = "Open project folder";
            folderBtn.Click += delegate { OpenFolder(); };
            logBtn.Kind = BtnKind.Ghost;
            logBtn.Glyph = Ui.GDocument;
            logBtn.Text = "Open activity log";
            logBtn.Click += delegate { OpenLogFile(); };
            foreach (FlatBtn b in new[] { resetBtn, folderBtn, logBtn })
            {
                b.Backdrop = Ui.Surface;
                footer.Controls.Add(b);
            }
            Version v = Assembly.GetExecutingAssembly().GetName().Version;
            footer.Note = "Algo Quant " + v.Major + "." + v.Minor + "   " + ctl.Root;

            body.Controls.Add(linksCard);
            body.Controls.Add(qrCard);
            body.Controls.Add(accountsCard);
            body.Controls.Add(activityCard);
            body.ClientSizeChanged += delegate { LayoutBody(); };

            Controls.Add(header);
            Controls.Add(strip);
            Controls.Add(body);
            Controls.Add(footer);

            flashTimer.Interval = 2600;
            flashTimer.Tick += delegate
            {
                flashTimer.Stop();
                flash = "";
                Render();
            };

            if (!preview)
            {
                ctl.StatusChanged += delegate(StatusSnapshot s) { Post(delegate { ApplyStatus(s); }); };
                ctl.LogAppended += delegate(string[] lines) { Post(delegate { AppendLog(lines); }); };
                ctl.LogCleared += delegate { Post(delegate { log.Clear(); }); };
            }

            RebuildAccounts();
            Render();
        }

        private static Icon LoadIcon()
        {
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AlgoQuant.icon.ico"))
                {
                    // the multi-size icon keeps the title bar and taskbar sharp
                    if (stream != null) return new Icon(stream);
                }
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
                return null;
            }
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (preview) return;
            ctl.Begin();
            LoadInfoAsync();
            if (ctl.NodePath == null)
            {
                int choice = ChoiceDialog.Ask(this, "Node.js is needed",
                    "Algo Quant runs on Node.js, which is not installed on this computer. Install the LTS version, then open Algo Quant again.",
                    new[] { "Download Node.js", "Close" }, new[] { BtnKind.Primary, BtnKind.Ghost },
                    Ui.GInfo, Ui.BlueText, Ui.BlueSoft);
                if (choice == 0) OpenUrl("https://nodejs.org/en/download");
            }
        }

        private void Post(MethodInvoker action)
        {
            if (IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke(action);
            }
            catch (InvalidOperationException)
            {
                // window is closing
            }
        }

        /* ------------------------------------------------------------------ layout */

        protected override void OnLayout(LayoutEventArgs levent)
        {
            base.OnLayout(levent);
            DoLayoutNow();
        }

        public void DoLayoutNow()
        {
            int W = ClientSize.Width;
            int H = ClientSize.Height;
            if (W <= 0 || H <= 0) return;

            int headerH = Ui.S(76);
            int stripH = Ui.S(46);
            int footerH = Ui.S(50);

            header.SetBounds(0, 0, W, headerH);
            int bh = Ui.S(40);
            int mainW = Math.Max(Ui.S(128), mainBtn.PreferredWidth + Ui.S(8));
            mainBtn.SetBounds(W - Ui.S(22) - mainW, (headerH - bh) / 2, mainW, bh);
            int x = mainBtn.Left - Ui.S(10);
            if (showOpenApp)
            {
                int ow = openAppBtn.PreferredWidth + Ui.S(4);
                openAppBtn.SetBounds(x - ow, (headerH - bh) / 2, ow, bh);
                x = openAppBtn.Left - Ui.S(16);
            }
            int pw = pill.PreferredWidth;
            int ph = Ui.S(30);
            pill.SetBounds(x - pw, (headerH - ph) / 2, pw, ph);

            strip.SetBounds(0, headerH, W, stripH);
            int cx = Ui.S(22);
            foreach (ServiceChip chip in new[] { chipDb, chipApi, chipWeb })
            {
                int w = chip.PreferredWidth;
                chip.SetBounds(cx, 1, w, stripH - 3);
                cx += w + Ui.S(20);
            }
            strip.MessageLeft = cx;
            strip.Invalidate();

            footer.SetBounds(0, H - footerH, W, footerH);
            int fx = Ui.S(12);
            foreach (FlatBtn b in new[] { resetBtn, folderBtn, logBtn })
            {
                int w = b.PreferredWidth;
                b.SetBounds(fx, (footerH - Ui.S(34)) / 2, w, Ui.S(34));
                fx += w + Ui.S(2);
            }

            body.SetBounds(0, headerH + stripH, W, Math.Max(0, H - headerH - stripH - footerH));
            LayoutBody();
        }

        private void LayoutBody()
        {
            if (layingOut) return;
            layingOut = true;
            try
            {
                if (body.ClientSize.Width <= 0 || body.ClientSize.Height <= 0) return;

                int pad = Ui.S(18);
                int gap = Ui.S(14);
                int rowH = Ui.S(74);
                int qrW = Ui.S(300);

                int linksTop = linksCard.ContentTop + Ui.S(2);
                int linksNeed = linksTop + rowH * 2 + Ui.S(8) + (showNotice ? Ui.S(54) : 0) + Ui.S(12);
                int rowA = Math.Max(linksNeed, Ui.S(290));
                int rowBMin = Math.Max(accountsCard.ContentTop + accounts.ContentHeight + Ui.S(12), Ui.S(200));

                // when the window is shorter than the cards, scroll instead of squeezing them
                var min = new Size(0, pad + rowA + gap + rowBMin + pad);
                if (body.AutoScrollMinSize != min) body.AutoScrollMinSize = min;

                // size from the outer bounds so no card reaches under the vertical scrollbar,
                // which would add a horizontal one
                bool scrolls = body.Height < min.Height;
                int W = body.Width - (scrolls ? SystemInformation.VerticalScrollBarWidth : 0);
                int H = body.Height;
                int top = pad + body.AutoScrollPosition.Y;
                int rowB = Math.Max(rowBMin, H - pad - rowA - gap - pad);

                linksCard.SetBounds(pad, top, W - pad * 2 - gap - qrW, rowA);
                qrCard.SetBounds(W - pad - qrW, top, qrW, rowA);

                int inner = linksCard.Width - Ui.S(36);
                localRow.SetBounds(Ui.S(18), linksTop, inner, rowH);
                wifiRow.SetBounds(Ui.S(18), linksTop + rowH + Ui.S(8), inner, rowH);
                wifiNotice.SetBounds(Ui.S(18), wifiRow.Bottom + Ui.S(6), inner, Ui.S(48));
                qr.SetBounds(Ui.S(18), qrCard.ContentTop, qrCard.Width - Ui.S(36), qrCard.Height - qrCard.ContentTop - Ui.S(10));

                int rowBTop = top + rowA + gap;
                int accW = Math.Max(Ui.S(400), (int)((W - pad * 2 - gap) * 0.46));
                accountsCard.SetBounds(pad, rowBTop, accW, rowB);
                activityCard.SetBounds(pad + accW + gap, rowBTop, W - pad * 2 - gap - accW, rowB);

                accounts.SetBounds(Ui.S(18), accountsCard.ContentTop, accountsCard.Width - Ui.S(36),
                    accountsCard.Height - accountsCard.ContentTop - Ui.S(10));
                logFrame.SetBounds(Ui.S(14), activityCard.ContentTop, activityCard.Width - Ui.S(28),
                    activityCard.Height - activityCard.ContentTop - Ui.S(14));
                log.SetBounds(Ui.S(10), Ui.S(8), logFrame.Width - Ui.S(12), logFrame.Height - Ui.S(16));
            }
            finally
            {
                layingOut = false;
            }
        }

        /* ------------------------------------------------------------------ state */

        private void ApplyStatus(StatusSnapshot s)
        {
            status = s;
            gotStatus = true;
            if (s.State != lastState)
            {
                AppState previous = lastState;
                lastState = s.State;
                OnStateChanged(previous, s.State);
            }
            Render();
        }

        private void OnStateChanged(AppState previous, AppState current)
        {
            if (current == AppState.Running) LoadInfoAsync();

            // Start opens the website once it answers, on whichever free port the launcher picked
            if (current == AppState.Running && openWhenReady) OpenUrl(Controller.LocalUrl);
            if (current != AppState.Starting) openWhenReady = false;

            bool settled = current == AppState.Stopped || current == AppState.Failed || current == AppState.Partial;
            if (previous == AppState.Stopping && settled)
            {
                if (closeAfterStop)
                {
                    allowClose = true;
                    Post(delegate { Close(); });
                    return;
                }
                if (pendingReset && current == AppState.Stopped)
                {
                    pendingReset = false;
                    StartEnvironment(true);
                }
            }
        }

        private void Render()
        {
            AppState state = status.State;
            string pillText = "Stopped";
            Color tone = Ui.MutedSoft;
            string buttonText = "Start";
            BtnKind kind = BtnKind.Accent;
            string glyph = Ui.GPlay;
            bool buttonEnabled = true;
            string message = "Press Start to run Algo Quant.";
            Color messageColor = Ui.Muted;

            switch (state)
            {
                case AppState.Starting:
                    pillText = "Starting";
                    tone = PillWarning;
                    buttonText = "Stop";
                    kind = BtnKind.OnDark;
                    glyph = Ui.GStop;
                    message = status.Phase.Length > 0 ? status.Phase + "…" : "Starting…";
                    messageColor = Ui.WarningInk;
                    break;
                case AppState.Running:
                    pillText = "Running";
                    tone = PillSuccess;
                    buttonText = "Stop";
                    kind = BtnKind.Danger;
                    glyph = Ui.GStop;
                    message = "Everything is running.";
                    messageColor = Ui.Success;
                    break;
                case AppState.Recovering:
                    pillText = "Recovering";
                    tone = PillWarning;
                    buttonText = "Stop";
                    kind = BtnKind.Danger;
                    glyph = Ui.GStop;
                    message = "Restarting a service that stopped…";
                    messageColor = Ui.WarningInk;
                    break;
                case AppState.Stopping:
                    pillText = "Stopping";
                    tone = PillWarning;
                    buttonText = "Stopping";
                    kind = BtnKind.OnDark;
                    glyph = Ui.GStop;
                    buttonEnabled = false;
                    message = "Stopping everything…";
                    messageColor = Ui.WarningInk;
                    break;
                case AppState.Failed:
                    pillText = "Stopped with an error";
                    tone = PillDanger;
                    buttonText = "Start again";
                    glyph = Ui.GRefresh;
                    message = status.Error.Length > 0 ? status.Error : "Stopped while starting. See Activity.";
                    messageColor = Ui.Danger;
                    break;
                case AppState.Partial:
                    pillText = "Partly running";
                    tone = PillWarning;
                    buttonText = "Stop";
                    kind = BtnKind.Danger;
                    glyph = Ui.GStop;
                    message = "Some parts are still running.";
                    messageColor = Ui.WarningInk;
                    break;
            }

            if (preview)
            {
                // snapshot: show the state as given
            }
            else if (ctl.NodePath == null)
            {
                pillText = "Node.js missing";
                tone = PillDanger;
                buttonText = "Get Node.js";
                kind = BtnKind.Accent;
                glyph = Ui.GOpen;
                buttonEnabled = true;
                message = "Install Node.js to run Algo Quant.";
                messageColor = Ui.Danger;
            }
            else if (!gotStatus)
            {
                pillText = "Checking";
                tone = Ui.MutedSoft;
                buttonEnabled = false;
                message = "Checking what is running…";
            }
            if (flash.Length > 0)
            {
                message = flash;
                messageColor = flashColor;
            }

            bool layoutChanged = false;

            if (pill.Text != pillText)
            {
                pill.Text = pillText;
                layoutChanged = true;
            }
            pill.Tone = tone;
            pill.Invalidate();

            if (mainBtn.Text != buttonText)
            {
                mainBtn.Text = buttonText;
                layoutChanged = true;
            }
            mainBtn.Kind = kind;
            mainBtn.Glyph = glyph;
            mainBtn.Enabled = buttonEnabled;
            mainBtn.Invalidate();

            bool running = state == AppState.Running;
            if (showOpenApp != running)
            {
                showOpenApp = running;
                openAppBtn.Visible = running;
                layoutChanged = true;
            }

            // the launcher may have moved to another port because 5173 / 3001 were taken
            string apiDetail = "port " + Controller.ApiPort;
            string webDetail = "port " + Controller.UiPort;
            if (chipApi.Detail != apiDetail || chipWeb.Detail != webDetail)
            {
                chipApi.Detail = apiDetail;
                chipWeb.Detail = webDetail;
                layoutChanged = true;
            }

            bool starting = gotStatus && (state == AppState.Starting || state == AppState.Recovering);
            layoutChanged |= SetChip(chipDb, status.Db, starting, state == AppState.Stopping);
            layoutChanged |= SetChip(chipApi, status.Api, starting, state == AppState.Stopping);
            layoutChanged |= SetChip(chipWeb, status.Web, starting, state == AppState.Stopping);

            string notStarted = "Available once Algo Quant is running";
            localRow.SetUrl(Controller.LocalUrl, running, running ? "" : notStarted);
            string wifiUrl = info.WifiUrl;
            wifiRow.SetUrl(wifiUrl, running,
                wifiUrl.Length == 0 ? (infoLoading ? "Looking for your network…" : "Not connected to Wi-Fi or a network") : (running ? "" : notStarted));

            // the latest check wins: local-info runs again after "Allow Wi-Fi access"
            string wifi = info.Wifi.Length > 0 ? info.Wifi : status.Wifi;
            bool blocked = wifiUrl.Length > 0 && (wifi == "no-rule" || wifi == "public-network");
            if (blocked)
            {
                wifiNotice.Message = wifi == "no-rule"
                    ? "Windows Firewall is blocking other devices from this link."
                    : "Windows treats this Wi-Fi as Public and blocks other devices.";
                wifiNotice.Invalidate();
            }
            if (showNotice != blocked)
            {
                showNotice = blocked;
                wifiNotice.Visible = blocked;
                layoutChanged = true;
            }

            qr.Modules = info.Qr;
            qr.Live = running;
            qr.Overlay = running ? "" : "Start Algo Quant to use this code";
            qr.Caption = wifiUrl.Length > 0 ? wifiUrl : "No network connection";
            qr.Invalidate();

            strip.Message = message;
            strip.MessageColor = messageColor;
            strip.Invalidate();
            if (message != tipText)
            {
                // long errors are cut short in the strip; the tooltip shows all of it
                tipText = message;
                tip.SetToolTip(strip, message);
            }

            resetBtn.Enabled = preview || (ctl.NodePath != null && gotStatus && state != AppState.Stopping);

            RebuildAccounts();
            if (layoutChanged) DoLayoutNow();
        }

        /// <summary>Updates one service chip. Returns true when its width may have changed.</summary>
        private static bool SetChip(ServiceChip chip, bool up, bool starting, bool stopping)
        {
            string text;
            if (up)
            {
                chip.Tone = Ui.Success;
                text = stopping ? "Stopping" : "Running";
            }
            else if (starting)
            {
                chip.Tone = Ui.Warning;
                text = "Starting";
            }
            else
            {
                chip.Tone = Ui.LineStrong;
                text = "Stopped";
            }
            bool changed = chip.StateText != text;
            chip.StateText = text;
            chip.Invalidate();
            return changed;
        }

        private void RebuildAccounts()
        {
            string key = info.AdminEmail + "|" + info.AdminPassword + "|" + info.Demo;
            if (key == accountsKey) return;
            accountsKey = key;
            accounts.Items.Clear();
            accounts.Items.Add(new Account("Admin", info.AdminEmail, info.AdminPassword));
            if (info.Demo)
            {
                accounts.Items.Add(new Account("Sales", "reem.sales@algoquant.local", "Demo@123"));
                accounts.Items.Add(new Account("Media", "karim.media@algoquant.local", "Demo@123"));
                accounts.Items.Add(new Account("Operations", "sara.ops@algoquant.local", "Demo@123"));
                accounts.Items.Add(new Account("Accounting", "fadi.finance@algoquant.local", "Demo@123"));
                accounts.Items.Add(new Account("Instructor", "omar.instructor@algoquant.local", "Demo@123"));
            }
            accounts.Invalidate();
            LayoutBody();
        }

        private void LoadInfoAsync()
        {
            if (infoLoading) return;
            infoLoading = true;
            Render();
            var thread = new Thread(delegate()
            {
                LocalInfo loaded = ctl.LoadInfo();
                Post(delegate
                {
                    info = loaded;
                    infoLoading = false;
                    Render();
                });
            });
            thread.IsBackground = true;
            thread.Start();
        }

        private void AppendLog(string[] lines)
        {
            var sb = new StringBuilder();
            foreach (string line in lines) sb.Append(line).Append("\r\n");
            if (log.TextLength > 400000)
            {
                // keep the newest half so the box stays responsive during long sessions
                log.Text = log.Text.Substring(log.TextLength - 200000);
            }
            log.AppendText(sb.ToString());
        }

        /* ------------------------------------------------------------------ actions */

        private void OnMainButton()
        {
            if (ctl.NodePath == null)
            {
                OpenUrl("https://nodejs.org/en/download");
                return;
            }
            switch (status.State)
            {
                case AppState.Stopped:
                case AppState.Failed:
                    StartEnvironment(false);
                    break;
                case AppState.Starting:
                case AppState.Running:
                case AppState.Recovering:
                case AppState.Partial:
                    StopEnvironment();
                    break;
            }
        }

        private void StartEnvironment(bool reset)
        {
            log.Clear();
            string problem = ctl.Start(reset);
            openWhenReady = problem == null;
            if (problem != null)
            {
                ChoiceDialog.Ask(this, "Algo Quant could not start", problem, new[] { "OK" }, new[] { BtnKind.Primary },
                    Ui.GWarning, Ui.Danger, Ui.DangerSoft);
            }
            status = ctl.Current;
            lastState = status.State;
            Render();
        }

        private void StopEnvironment()
        {
            ctl.Stop();
            status = ctl.Current;
            lastState = status.State;
            Render();
        }

        private void ResetDemoData()
        {
            if (status.State == AppState.Stopping) return;
            int choice = ChoiceDialog.Ask(this, "Reset the demo data?",
                "This deletes everything in the local database, including any leads, courses, students and payments added while testing, and restores the original demo data. Algo Quant restarts afterwards.",
                new[] { "Reset and restart", "Cancel" }, new[] { BtnKind.Danger, BtnKind.Ghost },
                Ui.GWarning, Ui.Danger, Ui.DangerSoft);
            if (choice != 0) return;

            AppState s = status.State;
            if (s == AppState.Stopped || s == AppState.Failed)
            {
                StartEnvironment(true);
            }
            else
            {
                pendingReset = true;
                StopEnvironment();
            }
        }

        private void FixWifi()
        {
            string script = Path.Combine(ctl.Root, "allow-wifi-access.bat");
            if (!File.Exists(script))
            {
                Flash("allow-wifi-access.bat is missing", Ui.Danger);
                return;
            }
            try
            {
                var psi = new ProcessStartInfo(script);
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                psi.WorkingDirectory = ctl.Root;
                Process process = Process.Start(psi);
                var thread = new Thread(delegate()
                {
                    try
                    {
                        if (process != null) process.WaitForExit();
                    }
                    catch
                    {
                        // ignore
                    }
                    Post(delegate { LoadInfoAsync(); });
                });
                thread.IsBackground = true;
                thread.Start();
            }
            catch (System.ComponentModel.Win32Exception)
            {
                // the administrator prompt was declined
            }
        }

        private void OpenFolder()
        {
            try
            {
                Process.Start("explorer.exe", Controller.Quote(ctl.Root));
            }
            catch
            {
                // ignore
            }
        }

        private void OpenLogFile()
        {
            string path = ctl.SessionLogPath;
            if (!File.Exists(path))
            {
                Flash("No activity log yet. Press Start first.", Ui.Muted);
                return;
            }
            try
            {
                Process.Start("notepad.exe", Controller.Quote(path));
            }
            catch
            {
                // ignore
            }
        }

        private void OpenUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            try
            {
                var psi = new ProcessStartInfo(url);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch
            {
                Copy(url, null);
                Flash("Couldn't open the browser; link copied", Ui.Danger);
            }
        }

        private void Copy(string value, string confirmation)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    Clipboard.SetText(value);
                    if (confirmation != null) Flash(confirmation);
                    return;
                }
                catch (ExternalException)
                {
                    // another program holds the clipboard for a moment
                    Thread.Sleep(60);
                }
            }
        }

        private void Flash(string text)
        {
            Flash(text, Ui.Success);
        }

        private void Flash(string text, Color color)
        {
            flash = text;
            flashColor = color;
            flashTimer.Stop();
            flashTimer.Start();
            Render();
        }

        /* ------------------------------------------------------------------ closing */

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (preview || allowClose || e.CloseReason == CloseReason.WindowsShutDown)
            {
                ctl.Dispose();
                base.OnFormClosing(e);
                return;
            }

            AppState s = status.State;
            if (s == AppState.Stopping)
            {
                e.Cancel = true;
                closeAfterStop = true;
                Flash("Closing once everything has stopped…", Ui.WarningInk);
                return;
            }

            bool active = s == AppState.Running || s == AppState.Starting || s == AppState.Recovering || s == AppState.Partial;
            if (active)
            {
                int choice = ChoiceDialog.Ask(this, "Algo Quant is still running",
                    "Stop it before closing, or keep it running in the background so the links keep working. Open this window again any time to stop it.",
                    new[] { "Stop and close", "Keep running", "Cancel" },
                    new[] { BtnKind.Danger, BtnKind.Secondary, BtnKind.Ghost },
                    Ui.GInfo, Ui.BlueText, Ui.BlueSoft);
                if (choice == 0)
                {
                    e.Cancel = true;
                    closeAfterStop = true;
                    StopEnvironment();
                    return;
                }
                if (choice != 1)
                {
                    e.Cancel = true;
                    return;
                }
            }

            ctl.Dispose();
            base.OnFormClosing(e);
        }

        /* ------------------------------------------------------------------ preview */

        /// <summary>Fills the window with a representative state for a design snapshot.</summary>
        public void ApplyPreview(string state)
        {
            info = ctl.LoadInfo();
            if (info.Lan.Count == 0) info.Lan.Add("192.168.1.20");
            var s = new StatusSnapshot();
            s.Wifi = info.Wifi;
            switch (state)
            {
                case "stopped":
                    s.State = AppState.Stopped;
                    break;
                case "starting":
                    s.State = AppState.Starting;
                    s.Db = true;
                    s.Phase = "Starting the web app";
                    break;
                default:
                    s.State = AppState.Running;
                    s.Db = s.Api = s.Web = true;
                    break;
            }
            status = s;
            lastState = s.State;
            gotStatus = true;
            if (s.State != AppState.Stopped)
            {
                AppendLog(new[]
                {
                    "[algo] starting PostgreSQL on port 5433…",
                    "[algo] database running",
                    "[algo] starting the API…",
                    "[api] Algo Quant API running on port 3001 [development]",
                    "[algo] starting the UI (localhost + Wi-Fi)…",
                    "[ui]   VITE v8.1.0  ready in 212 ms",
                    "[ui]   ➜  Local:   http://localhost:5173/",
                });
            }
            RebuildAccounts();
            Render();
            DoLayoutNow();
        }
    }
}
