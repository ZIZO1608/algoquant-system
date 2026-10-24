# Algo Quant — Design System (frontend)

Everything in `src/` reads from one token set. Page files may add layout CSS but **never** a literal color, a physical direction property, or letter-spacing on Arabic text.

## Tokens (`src/theme/tokens.css`)

| Group | Tokens |
|---|---|
| Brand | `--brand-50/100/200/300/500/600/700/900/950`. `--brand-500` is the logo blue (marks, focus, fills). `--brand-600` is text-safe (links, primary buttons). `--brand-900` is the sidebar. |
| Neutrals | `--ground` (page), `--surface` (cards), `--surface-2` / `--surface-3` (tints), `--line` / `--line-strong` (borders), `--ink`, `--ink-soft`, `--muted`, `--muted-soft`, `--overlay` |
| Semantic | `--success`, `--warning`, `--danger`, `--info` + `-soft` (background) and `-ink` (text on soft) variants |
| Components | `--primary-bg`, `--primary-ink`, `--primary-hover`, `--focus-ring`, `--sidebar-*`, `--avatar-*`, `--chart-1..6` |
| Shape | `--r-xs 4 / --r-sm 6 / --r-md 10 / --r-lg 14 / --r-xl 20 / --r-pill` |
| Elevation | `--sh-1` (rest), `--sh-2` (hover/raised), `--sh-3` (popovers, modals) |
| Space | `--s-1 4 … --s-8 40` |
| Type | `--font-head` (Cairo, headings/labels/buttons), `--font-body` (IBM Plex Sans Arabic), `--font-mono`; sizes `--fs-xs 12 … --fs-3xl 30` |
| Layout | `--sidebar-width`, `--sidebar-rail`, `--topbar-height`, `--content-max` |

Dark theme is automatic: tokens are redefined under `prefers-color-scheme: dark` and `[data-theme="dark"]`. Use tokens and both themes work.

Legacy aliases (`--black`, `--white`, `--gray-*`, `--accent`) still resolve but are deprecated.

## Global classes (`tokens.css`)

- **Structure**: `.page-header` (flex, title block + `.page-header-actions`), `.page-title`, `.page-subtitle`, `.breadcrumb` (+ `.breadcrumb-sep`), `.section-heading`
- **Cards**: `.card`, `.card-title`, `.card-header-row` (title + action on one line), `.card-flush` (no padding, for tables)
- **Buttons**: `.btn` + `.btn-primary | .btn-secondary | .btn-ghost | .btn-soft | .btn-danger | .btn-danger-text`, sizes `.btn-sm | .btn-lg`, `.btn-block`, `.btn-icon` (square icon button). Buttons may contain an icon from `components/icons.jsx` followed by text.
- **Chips / tabs**: `.chip` (+ `.active`), `.filter-chips`, `.tabs` > `.tab` (+ `.active`, optional `.tab-count`), `.filter-bar`, `.view-toggle`
- **Forms**: `.form-group` > `label` + control, `.form-row` (2 columns), `.form-actions`, `.form-error`, `.hint` / `.form-hint`, standalone `.input | .select | .textarea`, `.form-label`
- **Status**: `.badge.tone-{neutral|brand|success|warning|danger|muted}` (+ `.plain` to drop the dot), `.phase-badge`, `.track-pill`, `.dept-badge.dept-*`
- **People**: `.avatar` (+ `.avatar-sm | .avatar-lg`), `.avatar-initials`
- **States**: `.empty-state` (text only), `.empty-block` (icon + title + hint + action), `.skeleton`, `.page-loading`, `.spinner`
- **Grids**: `.grid-2 | .grid-3 | .grid-4 | .grid-auto`
- **Text**: `.ltr`, `.tnum` (tabular numbers), `.muted-text`, `.text-danger`, `.amount-positive | .amount-negative`, `.callout` (+ `.warning`), `.course-hint`, `.modal-hint`

## Components (`src/components`)

