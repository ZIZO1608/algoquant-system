import { translate, translateData } from '../i18n/core';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

function networkError() {
  const err = new Error(translate('تعذر الاتصال بالخادم'));
  err.code = 'NETWORK_ERROR';
  return err;
}

export function getAccessToken() {
  return localStorage.getItem('algo_access_token');
}

function getToken() {
  return getAccessToken();
}

function getRefreshToken() {
  return localStorage.getItem('algo_refresh_token');
}

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem('algo_access_token', accessToken);
  if (refreshToken) localStorage.setItem('algo_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('algo_access_token');
  localStorage.removeItem('algo_refresh_token');
  localStorage.removeItem('algo_auth');
}

/** Single in-flight refresh shared by api() and uploadFile() to avoid token-family revoke races. */
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token');
    let res;
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      throw networkError();
    }
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

const HAS_ARABIC = /[؀-ۿ]/;

// Some API messages are still English: they map to Arabic source text, then to the UI language.
const MESSAGES_AR = {
  'Invalid credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'Too many login attempts. Try again later.': 'محاولات دخول كثيرة. حاول مرة أخرى بعد 15 دقيقة.',
  'Too many login attempts for this account.': 'محاولات دخول كثيرة لهذا الحساب. حاول مرة أخرى بعد 15 دقيقة.',
  'Insufficient privileges': 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  'Insufficient privileges for this course': 'ليست لديك صلاحية على هذه الدورة.',
  'Insufficient privileges for this task specialty': 'ليست لديك صلاحية على مهام هذا التخصص.',
  'Insufficient privileges to access this file': 'ليست لديك صلاحية لفتح هذا الملف.',
  'Insufficient privileges to delete files': 'ليست لديك صلاحية لحذف الملفات.',
  'You are not assigned to this course': 'أنت غير مكلّف بهذه الدورة.',
  'Not assigned to this lead': 'هذا العميل المحتمل غير مسند إليك.',
  'Not a member of this conversation': 'لست عضواً في هذه المحادثة.',
  'Email already in use': 'البريد الإلكتروني مستخدم لموظف آخر.',
  'Insufficient wallet balance': 'رصيد المحفظة غير كافٍ.',
  'Insufficient balance for withdrawal': 'الرصيد غير كافٍ لطلب السحب.',
  'Invalid or expired evaluation link': 'رابط التقييم غير صالح أو انتهت صلاحيته.',
  'Internal server error': 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.',
};

const ENTITIES_AR = {
  Course: 'الدورة',
  Lead: 'العميل المحتمل',
  Student: 'الطالب',
  Task: 'المهمة',
  Session: 'الجلسة',
  Employee: 'الموظف',
  Wallet: 'المحفظة',
  File: 'الملف',
  Enrollment: 'التسجيل',
  Refund: 'طلب الاسترداد',
  Payment: 'الدفعة',
  Expense: 'المصروف',
  Withdrawal: 'السحب',
  'Document type': 'نوع المستند',
  'Withdrawal request': 'طلب السحب',
  'Salary advance': 'طلب السلفة',
  'Profit share run': 'توزيع الأرباح',
  Conversation: 'المحادثة',
};

const CODES_AR = {
  VALIDATION_ERROR: 'تحقق من البيانات المدخلة وحاول مرة أخرى.',
  UNAUTHORIZED: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
  FORBIDDEN: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  NOT_FOUND: 'العنصر المطلوب غير موجود أو تم حذفه.',
  CONFLICT: 'يتعارض هذا الإجراء مع بيانات موجودة.',
  RATE_LIMIT: 'طلبات كثيرة خلال وقت قصير. حاول مرة أخرى بعد قليل.',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة حالياً. حاول لاحقاً.',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.',
};

const STATUS_CODES = { 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMIT', 503: 'SERVICE_UNAVAILABLE' };

/** An API error as a message in the current UI language. */
export function localizedErrorMessage(message, code, status) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text && HAS_ARABIC.test(text)) return translateData(text);
  if (MESSAGES_AR[text]) return translate(MESSAGES_AR[text]);
  const notFound = /^(.+) not found$/i.exec(text);
  if (notFound && ENTITIES_AR[notFound[1]]) {
    return translate('لم يتم العثور على {entity}.', { entity: translate(ENTITIES_AR[notFound[1]]) });
  }
  const key = code || STATUS_CODES[status] || (status >= 500 ? 'INTERNAL_ERROR' : null);
  return translate(CODES_AR[key] || 'تعذّر إتمام الطلب. حاول مرة أخرى.');
}

