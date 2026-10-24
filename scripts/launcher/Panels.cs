// Algo Quant control panel: header, status strip, link rows, QR code, accounts and dialogs.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace AlgoQuant
{
    /// <summary>Deep-blue header with the logo lockup. Pill and main button are child controls.</summary>
    internal class HeaderPanel : Panel
    {
        public Image Logo;

        public HeaderPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Navy;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Navy);
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // soft glow of the logo blue behind the mark
            using (var path = new GraphicsPath())
            {
                var glow = new RectangleF(-Ui.S(120), -Ui.S(150), Ui.S(420), Ui.S(360));
                path.AddEllipse(glow);
                using (var brush = new PathGradientBrush(path))
                {
                    brush.CenterColor = Ui.Alpha(Ui.Blue, 70);
                    brush.SurroundColors = new[] { Ui.Alpha(Ui.Navy, 0) };
                    g.FillRectangle(brush, glow);
                }
            }

            int markSize = Ui.S(46);
            int markY = (Height - markSize) / 2;
            if (Logo != null)
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(Logo, new Rectangle(Ui.S(22), markY, markSize, markSize));
            }

            // stack the two lines by their measured heights so descenders are never clipped
            int textX = Ui.S(22) + markSize + Ui.S(14);
            Size brand = Ui.Measure("Algo Quant", Ui.Brand);
            Size tagline = Ui.Measure("Local server control panel", Ui.Small);
            int overlap = Ui.S(3);
            int top = (Height - (brand.Height + tagline.Height - overlap)) / 2;
            Ui.Text(g, "Algo Quant", Ui.Brand, Color.White,
                new Rectangle(textX, top, brand.Width + Ui.S(4), brand.Height), TextFormatFlags.Left | TextFormatFlags.Top);
            Ui.Text(g, "Local server control panel", Ui.Small, Ui.OnDarkMuted,
                new Rectangle(textX, top + brand.Height - overlap, tagline.Width + Ui.S(4), tagline.Height),
                TextFormatFlags.Left | TextFormatFlags.Top);
        }
    }

    /// <summary>White strip under the header: service chips on the left, a message on the right.</summary>
    internal class StripPanel : Panel
    {
        public string Message = "";
        public Color MessageColor = Ui.Muted;

        public StripPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Surface;
        }

        public int MessageLeft;

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            using (var pen = new Pen(Ui.Line))
            {
                g.DrawLine(pen, 0, Height - 1, Width, Height - 1);
            }
            if (!string.IsNullOrEmpty(Message))
            {
                Ui.Text(g, Message, Ui.Body, MessageColor,
                    new Rectangle(MessageLeft, 0, Width - MessageLeft - Ui.S(24), Height),
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Right | TextFormatFlags.EndEllipsis);
            }
        }
    }

    /// <summary>White footer strip with a top rule.</summary>
    internal class FooterPanel : Panel
    {
        public string Note = "";

        public FooterPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Surface;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            using (var pen = new Pen(Ui.Line))
            {
                g.DrawLine(pen, 0, 0, Width, 0);
            }
            Ui.Text(g, Note, Ui.Small, Ui.MutedSoft,
                new Rectangle(0, 0, Width - Ui.S(24), Height), TextFormatFlags.VerticalCenter | TextFormatFlags.Right);
        }
    }

    /// <summary>A link to open: caption, the address, and Open / Copy buttons.</summary>
    internal class UrlRow : Panel
    {
        public string Glyph = "";
        public string Caption = "";
        public string Url = "";
        public string Placeholder = "";
        public bool Live;
        public readonly FlatBtn OpenBtn = new FlatBtn();
        public readonly FlatBtn CopyBtn = new FlatBtn();
        public event Action<string> OpenRequested;
        public event Action<string> CopyRequested;
        private bool urlHover;

        public UrlRow()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Surface;

            OpenBtn.Kind = BtnKind.Secondary;
            OpenBtn.Text = "Open";
            OpenBtn.Glyph = Ui.GOpen;
            OpenBtn.Click += delegate { if (OpenRequested != null && Live) OpenRequested(Url); };

            CopyBtn.Kind = BtnKind.Ghost;
            CopyBtn.Text = "Copy";
            CopyBtn.Glyph = Ui.GCopy;
            CopyBtn.Click += delegate { if (CopyRequested != null && Url.Length > 0) CopyRequested(Url); };

            Controls.Add(OpenBtn);
            Controls.Add(CopyBtn);
        }

        public void SetUrl(string url, bool live, string placeholder)
        {
            Url = url ?? "";
            Live = live && Url.Length > 0;
            Placeholder = placeholder ?? "";
            OpenBtn.Enabled = Live;
            CopyBtn.Enabled = Url.Length > 0;
            Cursor = Cursors.Default;
            Invalidate();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            // caption 2..20, address 24..50, hint 50..68; buttons centred on the address
            int h = Ui.S(34);
            int y = Ui.S(20);
            CopyBtn.SetBounds(Width - Ui.S(92), y, Ui.S(92), h);
            OpenBtn.SetBounds(CopyBtn.Left - Ui.S(96), y, Ui.S(88), h);
        }

        private Rectangle UrlBounds
        {
            get { return new Rectangle(Ui.S(30), Ui.S(24), Math.Max(0, OpenBtn.Left - Ui.S(40)), Ui.S(26)); }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            bool over = Live && UrlBounds.Contains(e.Location) && e.X <= UrlBounds.Left + Ui.Measure(Url, Ui.Url).Width;
            if (over != urlHover)
            {
                urlHover = over;
                Cursor = over ? Cursors.Hand : Cursors.Default;
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            if (urlHover)
            {
                urlHover = false;
                Cursor = Cursors.Default;
                Invalidate();
            }
            base.OnMouseLeave(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            if (urlHover && OpenRequested != null) OpenRequested(Url);
            base.OnMouseClick(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            if (Ui.HasIcons)
            {
                Ui.Text(g, Glyph, Ui.Icon, Ui.Muted, new Rectangle(0, 0, Ui.S(22), Ui.S(22)),
                    TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            }
            Ui.Text(g, Caption, Ui.Small, Ui.Muted, new Rectangle(Ui.S(30), Ui.S(2), Width - Ui.S(30), Ui.S(18)),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter);

            Rectangle ub = UrlBounds;
            if (Url.Length > 0)
            {
                Color color = Live ? (urlHover ? Ui.BlueTextHover : Ui.BlueText) : Ui.MutedSoft;
                Font font = urlHover ? new Font(Ui.Url, FontStyle.Underline) : Ui.Url;
                Ui.Text(g, Url, font, color, ub, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                if (!ReferenceEquals(font, Ui.Url)) font.Dispose();
            }
            if (!Live && Placeholder.Length > 0)
            {
                Ui.Text(g, Placeholder, Ui.Small, Ui.MutedSoft, new Rectangle(ub.Left, ub.Bottom, ub.Width, Ui.S(18)),
                    TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis);
            }
        }
    }

    /// <summary>Amber notice with an action, used when Windows blocks Wi-Fi access.</summary>
    internal class NoticeBar : Panel
    {
        public string Message = "";
        public readonly FlatBtn Action = new FlatBtn();

        public NoticeBar()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Surface;
            Action.Kind = BtnKind.Secondary;
            Action.Backdrop = Ui.WarningSoft;
            Action.Glyph = Ui.GShield;
            Controls.Add(Action);
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            int w = Math.Max(Ui.S(120), Action.PreferredWidth);
            Action.SetBounds(Width - w - Ui.S(10), (Height - Ui.S(32)) / 2, w, Ui.S(32));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Ui.FillRounded(g, Ui.WarningSoft, new RectangleF(0, 0, Width - 1, Height - 1), Ui.S(8));
            int x = Ui.S(12);
            if (Ui.HasIcons)
            {
                Ui.Text(g, Ui.GWarning, Ui.Icon, Ui.Warning, new Rectangle(x, 0, Ui.S(20), Height),
                    TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
                x += Ui.S(28);
            }
            Ui.Text(g, Message, Ui.Small, Ui.WarningInk, new Rectangle(x, 0, Action.Left - x - Ui.S(10), Height),
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.WordBreak);
        }
    }

    /// <summary>Crisp QR code drawn module by module, with the logo in the middle.</summary>
    internal class QrView : Control
    {
        public bool[,] Modules;
        public Image Logo;
        public bool Live;
        public string Caption = "";
        public string Overlay = "";

        public QrView()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            int captionH = Ui.S(40);
            int side = Math.Min(Width, Height - captionH);
            if (side <= 0) return;

            if (Modules == null)
            {
                var box = new Rectangle((Width - side) / 2, 0, side, side);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Ui.FillRounded(g, Ui.Ground, box, Ui.S(10));
                Ui.Text(g, "The QR code appears here", Ui.Small, Ui.MutedSoft, box,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter | TextFormatFlags.WordBreak);
            }
            else
            {
                int n = Modules.GetLength(0);
                const int quiet = 2;
                int total = n + quiet * 2;
                int cell = Math.Max(1, side / total);
                int size = cell * total;
                int ox = (Width - size) / 2;
                int oy = (side - size) / 2;

                g.SmoothingMode = SmoothingMode.AntiAlias;
                Ui.FillRounded(g, Color.White, new Rectangle(ox, oy, size, size), Ui.S(8));
                Ui.StrokeRounded(g, Ui.Line, new RectangleF(ox + 0.5f, oy + 0.5f, size - 1, size - 1), Ui.S(8), 1f);

                // clear an odd number of modules in the centre for the logo (about a fifth of the width)
                int logoModules = Math.Max(5, (int)Math.Round(n * 0.22));
                if (logoModules % 2 == 0) logoModules++;
                int logoStart = (n - logoModules) / 2;

                g.SmoothingMode = SmoothingMode.None;
                using (var brush = new SolidBrush(Ui.Navy))
                {
                    for (int r = 0; r < n; r++)
                    {
                        for (int c = 0; c < n; c++)
                        {
                            if (!Modules[r, c]) continue;
                            bool underLogo = Logo != null && r >= logoStart && r < logoStart + logoModules &&
                                             c >= logoStart && c < logoStart + logoModules;
                            if (underLogo) continue;
                            g.FillRectangle(brush, ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
                        }
                    }
                }

                if (Logo != null)
                {
                    int lx = ox + (logoStart + quiet) * cell;
                    int ly = oy + (logoStart + quiet) * cell;
                    int ls = logoModules * cell;
                    int pad = Math.Max(2, cell / 2);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.DrawImage(Logo, new Rectangle(lx + pad, ly + pad, ls - pad * 2, ls - pad * 2));
                }

                if (!Live && Overlay.Length > 0)
                {
                    using (var veil = new SolidBrush(Color.FromArgb(215, Color.White)))
                    {
                        g.FillRectangle(veil, ox, oy, size, size);
                    }
                    Ui.Text(g, Overlay, Ui.BodyBold, Ui.InkSoft, new Rectangle(ox + Ui.S(16), oy, size - Ui.S(32), size),
                        TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter | TextFormatFlags.WordBreak);
                }
            }

            Ui.Text(g, Caption, Ui.Small, Live ? Ui.InkSoft : Ui.MutedSoft,
                new Rectangle(0, side + Ui.S(10), Width, captionH - Ui.S(10)),
                TextFormatFlags.HorizontalCenter | TextFormatFlags.Top | TextFormatFlags.EndEllipsis);
        }
    }

    internal sealed class Account
    {
        public string Role;
        public string Email;
        public string Password;

        public Account(string role, string email, string password)
        {
            Role = role;
            Email = email;
            Password = password;
        }
    }

    /// <summary>Sign-in accounts. Clicking an email or a password copies it.</summary>
    internal class AccountsView : Control
    {
        public readonly List<Account> Items = new List<Account>();
        public event Action<string, string> CopyRequested; // value, what
        private int hoverRow = -1;
        private int hoverCol = -1;

        public AccountsView()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        private int RowHeight { get { return Ui.S(32); } }
        private int RoleWidth { get { return Ui.S(92); } }

        public int ContentHeight { get { return Items.Count * RowHeight; } }

        private int PasswordLeft
        {
            get { return Math.Max(RoleWidth + Ui.S(150), Width - Ui.S(92)); }
        }

        private void HitTest(Point p, out int row, out int col)
        {
            row = p.Y / RowHeight;
            col = -1;
            if (row < 0 || row >= Items.Count) { row = -1; return; }
            if (p.X >= PasswordLeft) col = 2;
            else if (p.X >= RoleWidth) col = 1;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            int row, col;
            HitTest(e.Location, out row, out col);
            if (col < 1) row = -1;
            if (row != hoverRow || col != hoverCol)
            {
                hoverRow = row;
                hoverCol = col;
                Cursor = row >= 0 ? Cursors.Hand : Cursors.Default;
                Invalidate();
            }
            base.OnMouseMove(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            hoverRow = -1;
            hoverCol = -1;
            Cursor = Cursors.Default;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            int row, col;
            HitTest(e.Location, out row, out col);
            if (row >= 0 && CopyRequested != null)
            {
                if (col == 1) CopyRequested(Items[row].Email, "email");
                else if (col == 2) CopyRequested(Items[row].Password, "password");
            }
            base.OnMouseClick(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            int h = RowHeight;
            for (int i = 0; i < Items.Count; i++)
            {
                int y = i * h;
                Account a = Items[i];
                if (i > 0)
                {
                    using (var pen = new Pen(Ui.Surface2)) g.DrawLine(pen, 0, y, Width, y);
                }
                Ui.Text(g, a.Role, Ui.Small, Ui.Muted, new Rectangle(0, y, RoleWidth - Ui.S(8), h),
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);

                bool emailHover = hoverRow == i && hoverCol == 1;
                bool passHover = hoverRow == i && hoverCol == 2;
                var emailBox = new Rectangle(RoleWidth, y, PasswordLeft - RoleWidth - Ui.S(12), h);
                var passBox = new Rectangle(PasswordLeft, y, Width - PasswordLeft, h);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                if (emailHover) Ui.FillRounded(g, Ui.BlueSoft, new RectangleF(emailBox.X - Ui.S(6), y + Ui.S(4), emailBox.Width + Ui.S(6), h - Ui.S(8)), Ui.S(6));
                if (passHover) Ui.FillRounded(g, Ui.BlueSoft, new RectangleF(passBox.X - Ui.S(6), y + Ui.S(4), passBox.Width, h - Ui.S(8)), Ui.S(6));

                Ui.Text(g, a.Email, Ui.Body, emailHover ? Ui.BlueText : Ui.Ink, emailBox,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
                Ui.Text(g, a.Password, Ui.Mono, passHover ? Ui.BlueText : Ui.InkSoft, passBox,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            }
        }
    }

    /// <summary>Small branded dialog with up to three buttons. Result is the index pressed, or -1.</summary>
    internal class ChoiceDialog : Form
    {
        public int Result = -1;
        private readonly string heading;
        private readonly string message;
        private readonly string glyph;
        private readonly Color glyphColor;
        private readonly Color glyphBack;

        private ChoiceDialog(string heading, string message, string[] buttons, BtnKind[] kinds,
            string glyph, Color glyphColor, Color glyphBack)
        {
            this.heading = heading;
            this.message = message;
            this.glyph = glyph;
            this.glyphColor = glyphColor;
            this.glyphBack = glyphBack;

            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            BackColor = Ui.Surface;
            Font = Ui.Body;
            Text = "Algo Quant";
            AutoScaleMode = AutoScaleMode.None;

            int width = Ui.S(480);
            int textLeft = Ui.S(84);
            int textWidth = width - textLeft - Ui.S(28);
            Size msg = TextRenderer.MeasureText(message, Ui.Body, new Size(textWidth, int.MaxValue),
                TextFormatFlags.WordBreak | TextFormatFlags.NoPadding);
            int buttonsTop = Ui.S(62) + msg.Height + Ui.S(24);
            ClientSize = new Size(width, buttonsTop + Ui.S(36) + Ui.S(20));

            int x = width - Ui.S(24);
            for (int i = buttons.Length - 1; i >= 0; i--)
            {
                var b = new FlatBtn();
                b.Text = buttons[i];
                b.Kind = kinds[i];
                int w = Math.Max(Ui.S(96), b.PreferredWidth);
                x -= w;
                b.SetBounds(x, buttonsTop, w, Ui.S(36));
                x -= Ui.S(8);
                int index = i;
                b.Click += delegate { Result = index; Close(); };
                Controls.Add(b);
                if (i == 0) AcceptButtonFocus(b);
            }
        }

        private void AcceptButtonFocus(FlatBtn b)
        {
            Shown += delegate { b.Focus(); };
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape) Close();
            base.OnKeyDown(e);
        }

        protected override bool ProcessDialogKey(Keys keyData)
        {
            if (keyData == Keys.Escape)
            {
                Close();
                return true;
            }
            return base.ProcessDialogKey(keyData);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var circle = new Rectangle(Ui.S(24), Ui.S(24), Ui.S(44), Ui.S(44));
            using (var brush = new SolidBrush(glyphBack)) g.FillEllipse(brush, circle);
            if (Ui.HasIcons)
            {
                Ui.Text(g, glyph, Ui.IconLarge, glyphColor, circle, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            }
            int textLeft = Ui.S(84);
            Ui.Text(g, heading, Ui.DialogTitle, Ui.Ink, new Rectangle(textLeft, Ui.S(24), ClientSize.Width - textLeft - Ui.S(24), Ui.S(28)),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
            Ui.Text(g, message, Ui.Body, Ui.InkSoft,
                new Rectangle(textLeft, Ui.S(62), ClientSize.Width - textLeft - Ui.S(28), ClientSize.Height),
                TextFormatFlags.Left | TextFormatFlags.WordBreak);
        }

        public static int Ask(IWin32Window owner, string heading, string message, string[] buttons, BtnKind[] kinds,
            string glyph, Color glyphColor, Color glyphBack)
        {
            using (var dialog = new ChoiceDialog(heading, message, buttons, kinds, glyph, glyphColor, glyphBack))
            {
                dialog.ShowDialog(owner);
                return dialog.Result;
            }
        }
    }
}
