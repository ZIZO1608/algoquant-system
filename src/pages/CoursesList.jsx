import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  COURSE_STATUS_LABELS,
  formatAmountInput,
  formatDate,
  formatMinor,
  getCurrencyLabel,
  parseMinorInput,
  trackName,
} from '../utils/formatters';
import { courseProgress } from '../utils/courses';
import { coursesApi, settingsApi, employeesApi } from '../api/client';
import {
  BookIcon,
  CalendarIcon,
  ClockIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
} from '../components/icons';
import './CoursesList.css';

const emptyForm = () => ({
  name: '', trackId: '', startDate: '', sessionCount: 7, totalHours: 20, priceMinor: '', capacity: 20,
  primaryInstructorId: '', taskPathTemplateId: '',
  teacherPayMode: 'percent', payPercent: '50', hourlyRateMinor: '',
});

function courseCountLabel(n, t) {
  if (n === 1) return t('دورة واحدة');
  if (n === 2) return t('دورتان');
  if (n >= 3 && n <= 10) return t('{n} دورات', { n });
  return t('{n} دورة', { n });
}

function sessionCountLabel(n, t) {
  const count = Number(n) || 0;
  if (count === 1) return t('جلسة واحدة');
  if (count === 2) return t('جلستان');
  if (count >= 3 && count <= 10) return t('{n} جلسات', { n: count });
  return t('{n} جلسة', { n: count });
}

function ProgressBar({ value, small = false }) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`course-progress ${small ? 'small' : ''}`.trim()}>
      <div
        className="course-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('نسبة إنجاز المهام')}
      >
        <div className="course-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="course-progress-label tnum">{pct}%</span>
    </div>
  );
}