function throwApiError(data, status) {
  const raw = data?.error?.message || (typeof data?.error === 'string' ? data.error : '');
  const code = data?.error?.code;
  const err = new Error(localizedErrorMessage(raw, code, status));
  if (code) err.code = code;
  if (status) err.status = status;
  if (data?.error?.details !== undefined) err.details = data.error.details;
  if (raw) err.serverMessage = raw;
  throw err;
}

async function doFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw networkError();
  }
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await doFetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && getRefreshToken()) {
    try {
      const newToken = await refreshAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      res = await doFetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (err) {
      if (err.code === 'NETWORK_ERROR') throw err;
      clearTokens();
      window.location.href = '/login';
      throw new Error(translate('انتهت الجلسة. سجّل الدخول مرة أخرى.'));
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwApiError(data, res.status);
  return data;
}

export const authApi = {
  login: (email, password) =>
    api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () =>
    api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: getRefreshToken() }) }),
  me: () => api('/auth/me'),
};

export const leadsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/leads${q ? `?${q}` : ''}`);
  },
  get: (id) => api(`/leads/${id}`),
  create: (body) => api('/leads', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transition: (id, toStatus, reason) =>
    api(`/leads/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus, reason }) }),
  assign: (id, employeeId) =>
    api(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ employeeId }) }),
  addNote: (id, body) =>
    api(`/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  setFollowUp: (id, nextFollowUpAt) =>
    api(`/leads/${id}/follow-up`, {
      method: 'PATCH',
      body: JSON.stringify({ nextFollowUpAt }),
    }),
  convertAndPay: (id, body) =>
    api(`/leads/${id}/convert-and-pay`, { method: 'POST', body: JSON.stringify(body) }),
};

export const coursesApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/courses${q ? `?${q}` : ''}`);
  },
  get: (id) => api(`/courses/${id}`),
  create: (body) => api('/courses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transition: (id, toStatus, reason) =>
    api(`/courses/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus, reason }) }),
  attachTemplate: (id, templateId) =>
    api(`/courses/${id}/attach-template`, { method: 'POST', body: JSON.stringify({ templateId }) }),
  replaceTemplate: (id, templateId) =>
    api(`/courses/${id}/replace-template`, { method: 'POST', body: JSON.stringify({ templateId }) }),
  updateSession: (courseId, sessionId, body) =>
    api(`/courses/${courseId}/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  evaluationCampaigns: (id) => api(`/courses/${id}/evaluation-campaigns`),
  createEvaluationCampaign: (id, body = { type: 'post_course' }) =>
    api(`/courses/${id}/evaluation-campaigns`, { method: 'POST', body: JSON.stringify(body) }),
};

export const tasksApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/tasks${q ? `?${q}` : ''}`);
  },
  update: (id, body) => api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transition: (id, toStatus) =>
    api(`/tasks/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus }) }),
  suggestedAssignees: (specialty) =>
    api(`/tasks/suggested-assignees?specialty=${encodeURIComponent(specialty)}`),
  suggestedAssigneesForTask: (id) => api(`/tasks/${id}/suggested-assignees`),
};

export const studentsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/students${q ? `?${q}` : ''}`);
  },
  get: (id) => api(`/students/${id}`),
  create: (body) => api('/students', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** Enroll student into a course — first arg is courseId. */
  enroll: (courseId, body) =>
    api(`/courses/${courseId}/enrollments`, { method: 'POST', body: JSON.stringify(body) }),
  recordPayment: (enrollmentId, body) =>
    api(`/students/enrollments/${enrollmentId}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  /** Overall student status (active, frozen, graduated, withdrawn, blocked) with an optional reason. */
  setStatus: (id, status, reason) =>
    api(`/students/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  transitionEnrollment: (enrollmentId, toStatus, reason) =>
    api(`/students/enrollments/${enrollmentId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStatus, reason }),
    }),
  voidPayment: (paymentId, reason) =>
    api(`/students/payments/${paymentId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  issueCertificate: (enrollmentId) =>
    api(`/students/enrollments/${enrollmentId}/certificates`, { method: 'POST' }),
  recordAttendance: (sessionId, records) =>
    api(`/students/sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    }),
};