| Component | Use |
|---|---|
| `Modal` | `open, onClose, title, description?, size?('sm'|'md'|'lg'|'xl'), wide?, footer?, closeOnOverlay?` — Escape, focus trap, close button built in. Put primary actions in `footer` or in `.form-actions` inside a form. |
| `useDialog()` | `const { confirm, alert } = useDialog(); if (await confirm({ title, message, confirmLabel, danger: true })) …` — replaces `window.confirm` / `window.alert`. |
| `useToast()` | `toast.success(t('تم الحفظ'))`, `toast.error(msg)`, `toast.info`, `toast.warning` — for outcomes of actions. Inline `.form-error` stays for validation inside forms. |
| `StatusBadge` | `<StatusBadge kind="lead|course|task|student|enrollment|payment|refund|withdrawal|advance|session|attendance|certificate|evalRow|profitShare" value={status} />` |
| `usePrint()` | `const openPrint = usePrint(); openPrint('payment', paymentId)` — print dialog with live preview for receipts, vouchers and statements (`payment | expense | refund | owner_withdrawal | wallet_withdrawal | statement`). Contract: `docs/PRINTING.md`. |
| `StatusPill` | Lead-only alias of StatusBadge. |
| `DataTable` | `columns=[{key,label,render?,className?,width?,align?}], rows, onRowClick?, emptyMessage?, loading?, minWidth?, dense?, rowKey?` |
| `EmptyState` | `icon?, title, hint?, action?` |
| `StatCard` | `value, label, icon?, hint?, trend?, variant?('headline'|'warning'|'success'), onClick?` |
| `PageLoading` / `Skeleton` / `AppLoading` | Loading states. Never render a bare "جاري التحميل..." paragraph. |
| `Brand` | `Logo({size})`, `BrandLockup({size, tone:'ink'|'light'})`, `BRAND_NAME`, `BRAND_TAGLINE` |
| `LanguageToggle` | Arabic ⇄ English switch. `variant="topbar"` (in AppShell) or `"pill"` (Login, EvalPage). See `docs/I18N.md`. |
| `icons.jsx` | `DashboardIcon, UsersIcon, BookIcon, TasksIcon, GraduationIcon, WalletIcon, CoinsIcon, ChartIcon, SettingsIcon, ChatIcon, BellIcon, SearchIcon, PlusIcon, XIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ChevronStartIcon, ChevronEndIcon, ArrowBackIcon, ArrowForwardIcon, MenuIcon, LogoutIcon, SunIcon, MoonIcon, CalendarIcon, ClockIcon, UploadIcon, DownloadIcon, TrashIcon, CopyIcon, ExternalIcon, EditIcon, FilterIcon, MaximizeIcon, MinimizeIcon, AlertIcon, InfoIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, PhoneIcon, MailIcon, FileIcon, ImageIcon, LinkIcon, InboxIcon, SendIcon, PaperclipIcon, RefreshIcon, MoreIcon, UserIcon, LockIcon, TagIcon, LayersIcon, StarIcon, TrendUpIcon, SparkIcon, ListIcon, GridIcon, DragIcon, BotIcon, ShieldIcon, HistoryIcon, PercentIcon, CertificateIcon, NoteIcon, GlobeIcon, PrinterIcon, ReceiptIcon, PauseCircleIcon, BanIcon, UndoIcon` — all take `size` (default 20). Chevron start/end and back/forward arrows flip automatically in LTR; `UndoIcon` and `SendIcon` are drawn for LTR and flip in RTL. |

## Formatters (`src/utils/formatters.js`)

`formatDate`, `formatDateTime`, `formatTime`, `formatWeekday`, `formatRelativeTime` (UI language, Latin digits, Gregorian), `formatDueLabel`, `daysUntil`, `formatMinor(amount)` (uses the currency label from settings), `getCurrencyLabel()`, `formatAmount`, `formatAmountInput`, `parseMinorInput`, `initials(name)`, `calcTaskProgress`, `studentBalance`, `studentCourseNames`, `pluralAr`, `trackName(track)`.

Status labels: `statusLabel(kind, value)` / `statusInfo` in `utils/statusMaps.js`; `PRIVILEGE_LABELS` / `privilegeLabel(code)` for the six privilege codes. All of them return the current language when read. `statusLabelIn(lang, kind, value)` gives a label in a fixed language (printed documents). Payment methods: `PAYMENT_METHODS` / `paymentMethodLabel(value)` in `utils/paymentMethods.js`.

## Student status

