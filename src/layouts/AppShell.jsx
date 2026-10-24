import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import NotificationCenter from '../components/NotificationCenter';
import ChatTopbarButton from '../components/ChatTopbarButton';
import GlobalSearch from '../components/GlobalSearch';
import LanguageToggle from '../components/LanguageToggle';
import { useToast } from '../components/Toast';
import { useSiteChatStats } from '../hooks/useSiteChatStats';
import { channelLabel, visitorName } from '../utils/siteChats';
import { BrandLockup, Logo } from '../components/Brand';
import { canAccessPath } from '../utils/navAccess';
import { initials } from '../utils/formatters';
import { privilegeLabel } from '../utils/statusMaps';
import {
  BookIcon,
  BotIcon,
  ChartIcon,
  ChatIcon,
  ChevronDownIcon,
  ChevronEndIcon,
  ChevronStartIcon,
  CoinsIcon,
  DashboardIcon,
  GraduationIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TasksIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from '../components/icons';
import './AppShell.css';

const NAV_SECTIONS = [
  {
    label: 'التشغيل',
    items: [
      { path: '/', label: 'لوحة التحكم', icon: DashboardIcon, end: true },
      { path: '/crm', label: 'العملاء المحتملون', icon: UsersIcon },
      { path: '/site-chats', label: 'محادثات الموقع', icon: BotIcon, liveBadge: true },
      { path: '/courses', label: 'الدورات', icon: BookIcon },
      { path: '/tasks', label: 'المهام', icon: TasksIcon },
      { path: '/students', label: 'الطلاب', icon: GraduationIcon },
      { path: '/chat', label: 'المحادثات', icon: ChatIcon },
    ],
  },
  {
    label: 'المالية',
    items: [
      { path: '/employee-wallets', label: 'محافظ الموظفين', icon: WalletIcon },
      { path: '/finance', label: 'المالية', icon: CoinsIcon },
      { path: '/reports', label: 'التقارير', icon: ChartIcon },
    ],
  },
  {
    label: 'النظام',
    items: [{ path: '/settings', label: 'الإعدادات', icon: SettingsIcon }],
  },
];

const RAIL_KEY = 'algo_sidebar';
const MOBILE_QUERY = '(max-width: 900px)';

function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === 'rail';
  } catch {
    return false;
  }
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

function roleSummary(user, t) {
  const codes = user?.privileges || [];
  if (!codes.length) return t('موظف');
  return codes.slice(0, 2).map(privilegeLabel).join(' · ');
}