export const employeesApi = {
  list: () => api('/employees'),
  get: (id) => api(`/employees/${id}`),
  create: (body) => api('/employees', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => api(`/employees/${id}`, { method: 'DELETE' }),
  setPrivileges: (id, privilegeCodes) =>
    api(`/employees/${id}/privileges`, { method: 'PUT', body: JSON.stringify({ privilegeCodes }) }),
  markAbsence: (id, body) =>
    api(`/employees/${id}/absences`, { method: 'POST', body: JSON.stringify(body) }),
  absences: (id) => api(`/employees/${id}/absences`),
  ratings: () => api('/employees/ratings'),
};

export const financeApi = {
  expenses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/finance/expenses${q ? `?${q}` : ''}`);
  },
  createExpense: (body) => api('/finance/expenses', { method: 'POST', body: JSON.stringify(body) }),
  payments: () => api('/finance/payments'),
  ownerWithdrawals: () => api('/finance/owner-withdrawals'),
  createOwnerWithdrawal: (body) =>
    api('/finance/owner-withdrawals', { method: 'POST', body: JSON.stringify(body) }),
  profitShare: (period) => api(`/finance/profit-share/${period}`),
  computeProfitShare: (period) =>
    api(`/finance/profit-share/${period}/compute`, { method: 'POST' }),
  approveProfitShare: (period) =>
    api(`/finance/profit-share/${period}/approve`, { method: 'POST' }),
  rejectProfitShare: (period) =>
    api(`/finance/profit-share/${period}/reject`, { method: 'POST' }),
};

export const walletsApi = {
  me: () => api('/wallets/me'),
  list: () => api('/wallets'),
  get: (ownerId) => api(`/wallets/${ownerId}`),
  requestWithdrawal: (body) =>
    api('/wallets/withdrawals', { method: 'POST', body: JSON.stringify(body) }),
  pendingWithdrawals: () => api('/wallets/withdrawals/pending'),
  transitionWithdrawal: (id, toStatus) =>
    api(`/wallets/withdrawals/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus }) }),
  requestAdvance: (body) =>
    api('/wallets/advances', { method: 'POST', body: JSON.stringify(body) }),
  pendingAdvances: () => api('/wallets/advances/pending'),
  transitionAdvance: (id, toStatus) =>
    api(`/wallets/advances/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus }) }),
  initiateRefund: (body) =>
    api('/wallets/refunds', { method: 'POST', body: JSON.stringify(body) }),
  transitionRefund: (id, toStatus) =>
    api(`/wallets/refunds/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus }) }),
  refunds: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/wallets/refunds${q ? `?${q}` : ''}`);
  },
};

/** Printable documents: type is payment | expense | refund | owner_withdrawal | wallet_withdrawal | statement. */
export const documentsApi = {
  get: (type, id) => api(`/documents/${type}/${id}`),
  numbering: () => api('/documents/numbering'),
  setNextNumber: (type, next) =>
    api(`/documents/numbering/${type}`, { method: 'PUT', body: JSON.stringify({ next }) }),
};

export const reportsApi = {
  dashboard: () => api('/dashboard'),
  marketing: () => api('/reports/marketing'),
  leadDemand: () => api('/reports/lead-demand'),
  pnl: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/reports/pnl${q ? `?${q}` : ''}`);
  },
  cashflow: (months = 6) => api(`/reports/cashflow?months=${months}`),
  evaluations: () => api('/reports/evaluations'),
  coursePerformance: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/reports/course-performance${q ? `?${q}` : ''}`);
  },
  stuckLifecycle: () => api('/reports/stuck-lifecycle'),
  employeePerformance: () => api('/reports/employee-performance'),
  courseCosts: (courseId) => api(`/reports/course-costs/${courseId}`),
};

export const settingsApi = {
  get: () => api('/settings'),
  update: (body) => api('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  tracks: () => api('/settings/tracks'),
  createTrack: (body) => api('/settings/tracks', { method: 'POST', body: JSON.stringify(body) }),
  updateTrack: (id, body) => api(`/settings/tracks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTrack: (id) => api(`/settings/tracks/${id}`, { method: 'DELETE' }),
  expenseCategories: () => api('/settings/expense-categories'),
  createExpenseCategory: (body) =>
    api('/settings/expense-categories', { method: 'POST', body: JSON.stringify(body) }),
  updateExpenseCategory: (id, body) =>
    api(`/settings/expense-categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExpenseCategory: (id) => api(`/settings/expense-categories/${id}`, { method: 'DELETE' }),
  leadSources: () => api('/settings/lead-sources'),
  createLeadSource: (body) =>
    api('/settings/lead-sources', { method: 'POST', body: JSON.stringify(body) }),
  updateLeadSource: (id, body) =>
    api(`/settings/lead-sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLeadSource: (id) => api(`/settings/lead-sources/${id}`, { method: 'DELETE' }),
  stakeholderRules: () => api('/settings/stakeholder-rules'),
  createStakeholderRule: (body) =>
    api('/settings/stakeholder-rules', { method: 'POST', body: JSON.stringify(body) }),
  updateStakeholderRule: (id, body) =>
    api(`/settings/stakeholder-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteStakeholderRule: (id) => api(`/settings/stakeholder-rules/${id}`, { method: 'DELETE' }),
  taskTemplates: () => api('/settings/task-path-templates'),
  taskTemplate: (id) => api(`/settings/task-path-templates/${id}`),
  createTaskTemplate: (body) =>
    api('/settings/task-path-templates', { method: 'POST', body: JSON.stringify(body) }),
  updateTaskTemplate: (id, body) =>
    api(`/settings/task-path-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addTaskTemplateItem: (id, body) =>
    api(`/settings/task-path-templates/${id}/items`, { method: 'POST', body: JSON.stringify(body) }),
  updateTaskTemplateItem: (itemId, body) =>
    api(`/settings/task-path-templates/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTaskTemplateItem: (itemId) =>
    api(`/settings/task-path-templates/items/${itemId}`, { method: 'DELETE' }),
  reorderTaskTemplateItems: (id, orderedIds) =>
    api(`/settings/task-path-templates/${id}/items/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),
  webhook: () => api('/settings/webhook'),
  rotateWebhookSecret: () => api('/settings/webhook/rotate-secret', { method: 'POST' }),
  webhookLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/settings/webhook/logs${q ? `?${q}` : ''}`);
  },
  auditLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/settings/audit-logs${q ? `?${q}` : ''}`);
  },
  siteChat: () => api('/settings/site-chat'),
  updateSiteChat: (body) => api('/settings/site-chat', { method: 'PATCH', body: JSON.stringify(body) }),
  rotateSiteChatToken: () => api('/settings/site-chat/rotate-token', { method: 'POST' }),
  testSiteChat: () => api('/settings/site-chat/test', { method: 'POST' }),
  syncSiteChat: (body = {}) => api('/settings/site-chat/sync', { method: 'POST', body: JSON.stringify(body) }),
};