A student has an overall status (`Student.status`: active, frozen, graduated, withdrawn, blocked — `StatusBadge kind="student"`) and one status per course (`Enrollment.enrollmentStatus`). Frozen, withdrawn and blocked need a reason; blocked students cannot be enrolled; a new enrollment brings frozen, graduated or withdrawn students back to active. Enrollments move by themselves — enrolled → attending on the first present/late attendance, attending → completed when the course completes, completed → certified when a certificate is issued — and staff can complete, drop (reason required), undo a completion or reinstate. Every change is kept in `EntityStatusTransition` and shown in the student's "Status history" tab. Helpers and texts: `src/pages/student/studentStatus.js`.

## Printed documents

Receipts, vouchers and statements are separate documents rendered in an isolated print frame with their own stylesheet (`src/print/document.css`, always light, sized in mm). They are not app pages: the token and color rules above apply to the app-side print UI (`PrintDialog.css`, `PrintDesigner.css`), not to `document.css`. See `docs/PRINTING.md`.

## Page conventions

1. Page = `<AppShell>` → `.page-header` (title, subtitle, actions) → content. Detail pages add `.breadcrumb` above the header.
2. Loading: `<PageLoading />`. Empty: `<EmptyState />` or DataTable's `emptyMessage`. Errors from actions: `toast.error`; validation inside forms: `.form-error`.
3. Destructive actions go through `useDialog().confirm({ danger: true })`.
4. No `style={{…}}` except for values that are truly dynamic (bar widths, chart colors). No `<style>` tags in JSX.
5. Every user-facing string is written in Arabic and passed through `t()` from `useI18n()`; its English goes in `src/i18n/en/*.js` (contract: `docs/I18N.md`, check: `node scripts/i18n-check.mjs`). Numbers stay Latin digits. Amount labels use `getCurrencyLabel()` rather than a hardcoded "ل.س".
6. Dates go through `formatDate` / `formatDateTime`; never `toLocaleDateString('ar-SA')` or raw ISO slicing.
7. Direction: Arabic renders RTL and English LTR, so use `inset-inline-*`, `margin-inline-*`, `padding-inline-*`, `border-inline-start`, logical corner radii, `text-align: start`. Never `left/right`; for a rare physical case use `:root[dir='ltr'] …`.
8. Charts (recharts): fills from `--chart-1..6`, axis ticks `{ fill: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 12 }`, grid `var(--line)`, tooltip `contentStyle` with `background: var(--surface)`, `border: 1px solid var(--line)`, `borderRadius: 10`, `fontFamily: var(--font-body)`.
9. Tables: `DataTable`. Hand-written `<table className="data-table">` is acceptable inside a `.card-flush` when cells are complex.
10. Keep every existing API call, privilege check, and behaviour. This is a visual and UX pass, not a logic rewrite.
11. A page that has tabs or sections keeps the open one in the query string, so it can be linked to from a
    notification, another page or a bookmark, and survives a refresh: `?tab=` (Finance, EmployeeWallets,
    StudentDetail, CourseDetail), `?report=` (Reports), `?section=` (Settings). The default tab writes no
    parameter. Use `useSearchParams` and `setSearchParams(next, { replace: true })` so tab switching does
    not fill the back stack; a drill-down that should be undone with Back (opening a report) omits `replace`.
    A link to a tab the account may not read shows a "not available" state, never an empty shell.
12. A name, a course or a document number in a table is a link to the thing it names. If the API does not
    return the id needed for that link, add the id to its `select` — do not settle for plain text.
13. A total is never a dead end: show what it is made of, or say where it is entered, with a link.
14. A chart sets `minWidth={CHART_MIN_WIDTH}` (520) on its ResponsiveContainer and sits in a
    `.chart-scroll` wrapper. Below that the value axis eats the plot and the bars come out a few
    pixels wide; the wrapper scrolls sideways on a phone instead. ResponsiveContainer writes
    `min-width` inline, so the floor has to be the prop — CSS cannot override it.
15. "Open" work is one definition, not a list re-typed per page: `isOpenTask` in
    `src/utils/taskSpecialty.js` and `OPEN_TASK_STATUSES` in `backend/src/lib/tasks.ts`. A late
    task is open. Jobs that hunt for tasks *not yet* marked late use their own narrower filter.