export default function CoursesList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, tr, td } = useI18n();
  const { courses, tasks, refreshData, hasPrivilege } = useApp();
  const [view, setView] = useState('cards');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const canMutateCourse = hasPrivilege('admin') || hasPrivilege('operation');
  const [tracks, setTracks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const sessions = Math.max(1, Number(form.sessionCount) || 1);
  const hours = Math.max(0, Number(form.totalHours) || 0);
  const hoursPerSession = hours > 0 ? Math.round((hours / sessions) * 10) / 10 : 0;
  // Holds an API error message (already translated by the client); shown through td().
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (showCreate) {
      Promise.all([settingsApi.tracks(), settingsApi.taskTemplates(), employeesApi.list()])
        .then(([trackList, tpls, e]) => { setTracks(trackList); setTemplates(tpls); setEmployees(e); })
        .catch(() => {});
    }
  }, [showCreate]);

  const instructors = useMemo(
    () => employees.filter((emp) =>
      emp.privileges?.some((ep) => ep.privilege?.code === 'instructor')
    ),
    [employees]
  );

  // Progress comes from the API's task counts, so it doesn't change with the viewer's specialty.
  const getProgress = (course) => courseProgress(course, tasks);

  const statusCounts = useMemo(() => {
    const counts = {};
    courses.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [courses]);

  const activeCount = statusCounts.active || 0;

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      const name = (c.name || '').toLowerCase();
      const instructor = (c.primaryInstructor?.fullName || '').toLowerCase();
      return name.includes(q) || instructor.includes(q);
    });
  }, [courses, search, statusFilter]);

  const hasFilters = search.trim() !== '' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const openCourse = (course) => navigate(`/courses/${course.id}`);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        trackId: form.trackId,
        startDate: form.startDate,
        sessionCount: Number(form.sessionCount),
        totalHours: Number(form.totalHours),
        priceMinor: parseMinorInput(form.priceMinor),
        capacity: Number(form.capacity),
        primaryInstructorId: form.primaryInstructorId || undefined,
        taskPathTemplateId: form.taskPathTemplateId || null,
        teacherPayMode: form.primaryInstructorId ? form.teacherPayMode : null,
        payPercent: form.primaryInstructorId && form.teacherPayMode === 'percent'
          ? Number(form.payPercent)
          : null,
        hourlyRateMinor: form.primaryInstructorId && form.teacherPayMode === 'hourly'
          ? parseMinorInput(form.hourlyRateMinor)
          : null,
      };
      await coursesApi.create(payload);
      await refreshData();
      setShowCreate(false);
      setForm(emptyForm());
      toast.success(t('تم إنشاء الدورة'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createButton = canMutateCourse ? (
    <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
      <PlusIcon />
      {t('دورة جديدة')}
    </button>
  ) : null;

  const renderTrack = (course) =>
    course.track?.nameAr
      ? <span className="track-pill">{trackName(course.track)}</span>
      : <span className="cell-muted">—</span>;

  const tableColumns = [
    { key: 'name', label: t('الاسم'), render: (c) => <span className="cell-name">{c.name}</span> },
    { key: 'track', label: t('المسار'), render: renderTrack },
    { key: 'status', label: t('الحالة'), render: (c) => <StatusBadge kind="course" value={c.status} /> },
    { key: 'price', label: t('السعر'), render: (c) => <span className="tnum">{formatMinor(c.priceMinor)}</span> },
    {
      key: 'students',
      label: t('الطلاب'),
      render: (c) => <span className="tnum">{c._count?.enrollments ?? 0}/{c.capacity}</span>,
    },
    { key: 'progress', label: t('التقدم'), width: 160, render: (c) => <ProgressBar value={getProgress(c)} small /> },
    {
      key: 'instructor',
      label: t('المدرّب'),
      render: (c) => <span className="cell-muted">{c.primaryInstructor?.fullName || '—'}</span>,
    },
  ];

  let body;
  if (courses.length === 0) {
    body = (
      <EmptyState
        icon={<BookIcon />}
        title={t('لا توجد دورات بعد')}
        hint={canMutateCourse ? t('أنشئ أول دورة لبدء التسجيل وتوزيع المهام على الفريق.') : t('ستظهر الدورات هنا عند إنشائها.')}
        action={createButton}
      />
    );
  } else if (view === 'cards') {
    body = filteredCourses.length === 0 ? (
      <EmptyState
        icon={<SearchIcon />}
        title={t('لا توجد دورات مطابقة')}
        hint={t('جرّب كلمة بحث أخرى أو غيّر فلتر الحالة.')}
        action={
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>{t('مسح الفلاتر')}</button>
        }
      />
    ) : (
      <div className="courses-grid">
        {filteredCourses.map((course) => {
          const progress = getProgress(course);
          const enrolled = course._count?.enrollments ?? 0;
          return (
            <article
              key={course.id}
              className="course-card card"
              role="button"
              tabIndex={0}
              onClick={() => openCourse(course)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openCourse(course);
                }
              }}
              aria-label={t('فتح الدورة {name}', { name: course.name })}
            >
              <div className="course-card-top">
                {renderTrack(course)}
                <StatusBadge kind="course" value={course.status} />
              </div>
              <h3 className="course-card-title">{course.name}</h3>
              <ul className="course-meta">
                <li>
                  <UserIcon size={15} />
                  <span>{course.primaryInstructor?.fullName || t('بدون مدرّب')}</span>
                </li>
                <li>
                  <UsersIcon size={15} />
                  <span className="tnum">{t('{enrolled}/{capacity} طالب', { enrolled, capacity: course.capacity })}</span>
                </li>
                <li>
                  <CalendarIcon size={15} />
                  <span>{formatDate(course.startDate)}</span>
                </li>
                <li>
                  <ClockIcon size={15} />
                  <span className="tnum">{sessionCountLabel(course.sessionCount, t)}</span>
                </li>
              </ul>
              <ProgressBar value={progress} />
            </article>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className="card card-flush">
        <DataTable
          columns={tableColumns}
          rows={filteredCourses}
          onRowClick={openCourse}
          emptyMessage={hasFilters ? t('لا توجد دورات مطابقة للفلاتر الحالية') : t('لا توجد دورات بعد')}
          minWidth={820}
        />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('الدورات')}</h1>
          <p className="page-subtitle">
            {courseCountLabel(courses.length, t)}
            {' · '}
            {tr('{count} نشطة', { count: <span className="tnum">{activeCount}</span> })}
          </p>
        </div>
        <div className="page-header-actions">
          <div className="view-toggle" role="group" aria-label={t('طريقة العرض')}>
            <button
              type="button"
              className={view === 'cards' ? 'active' : ''}
              onClick={() => setView('cards')}
              aria-pressed={view === 'cards'}
            >
              <GridIcon size={16} />
              {t('بطاقات')}
            </button>
            <button
              type="button"
              className={view === 'table' ? 'active' : ''}
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
            >
              <ListIcon size={16} />
              {t('جدول')}
            </button>
          </div>
          {createButton}
        </div>
      </div>

      {courses.length > 0 && (
        <div className="filter-bar courses-filter">
          <label className="filter-search">
            <SearchIcon size={17} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('ابحث باسم الدورة أو المدرّب…')}
              aria-label={t('بحث في الدورات')}
            />
          </label>
          <div className="filter-chips" role="group" aria-label={t('فلترة حسب الحالة')}>
            <button
              type="button"
              className={`chip ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
              aria-pressed={statusFilter === 'all'}
            >
              {t('الكل')}
              <span className="chip-count tnum">{courses.length}</span>
            </button>
            {Object.entries(COURSE_STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip ${statusFilter === value ? 'active' : ''}`}
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
              >
                {label}
                <span className="chip-count tnum">{statusCounts[value] || 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {body}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('دورة جديدة')}
        description={t('أدخل بيانات الدورة الأساسية، ويمكنك تعديل التفاصيل لاحقاً من صفحة الدورة.')}
        size="lg"
      >
        <form onSubmit={handleCreate} className="course-form">
          {error && <p className="form-error">{td(error)}</p>}

          <section className="form-section">
            <h4 className="form-section-title">{t('الأساسيات')}</h4>
            <div className="form-group">
              <label htmlFor="nc-name">{t('اسم الدورة')}</label>
              <input
                id="nc-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('مثال: أساسيات التداول — الدفعة 3')}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nc-track">{t('المسار')}</label>
                <select
                  id="nc-track"
                  required
                  value={form.trackId}
                  onChange={(e) => setForm({ ...form, trackId: e.target.value })}
                >
                  <option value="">{t('— اختر —')}</option>
                  {tracks.map((track) => <option key={track.id} value={track.id}>{trackName(track)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="nc-template">{t('قالب مسار المهام')}</label>
                <select
                  id="nc-template"
                  value={form.taskPathTemplateId}
                  onChange={(e) => setForm({ ...form, taskPathTemplateId: e.target.value })}
                >
                  <option value="">{t('بدون قالب')}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4 className="form-section-title">{t('الجدولة')}</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nc-start">{t('تاريخ البداية')}</label>
                <input
                  id="nc-start"
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="nc-sessions">{t('عدد الجلسات')}</label>
                <input
                  id="nc-sessions"
                  type="number"
                  min={1}
                  required
                  value={form.sessionCount}
                  onChange={(e) => setForm({ ...form, sessionCount: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="nc-hours">{t('ساعات الدورة التقريبية')}</label>
              <input
                id="nc-hours"
                type="number"
                min={0.5}
                step="0.5"
                required
                value={form.totalHours}
                onChange={(e) => setForm({ ...form, totalHours: e.target.value })}
              />
              <span className="form-hint">
                {t('مدة كل جلسة ≈ {hours} ساعة', { hours: hoursPerSession || '—' })}
                {hoursPerSession ? ` (${form.totalHours} ÷ ${sessions})` : ''}
              </span>
            </div>
          </section>

          <section className="form-section">
            <h4 className="form-section-title">{t('السعر والسعة')}</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nc-price">{t('السعر ({currency})', { currency: getCurrencyLabel() })}</label>
                <input
                  id="nc-price"
                  type="text"
                  inputMode="numeric"
                  required
                  className="ltr"
                  placeholder="100,000"
                  value={form.priceMinor}
                  onChange={(e) => setForm({ ...form, priceMinor: formatAmountInput(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="nc-capacity">{t('السعة')}</label>
                <input
                  id="nc-capacity"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className="form-section">
            <h4 className="form-section-title">{t('المدرّب')}</h4>
            <div className="form-group">
              <label htmlFor="nc-instructor">{t('المدرّب الرئيسي')}</label>
              <select
                id="nc-instructor"
                value={form.primaryInstructorId}
                onChange={(e) => setForm({ ...form, primaryInstructorId: e.target.value })}
              >
                <option value="">{t('— اختياري —')}</option>
                {instructors.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)}
              </select>
            </div>
            {form.primaryInstructorId && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="nc-paymode">{t('طريقة أجر المدرّب')}</label>
                  <select
                    id="nc-paymode"
                    value={form.teacherPayMode}
                    onChange={(e) => setForm({ ...form, teacherPayMode: e.target.value })}
                  >
                    <option value="percent">{t('نسبة من سعر الدورة')}</option>
                    <option value="hourly">{t('أجر بالساعة')}</option>
                  </select>
                </div>
                {form.teacherPayMode === 'percent' ? (
                  <div className="form-group">
                    <label htmlFor="nc-percent">{t('النسبة %')}</label>
                    <input
                      id="nc-percent"
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={form.payPercent}
                      onChange={(e) => setForm({ ...form, payPercent: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="nc-hourly">{t('أجر الساعة ({currency})', { currency: getCurrencyLabel() })}</label>
                    <input
                      id="nc-hourly"
                      type="text"
                      inputMode="numeric"
                      required
                      className="ltr"
                      placeholder="75,000"
                      value={form.hourlyRateMinor}
                      onChange={(e) => setForm({ ...form, hourlyRateMinor: formatAmountInput(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('إنشاء الدورة')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>{t('إلغاء')}</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