/** Website bot conversations (algoquant.vip) — readable by every employee. */
export const siteChatsApi = {
  list: (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const q = new URLSearchParams(clean).toString();
    return api(`/site-chats${q ? `?${q}` : ''}`);
  },
  stats: () => api('/site-chats/stats'),
  get: (id) => api(`/site-chats/${id}`),
};

export const notificationsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/notifications${q ? `?${q}` : ''}`);
  },
  unreadCount: () => api('/notifications/unread-count'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => api('/notifications/read-all', { method: 'POST' }),
};

export const conversationsApi = {
  list: () => api('/conversations'),
  createDm: (employeeId) =>
    api('/conversations/dm', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  team: () => api('/conversations/team'),
  getMessages: (id) => api(`/conversations/${id}/messages`),
  sendMessage: (id, body, attachments) =>
    api(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    }),
  markRead: (id) => api(`/conversations/${id}/read`, { method: 'POST' }),
};

export async function uploadFile(file, purpose = 'chat', extras = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('purpose', purpose);
  if (extras.entityType) fd.append('entityType', extras.entityType);
  if (extras.entityId) fd.append('entityId', extras.entityId);
  const headers = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await doFetch(`${API_BASE}/files/upload`, { method: 'POST', headers, body: fd });

  if (res.status === 401 && getRefreshToken()) {
    try {
      const newToken = await refreshAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      res = await doFetch(`${API_BASE}/files/upload`, { method: 'POST', headers, body: fd });
    } catch (err) {
      if (err.code === 'NETWORK_ERROR') throw err;
      clearTokens();
      window.location.href = '/login';
      throw new Error(translate('انتهت الجلسة. سجّل الدخول مرة أخرى.'));
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwApiError(data, res.status);
  return data;
}

export const filesApi = {
  upload: uploadFile,
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api(`/files${q ? `?${q}` : ''}`);
  },
  getUrl: (id) => api(`/files/${id}/url`),
  remove: (id) => api(`/files/${id}`, { method: 'DELETE' }),
};

export const publicApi = {
  getEvaluation: (token) => api(`/public/evaluations/${token}`),
  submitEvaluation: (token, body) =>
    api(`/public/evaluations/${token}`, { method: 'POST', body: JSON.stringify(body) }),
};
