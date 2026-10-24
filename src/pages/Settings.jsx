import { useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { useDialog } from '../components/DialogProvider';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { employeesApi, settingsApi } from '../api/client';
import {
  SPECIALTY_LABELS as SPECIALTY_META,
  formatAmountInput,
  formatDateTime,
  formatMinor,
  getCurrencyLabel,
  initials,
  parseMinorInput,
} from '../utils/formatters';
import { PRIVILEGE_LABELS } from '../utils/statusMaps';
import SiteChatSettings from './settings/SiteChatSettings';
import {
  COURSE_LIFECYCLE_STAGES,
  defaultOffsetForStage,
  formatStageTiming,
  lifecycleStageLabel,
  stageTimingHint,
} from '../utils/courseLifecycle';
import {
  AlertIcon,
  BotIcon,
  ChatIcon,
  CoinsIcon,
  CopyIcon,
  DragIcon,
  EditIcon,
  HistoryIcon,
  LayersIcon,
  ListIcon,
  LockIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshIcon,
  ShieldIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from '../components/icons';
import PrintDesigner from '../print/PrintDesigner';
import './Settings.css';

// Specialty and privilege labels translate when read, so they are looked up at render time.
const SPECIALTY_VALUES = Object.keys(SPECIALTY_META);

const ACTOR_TYPE_LABELS = {
  employee: 'موظف',
  system: 'النظام',
  bot_webhook: 'بوت التأهيل',
};

function formatAuditJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function specialtyLabel(value) {
  return SPECIALTY_META[value]?.label || value;
}

function specialtyClass(value) {
  return SPECIALTY_META[value]?.className || '';
}

function formatOffset(item) {
  return formatStageTiming(item);
}

function applyStageDefaults(item, phaseKey) {
  const timing = defaultOffsetForStage(phaseKey);
  return { ...item, phaseKey, ...timing };
}

function StageTimingFields({ item, onChange, idPrefix }) {
  const { t } = useI18n();
  const hint = stageTimingHint(item.phaseKey);
  const id = `${idPrefix}-timing`;
  if (item.phaseKey === 'before_start') {
    return (
      <div className="form-group">
        <label htmlFor={id}>{t('أيام قبل البداية')}</label>
        <input
          id={id}
          type="number"
          min={1}
          value={item.offsetValue}
          onChange={(e) => onChange({ ...item, offsetValue: Number(e.target.value) || 1 })}
        />
        <span className="form-hint">{hint}</span>
      </div>
    );
  }
  if (item.phaseKey === 'during') {
    return (
      <div className="form-group">
        <label htmlFor={id}>{t('رقم الجلسة')}</label>
        <input
          id={id}
          type="number"
          min={1}
          step={1}
          value={item.offsetValue > 0 ? item.offsetValue : 1}
          onChange={(e) =>
            onChange({
              ...item,
              offsetType: 'session_number',
              offsetValue: Math.max(1, Math.floor(Number(e.target.value) || 1)),
            })
          }
        />
        <span className="form-hint">{hint}</span>
      </div>
    );
  }
  if (item.phaseKey === 'after_end') {
    return (
      <div className="form-group">
        <label htmlFor={id}>{t('أيام بعد آخر جلسة')}</label>
        <input
          id={id}
          type="number"
          min={1}
          value={item.offsetValue}
          onChange={(e) => onChange({ ...item, offsetValue: Number(e.target.value) || 1 })}
        />
        <span className="form-hint">{hint}</span>
      </div>
    );
  }
  return (
    <div className="form-group">
      <span className="form-label">{t('التوقيت')}</span>
      <div className="tpl-timing-readonly">{hint}</div>
    </div>
  );
}

function TemplateItemFields({ item, onChange, idPrefix }) {
  const { t } = useI18n();
  return (
    <>
      <div className="tpl-field-grid">
        <div className="form-group">
          <label htmlFor={`${idPrefix}-title`}>{t('عنوان المهمة')}</label>
          <input
            id={`${idPrefix}-title`}
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${idPrefix}-phase`}>{t('المرحلة')}</label>
          <select
            id={`${idPrefix}-phase`}
            value={item.phaseKey}
            onChange={(e) => onChange(applyStageDefaults(item, e.target.value))}
            required
          >
            {COURSE_LIFECYCLE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`${idPrefix}-specialty`}>{t('التخصص المسؤول')}</label>
          <select
            id={`${idPrefix}-specialty`}
            value={item.specialty}
            onChange={(e) => onChange({ ...item, specialty: e.target.value })}
          >
            {SPECIALTY_VALUES.map((value) => (
              <option key={value} value={value}>{specialtyLabel(value)}</option>
            ))}
          </select>
        </div>
        <StageTimingFields item={item} onChange={onChange} idPrefix={idPrefix} />
      </div>
      <div className="form-group">
        <label htmlFor={`${idPrefix}-desc`}>{t('الوصف')}</label>
        <textarea
          id={`${idPrefix}-desc`}
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          rows={4}
          placeholder={t('تفاصيل تساعد المسؤول على تنفيذ المهمة (اختياري)')}
        />
      </div>
    </>
  );
}

const EMPTY_ITEM = {
  title: '',
  phaseKey: 'before_start',
  specialty: 'sales',
  offsetType: 'days_from_start',
  offsetValue: 1,
  description: '',
};

const SECTIONS = [
  { id: 'employees', label: 'الموظفون والصلاحيات', icon: UsersIcon },
  { id: 'tracks', label: 'مسارات التدريب', icon: LayersIcon },
  { id: 'taskTemplates', label: 'قوالب مسار المهام', icon: ListIcon },
  { id: 'expenseCategories', label: 'فئات المصروفات', icon: TagIcon },
  { id: 'crm', label: 'مصادر العملاء', icon: TagIcon },
  { id: 'webhook', label: 'بوت التأهيل', icon: BotIcon },
  { id: 'siteChat', label: 'محادثات الموقع', icon: ChatIcon },
  { id: 'currency', label: 'العملة', icon: CoinsIcon },
  { id: 'printing', label: 'الإيصالات والطباعة', icon: ReceiptIcon },
  { id: 'audit', label: 'سجل النشاط', icon: HistoryIcon },
];

export default function Settings() {
  const { hasPrivilege, user, loadSettings } = useApp();
  const { t, tr, td } = useI18n();
  const { confirm, alert } = useDialog();
  const toast = useToast();
  const isAdmin = hasPrivilege('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSection = searchParams.get('section');
  const sectionIds = SECTIONS.map((s) => s.id);
  const [section, setSection] = useState(sectionIds.includes(urlSection) ? urlSection : 'employees');
  const [employees, setEmployees] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [tplEditorExpanded, setTplEditorExpanded] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [showAddTemplateItem, setShowAddTemplateItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [reorderingItems, setReorderingItems] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [leadSources, setLeadSources] = useState([]);
  const [webhook, setWebhook] = useState(null);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [newTrack, setNewTrack] = useState({ nameAr: '' });
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [editingTrackName, setEditingTrackName] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState({ code: '', labelAr: '' });
  const [showAddExpenseCategory, setShowAddExpenseCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState('');
  const [newLeadSource, setNewLeadSource] = useState({ code: '', labelAr: '' });
  const [showAddLeadSource, setShowAddLeadSource] = useState(false);
  const [editingLeadSourceId, setEditingLeadSourceId] = useState(null);
  const [editingLeadSourceLabel, setEditingLeadSourceLabel] = useState('');
  const SALARY_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
  const privilegeOptions = Object.entries(PRIVILEGE_LABELS).map(([code, label]) => ({ code, label }));

  const [newEmployee, setNewEmployee] = useState({
    email: '',
    password: '',
    fullName: '',
    privilegeCodes: ['sales'],
    isSalaried: true,
    monthlySalaryMinor: '',
    salaryDayOfMonth: 1,
  });
  const [salaryEmployee, setSalaryEmployee] = useState(null);
  const [salaryForm, setSalaryForm] = useState({
    isSalaried: true,
    monthlySalaryMinor: '',
    salaryDayOfMonth: 1,
  });
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [privilegesEmployee, setPrivilegesEmployee] = useState(null);
  const [editPrivilegeCodes, setEditPrivilegeCodes] = useState([]);
  const [passwordEmployee, setPasswordEmployee] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [employeeActionError, setEmployeeActionError] = useState('');
  const [employeeActionSaving, setEmployeeActionSaving] = useState(false);
  const [rotatedToken, setRotatedToken] = useState('');
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState('');

  const visibleSections = SECTIONS.filter(
    (s) => !['webhook', 'siteChat', 'audit'].includes(s.id) || isAdmin
  );

  const loadTemplateDetail = async (id) => {
    if (!id) {
      setSelectedTemplate(null);
      return;
    }
    const detail = await settingsApi.taskTemplate(id).catch(() => null);
    setSelectedTemplate(detail);
  };

  const load = async (templateIdOverride) => {
    const activeTemplateId = templateIdOverride !== undefined ? templateIdOverride : selectedTemplateId;

    if (section === 'employees') {
      setEmployees(await employeesApi.list().catch(() => []));
      return;
    }
    if (section === 'tracks') {
      setTracks(await settingsApi.tracks().catch(() => []));
      return;
    }
    if (section === 'taskTemplates') {
      setTaskTemplates(await settingsApi.taskTemplates().catch(() => []));
      if (activeTemplateId) await loadTemplateDetail(activeTemplateId);
      return;
    }
    if (section === 'expenseCategories') {
      setExpenseCategories(await settingsApi.expenseCategories().catch(() => []));
      return;
    }
    if (section === 'crm') {
      setLeadSources(await settingsApi.leadSources().catch(() => []));
      return;
    }
    if (section === 'webhook') {
      const [wh, wl] = await Promise.all([
        settingsApi.webhook().catch(() => null),
        settingsApi.webhookLogs().catch(() => []),
      ]);
      setWebhook(wh);
      setWebhookLogs(wl);
      return;
    }
    if (section === 'currency') {
      setSettings(await settingsApi.get().catch(() => ({})));
      return;
    }
    if (section === 'audit') {
      setAuditLogs(await settingsApi.auditLogs({ limit: 30 }).catch(() => []));
    }
  };

  useEffect(() => { load(); }, [section]);

  // The open section lives in the address, so a section can be linked to and survives a refresh.
  useEffect(() => {
    if (sectionIds.includes(urlSection) && urlSection !== section) setSection(urlSection);
  }, [urlSection]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSection = (id) => {
    setSection(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'employees') next.delete('section');
    else next.set('section', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (section === 'taskTemplates' && selectedTemplateId) {
      loadTemplateDetail(selectedTemplateId);
    }
  }, [selectedTemplateId, section]);

  /* ---------------------------------------------------------------- */
  /* Employees                                                         */
  /* ---------------------------------------------------------------- */

  const openPrivilegesModal = (emp) => {
    setEmployeeActionError('');
    setPrivilegesEmployee(emp);
    setEditPrivilegeCodes(emp.privileges.map((p) => p.privilege.code));
  };

  const toggleEditPrivilege = (code) => {
    setEditPrivilegeCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSavePrivileges = async (e) => {
    e.preventDefault();
    if (!privilegesEmployee) return;
    setEmployeeActionSaving(true);
    setEmployeeActionError('');
    try {
      await employeesApi.setPrivileges(privilegesEmployee.id, editPrivilegeCodes);
      setPrivilegesEmployee(null);
      await load();
      toast.success(t('تم حفظ الصلاحيات'));
    } catch (err) {
      setEmployeeActionError(err.message || 'تعذر حفظ الصلاحيات');
    } finally {
      setEmployeeActionSaving(false);
    }
  };

  const openPasswordModal = (emp) => {
    setEmployeeActionError('');
    setNewPassword('');
    setPasswordEmployee(emp);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordEmployee || !newPassword.trim()) return;
    setEmployeeActionSaving(true);
    setEmployeeActionError('');
    try {
      await employeesApi.update(passwordEmployee.id, { password: newPassword });
      setPasswordEmployee(null);
      setNewPassword('');
      toast.success(t('تم تغيير كلمة المرور'));
    } catch (err) {
      setEmployeeActionError(err.message || 'تعذر تغيير كلمة المرور');
    } finally {
      setEmployeeActionSaving(false);
    }
  };

  const handleDeleteEmployee = async (emp) => {
    if (emp.id === user?.id) {
      await alert({ title: t('تعذّر الحذف'), message: t('لا يمكنك حذف حسابك الحالي') });
      return;
    }
    const confirmed = await confirm({
      title: t('حذف الموظف'),
      message: t('سيتم حذف الموظف "{name}" نهائياً مع صلاحياته. هل أنت متأكد؟', { name: emp.fullName }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await employeesApi.remove(emp.id);
      await load();
      toast.success(t('تم حذف الموظف'));
    } catch (err) {
      toast.error(err.message || t('تعذر حذف الموظف'));
    }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    const payload = {
      email: newEmployee.email,
      password: newEmployee.password,
      fullName: newEmployee.fullName,
      privilegeCodes: newEmployee.privilegeCodes,
      isSalaried: newEmployee.isSalaried,
      monthlySalaryMinor: newEmployee.isSalaried
        ? parseMinorInput(newEmployee.monthlySalaryMinor)
        : null,
      salaryDayOfMonth: newEmployee.isSalaried
        ? Number(newEmployee.salaryDayOfMonth) || 1
        : null,
    };
    try {
      await employeesApi.create(payload);
      setNewEmployee({
        email: '',
        password: '',
        fullName: '',
        privilegeCodes: ['sales'],
        isSalaried: true,
        monthlySalaryMinor: '',
        salaryDayOfMonth: 1,
      });
      setShowAddEmployee(false);
      load();
      toast.success(t('تمت إضافة الموظف'));
    } catch (err) {
      toast.error(err.message || t('تعذر إضافة الموظف'));
    }
  };

  const openSalaryModal = (emp) => {
    setSalaryEmployee(emp);
    setSalaryForm({
      isSalaried: emp.isSalaried !== false,
      monthlySalaryMinor: emp.monthlySalaryMinor != null
        ? formatAmountInput(String(emp.monthlySalaryMinor))
        : '',
      salaryDayOfMonth: emp.salaryDayOfMonth || 1,
    });
    setEmployeeActionError('');
  };

  const handleSaveSalary = async (e) => {
    e.preventDefault();
    if (!salaryEmployee) return;
    setEmployeeActionSaving(true);
    setEmployeeActionError('');
    try {
      await employeesApi.update(salaryEmployee.id, {
        isSalaried: salaryForm.isSalaried,
        monthlySalaryMinor: salaryForm.isSalaried
          ? parseMinorInput(salaryForm.monthlySalaryMinor)
          : null,
        salaryDayOfMonth: salaryForm.isSalaried
          ? Number(salaryForm.salaryDayOfMonth) || 1
          : null,
      });
      setSalaryEmployee(null);
      await load();
      toast.success(t('تم حفظ بيانات الراتب'));
    } catch (err) {
      setEmployeeActionError(err.message || 'تعذر حفظ بيانات الراتب');
    } finally {
      setEmployeeActionSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Tracks                                                            */
  /* ---------------------------------------------------------------- */

  const handleCreateTrack = async (e) => {
    e.preventDefault();
    if (!newTrack.nameAr.trim()) return;
    try {
      await settingsApi.createTrack({
        nameAr: newTrack.nameAr.trim(),
      });
      setNewTrack({ nameAr: '' });
      setShowAddTrack(false);
      load();
      toast.success(t('تمت إضافة المسار'));
    } catch (err) {
      toast.error(err.message || t('تعذر إضافة المسار'));
    }
  };

  const startEditTrack = (track) => {
    setEditingTrackId(track.id);
    setEditingTrackName(track.nameAr);
  };

  const handleSaveTrack = async (e) => {
    e.preventDefault();
    if (!editingTrackId || !editingTrackName.trim()) return;
    try {
      await settingsApi.updateTrack(editingTrackId, { nameAr: editingTrackName.trim() });
      setEditingTrackId(null);
      setEditingTrackName('');
      load();
      toast.success(t('تم حفظ المسار'));
    } catch (err) {
      toast.error(err.message || t('تعذر حفظ المسار'));
    }
  };

  const handleDeleteTrack = async (track) => {
    const confirmed = await confirm({
      title: t('حذف المسار'),
      message: t('سيتم حذف المسار "{name}". هل أنت متأكد؟', { name: track.nameAr }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await settingsApi.deleteTrack(track.id);
      if (editingTrackId === track.id) {
        setEditingTrackId(null);
        setEditingTrackName('');
      }
      await load();
      toast.success(t('تم حذف المسار'));
    } catch (err) {
      toast.error(err.message || t('تعذر حذف المسار'));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Expense categories                                                */
  /* ---------------------------------------------------------------- */

  const handleCreateExpenseCategory = async (e) => {
    e.preventDefault();
    if (!newExpenseCategory.code.trim() || !newExpenseCategory.labelAr.trim()) return;
    try {
      await settingsApi.createExpenseCategory({
        code: newExpenseCategory.code.trim(),
        labelAr: newExpenseCategory.labelAr.trim(),
      });
      setNewExpenseCategory({ code: '', labelAr: '' });
      setShowAddExpenseCategory(false);
      load();
      toast.success(t('تمت إضافة الفئة'));
    } catch (err) {
      toast.error(err.message || t('تعذر إضافة الفئة'));
    }
  };

  const startEditCategory = (cat) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryLabel(cat.labelAr);
  };

  const handleSaveExpenseCategory = async (e) => {
    e.preventDefault();
    if (!editingCategoryId || !editingCategoryLabel.trim()) return;
    try {
      await settingsApi.updateExpenseCategory(editingCategoryId, { labelAr: editingCategoryLabel.trim() });
      setEditingCategoryId(null);
      setEditingCategoryLabel('');
      load();
      toast.success(t('تم حفظ الفئة'));
    } catch (err) {
      toast.error(err.message || t('تعذر حفظ الفئة'));
    }
  };

  const toggleExpenseCategoryActive = async (cat) => {
    try {
      await settingsApi.updateExpenseCategory(cat.id, { isActive: !cat.isActive });
      load();
      toast.success(t(cat.isActive ? 'تم تعطيل الفئة' : 'تم تفعيل الفئة'));
    } catch (err) {
      toast.error(err.message || t('تعذر تحديث الفئة'));
    }
  };

  const handleDeleteExpenseCategory = async (cat) => {
    const confirmed = await confirm({
      title: t('حذف الفئة'),
      message: t('سيتم حذف الفئة "{name}". هل أنت متأكد؟', { name: td(cat.labelAr) }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await settingsApi.deleteExpenseCategory(cat.id);
      if (editingCategoryId === cat.id) {
        setEditingCategoryId(null);
        setEditingCategoryLabel('');
      }
      await load();
      toast.success(t('تم حذف الفئة'));
    } catch (err) {
      toast.error(err.message || t('تعذر حذف الفئة'));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Lead sources                                                      */
  /* ---------------------------------------------------------------- */

  const handleCreateLeadSource = async (e) => {
    e.preventDefault();
    if (!newLeadSource.code.trim() || !newLeadSource.labelAr.trim()) return;
    try {
      await settingsApi.createLeadSource({
        code: newLeadSource.code.trim(),
        labelAr: newLeadSource.labelAr.trim(),
      });
      setNewLeadSource({ code: '', labelAr: '' });
      setShowAddLeadSource(false);
      load();
      toast.success(t('تمت إضافة المصدر'));
    } catch (err) {
      toast.error(err.message || t('تعذر إضافة المصدر'));
    }
  };

  const startEditLeadSource = (src) => {
    setEditingLeadSourceId(src.id);
    setEditingLeadSourceLabel(src.labelAr);
  };

  const handleSaveLeadSource = async (e) => {
    e.preventDefault();
    if (!editingLeadSourceId || !editingLeadSourceLabel.trim()) return;
    try {
      await settingsApi.updateLeadSource(editingLeadSourceId, { labelAr: editingLeadSourceLabel.trim() });
      setEditingLeadSourceId(null);
      setEditingLeadSourceLabel('');
      load();
      toast.success(t('تم حفظ المصدر'));
    } catch (err) {
      toast.error(err.message || t('تعذر حفظ المصدر'));
    }
  };

  const toggleLeadSourceActive = async (src) => {
    try {
      await settingsApi.updateLeadSource(src.id, { isActive: !src.isActive });
      load();
      toast.success(t(src.isActive ? 'تم تعطيل المصدر' : 'تم تفعيل المصدر'));
    } catch (err) {
      toast.error(err.message || t('تعذر تحديث المصدر'));
    }
  };

  const handleDeleteLeadSource = async (src) => {
    if (src.code === 'bot') {
      await alert({ title: t('تعذّر الحذف'), message: t('لا يمكن حذف مصدر بوت التأهيل') });
      return;
    }
    const confirmed = await confirm({
      title: t('حذف المصدر'),
      message: t('سيتم حذف المصدر "{name}".\nسيتم حذف العملاء المرتبطين بهذا المصدر أيضاً.', { name: td(src.labelAr) }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await settingsApi.deleteLeadSource(src.id);
      if (editingLeadSourceId === src.id) {
        setEditingLeadSourceId(null);
        setEditingLeadSourceLabel('');
      }
      await load();
      toast.success(t('تم حذف المصدر'));
    } catch (err) {
      toast.error(err.message || t('تعذر حذف المصدر'));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Task path templates                                               */
  /* ---------------------------------------------------------------- */

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplate.name.trim()) return;
    try {
      const created = await settingsApi.createTaskTemplate({
        name: newTemplate.name.trim(),
        description: newTemplate.description.trim() || undefined,
      });
      setNewTemplate({ name: '', description: '' });
      setShowAddTemplate(false);
      setSelectedTemplateId(created.id);
      await load(created.id);
      toast.success(t('تم إنشاء القالب'));
    } catch (err) {
      toast.error(err.message || t('تعذر إنشاء القالب'));
    }
  };

  const handleAddTemplateItem = async (e) => {
    e.preventDefault();
    if (!selectedTemplateId || !newItem.title.trim() || !newItem.phaseKey.trim()) return;
    try {
      await settingsApi.addTaskTemplateItem(selectedTemplateId, {
        title: newItem.title.trim(),
        phaseKey: newItem.phaseKey.trim(),
        specialty: newItem.specialty,
        offsetType: newItem.offsetType,
        offsetValue: Number(newItem.offsetValue) || 0,
        notes: newItem.description.trim() || undefined,
      });
      setNewItem(EMPTY_ITEM);
      setShowAddTemplateItem(false);
      await load(selectedTemplateId);
      toast.success(t('تمت إضافة البند'));
    } catch (err) {
      toast.error(err.message || t('تعذر إضافة البند'));
    }
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditingItem({
      title: item.title,
      phaseKey: item.phaseKey,
      specialty: item.specialty,
      offsetType: item.offsetType,
      offsetValue: item.offsetValue,
      description: item.notes || '',
    });
  };

  const handleSaveTemplateItem = async (e) => {
    e.preventDefault();
    if (!editingItemId || !editingItem?.title?.trim() || !editingItem?.phaseKey?.trim()) return;
    try {
      await settingsApi.updateTaskTemplateItem(editingItemId, {
        title: editingItem.title.trim(),
        phaseKey: editingItem.phaseKey.trim(),
        specialty: editingItem.specialty,
        offsetType: editingItem.offsetType,
        offsetValue: Number(editingItem.offsetValue) || 0,
        notes: editingItem.description.trim() || null,
      });
      setEditingItemId(null);
      setEditingItem(null);
      await load(selectedTemplateId);
      toast.success(t('تم حفظ البند'));
    } catch (err) {
      toast.error(err.message || t('تعذر حفظ البند'));
    }
  };

  const handleDeleteTemplateItem = async (item) => {
    const confirmed = await confirm({
      title: t('حذف البند'),
      message: t('سيتم حذف البند "{name}" من القالب. هل أنت متأكد؟', { name: item.title }),
      confirmLabel: t('حذف'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await settingsApi.deleteTaskTemplateItem(item.id);
      if (editingItemId === item.id) {
        setEditingItemId(null);
        setEditingItem(null);
      }
      await load(selectedTemplateId);
      toast.success(t('تم حذف البند'));
    } catch (err) {
      toast.error(err.message || t('تعذر حذف البند'));
    }
  };

  const handleReorderTemplateItems = async (fromId, toId) => {
    if (!selectedTemplateId || !selectedTemplate?.items || fromId === toId || reorderingItems) return;
    const items = [...selectedTemplate.items];
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    const reordered = items.map((item, index) => ({ ...item, sortOrder: index }));
    setSelectedTemplate({ ...selectedTemplate, items: reordered });
    setReorderingItems(true);
    try {
      const updated = await settingsApi.reorderTaskTemplateItems(
        selectedTemplateId,
        reordered.map((item) => item.id)
      );
      setSelectedTemplate(updated);
    } catch (err) {
      toast.error(err.message || t('تعذر إعادة ترتيب البنود'));
      await load(selectedTemplateId);
    } finally {
      setReorderingItems(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Webhook / currency                                                */
  /* ---------------------------------------------------------------- */

  const handleRotateSecret = async () => {
    setRotating(true);
    setRotateError('');
    try {
      const result = await settingsApi.rotateWebhookSecret();
      setRotatedToken(result.token);
      await load();
      toast.success(t('تم تدوير الرمز — احفظ الرمز الجديد الآن'));
    } catch (err) {
      setRotateError(err.message || 'تعذّر تدوير الرمز');
    } finally {
      setRotating(false);
    }
  };

  const handleCopyToken = async () => {
    if (!rotatedToken) return;
    try {
      await navigator.clipboard.writeText(rotatedToken);
      toast.success(t('تم النسخ'));
    } catch {
      toast.error(t('تعذّر النسخ إلى الحافظة'));
    }
  };

  const handleSaveCurrency = async (e) => {
    e?.preventDefault?.();
    try {
      await settingsApi.update({
        currencyCode: settings.currencyCode,
        currencyLabel: settings.currencyLabel,
      });
      load();
      // Amounts everywhere (and printed receipts) read the label from the app settings.
      loadSettings();
      toast.success(t('تم حفظ إعدادات العملة'));
    } catch (err) {
      toast.error(err.message || t('تعذر حفظ إعدادات العملة'));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Derived                                                           */
  /* ---------------------------------------------------------------- */

  const templateItems = selectedTemplate?.items || [];
  const templateStageCount = new Set(templateItems.map((i) => i.phaseKey)).size;
  const templateSpecialtyCount = new Set(templateItems.map((i) => i.specialty)).size;

  const employeeColumns = [
    {
      key: 'name',
      label: t('الاسم'),
      render: (emp) => (
        <span className="cell-person">
          <span className="avatar">{initials(emp.fullName)}</span>
          <span className="cell-stack">
            <span className="cell-name">{emp.fullName}</span>
            {emp.id === user?.id && <span className="badge plain tone-brand settings-self-badge">{t('أنت')}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'email',
      label: t('البريد'),
      render: (emp) => <span className="ltr cell-muted">{emp.email}</span>,
    },
    {
      key: 'employment',
      label: t('نوع التوظيف'),
      render: (emp) => (
        <span className="cell-stack">
          <span>
            <span className="badge plain tone-neutral">{t(emp.isSalaried ? 'راتب ثابت' : 'بدون راتب ثابت')}</span>
          </span>
          {emp.isSalaried && emp.monthlySalaryMinor != null && (
            <span className="cell-muted tnum">
              {t('{amount} · يوم {day}', {
                amount: formatMinor(emp.monthlySalaryMinor),
                day: emp.salaryDayOfMonth || 1,
              })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'privileges',
      label: t('الصلاحيات'),
      render: (emp) => (
        <div className="privilege-tags">
          {privilegeOptions.filter((p) =>
            emp.privileges.some((ep) => ep.privilege.code === p.code)
          ).map((p) => (
            <span key={p.code} className="badge plain tone-brand">{p.label}</span>
          ))}
          {emp.privileges.length === 0 && (
            <span className="muted-text">{t('لا توجد صلاحيات')}</span>
          )}
        </div>
      ),
    },
  ];

  if (isAdmin) {
    employeeColumns.push({
      key: 'actions',
      label: t('إجراءات'),
      render: (emp) => (
        <div className="cell-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSalaryModal(emp)}>
            <EditIcon />
            {t('الراتب')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPrivilegesModal(emp)}>
            <ShieldIcon />
            {t('الصلاحيات')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPasswordModal(emp)}>
            <LockIcon />
            {t('كلمة المرور')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger-text"
            onClick={() => handleDeleteEmployee(emp)}
            disabled={emp.id === user?.id}
          >
            <TrashIcon />
            {t('حذف')}
          </button>
        </div>
      ),
    });
  }

  const webhookLogColumns = [
    {
      key: 'receivedAt',
      label: t('الوقت'),
      render: (log) => <span className="cell-muted tnum">{formatDateTime(log.receivedAt)}</span>,
    },
    {
      key: 'success',
      label: t('الحالة'),
      render: (log) => (
        <span className={`badge plain ${log.success ? 'tone-success' : 'tone-danger'}`}>
          {t(log.success ? 'نجاح' : 'فشل')}
        </span>
      ),
    },
    {
      key: 'failureReason',
      label: t('السبب'),
      render: (log) => <span className="cell-muted">{td(log.failureReason) || '—'}</span>,
    },
  ];

  const auditColumns = [
    {
      key: 'createdAt',
      label: t('الوقت'),
      render: (log) => <span className="cell-muted tnum">{formatDateTime(log.createdAt)}</span>,
    },
    {
      key: 'actor',
      label: t('الفاعل'),
      render: (log) => (
        <span className="cell-name">
          {log.actor?.fullName || t(ACTOR_TYPE_LABELS[log.actorType]) || log.actorType}
        </span>
      ),
    },
    {
      key: 'action',
      label: t('الإجراء'),
      render: (log) => <code className="audit-action-code ltr">{log.action}</code>,
    },
    {
      key: 'entityType',
      label: t('الكيان'),
      render: (log) => <span className="cell-muted">{log.entityType}</span>,
    },
  ];

  const addToggleLabel = (open, label) => (
    open ? (
      <>
        <XIcon />
        {t('إلغاء')}
      </>
    ) : (
      <>
        <PlusIcon />
        {label}
      </>
    )
  );

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('الإعدادات')}</h1>
          <p className="page-subtitle">{t('إدارة الموظفين، المسارات، المصادر، والتكاملات')}</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav card" aria-label={t('أقسام الإعدادات')}>
          {visibleSections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item ${active ? 'active' : ''}`}
                onClick={() => selectSection(s.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="settings-nav-icon">
                  <Icon size={18} />
                </span>
                <span className="settings-nav-label">{t(s.label)}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {/* ------------------------------------------------------------ */}
          {/* Employees                                                     */}
          {/* ------------------------------------------------------------ */}
          {section === 'employees' && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('الموظفون والصلاحيات')}</h3>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAddEmployee((open) => !open)}
                    aria-expanded={showAddEmployee}
                  >
                    {addToggleLabel(showAddEmployee, t('إضافة موظف'))}
                  </button>
                )}
              </div>

              {isAdmin && showAddEmployee && (
                <form className="settings-inline-form" onSubmit={handleCreateEmployee}>
                  <h4 className="settings-inline-form-title">{t('موظف جديد')}</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="emp-name">{t('الاسم الكامل')}</label>
                      <input
                        id="emp-name"
                        value={newEmployee.fullName}
                        onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="emp-email">{t('البريد الإلكتروني')}</label>
                      <input
                        id="emp-email"
                        type="email"
                        dir="ltr"
                        value={newEmployee.email}
                        onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                        required
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="emp-password">{t('كلمة المرور')}</label>
                      <input
                        id="emp-password"
                        type="password"
                        value={newEmployee.password}
                        onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="emp-type">{t('نوع التوظيف')}</label>
                      <select
                        id="emp-type"
                        value={newEmployee.isSalaried ? 'salary' : 'non_salary'}
                        onChange={(e) => setNewEmployee({ ...newEmployee, isSalaried: e.target.value === 'salary' })}
                      >
                        <option value="salary">{t('راتب ثابت')}</option>
                        <option value="non_salary">{t('بدون راتب ثابت')}</option>
                      </select>
                    </div>
                  </div>
                  {newEmployee.isSalaried && (
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="emp-salary">{t('الراتب الشهري ({currency})', { currency: getCurrencyLabel() })}</label>
                        <input
                          id="emp-salary"
                          type="text"
                          inputMode="numeric"
                          className="ltr"
                          placeholder="1,000,000"
                          value={newEmployee.monthlySalaryMinor}
                          onChange={(e) => setNewEmployee({
                            ...newEmployee,
                            monthlySalaryMinor: formatAmountInput(e.target.value),
                          })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="emp-salary-day">{t('يوم صرف الراتب من كل شهر')}</label>
                        <select
                          id="emp-salary-day"
                          value={newEmployee.salaryDayOfMonth}
                          onChange={(e) => setNewEmployee({
                            ...newEmployee,
                            salaryDayOfMonth: Number(e.target.value),
                          })}
                        >
                          {SALARY_DAYS.map((d) => (
                            <option key={d} value={d}>{t('يوم {day}', { day: d })}</option>
                          ))}
                        </select>
                        <span className="form-hint">{t('يُضاف الراتب تلقائياً إلى محفظة الموظف في هذا اليوم.')}</span>
                      </div>
                    </div>
                  )}
                  <p className="form-hint">
                    {t('يُمنح الموظف الجديد صلاحية «مبيعات» افتراضياً، ويمكنك تعديل صلاحياته بعد الإضافة.')}
                  </p>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      <PlusIcon />
                      {t('إضافة الموظف')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAddEmployee(false)}>
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              )}

              <div className="settings-table">
                <DataTable
                  columns={employeeColumns}
                  rows={employees}
                  emptyMessage={t('لا يوجد موظفون بعد')}
                  minWidth={isAdmin ? 820 : 620}
                />
              </div>

              <Modal
                open={!!privilegesEmployee}
                onClose={() => setPrivilegesEmployee(null)}
                title={privilegesEmployee ? t('صلاحيات {name}', { name: privilegesEmployee.fullName }) : ''}
                description={t('اختر الصلاحيات المطلوبة ثم احفظ. تُطبَّق التغييرات فوراً على وصول الموظف.')}
              >
                <form onSubmit={handleSavePrivileges}>
                  {employeeActionError && <p className="form-error">{td(employeeActionError)}</p>}
                  <div className="privilege-tags privilege-modal-tags" role="group" aria-label={t('الصلاحيات')}>
                    {privilegeOptions.map((p) => {
                      const active = editPrivilegeCodes.includes(p.code);
                      return (
                        <button
                          key={p.code}
                          type="button"
                          className={`chip ${active ? 'active' : ''}`}
                          onClick={() => toggleEditPrivilege(p.code)}
                          aria-pressed={active}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  {editPrivilegeCodes.length === 0 && (
                    <p className="form-hint">{t('بدون صلاحيات لن يتمكن الموظف من الوصول إلى أي قسم.')}</p>
                  )}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={employeeActionSaving}>
                      {employeeActionSaving ? t('جاري الحفظ…') : t('حفظ')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setPrivilegesEmployee(null)}
                    >
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              </Modal>

              <Modal
                open={!!passwordEmployee}
                onClose={() => setPasswordEmployee(null)}
                title={passwordEmployee ? t('تغيير كلمة مرور {name}', { name: passwordEmployee.fullName }) : ''}
                description={t('سيحتاج الموظف إلى كلمة المرور الجديدة عند تسجيل الدخول التالي.')}
                size="sm"
              >
                <form onSubmit={handleChangePassword}>
                  {employeeActionError && <p className="form-error">{td(employeeActionError)}</p>}
                  <div className="form-group">
                    <label htmlFor="emp-new-password">{t('كلمة المرور الجديدة')}</label>
                    <input
                      id="emp-new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <span className="form-hint">{t('6 أحرف على الأقل.')}</span>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={employeeActionSaving}>
                      {employeeActionSaving ? t('جاري الحفظ…') : t('حفظ')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setPasswordEmployee(null)}
                    >
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              </Modal>

              <Modal
                open={!!salaryEmployee}
                onClose={() => setSalaryEmployee(null)}
                title={salaryEmployee ? t('الراتب ونوع التوظيف — {name}', { name: salaryEmployee.fullName }) : ''}
              >
                <form onSubmit={handleSaveSalary}>
                  {employeeActionError && <p className="form-error">{td(employeeActionError)}</p>}
                  <div className="form-group">
                    <label htmlFor="salary-type">{t('نوع التوظيف')}</label>
                    <select
                      id="salary-type"
                      value={salaryForm.isSalaried ? 'salary' : 'non_salary'}
                      onChange={(e) => setSalaryForm({ ...salaryForm, isSalaried: e.target.value === 'salary' })}
                    >
                      <option value="salary">{t('راتب ثابت')}</option>
                      <option value="non_salary">{t('بدون راتب ثابت')}</option>
                    </select>
                  </div>
                  {salaryForm.isSalaried && (
                    <>
                      <div className="form-group">
                        <label htmlFor="salary-amount">{t('الراتب الشهري ({currency})', { currency: getCurrencyLabel() })}</label>
                        <input
                          id="salary-amount"
                          type="text"
                          inputMode="numeric"
                          className="ltr"
                          required
                          value={salaryForm.monthlySalaryMinor}
                          onChange={(e) => setSalaryForm({
                            ...salaryForm,
                            monthlySalaryMinor: formatAmountInput(e.target.value),
                          })}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="salary-day">{t('يوم صرف الراتب من كل شهر')}</label>
                        <select
                          id="salary-day"
                          value={salaryForm.salaryDayOfMonth}
                          onChange={(e) => setSalaryForm({
                            ...salaryForm,
                            salaryDayOfMonth: Number(e.target.value),
                          })}
                        >
                          {SALARY_DAYS.map((d) => (
                            <option key={d} value={d}>{t('يوم {day}', { day: d })}</option>
                          ))}
                        </select>
                        <span className="form-hint">
                          {t('يُضاف الراتب تلقائياً إلى محفظة الموظف في هذا اليوم من كل شهر.')}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary" disabled={employeeActionSaving}>
                      {employeeActionSaving ? t('جاري الحفظ…') : t('حفظ')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSalaryEmployee(null)}
                    >
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              </Modal>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Tracks                                                        */}
          {/* ------------------------------------------------------------ */}
          {section === 'tracks' && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('مسارات التدريب')}</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddTrack((open) => !open)}
                  aria-expanded={showAddTrack}
                >
                  {addToggleLabel(showAddTrack, t('إضافة مسار'))}
                </button>
              </div>
              <p className="settings-lead">
                {t('مسارات الدورات (مثل الذكاء الاصطناعي، التداول). يُختار قالب مسار المهام عند إنشاء كل دورة.')}
              </p>

              {showAddTrack && (
                <form className="settings-inline-form" onSubmit={handleCreateTrack}>
                  <h4 className="settings-inline-form-title">{t('مسار جديد')}</h4>
                  <div className="form-group">
                    <label htmlFor="track-name">{t('اسم المسار')}</label>
                    <input
                      id="track-name"
                      placeholder={t('مثل: الذكاء الاصطناعي')}
                      value={newTrack.nameAr}
                      onChange={(e) => setNewTrack({ ...newTrack, nameAr: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      <PlusIcon />
                      {t('إضافة المسار')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAddTrack(false)}>
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              )}

              {tracks.length === 0 ? (
                <EmptyState
                  icon={<LayersIcon />}
                  title={t('لا توجد مسارات بعد')}
                  hint={t('أضف أول مسار لتتمكن من إنشاء الدورات عليه.')}
                />
              ) : (
                <ul className="settings-list">
                  {tracks.map((track) => (
                    <li key={track.id} className="settings-row">
                      {editingTrackId === track.id ? (
                        <form onSubmit={handleSaveTrack} className="settings-row-edit">
                          <input
                            className="input"
                            value={editingTrackName}
                            onChange={(e) => setEditingTrackName(e.target.value)}
                            aria-label={t('اسم المسار')}
                            autoFocus
                            required
                          />
                          <button type="submit" className="btn btn-primary btn-sm">{t('حفظ')}</button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingTrackId(null); setEditingTrackName(''); }}
                          >
                            {t('إلغاء')}
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="settings-row-main">
                            <strong>{track.nameAr}</strong>
                            {track.nameEn && <code className="ltr settings-code">{track.nameEn}</code>}
                          </span>
                          <span className="settings-row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditTrack(track)}>
                              <EditIcon />
                              {t('تعديل')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-danger-text"
                              onClick={() => handleDeleteTrack(track)}
                            >
                              <TrashIcon />
                              {t('حذف')}
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Task path templates                                           */}
          {/* ------------------------------------------------------------ */}
          {section === 'taskTemplates' && (
            <div className="tpl-workspace">
              <header className="tpl-workspace-header">
                <div>
                  <h3 className="card-title">{t('قوالب مسار المهام')}</h3>
                  <p className="settings-lead">
                    {t('اختر قالباً من القائمة ثم أدر بنوده — كل بند يصبح مهمة عند ربط القالب بدورة.')}
                  </p>
                </div>
                {!tplEditorExpanded && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAddTemplate((open) => !open)}
                    aria-expanded={showAddTemplate}
                  >
                    {addToggleLabel(showAddTemplate, t('قالب جديد'))}
                  </button>
                )}
              </header>

              {showAddTemplate && !tplEditorExpanded && (
                <form className="settings-inline-form card" onSubmit={handleCreateTemplate}>
                  <h4 className="settings-inline-form-title">{t('قالب جديد')}</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="tpl-name">{t('اسم القالب')}</label>
                      <input
                        id="tpl-name"
                        placeholder={t('مثل: مسار الدورة القياسي')}
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="tpl-desc">{t('الوصف (اختياري)')}</label>
                      <input
                        id="tpl-desc"
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      <PlusIcon />
                      {t('إنشاء القالب')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAddTemplate(false)}>
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              )}

              <div className={`tpl-workspace-body ${tplEditorExpanded ? 'editor-expanded' : ''}`}>
                {!tplEditorExpanded && (
                  <aside className="tpl-sidebar card">
                    <div className="tpl-sidebar-head">
                      <h4>{t('القوالب')}</h4>
                      <span className="tpl-count tnum">{taskTemplates.length}</span>
                    </div>

                    <ul className="tpl-list">
                      {taskTemplates.map((tpl) => (
                        <li key={tpl.id}>
                          <button
                            type="button"
                            className={`tpl-list-item ${selectedTemplateId === tpl.id ? 'active' : ''}`}
                            onClick={() => setSelectedTemplateId(tpl.id)}
                            aria-current={selectedTemplateId === tpl.id ? 'true' : undefined}
                          >
                            <span className="tpl-list-item-main">
                              <strong>{tpl.name}</strong>
                              {tpl.description && <span className="tpl-list-item-desc">{tpl.description}</span>}
                            </span>
                            <span className="tpl-list-item-meta tnum">
                              {t('{count} بند', { count: tpl.items?.length ?? 0 })}
                            </span>
                          </button>
                        </li>
                      ))}
                      {taskTemplates.length === 0 && (
                        <li className="tpl-empty">{t('لا توجد قوالب بعد — اضغط «قالب جديد» لإنشاء الأول')}</li>
                      )}
                    </ul>
                  </aside>
                )}

                <section className={`tpl-editor card ${tplEditorExpanded ? 'is-expanded' : ''}`}>
                  {!selectedTemplate ? (
                    <div className="tpl-editor-empty">
                      <span className="empty-block-icon">
                        <ListIcon />
                      </span>
                      <strong>{t('لم يتم اختيار قالب')}</strong>
                      <p>{t('اختر قالباً من القائمة لعرض بنوده وتعديلها، أو أنشئ قالباً جديداً.')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="tpl-editor-banner">
                        <div className="tpl-editor-banner-text">
                          <span className="tpl-editor-eyebrow">{t('تحرير القالب')}</span>
                          <h4>{selectedTemplate.name}</h4>
                          {selectedTemplate.description && (
                            <p className="tpl-editor-desc">{selectedTemplate.description}</p>
                          )}
                        </div>
                        <div className="tpl-editor-banner-actions">
                          <div className="tpl-editor-stats">
                            <div className="tpl-stat">
                              <span className="tpl-stat-value tnum">{templateItems.length}</span>
                              <span className="tpl-stat-label">{t('بنود')}</span>
                            </div>
                            <div className="tpl-stat">
                              <span className="tpl-stat-value tnum">{templateStageCount}</span>
                              <span className="tpl-stat-label">{t('مراحل')}</span>
                            </div>
                            <div className="tpl-stat">
                              <span className="tpl-stat-value tnum">{templateSpecialtyCount}</span>
                              <span className="tpl-stat-label">{t('تخصصات')}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn tpl-expand-btn"
                            onClick={() => setTplEditorExpanded((v) => !v)}
                            aria-expanded={tplEditorExpanded}
                          >
                            {tplEditorExpanded ? <MinimizeIcon /> : <MaximizeIcon />}
                            {t(tplEditorExpanded ? 'تصغير النافذة' : 'توسيع النافذة')}
                          </button>
                        </div>
                      </div>

                      <div className="tpl-items-block">
                        <div className="tpl-block-head">
                          <div>
                            <h5>{t('بنود المسار')}</h5>
                            <p>{t('أضف البنود ثم اسحب مقبض الترتيب لإعادة ترتيب التنفيذ')}</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowAddTemplateItem((open) => !open)}
                            aria-expanded={showAddTemplateItem}
                          >
                            {addToggleLabel(showAddTemplateItem, t('بند جديد'))}
                          </button>
                        </div>

                        {showAddTemplateItem && (
                          <form className="tpl-add-panel" onSubmit={handleAddTemplateItem}>
                            <h5 className="tpl-add-panel-title">{t('إضافة بند جديد')}</h5>
                            <TemplateItemFields item={newItem} onChange={setNewItem} idPrefix="tpl-new" />
                            <div className="form-actions">
                              <button type="submit" className="btn btn-primary">
                                <PlusIcon />
                                {t('إضافة البند إلى القالب')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowAddTemplateItem(false)}
                              >
                                {t('إلغاء')}
                              </button>
                            </div>
                          </form>
                        )}

                        {templateItems.length === 0 ? (
                          <div className="tpl-items-empty">
                            {t('لا بنود في هذا القالب بعد. اضغط «بند جديد» لإنشاء البند الأول.')}
                          </div>
                        ) : (
                          <div className="tpl-table-wrap">
                            <table className="data-table tpl-items-table">
                              <thead>
                                <tr>
                                  <th className="tpl-sort-head">#</th>
                                  <th>{t('عنوان المهمة')}</th>
                                  <th>{t('المرحلة')}</th>
                                  <th>{t('التخصص')}</th>
                                  <th>{t('توقيت الاستحقاق')}</th>
                                  <th>{t('إجراءات')}</th>
                                  <th aria-label={t('ترتيب')} />
                                </tr>
                              </thead>
                              <tbody>
                                {templateItems.map((item, index) => (
                                  <Fragment key={item.id}>
                                    <tr
                                      className={[
                                        editingItemId === item.id ? 'is-editing' : '',
                                        dragItemId === item.id ? 'is-dragging' : '',
                                        dragOverItemId === item.id ? 'is-drag-over' : '',
                                        expandedItemId === item.id ? 'is-expanded' : '',
                                        editingItemId !== item.id ? 'is-clickable' : '',
                                      ].filter(Boolean).join(' ')}
                                      onClick={() => {
                                        if (editingItemId === item.id) return;
                                        setExpandedItemId((id) => (id === item.id ? null : item.id));
                                      }}
                                      onDragOver={(e) => {
                                        if (editingItemId || reorderingItems) return;
                                        e.preventDefault();
                                        if (dragOverItemId !== item.id) setDragOverItemId(item.id);
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        const fromId = dragItemId || e.dataTransfer.getData('text/plain');
                                        setDragItemId(null);
                                        setDragOverItemId(null);
                                        if (fromId) handleReorderTemplateItems(fromId, item.id);
                                      }}
                                    >
                                      {editingItemId === item.id ? (
                                        <td colSpan={7} className="tpl-edit-cell">
                                          <form className="tpl-edit-form" onSubmit={handleSaveTemplateItem}>
                                            <TemplateItemFields
                                              item={editingItem}
                                              onChange={setEditingItem}
                                              idPrefix={`tpl-edit-${item.id}`}
                                            />
                                            <div className="form-actions">
                                              <button type="submit" className="btn btn-primary">{t('حفظ التعديل')}</button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => { setEditingItemId(null); setEditingItem(null); }}
                                              >
                                                {t('إلغاء')}
                                              </button>
                                            </div>
                                          </form>
                                        </td>
                                      ) : (
                                        <>
                                          <td className="tpl-sort tnum">{index + 1}</td>
                                          <td><strong className="tpl-item-title">{item.title}</strong></td>
                                          <td>
                                            <span className="badge plain tone-neutral">
                                              {lifecycleStageLabel(item.phaseKey)}
                                            </span>
                                          </td>
                                          <td>
                                            <span className={`dept-badge ${specialtyClass(item.specialty)}`.trim()}>
                                              {specialtyLabel(item.specialty)}
                                            </span>
                                          </td>
                                          <td className="cell-muted">{formatOffset(item)}</td>
                                          <td onClick={(e) => e.stopPropagation()}>
                                            <div className="cell-actions">
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => startEditItem(item)}
                                              >
                                                <EditIcon />
                                                {t('تعديل')}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm btn-danger-text"
                                                onClick={() => handleDeleteTemplateItem(item)}
                                              >
                                                <TrashIcon />
                                                {t('حذف')}
                                              </button>
                                            </div>
                                          </td>
                                          <td className="tpl-drag-cell" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              type="button"
                                              className="tpl-drag-handle"
                                              draggable
                                              aria-label={t('سحب لإعادة الترتيب')}
                                              title={t('اسحب لإعادة الترتيب')}
                                              disabled={reorderingItems}
                                              onDragStart={(e) => {
                                                setDragItemId(item.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                                e.dataTransfer.setData('text/plain', item.id);
                                              }}
                                              onDragEnd={() => {
                                                setDragItemId(null);
                                                setDragOverItemId(null);
                                              }}
                                            >
                                              <DragIcon size={16} />
                                            </button>
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                    {editingItemId !== item.id && expandedItemId === item.id && (
                                      <tr className="tpl-item-description-row">
                                        <td colSpan={7}>
                                          <div className="tpl-item-description">
                                            <strong>{t('الوصف')}</strong>
                                            <p>{item.notes?.trim() ? item.notes : t('لا يوجد وصف لهذه المهمة')}</p>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Expense categories                                            */}
          {/* ------------------------------------------------------------ */}
          {section === 'expenseCategories' && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('فئات المصروفات')}</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddExpenseCategory((open) => !open)}
                  aria-expanded={showAddExpenseCategory}
                >
                  {addToggleLabel(showAddExpenseCategory, t('إضافة فئة'))}
                </button>
              </div>
              <p className="settings-lead">
                {t('تُستخدم الفئات لتصنيف المصروفات في قسم المالية. يمكن تعطيل الفئة بدل حذفها للحفاظ على السجلات القديمة.')}
              </p>

              {showAddExpenseCategory && (
                <form className="settings-inline-form" onSubmit={handleCreateExpenseCategory}>
                  <h4 className="settings-inline-form-title">{t('فئة جديدة')}</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="cat-code">{t('الرمز')}</label>
                      <input
                        id="cat-code"
                        placeholder="rent"
                        dir="ltr"
                        value={newExpenseCategory.code}
                        onChange={(e) => setNewExpenseCategory({ ...newExpenseCategory, code: e.target.value })}
                        required
                        autoFocus
                      />
                      <span className="form-hint">{t('أحرف لاتينية بدون مسافات؛ لا يمكن تغييره لاحقاً.')}</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="cat-label">{t('الاسم بالعربية')}</label>
                      <input
                        id="cat-label"
                        placeholder={t('الإيجار')}
                        value={newExpenseCategory.labelAr}
                        onChange={(e) => setNewExpenseCategory({ ...newExpenseCategory, labelAr: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      <PlusIcon />
                      {t('إضافة الفئة')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAddExpenseCategory(false)}>
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              )}

              {expenseCategories.length === 0 ? (
                <EmptyState
                  icon={<TagIcon />}
                  title={t('لا توجد فئات بعد')}
                  hint={t('أضف فئات مثل الإيجار أو الرواتب لتصنيف المصروفات.')}
                />
              ) : (
                <ul className="settings-list">
                  {expenseCategories.map((cat) => (
                    <li key={cat.id} className={`settings-row ${cat.isActive ? '' : 'is-inactive'}`.trim()}>
                      {editingCategoryId === cat.id ? (
                        <form onSubmit={handleSaveExpenseCategory} className="settings-row-edit">
                          <input
                            className="input"
                            value={editingCategoryLabel}
                            onChange={(e) => setEditingCategoryLabel(e.target.value)}
                            aria-label={t('اسم الفئة')}
                            autoFocus
                          />
                          <button type="submit" className="btn btn-primary btn-sm">{t('حفظ')}</button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingCategoryId(null); setEditingCategoryLabel(''); }}
                          >
                            {t('إلغاء')}
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="settings-row-main">
                            <strong>{td(cat.labelAr)}</strong>
                            <code className="ltr settings-code">{cat.code}</code>
                            {!cat.isActive && (
                              <span className="badge plain tone-warning">{t('معطّل')}</span>
                            )}
                          </span>
                          <span className="settings-row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditCategory(cat)}>
                              <EditIcon />
                              {t('تعديل')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleExpenseCategoryActive(cat)}
                            >
                              {t(cat.isActive ? 'تعطيل' : 'تفعيل')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-danger-text"
                              onClick={() => handleDeleteExpenseCategory(cat)}
                            >
                              <TrashIcon />
                              {t('حذف')}
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Lead sources                                                  */}
          {/* ------------------------------------------------------------ */}
          {section === 'crm' && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('مصادر العملاء')}</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddLeadSource((open) => !open)}
                  aria-expanded={showAddLeadSource}
                >
                  {addToggleLabel(showAddLeadSource, t('إضافة مصدر'))}
                </button>
              </div>
              <p className="settings-lead">
                {t('القنوات التي يصل منها العملاء المحتملون. مصادر النظام لا يمكن حذفها.')}
              </p>

              {showAddLeadSource && (
                <form className="settings-inline-form" onSubmit={handleCreateLeadSource}>
                  <h4 className="settings-inline-form-title">{t('مصدر جديد')}</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="src-code">{t('الرمز')}</label>
                      <input
                        id="src-code"
                        placeholder="facebook"
                        dir="ltr"
                        value={newLeadSource.code}
                        onChange={(e) => setNewLeadSource({ ...newLeadSource, code: e.target.value })}
                        required
                        autoFocus
                      />
                      <span className="form-hint">{t('أحرف لاتينية بدون مسافات؛ لا يمكن تغييره لاحقاً.')}</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="src-label">{t('الاسم بالعربية')}</label>
                      <input
                        id="src-label"
                        placeholder={t('فيسبوك')}
                        value={newLeadSource.labelAr}
                        onChange={(e) => setNewLeadSource({ ...newLeadSource, labelAr: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      <PlusIcon />
                      {t('إضافة المصدر')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAddLeadSource(false)}>
                      {t('إلغاء')}
                    </button>
                  </div>
                </form>
              )}

              {leadSources.length === 0 ? (
                <EmptyState
                  icon={<TagIcon />}
                  title={t('لا توجد مصادر بعد')}
                  hint={t('أضف مصادر مثل إنستغرام أو واتساب لتتبّع قنوات الوصول.')}
                />
              ) : (
                <ul className="settings-list">
                  {leadSources.map((src) => (
                    <li key={src.id} className={`settings-row ${src.isActive ? '' : 'is-inactive'}`.trim()}>
                      {editingLeadSourceId === src.id ? (
                        <form onSubmit={handleSaveLeadSource} className="settings-row-edit">
                          <input
                            className="input"
                            value={editingLeadSourceLabel}
                            onChange={(e) => setEditingLeadSourceLabel(e.target.value)}
                            aria-label={t('اسم المصدر')}
                            autoFocus
                          />
                          <button type="submit" className="btn btn-primary btn-sm">{t('حفظ')}</button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingLeadSourceId(null); setEditingLeadSourceLabel(''); }}
                          >
                            {t('إلغاء')}
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="settings-row-main">
                            <strong>{td(src.labelAr)}</strong>
                            <code className="ltr settings-code">{src.code}</code>
                            {src.isSystem && (
                              <span className="badge plain tone-muted">{t('نظام')}</span>
                            )}
                            {!src.isActive && (
                              <span className="badge plain tone-warning">{t('معطّل')}</span>
                            )}
                          </span>
                          <span className="settings-row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditLeadSource(src)}>
                              <EditIcon />
                              {t('تعديل')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleLeadSourceActive(src)}
                            >
                              {t(src.isActive ? 'تعطيل' : 'تفعيل')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-danger-text"
                              onClick={() => handleDeleteLeadSource(src)}
                              disabled={src.code === 'bot'}
                            >
                              <TrashIcon />
                              {t('حذف')}
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Webhook                                                       */}
          {/* ------------------------------------------------------------ */}
          {section === 'webhook' && isAdmin && webhook && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('تكامل بوت التأهيل')}</h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={rotating}
                  onClick={handleRotateSecret}
                >
                  <RefreshIcon />
                  {t(rotating ? 'جاري التدوير…' : 'تدوير الرمز')}
                </button>
              </div>

              <dl className="webhook-defs">
                <div className="webhook-def">
                  <dt>{t('نقطة الاستقبال')}</dt>
                  <dd><code className="ltr">GET /api/v1/webhooks/leads/inbound</code></dd>
                </div>
                <div className="webhook-def">
                  <dt>{t('الرمز الحالي')}</dt>
                  <dd>
                    {tr('ينتهي بـ {hint}', { hint: <code className="ltr">{webhook.secretHint}</code> })}
                  </dd>
                </div>
              </dl>

              <div className="webhook-stats">
                <StatCard value={webhook.stats.total} label={t('إجمالي المحاولات')} icon={<BotIcon />} />
                <StatCard value={webhook.stats.success} label={t('ناجحة')} variant="success" />
                <StatCard value={webhook.stats.failed} label={t('فاشلة')} variant="warning" />
              </div>

              {rotateError && <p className="form-error">{td(rotateError)}</p>}

              {rotatedToken && (
                <div className="callout warning webhook-token-callout">
                  <AlertIcon />
                  <div className="webhook-token">
                    <strong>{t('الرمز الجديد — احفظه الآن، لن يُعرض مرة أخرى.')}</strong>
                    <code className="ltr webhook-token-value">{rotatedToken}</code>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyToken}>
                    <CopyIcon />
                    {t('نسخ')}
                  </button>
                </div>
              )}

              <h4 className="settings-subheading">{t('سجل المحاولات')}</h4>
              <div className="settings-table">
                <DataTable
                  columns={webhookLogColumns}
                  rows={webhookLogs}
                  emptyMessage={t('لا توجد محاولات مسجّلة بعد')}
                  dense
                />
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Currency                                                      */}
          {/* ------------------------------------------------------------ */}
          {section === 'currency' && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('إعدادات العملة')}</h3>
              </div>
              <p className="settings-lead">
                {t('تُستخدم التسمية في كل المبالغ المعروضة في النظام (الأسعار، الرواتب، التقارير).')}
              </p>
              <form className="settings-currency-form" onSubmit={handleSaveCurrency}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="currency-code">{t('رمز العملة')}</label>
                    <input
                      id="currency-code"
                      className="ltr"
                      value={settings.currencyCode || 'SYP'}
                      onChange={(e) => setSettings({ ...settings, currencyCode: e.target.value })}
                    />
                    <span className="form-hint">{t('الرمز الدولي، مثل SYP أو USD.')}</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="currency-label">{t('التسمية المعروضة')}</label>
                    <input
                      id="currency-label"
                      value={settings.currencyLabel || 'ل.س'}
                      onChange={(e) => setSettings({ ...settings, currencyLabel: e.target.value })}
                    />
                    <span className="form-hint">{t('تظهر بجانب كل مبلغ، مثل «ل.س».')}</span>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">{t('حفظ')}</button>
                </div>
              </form>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Audit log                                                     */}
          {/* ------------------------------------------------------------ */}
          {section === 'printing' && <PrintDesigner />}

          {section === 'siteChat' && isAdmin && <SiteChatSettings />}

          {section === 'audit' && isAdmin && (
            <div className="card">
              <div className="card-header-row">
                <h3 className="card-title">{t('سجل النشاط')}</h3>
                <span className="muted-text">{t('انقر على أي صف لعرض التفاصيل الكاملة')}</span>
              </div>
              <div className="settings-table">
                <DataTable
                  columns={auditColumns}
                  rows={auditLogs}
                  onRowClick={(log) => setSelectedAuditLog(log)}
                  emptyMessage={t('لا توجد سجلات بعد')}
                  minWidth={640}
                />
              </div>

              <Modal
                open={!!selectedAuditLog}
                onClose={() => setSelectedAuditLog(null)}
                title={t('تفاصيل سجل النشاط')}
                size="lg"
                footer={
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSelectedAuditLog(null)}
                  >
                    {t('إغلاق')}
                  </button>
                }
              >
                {selectedAuditLog && (
                  <div className="audit-detail">
                    <dl className="audit-detail-grid">
                      <div>
                        <dt>{t('الوقت')}</dt>
                        <dd className="tnum">{formatDateTime(selectedAuditLog.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>{t('الفاعل')}</dt>
                        <dd>
                          {selectedAuditLog.actor?.fullName || '—'}
                          <span className="audit-meta">
                            {' '}
                            ({t(ACTOR_TYPE_LABELS[selectedAuditLog.actorType]) || selectedAuditLog.actorType})
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t('معرف الفاعل')}</dt>
                        <dd className="ltr audit-mono">
                          {selectedAuditLog.actorId || selectedAuditLog.actorType || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('عنوان IP')}</dt>
                        <dd className="ltr audit-mono">{selectedAuditLog.ip || '—'}</dd>
                      </div>
                      <div>
                        <dt>{t('الإجراء')}</dt>
                        <dd><code className="audit-action-code ltr">{selectedAuditLog.action}</code></dd>
                      </div>
                      <div>
                        <dt>{t('نوع الكيان')}</dt>
                        <dd>{selectedAuditLog.entityType}</dd>
                      </div>
                      <div className="audit-detail-full">
                        <dt>{t('معرف الكيان')}</dt>
                        <dd className="ltr audit-mono">{selectedAuditLog.entityId || '—'}</dd>
                      </div>
                      <div className="audit-detail-full">
                        <dt>{t('معرف السجل')}</dt>
                        <dd className="ltr audit-mono">{selectedAuditLog.id}</dd>
                      </div>
                    </dl>

                    <div className="audit-json-pair">
                      <div className="audit-json-block">
                        <h4>{t('القيمة السابقة')}</h4>
                        {formatAuditJson(selectedAuditLog.oldValue) ? (
                          <pre dir="ltr">{formatAuditJson(selectedAuditLog.oldValue)}</pre>
                        ) : (
                          <p className="muted-text">{t('لا توجد')}</p>
                        )}
                      </div>
                      <div className="audit-json-block">
                        <h4>{t('القيمة الجديدة')}</h4>
                        {formatAuditJson(selectedAuditLog.newValue) ? (
                          <pre dir="ltr">{formatAuditJson(selectedAuditLog.newValue)}</pre>
                        ) : (
                          <p className="muted-text">{t('لا توجد')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Modal>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
