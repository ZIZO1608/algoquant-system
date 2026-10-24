import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { BRAND_NAME, Logo } from '../components/Brand';
import LanguageToggle from '../components/LanguageToggle';
import { AlertIcon, CheckCircleIcon } from '../components/icons';
import { useI18n } from '../i18n';
import './Eval.css';

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1);

function ScoreField({ id, label, hint, value, onChange }) {
  const { t } = useI18n();
  return (
    <fieldset className="eval-score">
      <legend>
        <span className="eval-score-label">{label}</span>
        {hint && <span className="eval-score-hint">{hint}</span>}
      </legend>
      <div className="eval-scale" role="radiogroup" aria-label={label}>
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`eval-scale-btn ${value === n ? 'is-active' : ''} ${n <= value ? 'is-filled' : ''}`}
            onClick={() => onChange(n)}
            id={`${id}-${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="eval-scale-ends" aria-hidden="true">
        <span>{t('ضعيف')}</span>
        <span>{t('ممتاز')}</span>
      </div>
    </fieldset>
  );
}

function Shell({ children }) {
  const { t } = useI18n();
  return (
    <div className="eval-page">
      <header className="eval-brand">
        <div className="eval-brand-lockup">
          <Logo size={40} />
          <span className="eval-brand-name">{BRAND_NAME}</span>
        </div>
        <div className="eval-lang">
          <LanguageToggle variant="pill" />
        </div>
      </header>
      <main className="eval-main">{children}</main>
      <footer className="eval-foot">© {new Date().getFullYear()} {BRAND_NAME} · {t('تقييمك يساعدنا على تطوير دوراتنا')}</footer>
    </div>
  );
}

export default function EvalPage() {
  const { token } = useParams();
  const { t, td } = useI18n();
  const [info, setInfo] = useState(null);
  const [courseScore, setCourseScore] = useState(0);
  const [teacherScore, setTeacherScore] = useState(0);
  const [hallScore, setHallScore] = useState(0);
  const [benefitLevel, setBenefitLevel] = useState(0);
  const [comment, setComment] = useState('');
  const [recommendedCourses, setRecommendedCourses] = useState('');
  const [benefitReason, setBenefitReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Errors hold Arabic source text (or an API message) and are translated when shown.
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    publicApi
      .getEvaluation(token)
      .then(setInfo)
      .catch(() => setLoadError('هذا الرابط غير صالح أو انتهت صلاحيته. تواصل مع الأكاديمية للحصول على رابط جديد.'));
  }, [token]);

  const allScored = courseScore && teacherScore && hallScore && benefitLevel;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allScored) {
      setError('يرجى اختيار درجة لكل بند من بنود التقييم.');
      return;
    }
    if (!benefitReason.trim()) {
      setError('يرجى توضيح سبب مستوى الإفادة باختصار.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await publicApi.submitEvaluation(token, {
        courseScore,
        teacherScore,
        hallScore,
        benefitLevel,
        comment: comment.trim() || undefined,
        recommendedCourses: recommendedCourses.trim() || undefined,
        benefitReason: benefitReason.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'تعذّر إرسال التقييم. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Shell>
        <div className="eval-card eval-card-center">
          <span className="eval-state-icon success">
            <CheckCircleIcon size={30} />
          </span>
          <h1>{t('شكراً لك!')}</h1>
          <p>{t('تم إرسال تقييمك بنجاح. نقدّر وقتك ورأيك.')}</p>
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="eval-card eval-card-center">
          <span className="eval-state-icon danger">
            <AlertIcon size={30} />
          </span>
          <h1>{t('الرابط غير صالح')}</h1>
          <p>{td(loadError)}</p>
        </div>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell>
        <div className="eval-card eval-card-center">
          <span className="spinner" />
          <p>{t('جاري تحميل نموذج التقييم…')}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="eval-card">
        <div className="eval-head">
          <span className="eval-eyebrow">{t('تقييم الدورة')}</span>
          <h1>{info.courseName}</h1>
          <p className="eval-meta">
            {info.sessionNumber ? t('الجلسة {n}', { n: info.sessionNumber }) : t('تقييم نهاية الدورة')}
            {info.studentName ? ` · ${info.studentName}` : ''}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <ScoreField id="course" label={t('محاور الدورة')} hint={t('المحتوى والتنظيم')} value={courseScore} onChange={setCourseScore} />
          <ScoreField id="teacher" label={t('المدرّب')} hint={t('الشرح والتفاعل')} value={teacherScore} onChange={setTeacherScore} />
          <ScoreField id="hall" label={t('القاعة')} hint={t('المكان والتجهيزات')} value={hallScore} onChange={setHallScore} />
          <ScoreField id="benefit" label={t('مستوى الإفادة')} hint={t('ما مدى استفادتك عملياً؟')} value={benefitLevel} onChange={setBenefitLevel} />

          <div className="eval-field">
            <label htmlFor="eval-benefit-reason">{t('لماذا اخترت هذا المستوى من الإفادة؟')} <span className="eval-required">*</span></label>
            <textarea
              id="eval-benefit-reason"
              value={benefitReason}
              onChange={(e) => setBenefitReason(e.target.value)}
              rows={3}
              required
              placeholder={t('اشرح باختصار سبب تقييمك لمستوى الإفادة')}
            />
          </div>
          <div className="eval-field">
            <label htmlFor="eval-recommend">{t('هل ترشّح دورات أخرى؟')}</label>
            <textarea
              id="eval-recommend"
              value={recommendedCourses}
              onChange={(e) => setRecommendedCourses(e.target.value)}
              rows={2}
              placeholder={t('اذكر الدورات التي تود أن نقدّمها')}
            />
          </div>
          <div className="eval-field">
            <label htmlFor="eval-comment">{t('ملاحظات إضافية')}</label>
            <textarea
              id="eval-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={t('أي شيء آخر تود مشاركته (اختياري)')}
            />
          </div>

          {error && (
            <p className="eval-error" role="alert">
              <AlertIcon size={16} />
              {td(error)}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
            {submitting ? t('جاري الإرسال…') : t('إرسال التقييم')}
          </button>
        </form>
      </div>
    </Shell>
  );
}
