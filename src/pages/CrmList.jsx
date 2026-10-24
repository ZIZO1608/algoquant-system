import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import SourceBadge from '../components/SourceBadge';
import { useToast } from '../components/Toast';
import { AlertIcon, PlusIcon, SearchIcon } from '../components/icons';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  formatDate,
  formatDueLabel,
  formatRelativeTime,
  getSourceLabel,
  initials,
  LEAD_STATUSES,
  trackName,
} from '../utils/formatters';
import { followUpTone, hasOpenFollowUp, leadOwners } from '../utils/leads';
import { leadsApi, settingsApi, employeesApi } from '../api/client';
import './Crm.css';
import './CrmList.css';

const EMPTY_FORM = { fullName: '', phone: '', sourceId: '', requestedTrackId: '', assignedEmployeeId: '' };

function leadsCountLabel(t, n) {
  if (n === 0) return t('لا يوجد عملاء محتملون بعد');
  if (n === 1) return t('عميل محتمل واحد');
  if (n === 2) return t('عميلان محتملان');
  if (n <= 10) return t('{n} عملاء محتملين', { n });
  return t('{n} عميلاً محتملاً', { n });
}

function matchesQuery(lead, q) {
  if (!q) return true;
  const name = String(lead.fullName || '').toLowerCase();
  const phone = String(lead.phone || '').replace(/\s+/g, '');
  return name.includes(q) || phone.includes(q.replace(/\s+/g, ''));
}

