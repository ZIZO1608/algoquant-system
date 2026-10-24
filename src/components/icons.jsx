/**
 * Algo Quant icon set — 24px stroke icons on a shared base.
 * All icons are decorative (aria-hidden); pair them with visible or sr-only text.
 */

function Icon({ size = 20, children, strokeWidth = 1.8, className, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="14" width="8" height="7" rx="2" /></Icon>
);
export const UsersIcon = (p) => (
  <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>
);
export const BookIcon = (p) => (
  <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Icon>
);
export const TasksIcon = (p) => (
  <Icon {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon>
);
export const GraduationIcon = (p) => (
  <Icon {...p}><path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /><path d="M22 10v6" /></Icon>
);
export const WalletIcon = (p) => (
  <Icon {...p}><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M16 3H6a2 2 0 0 0-2 2v2" /><path d="M18 13.5h-3a1.5 1.5 0 0 0 0 3h3z" /></Icon>
);
export const CoinsIcon = (p) => (
  <Icon {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></Icon>
);
export const ChartIcon = (p) => (
  <Icon {...p}><path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" /></Icon>
);
export const SettingsIcon = (p) => (
  <Icon {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></Icon>
);
export const ChatIcon = (p) => (
  <Icon {...p}><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.5-4.6A8.5 8.5 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14h4.5" /></Icon>
);
export const BellIcon = (p) => (
  <Icon {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>
);
export const SearchIcon = (p) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
);
export const PlusIcon = (p) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const XIcon = (p) => (
  <Icon {...p}><path d="M18 6L6 18M6 6l12 12" /></Icon>
);
export const CheckIcon = (p) => (
  <Icon {...p}><path d="M20 6L9 17l-5-5" /></Icon>
);
export const ChevronDownIcon = (p) => (
  <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
);
export const ChevronUpIcon = (p) => (
  <Icon {...p}><path d="M18 15l-6-6-6 6" /></Icon>
);
/* Directional icons are drawn for RTL; .icon-mirror flips them in an LTR document. */
const mirrored = (p) => ({ ...p, className: p.className ? `icon-mirror ${p.className}` : 'icon-mirror' });

export const ChevronStartIcon = (p) => (
  /* points toward inline-start */
  <Icon {...mirrored(p)}><path d="M9 6l6 6-6 6" /></Icon>
);
export const ChevronEndIcon = (p) => (
  /* points toward inline-end */
  <Icon {...mirrored(p)}><path d="M15 6l-6 6 6 6" /></Icon>
);
export const ArrowBackIcon = (p) => (
  /* "back" points toward inline-start */
  <Icon {...mirrored(p)}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const ArrowForwardIcon = (p) => (
  <Icon {...mirrored(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></Icon>
);
export const MenuIcon = (p) => (
  <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
);
export const GlobeIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13.8 13.8 0 0 1 3.6 9A13.8 13.8 0 0 1 12 21a13.8 13.8 0 0 1-3.6-9A13.8 13.8 0 0 1 12 3z" /></Icon>
);
export const PanelIcon = (p) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Icon>
);
export const LogoutIcon = (p) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Icon>
);
export const SunIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const MoonIcon = (p) => (
  <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>
);
export const CalendarIcon = (p) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);
export const ClockIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
export const UploadIcon = (p) => (
  <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></Icon>
);
export const DownloadIcon = (p) => (
  <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></Icon>
);
export const TrashIcon = (p) => (
  <Icon {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></Icon>
);
export const CopyIcon = (p) => (
  <Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>
);
export const ExternalIcon = (p) => (
  <Icon {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></Icon>
);
export const EditIcon = (p) => (
  <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>
);
export const FilterIcon = (p) => (
  <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></Icon>
);
export const MaximizeIcon = (p) => (
  <Icon {...p}><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" /></Icon>
);
export const MinimizeIcon = (p) => (
  <Icon {...p}><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /></Icon>
);
export const AlertIcon = (p) => (
  <Icon {...p}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Icon>
);
export const InfoIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Icon>
);
export const CheckCircleIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></Icon>
);
export const EyeIcon = (p) => (
  <Icon {...p}><path d="M2.2 12C3.7 7.7 7.5 4.8 12 4.8s8.3 2.9 9.8 7.2c-1.5 4.3-5.3 7.2-9.8 7.2S3.7 16.3 2.2 12z" /><circle cx="12" cy="12" r="2.5" /></Icon>
);
export const EyeOffIcon = (p) => (
  <Icon {...p}><path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.9 5.1A9.8 9.8 0 0 1 12 4.8c4.5 0 8.3 2.9 9.8 7.2a10.4 10.4 0 0 1-4.1 4.9M6.1 6.1A10.5 10.5 0 0 0 2.2 12c1.5 4.3 5.3 7.2 9.8 7.2 1.4 0 2.7-.3 3.9-.8" /></Icon>
);
export const PhoneIcon = (p) => (
  <Icon {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.8 2z" /></Icon>
);
export const MailIcon = (p) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>
);
export const PrinterIcon = (p) => (
  <Icon {...p}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /><path d="M17.5 11.5h.01" /></Icon>
);
export const ReceiptIcon = (p) => (
  <Icon {...p}><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3" /></Icon>
);
export const PauseCircleIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M10 9v6" /><path d="M14 9v6" /></Icon>
);
export const BanIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></Icon>
);
export const UndoIcon = (p) => (
  /* drawn for LTR (arrow back to the left); .icon-mirror-rtl flips it in RTL */
  <Icon {...p} className={p.className ? `icon-mirror-rtl ${p.className}` : 'icon-mirror-rtl'}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
);
export const FileIcon = (p) => (
  <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></Icon>
);
export const ImageIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></Icon>
);
export const LinkIcon = (p) => (
  <Icon {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Icon>
);
export const InboxIcon = (p) => (
  <Icon {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></Icon>
);
export const SendIcon = (p) => (
  /* points toward inline-end: drawn for LTR, .icon-mirror-rtl flips it in RTL */
  <Icon {...p} className={p.className ? `icon-mirror-rtl ${p.className}` : 'icon-mirror-rtl'}><path d="M2 12l20-9-7 20-3-8-10-3z" /><path d="M22 3L12 15" /></Icon>
);
export const PaperclipIcon = (p) => (
  <Icon {...p}><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Icon>
);
export const RefreshIcon = (p) => (
  <Icon {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></Icon>
);
export const MoreIcon = (p) => (
  <Icon {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Icon>
);
export const UserIcon = (p) => (
  <Icon {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
);
export const LockIcon = (p) => (
  <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
);
export const TagIcon = (p) => (
  <Icon {...p}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><path d="M7 7h.01" /></Icon>
);
export const LayersIcon = (p) => (
  <Icon {...p}><path d="M12 2l10 5-10 5L2 7l10-5z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></Icon>
);
export const StarIcon = (p) => (
  <Icon {...p}><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></Icon>
);
export const TrendUpIcon = (p) => (
  <Icon {...p}><path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></Icon>
);
export const SparkIcon = (p) => (
  <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" /></Icon>
);
export const ListIcon = (p) => (
  <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icon>
);
export const GridIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>
);
export const DragIcon = (p) => (
  <Icon {...p} strokeWidth={2.2}><circle cx="9" cy="6" r="0.6" /><circle cx="15" cy="6" r="0.6" /><circle cx="9" cy="12" r="0.6" /><circle cx="15" cy="12" r="0.6" /><circle cx="9" cy="18" r="0.6" /><circle cx="15" cy="18" r="0.6" /></Icon>
);
export const BotIcon = (p) => (
  <Icon {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" /></Icon>
);
export const ShieldIcon = (p) => (
  <Icon {...p}><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /></Icon>
);
export const HistoryIcon = (p) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></Icon>
);
export const PercentIcon = (p) => (
  <Icon {...p}><path d="M19 5L5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Icon>
);
export const CertificateIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="9" r="5" /><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" /></Icon>
);
export const NoteIcon = (p) => (
  <Icon {...p}><path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4z" /><path d="M8 12h8M8 16h5" /></Icon>
);
