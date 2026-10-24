import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { AlertIcon, GraduationIcon, PlusIcon, SearchIcon } from '../components/icons';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { studentBalance, studentCourseNames, formatMinor, initials } from '../utils/formatters';
import { studentsApi } from '../api/client';
import { statusLabel } from '../utils/statusMaps';
import { STUDENT_STATUSES } from './student/studentStatus';
import './StudentsList.css';

const EMPTY_FORM = { fullName: '', phone: '', email: '' };

function studentsCountLabel(t, n) {
  if (n === 1) return t('طالب واحد');
  if (n === 2) return t('طالبان');
  if (n <= 10) return t('{n} طلاب', { n });
  return t('{n} طالباً', { n });
}

/** Status filter: "all", "due" (owes money) or one student status. */
function matchesFilter(student, filter) {
  if (filter === 'all') return true;
  if (filter === 'due') return studentBalance(student.enrollments) > 0;
  return (student.status || 'active') === filter;
}

/** The enrollment that best describes where the student is now. */
function currentEnrollment(enrollments) {
  const list = enrollments || [];
  return (
    list.find((e) => e.enrollmentStatus === 'attending') ||
    list.find((e) => e.enrollmentStatus === 'enrolled') ||
    list[0] ||
    null
  );
}

function matchesQuery(student, q) {
  if (!q) return true;
  const name = String(student.fullName || '').toLowerCase();
  const email = String(student.email || '').toLowerCase();
  const phone = String(student.phone || '').replace(/\s+/g, '');
  return name.includes(q) || email.includes(q) || phone.includes(q.replace(/\s+/g, ''));
}

export default function StudentsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, td } = useI18n();
  const { students, refreshData, hasPrivilege } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  // The existing student when the phone number is already taken: { studentId }
  const [duplicate, setDuplicate] = useState(null);
  const [saving, setSaving] = useState(false);

  const canCreate = hasPrivilege('admin') || hasPrivilege('operation');

  const query = search.trim().toLowerCase();
  const filtered = students.filter((s) => matchesQuery(s, query) && matchesFilter(s, filter));
  const countFor = (key) => students.filter((s) => matchesFilter(s, key)).length;
  const filters = [
    { key: 'all', label: t('الكل') },
    ...STUDENT_STATUSES.map((value) => ({ key: value, label: statusLabel('student', value) })),
    { key: 'due', label: t('عليهم رصيد') },
  ].map((f) => ({ ...f, count: countFor(f.key) }));

  const closeCreate = () => {
    setShowCreate(false);
    setError('');
    setDuplicate(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setDuplicate(null);
    try {
      await studentsApi.create(form);
      await refreshData();
      setShowCreate(false);
      setForm(EMPTY_FORM);
      toast.success(t('تمت إضافة الطالب'));
    } catch (err) {
      if (err.code === 'CONFLICT' && err.details?.studentId) setDuplicate(err.details);
      else setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('الطالب'),
      render: (r) => (
        <span className="cell-person">
          <span className="avatar">{initials(r.fullName)}</span>
          <span className="cell-name">{r.fullName}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: t('الحالة'),
      render: (r) => <StatusBadge kind="student" value={r.status || 'active'} />,
    },
    {
      key: 'phone',
      label: t('الهاتف'),
      render: (r) => <span className="cell-phone ltr">{r.phone || '—'}</span>,
    },
    {
      key: 'courses',
      label: t('الدورات'),
      render: (r) => {
        const current = currentEnrollment(r.enrollments);
        const single = (r.enrollments || []).length === 1 ? r.enrollments[0] : null;
        return (
          <span className="cell-stack students-course-cell">
            {single?.course?.id ? (
              <Link
                to={`/courses/${single.course.id}`}
                className="students-course-link"
                onClick={(event) => event.stopPropagation()}
              >
                {single.course.name}
              </Link>
            ) : (
              <span className="cell-muted">{studentCourseNames(r.enrollments)}</span>
            )}
            {current && <StatusBadge kind="enrollment" value={current.enrollmentStatus} />}
          </span>
        );
      },
    },
    {
      key: 'balance',
      label: t('رصيد مستحق'),
      render: (r) => {
        const bal = studentBalance(r.enrollments);
        return bal > 0 ? (
          <span className="amount-negative">{formatMinor(bal)}</span>
        ) : (
          <span className="cell-muted">—</span>
        );
      },
    },
    {
      key: 'enrollments',
      label: t('التسجيلات'),
      render: (r) => <span className="tnum">{r.enrollments?.length || 0}</span>,
    },
  ];

  const createButton = canCreate ? (
    <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
      <PlusIcon />
      {t('طالب جديد')}
    </button>
  ) : null;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('الطلاب')}</h1>
          <p className="page-subtitle">{t('إدارة ملفات الطلاب والحضور والمدفوعات')}</p>
        </div>
        {createButton && <div className="page-header-actions">{createButton}</div>}
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<GraduationIcon />}
          title={t('لا يوجد طلاب بعد')}
          hint={t('يظهر الطلاب هنا عند تسجيلهم في دورة أو إضافتهم يدوياً.')}
          action={createButton}
        />
      ) : (
        <>
          <div className="filter-chips students-status-chips" role="tablist" aria-label={t('تصفية حسب الحالة')}>
            {filters
              .filter((f) => f.key === 'all' || f.count > 0 || f.key === filter)
              .map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`chip ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <span className="chip-count tnum">{f.count}</span>
                </button>
              ))}
          </div>

          <div className="filter-bar students-filter-bar">
            <label className="students-search">
              <SearchIcon size={16} />
              <input
                type="search"
                className="input"
                placeholder={t('بحث بالاسم أو الهاتف أو البريد')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('بحث عن طالب')}
              />
            </label>
            <span className="muted-text students-count">
              {query || filter !== 'all'
                ? t('{shown} من {total}', { shown: filtered.length, total: students.length })
                : studentsCountLabel(t, students.length)}
            </span>
          </div>

          <div className="card card-flush">
            <DataTable
              columns={columns}
              rows={filtered}
              onRowClick={(r) => navigate(`/students/${r.id}`)}
              emptyMessage={t('لا توجد نتائج مطابقة للبحث')}
            />
          </div>
        </>
      )}

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title={t('طالب جديد')}
        description={t('أضف طالباً يدوياً دون المرور بمسار العملاء المحتملين.')}
      >
        <form onSubmit={handleCreate}>
          {error && (
            <p className="form-error" role="alert">
              {td(error)}
            </p>
          )}
          <div className="form-group">
            <label htmlFor="student-name">{t('الاسم')}</label>
            <input
              id="student-name"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="student-phone">{t('الهاتف')}</label>
              <input
                id="student-phone"
                className="ltr"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  setDuplicate(null);
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="student-email">{t('البريد الإلكتروني')}</label>
              <input
                id="student-email"
                type="email"
                className="ltr"
                inputMode="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          {duplicate && (
            <div className="callout warning students-duplicate" role="alert">
              <AlertIcon />
              <div className="students-duplicate-body">
                <p>{t('يوجد طالب مسجّل بنفس رقم الهاتف.')}</p>
                <Link to={`/students/${duplicate.studentId}`} className="btn btn-secondary btn-sm">
                  {t('فتح ملف الطالب الموجود')}
                </Link>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ الطالب')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeCreate}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
