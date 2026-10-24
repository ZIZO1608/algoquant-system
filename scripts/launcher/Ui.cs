// Algo Quant control panel: palette, fonts and the custom-drawn controls.
// C# 5 (the csc.exe that ships with Windows): no string interpolation, no ?. operator.

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace AlgoQuant
{
    internal static class Ui
    {
        public static float ScaleFactor = 1f;

        public static int S(float value)
        {
            return (int)Math.Round(value * ScaleFactor);
        }

        // Brand (from the web app tokens)
        public static readonly Color Navy = Hex("#0D2A45");
        public static readonly Color NavyDeep = Hex("#081C30");
        public static readonly Color Blue = Hex("#26ABFB");
        public static readonly Color BlueHover = Hex("#55BDFC");
        public static readonly Color BlueText = Hex("#0A78C4");
        public static readonly Color BlueTextHover = Hex("#085F9C");
        public static readonly Color BlueSoft = Hex("#EEF8FF");
        public static readonly Color BlueInk = Hex("#06202F");

        // Neutrals
        public static readonly Color Ground = Hex("#F3F6F9");
        public static readonly Color Surface = Color.White;
        public static readonly Color Surface2 = Hex("#E9EEF3");
        public static readonly Color Line = Hex("#D5DDE5");
        public static readonly Color LineStrong = Hex("#B8C4CF");
        public static readonly Color Ink = Hex("#0F1B26");
        public static readonly Color InkSoft = Hex("#3A4A58");
        public static readonly Color Muted = Hex("#5F6F7D");
        public static readonly Color MutedSoft = Hex("#8D9BAA");
        public static readonly Color OnDarkMuted = Hex("#A9BCCB");

        // Semantic
        public static readonly Color Success = Hex("#1E8E5A");
        public static readonly Color SuccessSoft = Hex("#E1F4EA");
        public static readonly Color Warning = Hex("#C27A0E");
        public static readonly Color WarningSoft = Hex("#FBF0DC");
        public static readonly Color WarningInk = Hex("#8A5608");
        public static readonly Color Danger = Hex("#C93A2E");
        public static readonly Color DangerHover = Hex("#A8302A");
        public static readonly Color DangerSoft = Hex("#FBE7E4");
        public static readonly Color DangerInk = Hex("#952A21");

        public static readonly Color LogBg = Hex("#0B1621");
        public static readonly Color LogInk = Hex("#C3D1DD");

        public static readonly string UiFamily = PickFamily("Segoe UI");
        public static readonly string SemiboldFamily = PickFamily("Segoe UI Semibold", "Segoe UI");
        public static readonly string MonoFamily = PickFamily("Cascadia Mono", "Consolas", "Courier New");
        public static readonly string IconFamily = PickFamily("Segoe Fluent Icons", "Segoe MDL2 Assets");
        public static readonly bool HasIcons = IconFamily == "Segoe Fluent Icons" || IconFamily == "Segoe MDL2 Assets";

        public static readonly Font Body = new Font(UiFamily, 9.5f);
        public static readonly Font Small = new Font(UiFamily, 8.5f);
        public static readonly Font Tiny = new Font(UiFamily, 8f);
        public static readonly Font BodyBold = new Font(SemiboldFamily, 9.5f);
        public static readonly Font Title = new Font(SemiboldFamily, 10.5f);
        public static readonly Font Url = new Font(SemiboldFamily, 11f);
        public static readonly Font Brand = new Font(SemiboldFamily, 16f);
        public static readonly Font DialogTitle = new Font(SemiboldFamily, 12f);
        public static readonly Font Mono = new Font(MonoFamily, 8.75f);
        public static readonly Font MonoSmall = new Font(MonoFamily, 8.5f);
        public static readonly Font Icon = new Font(IconFamily, 10f);
        public static readonly Font IconLarge = new Font(IconFamily, 18f);

        // Segoe MDL2 / Fluent icon code points
        public const string GPlay = "\uE768";
        public const string GStop = "\uE71A";
        public const string GCopy = "\uE8C8";
        public const string GOpen = "\uE8A7";
        public const string GRefresh = "\uE72C";
        public const string GFolder = "\uE8B7";
        public const string GWarning = "\uE7BA";
        public const string GWifi = "\uE701";
        public const string GDocument = "\uE8A5";
        public const string GCheck = "\uE73E";
        public const string GMonitor = "\uE7F4";
        public const string GPhone = "\uE8EA";
        public const string GShield = "\uEA18";
        public const string GInfo = "\uE946";

        public static Color Hex(string hex)
        {
            return ColorTranslator.FromHtml(hex);
        }

        public static Color Alpha(Color color, int alpha)
        {
            return Color.FromArgb(Math.Max(0, Math.Min(255, alpha)), color);
        }

        /// <summary>Opaque blend of color toward another color by t (0..1).</summary>
        public static Color Mix(Color color, Color toward, float t)
        {
            return Color.FromArgb(
                (int)Math.Round(color.R + (toward.R - color.R) * t),
                (int)Math.Round(color.G + (toward.G - color.G) * t),
                (int)Math.Round(color.B + (toward.B - color.B) * t));
        }

        private static string PickFamily(params string[] names)
        {
            using (var fonts = new InstalledFontCollection())
            {
                foreach (string name in names)
                {
                    foreach (FontFamily family in fonts.Families)
                    {
                        if (string.Equals(family.Name, name, StringComparison.OrdinalIgnoreCase)) return family.Name;
                    }
                }
            }
            return "Segoe UI";
        }

        public static GraphicsPath Rounded(RectangleF r, float radius)
        {
            var path = new GraphicsPath();
            if (radius <= 0.5f)
            {
                path.AddRectangle(r);
                return path;
            }
            float d = radius * 2f;
            if (d > r.Height) d = r.Height;
            if (d > r.Width) d = r.Width;
            path.AddArc(r.X, r.Y, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        public static void FillRounded(Graphics g, Color fill, RectangleF r, float radius)
        {
            using (var path = Rounded(r, radius))
            using (var brush = new SolidBrush(fill))
            {
                g.FillPath(brush, path);
            }
        }

        public static void StrokeRounded(Graphics g, Color stroke, RectangleF r, float radius, float width)
        {
            using (var path = Rounded(r, radius))
            using (var pen = new Pen(stroke, width))
            {
                g.DrawPath(pen, path);
            }
        }

        public static void Text(Graphics g, string text, Font font, Color color, Rectangle bounds, TextFormatFlags flags)
        {
            TextRenderer.DrawText(g, text, font, bounds, color,
                flags | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
        }

        public static Size Measure(string text, Font font)
        {
            return TextRenderer.MeasureText(text, font, new Size(int.MaxValue, int.MaxValue),
                TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine);
        }

        public static void Dot(Graphics g, Color color, int cx, int cy, int diameter)
        {
            using (var brush = new SolidBrush(color))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.FillEllipse(brush, cx - diameter / 2f, cy - diameter / 2f, diameter, diameter);
            }
        }
    }

    /// <summary>White rounded card on the page ground, with an optional title and subtitle.</summary>
    internal class Card : Panel
    {
        public string Title = "";
        public string Subtitle = "";

        public Card()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Ui.Ground;
        }

        public int ContentTop
        {
            get
            {
                if (string.IsNullOrEmpty(Title)) return Ui.S(16);
                return string.IsNullOrEmpty(Subtitle) ? Ui.S(50) : Ui.S(64);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Ui.FillRounded(g, Ui.Surface, r, Ui.S(12));
            Ui.StrokeRounded(g, Ui.Line, r, Ui.S(12), 1f);

            if (!string.IsNullOrEmpty(Title))
            {
                Ui.Text(g, Title, Ui.Title, Ui.Ink, new Rectangle(Ui.S(18), Ui.S(16), Width - Ui.S(36), Ui.S(22)),
                    TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            }
            if (!string.IsNullOrEmpty(Subtitle))
            {
                Ui.Text(g, Subtitle, Ui.Small, Ui.Muted, new Rectangle(Ui.S(18), Ui.S(38), Width - Ui.S(36), Ui.S(18)),
                    TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            }
        }
    }

    internal enum BtnKind
    {
        Primary,
        Accent,
        Danger,
        Secondary,
        Ghost,
        OnDark
    }

    /// <summary>Rounded flat button with hover, press, focus and disabled states.</summary>
    internal class FlatBtn : Control
    {
        public BtnKind Kind = BtnKind.Secondary;
        public string Glyph = "";
        public Color Backdrop = Ui.Surface;
        private bool hover;
        private bool down;

        public FlatBtn()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.Selectable | ControlStyles.StandardClick, true);
            Cursor = Cursors.Hand;
            TabStop = true;
            Font = Ui.BodyBold;
        }

        public int PreferredWidth
        {
            get
            {
                int w = Ui.Measure(Text, Font).Width + Ui.S(28);
                if (Ui.HasIcons && !string.IsNullOrEmpty(Glyph)) w += Ui.S(22);
                return w;
            }
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { if (e.Button == MouseButtons.Left) { down = true; Invalidate(); } base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }
        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }

        protected override void OnKeyUp(KeyEventArgs e)
        {
            if (Enabled && (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter)) OnClick(EventArgs.Empty);
            base.OnKeyUp(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Backdrop);
            g.SmoothingMode = SmoothingMode.AntiAlias;

            Color fill = Color.Transparent, border = Color.Transparent, text = Ui.Ink;
            bool active = Enabled && (hover || down);
            switch (Kind)
            {
                case BtnKind.Primary:
                    fill = active ? Ui.BlueTextHover : Ui.BlueText; text = Color.White; break;
                case BtnKind.Accent:
                    fill = active ? Ui.BlueHover : Ui.Blue; text = Ui.BlueInk; break;
                case BtnKind.Danger:
                    fill = active ? Ui.DangerHover : Ui.Danger; text = Color.White; break;
                case BtnKind.Secondary:
                    fill = active ? Ui.Surface2 : Ui.Surface; border = Ui.LineStrong; text = Ui.Ink; break;
                case BtnKind.Ghost:
                    fill = active ? Ui.BlueSoft : Color.Transparent; text = Ui.BlueText; break;
                case BtnKind.OnDark:
                    fill = Ui.Alpha(Color.White, active ? 46 : 26); border = Ui.Alpha(Color.White, 64); text = Color.White; break;
            }
            if (!Enabled)
            {
                fill = fill.A == 0 ? fill : Ui.Alpha(fill, fill.A * 45 / 100);
                border = border.A == 0 ? border : Ui.Alpha(border, border.A * 45 / 100);
                // GDI text ignores alpha, so fade the colour into the background instead
                text = Ui.Mix(text, Backdrop, 0.55f);
            }

            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            if (down && Enabled) r.Offset(0, 0.75f);
            float radius = Ui.S(8);
            if (fill.A > 0) Ui.FillRounded(g, fill, r, radius);
            if (border.A > 0) Ui.StrokeRounded(g, border, r, radius, 1f);
            if (Focused && ShowFocusCues)
            {
                var ring = RectangleF.Inflate(r, -Ui.S(2), -Ui.S(2));
                Ui.StrokeRounded(g, Kind == BtnKind.OnDark ? Color.White : Ui.Blue, ring, radius - 2, Ui.S(2));
            }

            bool withGlyph = Ui.HasIcons && !string.IsNullOrEmpty(Glyph);
            Size textSize = Ui.Measure(Text, Font);
            int glyphW = withGlyph ? Ui.S(22) : 0;
            int x = (Width - (textSize.Width + glyphW)) / 2;
            int y = (Height - textSize.Height) / 2 + (down && Enabled ? 1 : 0);
            if (withGlyph)
            {
                Ui.Text(g, Glyph, Ui.Icon, text, new Rectangle(x, 0, Ui.S(18), Height),
                    TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            }
            Ui.Text(g, Text, Font, text, new Rectangle(x + glyphW, y, textSize.Width + 2, textSize.Height), TextFormatFlags.Left);
        }
    }

    /// <summary>Pill showing the overall state, drawn on the dark header.</summary>
    internal class StatusPill : Control
    {
        public Color Tone = Ui.MutedSoft;

        public StatusPill()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            Font = Ui.BodyBold;
        }

        public int PreferredWidth
        {
            get { return Ui.Measure(Text, Font).Width + Ui.S(40); }
        }

        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Navy);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Ui.FillRounded(g, Ui.Alpha(Tone, 46), r, Height / 2f);
            Ui.StrokeRounded(g, Ui.Alpha(Tone, 110), r, Height / 2f, 1f);
            Ui.Dot(g, Tone, Ui.S(15), Height / 2, Ui.S(8));
            Ui.Text(g, Text, Font, Color.White, new Rectangle(Ui.S(26), 0, Width - Ui.S(30), Height),
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
        }
    }

    /// <summary>One service in the status strip: coloured dot, name and port.</summary>
    internal class ServiceChip : Control
    {
        public string Label = "";
        public string Detail = "";
        public Color Tone = Ui.LineStrong;
        public string StateText = "";

        public ServiceChip()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        public int PreferredWidth
        {
            get
            {
                return Ui.S(20) + Ui.Measure(Label, Ui.BodyBold).Width + Ui.S(6) +
                       Ui.Measure(Detail, Ui.Small).Width + Ui.S(10) + Ui.Measure(StateText, Ui.Small).Width + Ui.S(4);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Ui.Surface);
            Ui.Dot(g, Tone, Ui.S(6), Height / 2, Ui.S(9));
            int x = Ui.S(20);
            Size a = Ui.Measure(Label, Ui.BodyBold);
            Ui.Text(g, Label, Ui.BodyBold, Ui.Ink, new Rectangle(x, 0, a.Width + 2, Height), TextFormatFlags.VerticalCenter);
            x += a.Width + Ui.S(6);
            Size b = Ui.Measure(Detail, Ui.Small);
            Ui.Text(g, Detail, Ui.Small, Ui.Muted, new Rectangle(x, 0, b.Width + 2, Height), TextFormatFlags.VerticalCenter);
            x += b.Width + Ui.S(10);
            Ui.Text(g, StateText, Ui.Small, Tone == Ui.LineStrong ? Ui.MutedSoft : Tone,
                new Rectangle(x, 0, Width - x, Height), TextFormatFlags.VerticalCenter);
        }
    }
}
