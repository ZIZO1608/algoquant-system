import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { BRAND_NAME, BRAND_TAGLINE, Logo } from '../components/Brand';
import LanguageToggle from '../components/LanguageToggle';
import { AlertIcon, BookIcon, CoinsIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, UsersIcon } from '../components/icons';
import './Login.css';

const FEATURES = [
  { icon: UsersIcon, title: 'العملاء المحتملون', text: 'من أول رسالة حتى التسجيل والتحصيل في خطوة واحدة.' },
  { icon: BookIcon, title: 'الدورات والمهام', text: 'دورة حياة تلقائية لكل دورة مع مهام موزّعة على الفريق.' },
  { icon: CoinsIcon, title: 'المالية والمحافظ', text: 'إيرادات، مصروفات، رواتب ومحافظ الموظفين في مكان واحد.' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login, isAuthenticated } = useApp();
  const { t, td } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Errors hold Arabic source text and are translated when shown, so they follow the language toggle.
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from && location.state.from !== '/login' ? location.state.from : '/';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const validate = () => {
    const errs = {};
    const trimmed = email.trim();
    if (!trimmed) errs.email = 'أدخل البريد الإلكتروني.';
    else if (!EMAIL_RE.test(trimmed)) errs.email = 'تحقق من صيغة البريد الإلكتروني، مثل name@algoquant.local';
    if (!password) errs.password = 'أدخل كلمة المرور.';
    return errs;
  };

  const clearFieldError = (field) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const errs = validate();
    setFieldErrors(errs);
    setError('');
    if (errs.email) {
      emailRef.current?.focus();
      return;
    }
    if (errs.password) {
      passwordRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'تعذّر تسجيل الدخول. تأكد من البريد وكلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand-panel" aria-hidden="true">
        <div className="login-brand-glow" />
        <div className="login-brand-inner">
          <div className="login-brand-lockup">
            <Logo size={64} />
            <div>
              <div className="login-brand-name">{BRAND_NAME}</div>
              <div className="login-brand-tagline">{t(BRAND_TAGLINE)}</div>
            </div>
          </div>
          <h2 className="login-brand-title">{t('كل الأكاديمية في شاشة واحدة.')}</h2>
          <ul className="login-features">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title}>
                  <span className="login-feature-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{t(f.title)}</strong>
                    <span>{t(f.text)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="login-brand-foot">© {new Date().getFullYear()} {BRAND_NAME}</div>
      </aside>

      <main className="login-form-panel">
        <div className="login-lang">
          <LanguageToggle variant="pill" />
        </div>
        <div className="login-card">
          <div className="login-mobile-brand">
            <Logo size={44} />
            <span className="login-mobile-name">{BRAND_NAME}</span>
          </div>
          <h1 className="login-title">{t('تسجيل الدخول')}</h1>
          <p className="login-subtitle">{t('ادخل ببيانات حسابك للوصول إلى لوحة الإدارة.')}</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="login-email">{t('البريد الإلكتروني')}</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <MailIcon size={18} />
                </span>
                <input
                  ref={emailRef}
                  id="login-email"
                  type="email"
                  className="login-input"
                  dir="ltr"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  placeholder="name@algoquant.local"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                  required
                  autoFocus
                />
              </div>
              {fieldErrors.email && (
                <p id="login-email-error" className="login-field-error">
                  {t(fieldErrors.email)}
                </p>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="login-password">{t('كلمة المرور')}</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <LockIcon size={18} />
                </span>
                <input
                  ref={passwordRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input login-input-password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError('password');
                  }}
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('إخفاء كلمة المرور') : t('إظهار كلمة المرور')}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="login-password-error" className="login-field-error">
                  {t(fieldErrors.password)}
                </p>
              )}
            </div>

            {error && (
              <p className="login-error" role="alert">
                <AlertIcon size={16} />
                {td(error)}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner spinner-on-primary" />
                  {t('جاري الدخول…')}
                </>
              ) : (
                t('تسجيل الدخول')
              )}
            </button>
          </form>

          <p className="login-help">{t('نسيت كلمة المرور؟ تواصل مع مدير النظام لإعادة تعيينها.')}</p>
        </div>
      </main>
    </div>
  );
}