export default function AppShell({ children, contentClassName = '' }) {
  const { user, logout, hasPrivilege } = useApp();
  const { resolved, toggle } = useTheme();
  const { t } = useI18n();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(readRail);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const toast = useToast();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  // A visitor just started talking to the website bot: tell whoever is signed in,
  // unless they are already watching the conversations page (it shows the new row itself).
  const { stats: siteChatStats } = useSiteChatStats({
    onUpdate: (payload) => {
      if (!payload?.isNew || pathRef.current.startsWith('/site-chats')) return;
      const conv = payload.conversation;
      toast.info(`${visitorName(conv)} · ${channelLabel(conv?.channel)}`, {
        title: t('زائر جديد يتحدث مع بوت الموقع'),
        duration: 6000,
      });
    },
  });
  const liveVisitors = siteChatStats?.live ?? 0;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_KEY, next ? 'rail' : 'full');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Close the mobile drawer and menus on navigation
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((item) => !user || canAccessPath(item.path, hasPrivilege)),
  })).filter((s) => s.items.length > 0);

  const rail = collapsed && !isMobile;
  const shellClass = ['app-shell', rail ? 'is-rail' : '', drawerOpen ? 'drawer-open' : ''].filter(Boolean).join(' ');
  const userInitials = initials(user?.fullName);
  const themeLabel = resolved === 'dark' ? t('الوضع الفاتح') : t('الوضع الداكن');

  return (
    <div className={shellClass}>
      <a href="#main-content" className="skip-link">{t('تخطّي إلى المحتوى')}</a>

      <aside className="sidebar" aria-label={t('القائمة الرئيسية')}>
        <div className="sidebar-head">
          {rail ? (
            <button type="button" className="sidebar-rail-logo" onClick={toggleCollapsed} aria-label={t('توسيع القائمة')} title={t('توسيع القائمة')}>
              <Logo size={34} />
            </button>
          ) : (
            <NavLink to="/" className="sidebar-brand" aria-label={t('Algo Quant — الصفحة الرئيسية')}>
              <BrandLockup size={36} tone="light" />
            </NavLink>
          )}
          {isMobile ? (
            <button type="button" className="sidebar-toggle" onClick={() => setDrawerOpen(false)} aria-label={t('إغلاق القائمة')}>
              <XIcon />
            </button>
          ) : (
            !rail && (
              <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} aria-label={t('طيّ القائمة')} title={t('طيّ القائمة')}>
                <ChevronStartIcon />
              </button>
            )
          )}
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <div className="sidebar-section-label">{t(section.label)}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const label = t(item.label);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    title={rail ? label : undefined}
                  >
                    <span className="sidebar-icon">
                      <Icon size={20} />
                    </span>
                    <span className="sidebar-label">{label}</span>
                    {item.liveBadge && liveVisitors > 0 && (
                      <span
                        className="sidebar-live"
                        title={t('{n} يتحدثون الآن', { n: liveVisitors })}
                        aria-label={t('{n} يتحدثون الآن', { n: liveVisitors })}
                      >
                        <span className="sidebar-live-dot" aria-hidden="true" />
                        <span className="sidebar-live-count tnum">{liveVisitors}</span>
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user" title={user?.fullName || ''}>
            <span className="avatar sidebar-avatar">{userInitials}</span>
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{user?.fullName || '—'}</span>
              <span className="sidebar-user-role">{roleSummary(user, t)}</span>
            </span>
          </div>
          <div className="sidebar-foot-actions">
            <button type="button" className="sidebar-action" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
              {resolved === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
            <button type="button" className="sidebar-action" onClick={logout} aria-label={t('تسجيل الخروج')} title={t('تسجيل الخروج')}>
              <LogoutIcon size={18} />
            </button>
          </div>
        </div>
      </aside>

      {drawerOpen && (
        <button type="button" className="sidebar-backdrop" aria-label={t('إغلاق القائمة')} onClick={() => setDrawerOpen(false)} />
      )}

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button type="button" className="topbar-btn topbar-menu" onClick={() => setDrawerOpen(true)} aria-label={t('فتح القائمة')}>
              <MenuIcon />
            </button>
            {rail && (
              <button type="button" className="topbar-btn topbar-expand" onClick={toggleCollapsed} aria-label={t('توسيع القائمة')} title={t('توسيع القائمة')}>
                <ChevronEndIcon />
              </button>
            )}
            <GlobalSearch />
          </div>

          <div className="topbar-end">
            <LanguageToggle />
            <ChatTopbarButton />
            <NotificationCenter />
            <span className="topbar-divider" aria-hidden="true" />
            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className={`user-menu-btn ${menuOpen ? 'is-open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="avatar">{userInitials}</span>
                <span className="user-menu-name">{user?.fullName || '—'}</span>
                <ChevronDownIcon size={16} className="user-menu-chevron" />
              </button>
              {menuOpen && (
                <div className="user-menu-panel" role="menu">
                  <div className="user-menu-head">
                    <span className="avatar avatar-lg">{userInitials}</span>
                    <div className="user-menu-head-text">
                      <strong>{user?.fullName || '—'}</strong>
                      <span className="ltr">{user?.email || ''}</span>
                    </div>
                  </div>
                  {user?.privileges?.length > 0 && (
                    <div className="user-menu-roles">
                      {user.privileges.map((code) => (
                        <span key={code} className="badge plain tone-brand">
                          {privilegeLabel(code)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="user-menu-sep" />
                  <button type="button" className="user-menu-item" role="menuitem" onClick={toggle}>
                    {resolved === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                    {themeLabel}
                  </button>
                  <button type="button" className="user-menu-item danger" role="menuitem" onClick={logout}>
                    <LogoutIcon size={18} />
                    {t('تسجيل الخروج')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`page-content ${contentClassName}`.trim()} id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
