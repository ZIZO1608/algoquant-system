import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import PhaseStepper from '../components/PhaseStepper';
import TaskRow from '../components/TaskRow';
import ProgressSummary from '../components/ProgressSummary';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import {
  SPECIALTY_LABELS,
  formatAmountInput,
  formatMinor,
  formatDate,
  formatDateTime,
  getCurrencyLabel,
  initials,
  parseMinorInput,
  trackName,
} from '../utils/formatters';
import { statusLabel } from '../utils/statusMaps';
import { courseTaskTotals } from '../utils/courses';
import { COURSE_LIFECYCLE_STAGES, lifecycleStageLabel } from '../utils/courseLifecycle';
import { coursesApi, tasksApi, settingsApi, employeesApi, studentsApi, leadsApi, filesApi } from '../api/client';
import {
  AlertIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CoinsIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ExternalIcon,
  FileIcon,
  ImageIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from '../components/icons';
import './CourseDetail.css';

const TABS = [
  { id: 'lifecycle', label: 'دورة الحياة' },
  { id: 'students', label: 'الطلاب' },
  { id: 'sessions', label: 'الجلسات' },
  { id: 'evaluations', label: 'التقييمات' },
  { id: 'finance', label: 'المالية' },
  { id: 'files', label: 'الملفات' },
];

function avgLabel(value) {
  return value == null ? '—' : Number(value).toFixed(1);
}

const FILE_CATEGORIES = [
  { value: 'all', label: 'الكل' },
  { value: 'materials', label: 'مواد تعليمية' },
  { value: 'media', label: 'ميديا' },
  { value: 'certificates', label: 'شهادات' },
  { value: 'other', label: 'أخرى' },
];

const FILE_CATEGORY_LABELS = Object.fromEntries(FILE_CATEGORIES.filter((c) => c.value !== 'all').map((c) => [c.value, c.label]));

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mime = '') {
  if (mime.startsWith('image/')) return 'صورة';
  if (mime.startsWith('video/')) return 'فيديو';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'جدول|file-kind';
  if (mime.includes('word') || mime.includes('document')) return 'مستند';
  return 'ملف';
}

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SpecialtyPanel({ title, specialty, tasks, employees, onTransition, onUpdate }) {
  const filtered = tasks.filter((task) => task.specialty === specialty);
  if (!filtered.length) return null;
  const dept = SPECIALTY_LABELS[specialty];
  const done = filtered.filter((task) => task.status === 'done').length;
  return (
    <div className="side-panel card">
      <div className={`side-panel-header ${dept?.className || ''}`}>
        <span className={`dept-badge ${dept?.className}`}>{dept?.label}</span>
        <h3>{title}</h3>
        <span className="side-panel-count tnum">
          {done}/{filtered.length}
        </span>
      </div>
      <div className="side-panel-list">
        {filtered.map((task) => (
          <TaskRow key={task.id} task={task} employees={employees} onTransition={onTransition} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function StatCardInline({ label, value, icon, tone }) {
  return (
    <div className={`card stat-inline ${tone || ''}`}>
      <div className="stat-inline-top">
        <span className="stat-inline-label">{label}</span>
        {icon && <span className="stat-inline-icon">{icon}</span>}
      </div>
      <div className="stat-inline-value">{value}</div>
    </div>
  );
}

export default function CourseDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { confirm } = useDialog();
  const { t, td } = useI18n();
  const {
    transitionTask,
    refreshData,
    students: allStudents,
    leads: allLeads,
    courses: allCourses,
    hasPrivilege,
  } = useApp();
  const canMutateCourse = hasPrivilege('admin') || hasPrivilege('operation');
  // Only these privileges may read the students list; others get 403 and an empty allStudents.
  const canReadStudents = hasPrivilege('admin') || hasPrivilege('operation') || hasPrivilege('sales');
  const canManageTemplate = hasPrivilege('admin');
  const [course, setCourse] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [phases, setPhases] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const tabIds = TABS.map((tab) => tab.id);
  const [activeTab, setActiveTab] = useState(tabIds.includes(urlTab) ? urlTab : 'lifecycle');

  // The open tab lives in the address, so a tab can be linked to and survives a refresh.
  useEffect(() => {
    if (tabIds.includes(urlTab) && urlTab !== activeTab) setActiveTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (id) => {
    setActiveTab(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'lifecycle') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };
  const [deptFilter, setDeptFilter] = useState('all');
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState(new Set());
  const [showEdit, setShowEdit] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [payVisible, setPayVisible] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollTab, setEnrollTab] = useState('students');
  const [paymentForm, setPaymentForm] = useState({ enrollmentId: '', amountMinor: '', note: '' });
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [sessionEdits, setSessionEdits] = useState({});
  const [archiveReason, setArchiveReason] = useState('');
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [courseFiles, setCourseFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [fileCategory, setFileCategory] = useState('all');
  const [uploadPurpose, setUploadPurpose] = useState('materials');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileBusyId, setFileBusyId] = useState(null);
  const [evalCampaigns, setEvalCampaigns] = useState([]);
  const [evalsLoading, setEvalsLoading] = useState(false);
  const [evalsError, setEvalsError] = useState('');

  const currency = getCurrencyLabel();

  const openModal = (setter) => {
    setError('');
    setter(true);
  };

  const reloadTasks = useCallback(async () => {
    try {
      const list = await tasksApi.list({ courseId: id });
      setTasks(list);
      setTasksError('');
      return list;
    } catch (err) {
      setTasks([]);
      setTasksError(err.message || 'تعذّر تحميل المهام');
      return [];
    }
  }, [id]);

  const reloadCourse = useCallback(async () => {
    const data = await coursesApi.get(id);
    setCourse(data);
    const link = data.instructors?.find((i) => i.employeeId === data.primaryInstructorId) || data.instructors?.[0];
    const visible = !!(link && ('payPercent' in link || 'hourlyRateMinor' in link));
    setPayVisible(visible);
    const payMode = visible && link?.hourlyRateMinor != null ? 'hourly' : 'percent';
    setEditForm({
      name: data.name,
      capacity: data.capacity,
      hallNotes: data.hallNotes || '',
      totalHours: data.totalHours ?? 0,
      primaryInstructorId: data.primaryInstructorId || '',
      teacherPayMode: payMode,
      payPercent: visible && link?.payPercent != null ? String(link.payPercent) : '',
      hourlyRateMinor: visible && link?.hourlyRateMinor != null ? formatAmountInput(String(link.hourlyRateMinor)) : '',
    });
    if (data.sessions?.length) {
      setSelectedSessionId((prev) => prev || data.sessions[0].id);
    }
    return data;
  }, [id]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        reloadCourse(),
        reloadTasks(),
        employeesApi.list().then(setEmployees).catch(() => setEmployees([])),
        settingsApi.taskTemplates().then(setTemplates).catch(() => setTemplates([])),
      ]);
      setPhases(COURSE_LIFECYCLE_STAGES.map((s) => ({ key: s.key, labelAr: s.labelAr, sortOrder: s.sortOrder })));
    } catch {
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [reloadCourse, reloadTasks]);

  const instructors = useMemo(
    () => employees.filter((emp) => emp.privileges?.some((ep) => ep.privilege?.code === 'instructor')),
    [employees]
  );

  useEffect(() => {
    reload().then(() => {
      setExpandedPhases(new Set(COURSE_LIFECYCLE_STAGES.slice(0, 3).map((x) => x.key)));
    });
  }, [reload]);

  useEffect(() => {
    if (!tasks.length) return;
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      tasks.forEach((task) => {
        if (task.phaseKey) next.add(task.phaseKey);
      });
      return next;
    });
  }, [tasks]);

  const displayPhases = useMemo(() => {
    const known = new Set(COURSE_LIFECYCLE_STAGES.map((p) => p.key));
    const base = COURSE_LIFECYCLE_STAGES.map((s) => ({ key: s.key, labelAr: s.labelAr, label: t(s.labelAr), sortOrder: s.sortOrder }));
    const orphanKeys = [...new Set(tasks.map((task) => task.phaseKey).filter((k) => k && !known.has(k)))];
    return [...base, ...orphanKeys.map((key) => ({ key, labelAr: lifecycleStageLabel(key), label: lifecycleStageLabel(key) }))];
  }, [tasks, t]);

  const attachedLink = useMemo(() => course?.taskPathLinks?.[0] ?? null, [course]);

  const courseStudents = useMemo(() => allStudents.filter((s) => s.enrollments?.some((e) => e.course?.id === id)), [allStudents, id]);
  // The course list carries counts the detail response doesn't: enrolled students and all tasks.
  const courseSummary = useMemo(() => allCourses.find((c) => c.id === id), [allCourses, id]);
  const enrolledCount = course?._count?.enrollments ?? courseSummary?._count?.enrollments ?? courseStudents.length;
  const taskTotals = useMemo(
    () => courseTaskTotals(course?.taskStats ? course : courseSummary, tasks),
    [course, courseSummary, tasks]
  );
  /**
   * Who to show in the attendance panel. Instructors may record attendance but cannot read the
   * students list, so the course API sends them a roster of their own course.
   */
  const attendanceRoster = useMemo(() => {
    if (course?.enrollments?.length) {
      return course.enrollments.map((enrollment) => ({
        id: enrollment.student.id,
        fullName: enrollment.student.fullName,
      }));
    }
    return courseStudents;
  }, [course, courseStudents]);
  const enrolledStudentIds = useMemo(() => new Set(courseStudents.map((s) => s.id)), [courseStudents]);

  const financeStats = useMemo(() => {
    let revenue = 0;
    let collected = 0;
    courseStudents.forEach((s) => {
      const enr = s.enrollments?.find((e) => e.course?.id === id);
      if (enr) {
        revenue += Number(enr.totalPriceMinor ?? 0);
        collected += Number(enr.amountPaidMinor ?? 0);
      }
    });
    return { revenue, collected };
  }, [courseStudents, id]);

  const enrollCandidates = useMemo(() => {
    const q = enrollSearch.trim().toLowerCase();
    if (enrollTab === 'students') {
      return allStudents
        .filter((s) => !enrolledStudentIds.has(s.id))
        .filter((s) => !q || s.fullName?.toLowerCase().includes(q) || s.phone?.includes(q));
    }
    return allLeads.filter((l) => !q || l.fullName?.toLowerCase().includes(q) || l.phone?.includes(q));
  }, [enrollSearch, enrollTab, allStudents, allLeads, enrolledStudentIds]);

  const selectedSession = useMemo(() => course?.sessions?.find((s) => s.id === selectedSessionId) ?? null, [course, selectedSessionId]);

  const canRecordAttendance = hasPrivilege('admin') || hasPrivilege('operation') || hasPrivilege('instructor');
  const canRecordPayment = hasPrivilege('admin') || hasPrivilege('accountant') || hasPrivilege('operation');
  const canEditSessions = hasPrivilege('admin') || hasPrivilege('operation');
  const canManageFiles = hasPrivilege('admin') || hasPrivilege('operation') || hasPrivilege('media');
  const canViewEvaluations = hasPrivilege('admin') || hasPrivilege('operation') || hasPrivilege('instructor');
  const canManageEvaluations = hasPrivilege('admin') || hasPrivilege('operation');

  const reloadEvaluations = useCallback(async () => {
    if (!id || !canViewEvaluations) return;
    setEvalsLoading(true);
    setEvalsError('');
    try {
      const rows = await coursesApi.evaluationCampaigns(id);
      setEvalCampaigns(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setEvalCampaigns([]);
      setEvalsError(err.message || 'تعذّر تحميل التقييمات');
    } finally {
      setEvalsLoading(false);
    }
  }, [id, canViewEvaluations]);

  const reloadFiles = useCallback(async () => {
    if (!id) return;
    setFilesLoading(true);
    setFilesError('');
    try {
      const rows = await filesApi.list({ entityType: 'course', entityId: id });
      setCourseFiles(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setFilesError(err.message || 'تعذّر تحميل الملفات');
      setCourseFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'files') reloadFiles();
  }, [activeTab, reloadFiles]);

  useEffect(() => {
    if (activeTab === 'evaluations') reloadEvaluations();
  }, [activeTab, reloadEvaluations]);

  const filteredCourseFiles = useMemo(
    () => (fileCategory === 'all' ? courseFiles : courseFiles.filter((f) => f.purpose === fileCategory)),
    [courseFiles, fileCategory]
  );

  const handleUploadCourseFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFile(true);
    setFilesError('');
    try {
      await filesApi.upload(file, uploadPurpose, { entityType: 'course', entityId: id });
      await reloadFiles();
      toast.success(t('تم رفع الملف'));
    } catch (err) {
      setFilesError(err.message || 'فشل رفع الملف');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleOpenCourseFile = async (fileId) => {
    setFileBusyId(fileId);
    setFilesError('');
    try {
      const { url } = await filesApi.getUrl(fileId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setFilesError(err.message || 'تعذّر فتح الملف. تأكد أن خدمة التخزين تعمل.');
    } finally {
      setFileBusyId(null);
    }
  };

  const handleDeleteCourseFile = async (file) => {
    const ok = await confirm({
      title: t('حذف الملف'),
      message: t('سيتم حذف «{name}» نهائياً. لا يمكن التراجع عن هذا الإجراء.', { name: file.originalName || t('الملف') }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!ok) return;
    setFileBusyId(file.id);
    setFilesError('');
    try {
      await filesApi.remove(file.id);
      setCourseFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(t('تم حذف الملف'));
    } catch (err) {
      setFilesError(err.message || 'تعذّر حذف الملف');
    } finally {
      setFileBusyId(null);
    }
  };

  const getSessionDraft = (session) => {
    const edit = sessionEdits[session.id] || {};
    return {
      scheduledLocal: edit.scheduledLocal ?? toLocalInput(session.scheduledAt),
      durationHours:
        edit.durationHours ?? (session.durationMinutes != null ? String(Math.round((session.durationMinutes / 60) * 100) / 100) : '1.5'),
    };
  };

  const isSessionDirty = (session) => {
    const draft = getSessionDraft(session);
    const currentHours = session.durationMinutes != null ? String(Math.round((session.durationMinutes / 60) * 100) / 100) : '1.5';
    return draft.scheduledLocal !== toLocalInput(session.scheduledAt) || String(draft.durationHours) !== currentHours;
  };

  const handleTransition = async (taskId, toStatus) => {
    await transitionTask(taskId, toStatus);
    await reloadTasks();
  };

  const handleConfirmArchive = async () => {
    if (!archiveReason.trim()) {
      setError('يرجى إدخال سبب الأرشفة');
      return;
    }
    setSaving(true);
    try {
      await coursesApi.transition(id, 'archived', archiveReason.trim());
      await reloadCourse();
      await refreshData();
      setShowArchiveModal(false);
      setArchiveReason('');
      toast.success(t('تمت أرشفة الدورة'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const instructorLocked = ['active', 'completed', 'archived'].includes(course?.status);

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: editForm.name,
        capacity: Number(editForm.capacity),
        hallNotes: editForm.hallNotes,
        totalHours: Number(editForm.totalHours),
      };
      if (!instructorLocked) {
        payload.primaryInstructorId = editForm.primaryInstructorId || null;
        if (payVisible && editForm.primaryInstructorId) {
          payload.teacherPayMode = editForm.teacherPayMode;
          payload.payPercent = editForm.teacherPayMode === 'percent' ? Number(editForm.payPercent) : null;
          payload.hourlyRateMinor = editForm.teacherPayMode === 'hourly' ? parseMinorInput(editForm.hourlyRateMinor) : null;
        }
      }
      await coursesApi.update(id, payload);
      await reloadCourse();
      await refreshData();
      setShowEdit(false);
      toast.success(t('تم حفظ التعديلات'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAttachTemplate = async (templateId) => {
    if (attachedLink && attachedLink.templateId !== templateId) {
      const ok = await confirm({
        title: t('تغيير قالب المهام'),
        message: t('تغيير القالب سيُنهي المهام غير المكتملة من القالب الحالي ويُنشئ مهام القالب الجديد. المهام المكتملة تبقى في السجل. هل تريد المتابعة؟'),
        confirmLabel: t('تغيير القالب'),
      });
      if (!ok) return;
    }
    setSaving(true);
    setError('');
    try {
      if (attachedLink) await coursesApi.replaceTemplate(id, templateId);
      else await coursesApi.attachTemplate(id, templateId);
      await reloadCourse();
      await reloadTasks();
      setShowAttach(false);
      toast.success(t('تم ربط قالب المهام'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const findStudentForLead = (lead) => allStudents.find((s) => s.phone && lead.phone && s.phone === lead.phone);

  const handleEnrollStudent = async (studentId, leadId = null) => {
    setSaving(true);
    setError('');
    try {
      await studentsApi.enroll(id, { studentId, leadId });
      if (leadId) {
        const lead = allLeads.find((l) => l.id === leadId);
        if (lead?.status === 'paid') {
          try {
            await leadsApi.transition(leadId, 'enrolled');
          } catch {
            /* lead may already be enrolled */
          }
        }
      }
      await refreshData();
      setShowEnroll(false);
      setEnrollSearch('');
      toast.success(t('تم تسجيل الطالب في الدورة'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnrollLead = async (lead) => {
    setSaving(true);
    setError('');
    try {
      let student = findStudentForLead(lead);
      if (!student) student = await studentsApi.create({ fullName: lead.fullName, phone: lead.phone });
      await studentsApi.enroll(id, { studentId: student.id, leadId: lead.id });
      if (lead.status === 'paid') {
        try {
          await leadsApi.transition(lead.id, 'enrolled');
        } catch {
          /* ignore */
        }
      }
      await refreshData();
      setShowEnroll(false);
      setEnrollSearch('');
      toast.success(t('تم تسجيل الطالب في الدورة'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await studentsApi.recordPayment(paymentForm.enrollmentId, {
        amountMinor: parseMinorInput(paymentForm.amountMinor),
        note: paymentForm.note,
      });
      await refreshData();
      setShowPayment(false);
      setPaymentForm({ enrollmentId: '', amountMinor: '', note: '' });
      toast.success(t('تم تسجيل الدفعة'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const initAttendanceDraft = useCallback(
    (sessionId) => {
      const draft = {};
      courseStudents.forEach((s) => {
        draft[s.id] = 'absent';
      });
      setAttendanceDraft(draft);
      setSelectedSessionId(sessionId);
    },
    [courseStudents]
  );

  const handleSaveAttendance = async () => {
    if (!selectedSessionId) return;
    setSaving(true);
    setError('');
    try {
      const records = Object.entries(attendanceDraft).map(([studentId, status]) => ({ studentId, status }));
      await studentsApi.recordAttendance(selectedSessionId, records);
      await reloadCourse();
      await refreshData();
      await reloadEvaluations();
      toast.success(t('تم حفظ الحضور'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEvalCampaign = async () => {
    setSaving(true);
    setEvalsError('');
    try {
      await coursesApi.createEvaluationCampaign(id, { type: 'post_course' });
      await reloadEvaluations();
      toast.success(t('تم إنشاء حملة التقييم'));
    } catch (err) {
      setEvalsError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text, okMessage = t('تم النسخ')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMessage);
    } catch {
      toast.error(t('تعذّر النسخ إلى الحافظة'));
    }
  };

  const handleCopyAllEvalLinks = (campaign) => {
    const lines = (campaign.students || []).filter((s) => s.link).map((s) => `${s.studentName}: ${s.link}`);
    if (!lines.length) {
      toast.warning(t('لا توجد روابط متاحة للنسخ'));
      return;
    }
    copyText(lines.join('\n'), t('تم نسخ {count} رابط', { count: lines.length }));
  };

  const handleSaveSession = async (session) => {
    const draft = getSessionDraft(session);
    if (!draft.scheduledLocal) return;
    setSaving(true);
    setError('');
    try {
      const hours = Number(draft.durationHours);
      await coursesApi.updateSession(id, session.id, {
        scheduledAt: new Date(draft.scheduledLocal).toISOString(),
        durationMinutes: Math.round(hours * 60),
      });
      await reloadCourse();
      setSessionEdits((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      toast.success(t('تم حفظ الجلسة'));
    } catch (err) {
      toast.error(err.message || t('تعذّر حفظ الجلسة'));
    } finally {
      setSaving(false);
    }
  };

  const exportChecklist = () => {
    const rows = [[t('المرحلة'), t('المهمة'), t('القسم'), t('الحالة'), t('المسؤول'), t('الموعد')]];
    tasks.forEach((task) => {
      rows.push([
        lifecycleStageLabel(task.phaseKey),
        task.title,
        SPECIALTY_LABELS[task.specialty]?.label || task.specialty,
        statusLabel('task', task.status),
        task.assignedEmployee?.fullName || '',
        task.dueAt ? formatDate(task.dueAt) : '',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course?.name || 'course'}-checklist.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('تم تصدير قائمة المهام'));
  };

  const togglePhase = (phaseKey) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  };

  const filterTask = (task) => {
    if (deptFilter !== 'all' && task.specialty !== deptFilter) return false;
    if (showIncomplete && task.status === 'done') return false;
    return true;
  };

  const currentPhaseKey = useMemo(() => {
    for (const phase of displayPhases) {
      const phaseTasks = tasks.filter((task) => task.phaseKey === phase.key);
      if (phaseTasks.some((task) => task.status !== 'done')) return phase.key;
    }
    return displayPhases[displayPhases.length - 1]?.key;
  }, [displayPhases, tasks]);

  if (loading) {
    return (
      <AppShell>
        <PageLoading tiles={5} rows={4} />
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <EmptyState
          icon={<BookIcon />}
          title={t('الدورة غير موجودة')}
          hint={t('ربما تم حذفها أو أن الرابط غير صحيح.')}
          action={
            <Link to="/courses" className="btn btn-primary">
              {t('العودة إلى الدورات')}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const sessionsDone = (course.sessions || []).filter((s) => s.status === 'completed').length;
  // The finance figures add up enrollment payments, which only students-readers can load.
  const visibleTabs = TABS.filter((tab) => tab.id !== 'finance' || canReadStudents);
  const tabCounts = {
    students: enrolledCount,
    sessions: course.sessions?.length || course.sessionCount,
    files: courseFiles.length || undefined,
    evaluations: evalCampaigns.length || undefined,
  };

  return (
    <AppShell>
      <nav className="breadcrumb" aria-label={t('مسار التنقل')}>
        <Link to="/courses">{t('الدورات')}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{course.name}</span>
      </nav>

      <div className="page-header course-header">
        <div className="course-header-main">
          <div className="course-header-title">
            <h1 className="page-title">{course.name}</h1>
            <StatusBadge kind="course" value={course.status} />
          </div>
          <div className="course-meta">
            <span className="track-pill">{trackName(course.track) || '—'}</span>
            <span className="course-meta-item">
              <CoinsIcon size={14} />
              <span className="tnum">{formatMinor(course.priceMinor)}</span>
            </span>
            <span className="course-meta-item">
              <CalendarIcon size={14} />
              {t('يبدأ {date}', { date: formatDate(course.startDate) })}
            </span>
            <span className="course-meta-item">
              <ClockIcon size={14} />
              {t('{count} جلسات', { count: course.sessionCount })}
              {course.totalHours ? ` · ${t('{hours} ساعة', { hours: course.totalHours })}` : ''}
            </span>
            <span className="course-meta-item">
              <UserIcon size={14} />
              {course.primaryInstructor?.fullName || t('بدون مدرّب')}
            </span>
            <span className="course-meta-item">
              <UsersIcon size={14} />
              {t('{count}/{capacity} طالب', { count: enrolledCount, capacity: course.capacity })}
            </span>
          </div>
        </div>
        <div className="page-header-actions">
          {canMutateCourse && (
            <button type="button" className="btn btn-secondary" onClick={() => openModal(setShowEdit)}>
              <EditIcon />
              {t('تعديل')}
            </button>
          )}
          {canManageTemplate && (
            <button type="button" className="btn btn-secondary" onClick={() => openModal(setShowAttach)}>
              <LayersIcon />
              {attachedLink ? t('تغيير القالب') : t('ربط قالب مهام')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={exportChecklist}>
            <DownloadIcon />
            {t('تصدير المهام')}
          </button>
          {canMutateCourse && course.allowedTransitions?.includes('archived') && (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => openModal(setShowArchiveModal)}>
              {t('أرشفة')}
            </button>
          )}
        </div>
      </div>

      {course.status === 'enrollment_open' && (
        <div className="callout">
          <InfoIcon />
          <span>
            {t('ستتحول الدورة تلقائياً إلى «نشط» عند تاريخ البدء ({date}) وإلى «مكتمل» بعد تسجيل حضور آخر جلسة.', { date: formatDate(course.startDate) })}
          </span>
        </div>
      )}

      <div className="tabs">
        {visibleTabs.map((tab) => (
          <button key={tab.id} type="button" className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => selectTab(tab.id)}>
            {t(tab.label)}
            {tabCounts[tab.id] != null && <span className="tab-count">{tabCounts[tab.id]}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'lifecycle' && (
        <>
          {attachedLink ? (
            <div className="template-banner">
              <span className="template-banner-icon">
                <LayersIcon size={18} />
              </span>
              <div className="template-banner-text">
                <span className="template-banner-label">{t('قالب المهام المرفق')}</span>
                <strong>{attachedLink.template?.name}</strong>
              </div>
              {canManageTemplate && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(setShowAttach)}>
                  {t('تغيير القالب')}
                </button>
              )}
            </div>
          ) : (
            <div className="template-banner is-missing">
              <span className="template-banner-icon">
                <AlertIcon size={18} />
              </span>
              <div className="template-banner-text">
                <strong>{t('لا يوجد قالب مهام مرفق')}</strong>
                <span className="template-banner-label">{t('اربط قالباً لتوليد مهام دورة الحياة تلقائياً.')}</span>
              </div>
              {canManageTemplate && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(setShowAttach)}>
                  <LayersIcon />
                  {t('ربط قالب مهام')}
                </button>
              )}
            </div>
          )}

          <PhaseStepper phases={phases} tasks={tasks} currentPhaseKey={currentPhaseKey} hasHiddenTasks={taskTotals.hidden > 0} />

          <div className="lifecycle-layout">
            <div className="lifecycle-main">
              <div className="filter-chips">
                <button type="button" className={`chip ${deptFilter === 'all' ? 'active' : ''}`} onClick={() => setDeptFilter('all')}>
                  {t('الكل')}
                </button>
                {Object.entries(SPECIALTY_LABELS).map(([key, dept]) => (
                  <button key={key} type="button" className={`chip ${deptFilter === key ? 'active' : ''}`} onClick={() => setDeptFilter(key)}>
                    {dept.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chip chip-outline ${showIncomplete ? 'active' : ''}`}
                  onClick={() => setShowIncomplete(!showIncomplete)}
                  aria-pressed={showIncomplete}
                >
                  {t('غير المكتمل فقط')}
                </button>
              </div>

              {tasksError && (
                <p className="form-error">
                  <AlertIcon size={16} />
                  {td(tasksError)}
                </p>
              )}

              {tasks.length === 0 && !tasksError ? (
                taskTotals.total > 0 ? (
                  <EmptyState
                    icon={<LayersIcon />}
                    title={t('لا توجد مهام ضمن تخصصك')}
                    hint={t('مهام هذه الدورة ({count}) مسندة إلى أقسام أخرى.', { count: taskTotals.total })}
                  />
                ) : (
                <EmptyState
                  icon={<LayersIcon />}
                  title={t('لا توجد مهام بعد')}
                  hint={t('اربط قالب مهام لتوليد مهام دورة الحياة تلقائياً.')}
                  action={
                    canManageTemplate && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(setShowAttach)}>
                        {t('ربط قالب مهام')}
                      </button>
                    )
                  }
                />
                )
              ) : (
                displayPhases.map((phase) => {
                  const phaseTasks = tasks.filter((task) => task.phaseKey === phase.key).filter(filterTask);
                  if (phaseTasks.length === 0) return null;
                  const isOpen = expandedPhases.has(phase.key);
                  const allPhaseTasks = tasks.filter((task) => task.phaseKey === phase.key);
                  const phaseCompleted = allPhaseTasks.filter((task) => task.status === 'done').length;
                  const pct = allPhaseTasks.length ? Math.round((phaseCompleted / allPhaseTasks.length) * 100) : 0;
                  const isCurrent = phase.key === currentPhaseKey;
                  return (
                    <div key={phase.key} className={`phase-group ${isOpen ? 'is-open' : ''} ${isCurrent ? 'is-current' : ''}`}>
                      <button type="button" className="phase-group-header" onClick={() => togglePhase(phase.key)} aria-expanded={isOpen}>
                        <span className="phase-group-title">
                          {phase.label}
                          {isCurrent && <span className="badge plain tone-brand">{t('المرحلة الحالية')}</span>}
                        </span>
                        <span className="phase-group-progress">
                          <span className="phase-group-bar">
                            <span style={{ width: `${pct}%` }} />
                          </span>
                          <span className="phase-group-count tnum">
                            {phaseCompleted}/{allPhaseTasks.length}
                          </span>
                        </span>
                        <span className="phase-group-chevron">
                          <ChevronDownIcon size={18} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="phase-group-tasks">
                          {phaseTasks.map((task) => (
                            <TaskRow key={task.id} task={task} employees={employees} onTransition={handleTransition} onUpdate={reloadTasks} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <aside className="lifecycle-sidebar">
              <ProgressSummary tasks={tasks} totals={taskTotals} />
              <SpecialtyPanel title={t('مهام الميديا')} specialty="media" tasks={tasks} employees={employees} onTransition={handleTransition} onUpdate={reloadTasks} />
              <SpecialtyPanel title={t('مهام اللوجستيات')} specialty="logistics" tasks={tasks} employees={employees} onTransition={handleTransition} onUpdate={reloadTasks} />
            </aside>
          </div>
        </>
      )}

      {activeTab === 'students' && !canReadStudents && (
        <div className="card">
          <div className="card-header-row">
            <h3 className="card-title">
              {t('الطلاب المسجلون')} <span className="tab-count">{enrolledCount}</span>
            </h3>
            {attendanceRoster.length > 0 && (
              <span className="muted-text">{t('الأسماء فقط — بيانات الطلاب الكاملة تحتاج صلاحية أوسع.')}</span>
            )}
          </div>
          {attendanceRoster.length === 0 ? (
            // An empty roster means one of two very different things, so never say "none yet"
            // to someone who simply is not allowed to see the names.
            enrolledCount > 0 ? (
              <EmptyState
                icon={<LockIcon />}
                title={t('قائمة الطلاب غير متاحة لصلاحيتك')}
                hint={t('الدورة تضم {count} طالباً، لكن عرض الأسماء يحتاج صلاحية أوسع.', { count: enrolledCount })}
              />
            ) : (
              <p className="empty-state">{t('لا يوجد طلاب مسجلون بعد')}</p>
            )
          ) : (
            <ul className="roster-list">
              {attendanceRoster.map((student) => (
                <li key={student.id} className="roster-row">
                  <span className="avatar avatar-sm">{initials(student.fullName)}</span>
                  <span>{student.fullName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'students' && canReadStudents && (
        <div className="card card-flush">
          <div className="tab-toolbar">
            <h3 className="card-title">
              {t('الطلاب المسجلون')} <span className="tab-count">{courseStudents.length}</span>
            </h3>
            {canMutateCourse && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(setShowEnroll)}>
                <PlusIcon />
                {t('تسجيل طالب')}
              </button>
            )}
          </div>
          {courseStudents.length === 0 ? (
            <div className="tab-empty">
              <EmptyState
                icon={<UsersIcon />}
                title={t('لا يوجد طلاب مسجلون بعد')}
                hint={t('سجّل طالباً موجوداً أو حوّل عميلاً محتملاً إلى طالب.')}
                action={
                  canMutateCourse && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(setShowEnroll)}>
                      {t('تسجيل طالب')}
                    </button>
                  )
                }
              />
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('الطالب')}</th>
                    <th>{t('الهاتف')}</th>
                    <th>{t('حالة التسجيل')}</th>
                    <th>{t('الدفع')}</th>
                    <th>{t('المدفوع / الإجمالي')}</th>
                  </tr>
                </thead>
                <tbody>
                  {courseStudents.map((s) => {
                    const enr = s.enrollments.find((e) => e.course?.id === id);
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={`/students/${s.id}`} className="cell-person">
                            <span className="avatar avatar-sm">{initials(s.fullName)}</span>
                            <span className="cell-name">{s.fullName}</span>
                          </Link>
                        </td>
                        <td className="cell-phone">{s.phone || '—'}</td>
                        <td>
                          <StatusBadge kind="enrollment" value={enr?.enrollmentStatus} />
                        </td>
                        <td>
                          <StatusBadge kind="payment" value={enr?.paymentStatus} />
                        </td>
                        <td className="tnum">
                          {formatMinor(enr?.amountPaidMinor)} / {formatMinor(enr?.totalPriceMinor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="sessions-tab">
          <div className="card sessions-card">
            <div className="card-header-row">
              <h3 className="card-title">
                {t('الجلسات')} <span className="tab-count">{sessionsDone}/{course.sessions?.length || course.sessionCount}</span>
              </h3>
            </div>
            {canEditSessions && (
              <p className="hint sessions-hint">{t('اختر جلسة لتسجيل الحضور. يمكن تعديل التاريخ والوقت والمدة في أي وقت.')}</p>
            )}
            <ul className="sessions-list">
              {(course.sessions || []).map((session) => {
                const isCompleted = session.status === 'completed';
                const draft = getSessionDraft(session);
                const dirty = isSessionDirty(session);
                const isSelected = selectedSessionId === session.id;
                return (
                  <li key={session.id} className={`session-row ${isSelected ? 'is-selected' : ''} ${isCompleted ? 'is-done' : ''}`}>
                    <button
                      type="button"
                      className="session-select"
                      onClick={() => initAttendanceDraft(session.id)}
                      aria-pressed={isSelected}
                    >
                      <span className={`session-number ${isCompleted ? 'done' : ''}`}>{isCompleted ? <CheckIcon size={14} /> : session.sessionNumber}</span>
                      <span className="session-text">
                        <span className="session-title">{t('الجلسة {n}', { n: session.sessionNumber })}</span>
                        <span className="session-sub">
                          <StatusBadge kind="session" value={session.status} plain />
                          {!canEditSessions && session.scheduledAt && <span className="tnum">{formatDateTime(session.scheduledAt)}</span>}
                        </span>
                      </span>
                    </button>
                    {canEditSessions && (
                      <div className="session-fields">
                        <label className="session-field">
                          <span>{t('التاريخ والوقت')}</span>
                          <input
                            type="datetime-local"
                            className="input ltr"
                            value={draft.scheduledLocal || ''}
                            disabled={saving}
                            onChange={(e) =>
                              setSessionEdits((prev) => ({
                                ...prev,
                                [session.id]: { ...getSessionDraft(session), scheduledLocal: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="session-field session-field-duration">
                          <span>{t('المدة (ساعة)')}</span>
                          <input
                            type="number"
                            min={0.25}
                            step={0.25}
                            className="input ltr"
                            value={draft.durationHours}
                            disabled={saving}
                            onChange={(e) =>
                              setSessionEdits((prev) => ({
                                ...prev,
                                [session.id]: { ...getSessionDraft(session), durationHours: e.target.value },
                              }))
                            }
                          />
                        </label>
                        {dirty && (
                          <button type="button" className="btn btn-sm btn-primary session-save" disabled={saving} onClick={() => handleSaveSession(session)}>
                            {t('حفظ')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {selectedSession && canRecordAttendance && (
            <div className="card attendance-card">
              <div className="card-header-row">
                <h3 className="card-title">{t('حضور الجلسة {n}', { n: selectedSession.sessionNumber })}</h3>
                {selectedSession.scheduledAt && <span className="muted-text tnum">{formatDateTime(selectedSession.scheduledAt)}</span>}
              </div>
              {attendanceRoster.length === 0 ? (
                canReadStudents ? (
                  <EmptyState icon={<UsersIcon />} title={t('لا يوجد طلاب مسجلون')} hint={t('سجّل الطلاب أولاً لتسجيل الحضور.')} />
                ) : (
                  <EmptyState
                    icon={<LockIcon />}
                    title={t('قائمة الطلاب غير متاحة لصلاحيتك')}
                    hint={t('تسجيل الحضور يحتاج صلاحية الاطلاع على الطلاب — اطلبها من مدير النظام.')}
                  />
                )
              ) : (
                <>
                  <div className="attendance-summary">
                    <span className="badge tone-success">
                      {t('{count} حاضر', { count: Object.values(attendanceDraft).filter((v) => v === 'present').length })}
                    </span>
                    <span className="badge tone-danger">
                      {t('{count} غائب', { count: Object.values(attendanceDraft).filter((v) => v === 'absent').length })}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAttendanceDraft(Object.fromEntries(attendanceRoster.map((s) => [s.id, 'present'])))}
                    >
                      {t('تحديد الكل حاضر')}
                    </button>
                  </div>
                  <ul className="attendance-list">
                    {attendanceRoster.map((s) => (
                      <li key={s.id} className="attendance-row">
                        <span className="cell-person">
                          <span className="avatar avatar-sm">{initials(s.fullName)}</span>
                          <span>{s.fullName}</span>
                        </span>
                        <div className="attendance-toggles" role="radiogroup" aria-label={t('حضور {name}', { name: s.fullName })}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={attendanceDraft[s.id] === 'present'}
                            className={`attendance-toggle present ${attendanceDraft[s.id] === 'present' ? 'is-active' : ''}`}
                            onClick={() => setAttendanceDraft((prev) => ({ ...prev, [s.id]: 'present' }))}
                          >
                            {t('حاضر')}
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={attendanceDraft[s.id] === 'absent'}
                            className={`attendance-toggle absent ${attendanceDraft[s.id] === 'absent' ? 'is-active' : ''}`}
                            onClick={() => setAttendanceDraft((prev) => ({ ...prev, [s.id]: 'absent' }))}
                          >
                            {t('غائب')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {error && <p className="form-error">{td(error)}</p>}
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveAttendance}>
                    <CheckIcon />
                    {t('حفظ الحضور')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'evaluations' && (
        <div className="evaluations-tab">
          {!canViewEvaluations ? (
            <EmptyState icon={<StarIcon />} title={t('ليس لديك صلاحية عرض التقييمات')} />
          ) : (
            <>
              <div className="tab-toolbar tab-toolbar-plain">
                <p className="hint">{t('تُنشأ روابط التقييم تلقائياً عند تسجيل حضور آخر جلسة، أو يمكنك إنشاء الحملة يدوياً.')}</p>
                {canManageEvaluations && !evalCampaigns.some((c) => c.type === 'post_course') && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreateEvalCampaign}>
                    <PlusIcon />
                    {t('إنشاء حملة تقييم')}
                  </button>
                )}
              </div>
              {evalsError && <p className="form-error">{td(evalsError)}</p>}
              {evalsLoading ? (
                <PageLoading tiles={0} rows={3} title={false} />
              ) : evalCampaigns.length === 0 ? (
                <EmptyState icon={<StarIcon />} title={t('لا توجد تقييمات بعد')} hint={t('تظهر التقييمات هنا بعد إنشاء حملة وإرسال الروابط للطلاب.')} />
              ) : (
                evalCampaigns.map((campaign) => (
                  <div key={campaign.id} className="card card-flush eval-campaign-card">
                    <div className="eval-campaign-header">
                      <div>
                        <h3 className="card-title">
                          {campaign.type === 'post_course' ? t('تقييم نهاية الدورة') : t('تقييم جلسة')}
                          {campaign.session?.sessionNumber ? ` · ${t('الجلسة {n}', { n: campaign.session.sessionNumber })}` : ''}
                        </h3>
                        <div className="eval-averages">
                          <span className="eval-avg">
                            <span className="eval-avg-label">{t('الاستجابات')}</span>
                            <strong className="tnum">
                              {campaign.responseCount}/{campaign.tokenCount}
                            </strong>
                          </span>
                          <span className="eval-avg">
                            <span className="eval-avg-label">{t('محاور')}</span>
                            <strong className="tnum">{avgLabel(campaign.averages?.courseScore)}</strong>
                          </span>
                          <span className="eval-avg">
                            <span className="eval-avg-label">{t('مدرّب')}</span>
                            <strong className="tnum">{avgLabel(campaign.averages?.teacherScore)}</strong>
                          </span>
                          <span className="eval-avg">
                            <span className="eval-avg-label">{t('قاعة')}</span>
                            <strong className="tnum">{avgLabel(campaign.averages?.hallScore)}</strong>
                          </span>
                          <span className="eval-avg">
                            <span className="eval-avg-label">{t('إفادة')}</span>
                            <strong className="tnum">{avgLabel(campaign.averages?.benefitLevel)}</strong>
                          </span>
                        </div>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopyAllEvalLinks(campaign)}>
                        <CopyIcon />
                        {t('نسخ كل الروابط')}
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('الطالب')}</th>
                            <th>{t('الحالة')}</th>
                            <th>{t('محاور')}</th>
                            <th>{t('مدرّب')}</th>
                            <th>{t('قاعة')}</th>
                            <th>{t('إفادة')}</th>
                            <th>{t('ترشيح دورات')}</th>
                            <th>{t('ملاحظات')}</th>
                            <th>{t('الرابط')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(campaign.students || []).map((row) => (
                            <tr key={row.tokenId || row.studentId}>
                              <td className="cell-name">{row.studentName}</td>
                              <td>
                                <StatusBadge kind="evalRow" value={row.status} />
                              </td>
                              <td className="tnum">{row.evaluation?.courseScore ?? '—'}</td>
                              <td className="tnum">{row.evaluation?.teacherScore ?? '—'}</td>
                              <td className="tnum">{row.evaluation?.hallScore ?? '—'}</td>
                              <td>
                                {row.evaluation
                                  ? `${row.evaluation.benefitLevel}${row.evaluation.benefitReason ? ` · ${row.evaluation.benefitReason}` : ''}`
                                  : '—'}
                              </td>
                              <td className="cell-muted">{row.evaluation?.recommendedCourses || '—'}</td>
                              <td className="cell-muted">{row.evaluation?.comment || '—'}</td>
                              <td>
                                {row.link ? (
                                  <button type="button" className="btn btn-soft btn-sm" onClick={() => copyText(row.link, t('تم نسخ الرابط'))}>
                                    <CopyIcon />
                                    {t('نسخ')}
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'finance' && (
        <>
          <div className="tab-toolbar tab-toolbar-plain">
            <p className="hint">{t('الأرقام محسوبة من تسجيلات الطلاب في هذه الدورة.')}</p>
            {canRecordPayment && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(setShowPayment)}>
                <CoinsIcon />
                {t('تسجيل دفعة')}
              </button>
            )}
          </div>
          <div className="finance-tab-grid">
            <StatCardInline label={t('إجمالي الإيرادات المتوقعة')} value={formatMinor(financeStats.revenue)} icon={<CoinsIcon size={18} />} />
            <StatCardInline label={t('المحصّل')} value={formatMinor(financeStats.collected)} icon={<CheckCircleIcon size={18} />} tone="success" />
            <StatCardInline
              label={t('المتبقي')}
              value={formatMinor(financeStats.revenue - financeStats.collected)}
              icon={<ClockIcon size={18} />}
              tone={financeStats.revenue - financeStats.collected > 0 ? 'warning' : ''}
            />
          </div>
          <div className="finance-collect-bar card">
            <div className="finance-collect-head">
              <span>{t('نسبة التحصيل')}</span>
              <strong className="tnum">
                {financeStats.revenue ? Math.round((financeStats.collected / financeStats.revenue) * 100) : 0}%
              </strong>
            </div>
            <span className="finance-collect-track">
              <span
                style={{
                  width: `${financeStats.revenue ? Math.min(100, Math.round((financeStats.collected / financeStats.revenue) * 100)) : 0}%`,
                }}
              />
            </span>
          </div>
        </>
      )}

      {activeTab === 'files' && (
        <div className="course-files-tab">
          <div className="tab-toolbar tab-toolbar-plain">
            <div className="filter-chips course-files-filters">
              {FILE_CATEGORIES.map((cat) => {
                const count = cat.value === 'all' ? courseFiles.length : courseFiles.filter((f) => f.purpose === cat.value).length;
                return (
                  <button key={cat.value} type="button" className={`chip ${fileCategory === cat.value ? 'active' : ''}`} onClick={() => setFileCategory(cat.value)}>
                    {t(cat.label)}
                    <span className="chip-count tnum">{count}</span>
                  </button>
                );
              })}
            </div>
            {canManageFiles && (
              <div className="course-files-upload">
                <select className="select" value={uploadPurpose} onChange={(e) => setUploadPurpose(e.target.value)} disabled={uploadingFile} aria-label={t('تصنيف الملف')}>
                  {FILE_CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.label)}
                    </option>
                  ))}
                </select>
                <label className={`btn btn-primary ${uploadingFile ? 'is-disabled' : ''}`}>
                  {uploadingFile ? <span className="spinner spinner-on-primary" /> : <UploadIcon />}
                  {uploadingFile ? t('جاري الرفع…') : t('رفع ملف')}
                  <input type="file" hidden disabled={uploadingFile} onChange={handleUploadCourseFile} />
                </label>
              </div>
            )}
          </div>

          {filesError && (
            <p className="form-error">
              <AlertIcon size={16} />
              {td(filesError)}
            </p>
          )}

          {filesLoading ? (
            <PageLoading tiles={3} rows={0} title={false} />
          ) : filteredCourseFiles.length === 0 ? (
            <EmptyState
              icon={<FileIcon />}
              title={t('لا ملفات بعد')}
              hint={canManageFiles ? t('ارفع أول ملف لهذه الدورة: مواد تعليمية، صور، فيديو أو جداول.') : t('لم يُرفع أي ملف لهذه الدورة بعد.')}
            />
          ) : (
            <div className="course-files-grid">
              {filteredCourseFiles.map((file) => {
                const isImage = file.mime?.startsWith('image/');
                return (
                  <article key={file.id} className="course-file-card card">
                    <div className="course-file-card-top">
                      <span className={`course-file-kind ${isImage ? 'is-image' : ''}`}>
                        {isImage ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                        {t(fileKind(file.mime))}
                      </span>
                      <span className="badge plain tone-neutral">{t(FILE_CATEGORY_LABELS[file.purpose]) || file.purpose}</span>
                    </div>
                    <h4 className="course-file-name" title={file.originalName || file.storageKey}>
                      {file.originalName || t('ملف بدون اسم')}
                    </h4>
                    <p className="course-file-meta">
                      <span className="tnum">{formatFileSize(file.size)}</span>
                      {file.uploadedBy?.fullName ? ` · ${file.uploadedBy.fullName}` : ''}
                      {file.createdAt ? ` · ${formatDate(file.createdAt)}` : ''}
                    </p>
                    <div className="course-file-actions">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={fileBusyId === file.id} onClick={() => handleOpenCourseFile(file.id)}>
                        <ExternalIcon />
                        {t('فتح')}
                      </button>
                      {canManageFiles && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger-text"
                          disabled={fileBusyId === file.id}
                          onClick={() => handleDeleteCourseFile(file)}
                          aria-label={t('حذف الملف')}
                        >
                          <TrashIcon />
                          {t('حذف')}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------- Modals ---------- */}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={t('تعديل الدورة')} size="lg">
        <form onSubmit={handleEdit}>
          {error && <p className="form-error">{td(error)}</p>}
          <div className="form-group">
            <label htmlFor="edit-name">{t('اسم الدورة')}</label>
            <input id="edit-name" required value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-capacity">{t('السعة')}</label>
              <input id="edit-capacity" type="number" min={1} value={editForm.capacity ?? ''} onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="edit-hours">{t('ساعات الدورة التقريبية')}</label>
              <input
                id="edit-hours"
                type="number"
                min={0.5}
                step="0.5"
                value={editForm.totalHours ?? 0}
                onChange={(e) => setEditForm({ ...editForm, totalHours: e.target.value })}
              />
              <span className="form-hint">
                {t('مدة كل جلسة ≈ {hours} ساعة', {
                  hours: course.sessionCount ? Math.round(((Number(editForm.totalHours) || 0) / course.sessionCount) * 10) / 10 : '—',
                })}
              </span>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="edit-hall">{t('ملاحظات القاعة')}</label>
            <textarea id="edit-hall" value={editForm.hallNotes || ''} onChange={(e) => setEditForm({ ...editForm, hallNotes: e.target.value })} />
          </div>
          {instructorLocked && (
            <div className="callout">
              <InfoIcon />
              <span>{t('المدرّب وأجره مقفولان بعد بدء الدورة. يمكن تعديلهما فقط قبل البداية.')}</span>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="edit-instructor">{t('المدرّب الرئيسي')}</label>
            <select
              id="edit-instructor"
              value={editForm.primaryInstructorId || ''}
              disabled={instructorLocked}
              onChange={(e) => setEditForm({ ...editForm, primaryInstructorId: e.target.value })}
            >
              <option value="">{t('— بدون مدرّب —')}</option>
              {instructors.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}
                </option>
              ))}
            </select>
          </div>
          {payVisible && editForm.primaryInstructorId && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="edit-paymode">{t('طريقة أجر المدرّب')}</label>
                <select
                  id="edit-paymode"
                  value={editForm.teacherPayMode || 'percent'}
                  disabled={instructorLocked}
                  onChange={(e) => setEditForm({ ...editForm, teacherPayMode: e.target.value })}
                >
                  <option value="percent">{t('نسبة من سعر الدورة')}</option>
                  <option value="hourly">{t('أجر بالساعة')}</option>
                </select>
              </div>
              {editForm.teacherPayMode === 'hourly' ? (
                <div className="form-group">
                  <label htmlFor="edit-hourly">{t('أجر الساعة ({currency})', { currency })}</label>
                  <input
                    id="edit-hourly"
                    type="text"
                    inputMode="numeric"
                    className="ltr"
                    disabled={instructorLocked}
                    value={editForm.hourlyRateMinor || ''}
                    onChange={(e) => setEditForm({ ...editForm, hourlyRateMinor: formatAmountInput(e.target.value) })}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="edit-percent">{t('النسبة %')}</label>
                  <input
                    id="edit-percent"
                    type="number"
                    min={1}
                    max={100}
                    disabled={instructorLocked}
                    value={editForm.payPercent || ''}
                    onChange={(e) => setEditForm({ ...editForm, payPercent: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ التعديلات')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowEdit(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showAttach}
        onClose={() => setShowAttach(false)}
        title={attachedLink ? t('تغيير قالب المهام') : t('ربط قالب مهام')}
        description={
          attachedLink
            ? t('القالب الحالي: {name}. اختيار قالب جديد يُنهي المهام غير المكتملة ويبقي المكتملة في السجل.', { name: attachedLink.template?.name ?? '' })
            : t('كل بند في القالب يصبح مهمة مجدولة في دورة حياة الدورة.')
        }
      >
        {error && <p className="form-error">{td(error)}</p>}
        {templates.length === 0 ? (
          <EmptyState
            icon={<LayersIcon />}
            title={t('لا توجد قوالب بعد')}
            hint={t('أنشئ قالب مهام من الإعدادات أولاً.')}
            action={
              <Link to="/settings" className="btn btn-secondary btn-sm">
                {t('فتح الإعدادات')}
              </Link>
            }
          />
        ) : (
          <ul className="template-list">
            {templates.map((tpl) => {
              const isCurrent = tpl.id === attachedLink?.templateId;
              return (
                <li key={tpl.id}>
                  <button type="button" className={`template-option ${isCurrent ? 'is-current' : ''}`} disabled={saving || isCurrent} onClick={() => handleAttachTemplate(tpl.id)}>
                    <span className="template-option-icon">
                      <LayersIcon size={18} />
                    </span>
                    <span className="template-option-text">
                      <strong>{tpl.name}</strong>
                      <span>
                        {t('{count} مهمة', { count: tpl.items?.length || 0 })}
                        {tpl.description ? ` · ${tpl.description}` : ''}
                      </span>
                    </span>
                    {isCurrent && <span className="badge plain tone-brand">{t('الحالي')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal
        open={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        title={t('أرشفة الدورة')}
        description={t('الأرشفة نهائية وتُخفي الدورة من القوائم النشطة.')}
        size="sm"
      >
        {error && <p className="form-error">{td(error)}</p>}
        <div className="form-group">
          <label htmlFor="archive-reason">{t('سبب الأرشفة')}</label>
          <textarea id="archive-reason" rows={3} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder={t('اذكر سبب الأرشفة…')} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-danger" disabled={saving} onClick={handleConfirmArchive}>
            {t('تأكيد الأرشفة')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowArchiveModal(false)}>
            {t('إلغاء')}
          </button>
        </div>
      </Modal>

      <Modal open={showEnroll} onClose={() => setShowEnroll(false)} title={t('تسجيل طالب في الدورة')}>
        {error && <p className="form-error">{td(error)}</p>}
        <div className="enroll-tabs">
          <button type="button" className={`chip ${enrollTab === 'students' ? 'active' : ''}`} onClick={() => setEnrollTab('students')}>
            {t('طلاب حاليون')}
          </button>
          <button type="button" className={`chip ${enrollTab === 'leads' ? 'active' : ''}`} onClick={() => setEnrollTab('leads')}>
            {t('عملاء محتملون')}
          </button>
        </div>
        <input
          className="input enroll-search"
          placeholder={t('بحث بالاسم أو الهاتف…')}
          value={enrollSearch}
          onChange={(e) => setEnrollSearch(e.target.value)}
          aria-label={t('بحث')}
        />
        {enrollTab === 'leads' && <p className="hint">{t('يُعرض جميع العملاء المحتملين بغض النظر عن حالتهم. سيُنشأ ملف طالب تلقائياً إن لم يكن موجوداً.')}</p>}
        <ul className="enroll-results">
          {enrollCandidates.length === 0 ? (
            <li className="enroll-empty">{t('لا توجد نتائج')}</li>
          ) : enrollTab === 'students' ? (
            enrollCandidates.map((s) => (
              <li key={s.id}>
                <button type="button" className="enroll-result" disabled={saving} onClick={() => handleEnrollStudent(s.id)}>
                  <span className="avatar avatar-sm">{initials(s.fullName)}</span>
                  <span className="enroll-result-text">
                    <strong>{s.fullName}</strong>
                    <span className="ltr">{s.phone}</span>
                  </span>
                  <PlusIcon size={16} />
                </button>
              </li>
            ))
          ) : (
            enrollCandidates.map((l) => (
              <li key={l.id}>
                <button type="button" className="enroll-result" disabled={saving} onClick={() => handleEnrollLead(l)}>
                  <span className="avatar avatar-sm">{initials(l.fullName)}</span>
                  <span className="enroll-result-text">
                    <strong>{l.fullName}</strong>
                    <span className="ltr">{l.phone}</span>
                  </span>
                  <StatusBadge kind="lead" value={l.status} plain />
                </button>
              </li>
            ))
          )}
        </ul>
      </Modal>

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title={t('تسجيل دفعة')} size="sm">
        <form onSubmit={handleRecordPayment}>
          {error && <p className="form-error">{td(error)}</p>}
          <div className="form-group">
            <label htmlFor="pay-student">{t('الطالب')}</label>
            <select id="pay-student" required value={paymentForm.enrollmentId} onChange={(e) => setPaymentForm({ ...paymentForm, enrollmentId: e.target.value })}>
              <option value="">{t('— اختر —')}</option>
              {courseStudents.map((s) => {
                const enr = s.enrollments.find((e) => e.course?.id === id);
                if (!enr) return null;
                return (
                  <option key={enr.id} value={enr.id}>
                    {t('{name} — متبقي {amount}', { name: s.fullName, amount: formatMinor(Number(enr.totalPriceMinor ?? 0) - Number(enr.amountPaidMinor ?? 0)) })}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pay-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="pay-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={paymentForm.amountMinor}
              onChange={(e) => setPaymentForm({ ...paymentForm, amountMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="pay-note">{t('ملاحظة')}</label>
            <input id="pay-note" value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ الدفعة')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowPayment(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