export default function CrmList() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, td } = useI18n();
  const { leads, refreshData, user } = useApp();
  const isAdmin = Boolean(user?.privileges?.includes('admin'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sources, setSources] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  // The existing lead when the phone number is already taken: { leadId, fullName, status }.
  const [duplicate, setDuplicate] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (showCreate) {
      Promise.all([
        settingsApi.leadSources().catch(() => []),
        settingsApi.tracks().catch(() => []),
        employeesApi.list().catch(() => []),
      ]).then(([sourceList, trackList, employeeList]) => {
        setSources(sourceList);
        setTracks(trackList);
        setEmployees(employeeList);
      });
    }
  }, [showCreate]);

  const counts = useMemo(() => {
    const c = { all: leads.length };
    for (const key of Object.keys(LEAD_STATUSES)) c[key] = 0;
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [leads]);

  const query = search.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    return matchesQuery(l, query);
  });
  const isFiltering = statusFilter !== 'all' || query.length > 0;
  const assigneeOptions = leadOwners(employees, form.assignedEmployeeId);
  const assignedAway = !isAdmin && form.assignedEmployeeId !== (user?.id || '');

  const openCreate = () => {
    // Sales only see the leads assigned to them, so a lead they add starts assigned to them.
    setForm({ ...EMPTY_FORM, assignedEmployeeId: isAdmin ? '' : user?.id || '' });
    setError('');
    setDuplicate(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setError('');
    setDuplicate(null);
  };

  const createLead = async (force) => {
    setSaving(true);
    setError('');
    try {
      await leadsApi.create({
        fullName: form.fullName,
        phone: form.phone,
        sourceId: form.sourceId,
        requestedTrackId: form.requestedTrackId || undefined,
        assignedEmployeeId: form.assignedEmployeeId || undefined,
        force: force || undefined,
      });
      await refreshData();
      setShowCreate(false);
      setDuplicate(null);
      setForm(EMPTY_FORM);
      toast.success(t('تمت إضافة العميل'));
    } catch (err) {
      if (err.code === 'CONFLICT' && err.details?.leadId) {
        setDuplicate(err.details);
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    createLead(false);
  };

  const columns = [
    {
      key: 'fullName',
      label: t('العميل'),
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
      render: (r) => <StatusBadge kind="lead" value={r.status} />,
    },
    {
      key: 'followUp',
      label: t('المتابعة'),
      render: (r) =>
        hasOpenFollowUp(r) ? (
          <span className={`crm-due ${followUpTone(r.nextFollowUpAt)}`.trim()} title={formatDate(r.nextFollowUpAt)}>
            {formatDueLabel(r.nextFollowUpAt)}
          </span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    {
      key: 'phone',
      label: t('الهاتف'),
      render: (r) => <span className="cell-phone ltr">{r.phone || '—'}</span>,
    },
    {
      key: 'source',
      label: t('المصدر'),
      render: (r) => <SourceBadge source={r.source?.code || r.source} />,
    },
    {
      key: 'course',
      label: t('الدورة المطلوبة'),
      render: (r) =>
        r.requestedCourseText ? (
          <span className="track-pill">{r.requestedCourseText}</span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    // Sales only see their own leads, so the assignee column is for admins.
    ...(isAdmin
      ? [
          {
            key: 'assignee',
            label: t('المسؤول'),
            render: (r) =>
              r.assignedEmployee?.fullName ? (
                <span className="cell-person">
                  <span className="avatar avatar-sm">{initials(r.assignedEmployee.fullName)}</span>
                  <span className="cell-name">{r.assignedEmployee.fullName}</span>
                </span>
              ) : (
                <span className="cell-muted">{t('غير معيّن')}</span>
              ),
          },
        ]
      : []),
    {
      key: 'updatedAt',
      label: t('آخر تحديث'),
      render: (r) => <span className="cell-muted">{formatRelativeTime(r.updatedAt)}</span>,
    },
  ];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('العملاء المحتملون')}</h1>
          <p className="page-subtitle">
            {leadsCountLabel(t, leads.length)}
            {isFiltering &&
              leads.length > 0 &&
              ` · ${t('يظهر {shown} من {total}', { shown: filtered.length, total: leads.length })}`}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <PlusIcon />
            {t('عميل جديد')}
          </button>
        </div>
      </div>

      <div className="filter-bar crm-filter-bar">
        <div className="filter-chips crm-status-chips" role="group" aria-label={t('تصفية حسب الحالة')}>
          <button
            type="button"
            className={`chip ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
            aria-pressed={statusFilter === 'all'}
          >
            {t('الكل')}
            <span className="chip-count">{counts.all}</span>
          </button>
          {Object.entries(LEAD_STATUSES).map(([key, val]) => (
            <button
              key={key}
              type="button"
              className={`chip ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
            >
              {val.label}
              <span className="chip-count">{counts[key] || 0}</span>
            </button>
          ))}
        </div>
        <label className="crm-search">
          <SearchIcon size={16} />
          <input
            type="search"
            className="input"
            placeholder={t('بحث بالاسم أو الهاتف')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('بحث عن عميل')}
          />
        </label>
      </div>

      <div className="card card-flush">
        <DataTable
          className="crm-table"
          columns={columns}
          rows={filtered}
          minWidth={880}
          onRowClick={(r) => navigate(`/crm/${r.id}`)}
          emptyMessage={
            leads.length === 0 ? t('لا يوجد عملاء محتملون بعد') : t('لا توجد نتائج مطابقة للتصفية الحالية')
          }
        />
      </div>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title={t('إضافة عميل محتمل')}
        description={t('سجّل بيانات العميل الأساسية ومصدر التواصل.')}
      >
        <form onSubmit={handleCreate}>
          {error && (
            <p className="form-error" role="alert">
              {td(error)}
            </p>
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="lead-name">{t('الاسم')}</label>
              <input
                id="lead-name"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lead-phone">{t('الهاتف')}</label>
              <input
                id="lead-phone"
                required
                className="ltr"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  setDuplicate(null);
                }}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="lead-source">{t('المصدر')}</label>
            <select
              id="lead-source"
              required
              value={form.sourceId}
              onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
            >
              <option value="">{t('— اختر —')}</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {getSourceLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="lead-track">{t('المسار المطلوب')}</label>
              <select
                id="lead-track"
                value={form.requestedTrackId}
                onChange={(e) => setForm({ ...form, requestedTrackId: e.target.value })}
              >
                <option value="">{t('— اختياري —')}</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {trackName(track)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="lead-assignee">{t('تعيين موظف')}</label>
              <select
                id="lead-assignee"
                value={form.assignedEmployeeId}
                onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value })}
              >
                <option value="">{t('— اختياري —')}</option>
                {assigneeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </option>
                ))}
              </select>
              {assignedAway && (
                <span className="form-hint">{t('لن يظهر هذا العميل في قائمتك لأنه غير معيّن لك.')}</span>
              )}
            </div>
          </div>

          {duplicate && (
            <div className="callout warning crm-duplicate" role="alert">
              <AlertIcon />
              <div className="crm-duplicate-body">
                <p>{t('يوجد عميل محتمل بنفس رقم الهاتف: {name}', { name: duplicate.fullName })}</p>
                <div className="crm-duplicate-actions">
                  <Link to={`/crm/${duplicate.leadId}`} className="btn btn-secondary btn-sm">
                    {t('فتح العميل الموجود')}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={saving}
                    onClick={() => createLead(true)}
                  >
                    {t('إضافة كعميل جديد رغم ذلك')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ العميل')}
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
