import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import {
  formatAmount,
  formatAmountInput,
  formatDate,
  formatMinor,
  getCurrencyLabel,
  initials,
  parseMinorInput,
} from '../utils/formatters';
import { financeApi, walletsApi, reportsApi, settingsApi } from '../api/client';
import { AlertIcon, ChartIcon, CoinsIcon, PlusIcon, PrinterIcon, TrendUpIcon, WalletIcon } from '../components/icons';
import { useDialog } from '../components/DialogProvider';
import { usePrint } from '../print/PrintProvider';
import { formatDocNumber, normalizePrintSettings } from '../print/printSettings';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Finance.css';

/* Labels are Arabic source text, translated when rendered. */
const TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'income', label: 'الإيرادات' },
  { id: 'expenses', label: 'المصروفات' },
  { id: 'withdrawals', label: 'السحوبات' },
  { id: 'refunds', label: 'الاستردادات' },
];

const OPEN_REFUND = ['initiated', 'under_review', 'approved'];
const REFUND_FILTERS = [
  { id: 'open', label: 'بانتظار الإجراء' },
  { id: 'processed', label: 'تم الصرف' },
  { id: 'rejected', label: 'مرفوض' },
  { id: 'all', label: 'الكل' },
];
const WITHDRAWAL_DONE = {
  under_review: 'تم تحويل الطلب إلى المراجعة',
  approved: 'تمت الموافقة على طلب السحب',
  rejected: 'تم رفض طلب السحب',
  paid: 'تم تسجيل دفع الطلب',
};
const REFUND_DONE = {
  under_review: 'تم تحويل طلب الاسترداد إلى المراجعة',
  approved: 'تمت الموافقة على طلب الاسترداد',
  rejected: 'تم رفض طلب الاسترداد',
  processed: 'تم صرف مبلغ الاسترداد',
};
const PRINT_AFTER_KEY = 'algo_print_after_voucher';

function readPrintAfter() {
  try {
    return localStorage.getItem(PRINT_AFTER_KEY) !== '0';
  } catch {
    return true;
  }
}

/** "Print the voucher after saving", remembered on this device. */
function PrintAfterCheck({ checked, onChange }) {
  const { t } = useI18n();
  const toggle = (value) => {
    onChange(value);
    try {
      localStorage.setItem(PRINT_AFTER_KEY, value ? '1' : '0');
    } catch {
      // remembered for this page only
    }
  };
  return (
    <label className="finance-check">
      <input type="checkbox" checked={checked} onChange={(e) => toggle(e.target.checked)} />
      {t('طباعة السند بعد الحفظ')}
    </label>
  );
}

/* Recharts styling per the design system (rule 8) */
const AXIS_TICK = { fill: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 12 };
const AXIS_LINE = { stroke: 'var(--line)' };
const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  boxShadow: 'var(--sh-2)',
};
const TOOLTIP_LABEL = { color: 'var(--ink)', fontWeight: 700, marginBottom: 4 };
const TOOLTIP_ITEM = { color: 'var(--ink-soft)' };
const TOOLTIP_CURSOR = { fill: 'var(--surface-2)', opacity: 0.7 };
const LEGEND_STYLE = { fontFamily: 'var(--font-body)', fontSize: 13, paddingTop: 12 };
const BAR_RADIUS = [6, 6, 0, 0];
// Below this the bars thin out to hairlines, so the chart keeps this width and its
// card scrolls sideways on a phone (.chart-scroll).
const CHART_MIN_WIDTH = 520;

function FormError({ message }) {
  const { td } = useI18n();
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      <AlertIcon size={16} />
      {td(message)}
    </p>
  );
}

export default function Finance() {
  const { hasPrivilege, settings: appSettings } = useApp();
  const { t, td } = useI18n();
  const toast = useToast();
  const { confirm } = useDialog();
  const openPrint = usePrint();
  const printSettings = normalizePrintSettings(appSettings?.printSettings);
  const docNumber = (type, n) =>
    formatDocNumber(printSettings.docs[type].prefix, n, printSettings.look.numberPadding);
  const [refunds, setRefunds] = useState([]);
  const [refundFilter, setRefundFilter] = useState('open');
  const [printAfter, setPrintAfter] = useState(readPrintAfter);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const tabIds = TABS.map((tab) => tab.id);
  const [activeTab, setActiveTab] = useState(tabIds.includes(urlTab) ? urlTab : 'overview');
  const [pnl, setPnl] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [expenses, setExpenses] = useState([]);
  // The payments income is derived from, so the income tab can show its own detail.
  const [payments, setPayments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ownerWithdrawals, setOwnerWithdrawals] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ amountMinor: '', reason: '', spentAt: new Date().toISOString().slice(0, 10) });
  const [walletForm, setWalletForm] = useState({ amountMinor: '', reason: '' });
  const [expenseForm, setExpenseForm] = useState({ categoryId: '', amountMinor: '', reason: '', spentAt: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  // Holds the API error message; shown through td() so it follows the language toggle.
  const [error, setError] = useState('');

  const isAdmin = hasPrivilege('admin');
  const isManager = hasPrivilege('admin') || hasPrivilege('accountant');
  const currency = getCurrencyLabel();

  const loadData = async () => {
    setLoading(true);
    try {
      const [pnlData, cfData, expData, payData, cats, ownerData, pendingData, refundData] = await Promise.all([
        reportsApi.pnl().catch(() => null),
        reportsApi.cashflow(6).catch(() => []),
        financeApi.expenses().catch(() => []),
        financeApi.payments().catch(() => []),
        settingsApi.expenseCategories().catch(() => []),
        isAdmin ? financeApi.ownerWithdrawals().catch(() => []) : Promise.resolve([]),
        walletsApi.pendingWithdrawals().catch(() => []),
        walletsApi.refunds().catch(() => []),
      ]);
      setPnl(pnlData);
      setCashflow(cfData);
      setExpenses(expData);
      setPayments(Array.isArray(payData) ? payData : []);
      setCategories(cats);
      setOwnerWithdrawals(ownerData);
      setPendingWithdrawals(pendingData);
      setRefunds(Array.isArray(refundData) ? refundData : []);
      if (!hasPrivilege('admin') && !hasPrivilege('accountant')) {
        const w = await walletsApi.me().catch(() => null);
        setWallet(w);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch once on mount (unchanged behaviour); loadData reads the latest privileges at call time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  // The open tab lives in the address, so a tab can be linked to and survives a refresh.
  useEffect(() => {
    if (tabIds.includes(urlTab) && urlTab !== activeTab) setActiveTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (id) => {
    setActiveTab(id);
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  // month is "YYYY-MM" from the API, so the axis reads the same in both languages.
  const chartData = cashflow.map((m) => ({
    month: m.month,
    income: Number(m.income),
    expenses: Number(m.expenses),
    net: Number(m.netProfit),
  }));

  const netProfit = pnl ? Number(pnl.netProfit) : 0;
  const lastNet = chartData.length ? chartData[chartData.length - 1].net : 0;

  const openModal = (setter) => {
    setError('');
    setter(true);
  };

  const handleOwnerWithdrawal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await financeApi.createOwnerWithdrawal({
        amountMinor: parseMinorInput(ownerForm.amountMinor),
        reason: ownerForm.reason,
        spentAt: ownerForm.spentAt,
      });
      setShowOwnerModal(false);
      toast.success(t('تم تسجيل سحب المالك'));
      await loadData();
      if (printAfter && created?.id) openPrint('owner_withdrawal', created.id);
    } catch (err) {
      setError(err.message);
      toast.error(err.message || t('تعذّر تسجيل السحب'));
    } finally {
      setSaving(false);
    }
  };

  const handleWalletWithdrawal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await walletsApi.requestWithdrawal({
        amountMinor: parseMinorInput(walletForm.amountMinor),
        reason: walletForm.reason,
      });
      setShowWalletModal(false);
      toast.success(t('تم إرسال طلب السحب'));
      await loadData();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || t('تعذّر إرسال طلب السحب'));
    } finally {
      setSaving(false);
    }
  };

  const handleExpense = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await financeApi.createExpense({
        categoryId: expenseForm.categoryId,
        amountMinor: parseMinorInput(expenseForm.amountMinor),
        reason: expenseForm.reason,
        spentAt: expenseForm.spentAt,
      });
      setShowExpenseModal(false);
      toast.success(t('تم تسجيل المصروف'));
      await loadData();
      if (printAfter && created?.id) openPrint('expense', created.id);
    } catch (err) {
      setError(err.message);
      toast.error(err.message || t('تعذّر تسجيل المصروف'));
    } finally {
      setSaving(false);
    }
  };

  // requested → under_review → approved → paid (or rejected); the backend refuses skipped steps.
  const handleWithdrawalTransition = async (row, toStatus) => {
    const name = row.wallet?.owner?.fullName || '—';
    const amount = formatMinor(row.amountMinor);
    if (toStatus === 'rejected') {
      const ok = await confirm({
        title: t('رفض طلب السحب'),
        message: t('سيُرفض طلب {name} بقيمة {amount}. هل تريد المتابعة؟', { name, amount }),
        confirmLabel: t('رفض'),
        danger: true,
      });
      if (!ok) return;
    }
    if (toStatus === 'paid') {
      const ok = await confirm({
        title: t('تسجيل الدفع'),
        message: t('سيُخصم {amount} من محفظة {name}. هل سُلّم المبلغ؟', { name, amount }),
        confirmLabel: t('تسجيل الدفع'),
      });
      if (!ok) return;
    }
    try {
      await walletsApi.transitionWithdrawal(row.id, toStatus);
      toast.success(t(WITHDRAWAL_DONE[toStatus]));
      await loadData();
      if (toStatus === 'paid') openPrint('wallet_withdrawal', row.id);
    } catch (err) {
      toast.error(td(err.message) || t('تعذّر تنفيذ الإجراء'));
    }
  };

  // initiated → under_review → approved → processed (or rejected)
  const handleRefundTransition = async (row, toStatus) => {
    const name = row.enrollment?.student?.fullName || '—';
    const amount = formatMinor(row.amountMinor);
    if (toStatus === 'rejected') {
      const ok = await confirm({
        title: t('رفض طلب الاسترداد'),
        message: t('سيُرفض طلب استرداد {name} بقيمة {amount}. هل تريد المتابعة؟', { name, amount }),
        confirmLabel: t('رفض'),
        danger: true,
      });
      if (!ok) return;
    }
    if (toStatus === 'processed') {
      const ok = await confirm({
        title: t('صرف مبلغ الاسترداد'),
        message: t('سيُصرف {amount} إلى {name} ويُخصم من المبلغ المدفوع للدورة. هل تريد المتابعة؟', {
          name,
          amount,
        }),
        confirmLabel: t('صرف المبلغ'),
      });
      if (!ok) return;
    }
    try {
      await walletsApi.transitionRefund(row.id, toStatus);
      toast.success(t(REFUND_DONE[toStatus]));
      await loadData();
      if (toStatus === 'processed') openPrint('refund', row.id);
    } catch (err) {
      toast.error(td(err.message) || t('تعذّر تنفيذ الإجراء'));
    }
  };

  const printButton = (type, id, label) => (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      onClick={() => openPrint(type, id)}
      aria-label={label}
      title={label}
    >
      <PrinterIcon size={18} />
    </button>
  );
  const numberCell = (type, n) => <span className="ltr tnum fw-700">{docNumber(type, n)}</span>;
  const openRefunds = refunds.filter((r) => OPEN_REFUND.includes(r.status));
  const shownRefunds = refunds.filter((r) => {
    if (refundFilter === 'all') return true;
    if (refundFilter === 'open') return OPEN_REFUND.includes(r.status);
    return r.status === refundFilter;
  });

  const amountCell = (value) => <strong className="tnum">{formatMinor(value)}</strong>;
  const dateCell = (value) => <span className="cell-muted tnum">{formatDate(value)}</span>;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('المالية')}</h1>
          <p className="page-subtitle">{t('الإيرادات والمصروفات والتدفق النقدي')}</p>
        </div>
        <div className="page-header-actions">
          {isAdmin && (
            <button type="button" className="btn btn-secondary" onClick={() => openModal(setShowOwnerModal)}>
              <CoinsIcon />
              {t('سحب المالك')}
            </button>
          )}
          <button type="button" className="btn btn-soft" onClick={() => openModal(setShowWalletModal)}>
            <WalletIcon />
            {t('طلب سحب من المحفظة')}
          </button>
          {isManager && (
            <button type="button" className="btn btn-primary" onClick={() => openModal(setShowExpenseModal)}>
              <PlusIcon />
              {t('مصروف جديد')}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {t(tab.label)}
            {tab.id === 'withdrawals' && pendingWithdrawals.length > 0 && (
              <span className="tab-count">{pendingWithdrawals.length}</span>
            )}
            {tab.id === 'refunds' && openRefunds.length > 0 && (
              <span className="tab-count">{openRefunds.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoading title={false} tiles={4} rows={3} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <>
              <div className="grid-4 finance-kpis">
                <StatCard
                  value={pnl ? formatAmount(pnl.income) : '0'}
                  label={t('إيرادات الشهر')}
                  hint={currency}
                  icon={<TrendUpIcon />}
                />
                <StatCard
                  value={pnl ? formatAmount(pnl.expenses) : '0'}
                  label={t('مصروفات الشهر')}
                  hint={currency}
                  icon={<CoinsIcon />}
                />
                <StatCard
                  value={pnl ? formatAmount(pnl.netProfit) : '0'}
                  label={t('صافي الربح')}
                  hint={currency}
                  icon={<ChartIcon />}
                  variant={netProfit >= 0 ? 'success' : 'warning'}
                />
                <StatCard
                  value={chartData.length ? formatAmount(lastNet) : '0'}
                  label={t('التدفق النقدي (آخر شهر)')}
                  hint={currency}
                  icon={<WalletIcon />}
                />
              </div>

              <div className="card finance-chart-card">
                <div className="card-header-row">
                  <h3 className="card-title">{t('الإيرادات مقابل المصروفات')}</h3>
                  <span className="muted-text">{t('آخر 6 أشهر')}</span>
                </div>
                {chartData.length === 0 ? (
                  <EmptyState
                    icon={<ChartIcon />}
                    title={t('لا توجد بيانات مالية بعد')}
                    hint={t('ستظهر الإيرادات والمصروفات الشهرية هنا بمجرد تسجيل أول حركة.')}
                  />
                ) : (
                  <div className="finance-chart chart-scroll">
                    <ResponsiveContainer width="100%" height={300} minWidth={CHART_MIN_WIDTH}>
                      <BarChart data={chartData} barGap={4} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                        <YAxis
                          tickFormatter={(v) => formatAmount(v)}
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                          width={72}
                        />
                        <Tooltip
                          formatter={(v) => formatMinor(v)}
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={TOOLTIP_LABEL}
                          itemStyle={TOOLTIP_ITEM}
                          cursor={TOOLTIP_CURSOR}
                        />
                        <Legend
                          wrapperStyle={LEGEND_STYLE}
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => <span className="finance-legend-text">{value}</span>}
                        />
                        <Bar dataKey="income" name={t('الإيرادات')} fill="var(--chart-1)" radius={BAR_RADIUS} maxBarSize={44} />
                        <Bar dataKey="expenses" name={t('المصروفات')} fill="var(--chart-6)" radius={BAR_RADIUS} maxBarSize={44} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {wallet?.wallet && (
                <div className="card finance-wallet-card">
                  <div className="finance-wallet-main">
                    <span className="finance-wallet-icon">
                      <WalletIcon size={22} />
                    </span>
                    <div>
                      <p className="finance-wallet-label">{t('محفظتي')}</p>
                      <p className="finance-wallet-value tnum">{formatMinor(wallet.wallet.balanceMinor)}</p>
                    </div>
                  </div>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => openModal(setShowWalletModal)}>
                    <WalletIcon />
                    {t('طلب سحب')}
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'income' && (
            <div className="finance-stack">
              {pnl && (
                <div className="grid-2">
                  <StatCard
                    value={formatAmount(pnl.income)}
                    label={t('إجمالي الإيرادات')}
                    hint={currency}
                    icon={<TrendUpIcon />}
                    variant="headline"
                  />
                  <StatCard
                    value={formatAmount(pnl.netProfit)}
                    label={t('صافي الربح')}
                    hint={currency}
                    icon={<ChartIcon />}
                    variant={netProfit >= 0 ? 'success' : 'warning'}
                  />
                </div>
              )}

              <div className="card card-flush finance-table-card">
                <div className="card-header-row">
                  <h3 className="card-title">{t('دفعات الطلاب')}</h3>
                  <span className="muted-text">{t('{count} دفعة', { count: payments.length })}</span>
                </div>
                <DataTable
                  rows={payments}
                  emptyMessage={t('لا توجد دفعات مسجّلة بعد')}
                  minWidth={900}
                  columns={[
                    { key: 'number', label: t('رقم الإيصال'), render: (r) => numberCell('payment', r.receiptNo) },
                    { key: 'date', label: t('التاريخ'), render: (r) => dateCell(r.paidAt) },
                    {
                      key: 'student',
                      label: t('الطالب'),
                      render: (r) =>
                        r.enrollment?.student?.id ? (
                          <Link to={`/students/${r.enrollment.student.id}?tab=payments`}>
                            {r.enrollment.student.fullName}
                          </Link>
                        ) : (
                          <span className="cell-muted">—</span>
                        ),
                    },
                    {
                      key: 'course',
                      label: t('الدورة'),
                      render: (r) =>
                        r.enrollment?.course?.id ? (
                          <Link to={`/courses/${r.enrollment.course.id}`}>{r.enrollment.course.name}</Link>
                        ) : (
                          <span className="cell-muted">—</span>
                        ),
                    },
                    { key: 'amount', label: t('المبلغ'), render: (r) => amountCell(r.amountMinor) },
                    {
                      key: 'receivedBy',
                      label: t('استلمها'),
                      render: (r) => <span className="cell-muted">{r.receivedBy?.fullName || '—'}</span>,
                    },
                    {
                      key: 'print',
                      label: t('طباعة'),
                      render: (r) => printButton('payment', r.id, t('طباعة إيصال القبض')),
                    },
                  ]}
                />
                <p className="finance-table-foot">
                  {t('تُسجَّل الدفعات من صفحة الطالب (تبويب الدورات)، وتُحتسب الإيرادات منها تلقائياً.')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="card card-flush finance-table-card">
              <div className="card-header-row">
                <h3 className="card-title">{t('المصروفات')}</h3>
                <span className="muted-text">{t('{count} مصروف', { count: expenses.length })}</span>
              </div>
              <DataTable
                rows={expenses}
                emptyMessage={t('لا توجد مصروفات مسجّلة بعد')}
                minWidth={860}
                columns={[
                  { key: 'number', label: t('رقم السند'), render: (r) => numberCell('expense', r.voucherNo) },
                  { key: 'date', label: t('التاريخ'), render: (r) => dateCell(r.spentAt) },
                  {
                    key: 'category',
                    label: t('الفئة'),
                    render: (r) => <span className="badge tone-neutral plain">{td(r.category?.labelAr) || '—'}</span>,
                  },
                  { key: 'amount', label: t('المبلغ'), render: (r) => amountCell(r.amountMinor) },
                  { key: 'reason', label: t('السبب'), render: (r) => r.reason || '—' },
                  {
                    key: 'course',
                    label: t('الدورة'),
                    render: (r) =>
                      r.course?.id ? (
                        <Link to={`/courses/${r.course.id}`}>{r.course.name}</Link>
                      ) : (
                        <span className="cell-muted">{r.course?.name || '—'}</span>
                      ),
                  },
                  {
                    key: 'print',
                    label: t('طباعة'),
                    render: (r) => printButton('expense', r.id, t('طباعة سند الصرف')),
                  },
                ]}
              />
            </div>
          )}

          {activeTab === 'withdrawals' && (
            <div className="finance-stack">
              {isAdmin && (
                <div className="card card-flush finance-table-card">
                  <div className="card-header-row">
                    <h3 className="card-title">{t('سحوبات المالك')}</h3>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal(setShowOwnerModal)}>
                      <PlusIcon />
                      {t('سحب جديد')}
                    </button>
                  </div>
                  <DataTable
                    rows={ownerWithdrawals}
                    emptyMessage={t('لا توجد سحوبات مسجّلة')}
                    columns={[
                      {
                        key: 'number',
                        label: t('رقم السند'),
                        render: (r) => numberCell('owner_withdrawal', r.voucherNo),
                      },
                      { key: 'date', label: t('التاريخ'), render: (r) => dateCell(r.spentAt) },
                      { key: 'amount', label: t('المبلغ'), render: (r) => amountCell(r.amountMinor) },
                      { key: 'reason', label: t('السبب'), render: (r) => r.reason || '—' },
                      {
                        key: 'print',
                        label: t('طباعة'),
                        render: (r) => printButton('owner_withdrawal', r.id, t('طباعة سند السحب')),
                      },
                    ]}
                  />
                </div>
              )}

              {isManager && (
                <div className="card card-flush finance-table-card">
                  <div className="card-header-row">
                    <h3 className="card-title">{t('طلبات سحب المحافظ')}</h3>
                    <span className="muted-text">{t('{count} طلب', { count: pendingWithdrawals.length })}</span>
                  </div>
                  <DataTable
                    rows={pendingWithdrawals}
                    emptyMessage={t('لا توجد طلبات سحب معلّقة')}
                    columns={[
                      {
                        key: 'employee',
                        label: t('الموظف'),
                        render: (r) => {
                          const owner = r.wallet?.owner;
                          return (
                            <span className="cell-person">
                              <span className="avatar avatar-sm">{initials(owner?.fullName)}</span>
                              {owner?.id ? (
                                <Link
                                  to={`/employee-wallets?tab=all&wallet=${owner.id}`}
                                  className="cell-name"
                                  title={t('فتح محفظة الموظف')}
                                >
                                  {owner.fullName}
                                </Link>
                              ) : (
                                <span className="cell-name">{owner?.fullName || '—'}</span>
                              )}
                            </span>
                          );
                        },
                      },
                      { key: 'amount', label: t('المبلغ'), render: (r) => amountCell(r.amountMinor) },
                      { key: 'reason', label: t('السبب'), render: (r) => r.reason || '—' },
                      { key: 'status', label: t('الحالة'), render: (r) => <StatusBadge kind="withdrawal" value={r.status} /> },
                      {
                        key: 'actions',
                        label: t('إجراء'),
                        render: (r) => (
                          <div className="cell-actions">
                            {r.status === 'requested' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-soft"
                                onClick={() => handleWithdrawalTransition(r, 'under_review')}
                              >
                                {t('مراجعة')}
                              </button>
                            )}
                            {r.status === 'under_review' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleWithdrawalTransition(r, 'approved')}
                              >
                                {t('موافقة')}
                              </button>
                            )}
                            {r.status === 'approved' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleWithdrawalTransition(r, 'paid')}
                              >
                                {t('تسجيل الدفع')}
                              </button>
                            )}
                            {(r.status === 'requested' || r.status === 'under_review') && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-danger-text"
                                onClick={() => handleWithdrawalTransition(r, 'rejected')}
                              >
                                {t('رفض')}
                              </button>
                            )}
                            {printButton('wallet_withdrawal', r.id, t('طباعة سند الصرف'))}
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'refunds' && (
            <div className="card card-flush finance-table-card">
              <div className="card-header-row">
                <h3 className="card-title">{t('طلبات استرداد الطلاب')}</h3>
                <div className="filter-chips finance-refund-filters">
                  {REFUND_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`chip ${refundFilter === f.id ? 'active' : ''}`}
                      onClick={() => setRefundFilter(f.id)}
                    >
                      {t(f.label)}
                    </button>
                  ))}
                </div>
              </div>
              <DataTable
                rows={shownRefunds}
                minWidth={980}
                emptyMessage={
                  refundFilter === 'open' ? t('لا توجد طلبات استرداد بانتظار الإجراء') : t('لا توجد طلبات استرداد')
                }
                columns={[
                  { key: 'number', label: t('رقم السند'), render: (r) => numberCell('refund', r.voucherNo) },
                  { key: 'date', label: t('التاريخ'), render: (r) => dateCell(r.createdAt) },
                  {
                    key: 'student',
                    label: t('الطالب'),
                    render: (r) =>
                      r.enrollment?.student?.id ? (
                        <Link to={`/students/${r.enrollment.student.id}`}>{r.enrollment.student.fullName}</Link>
                      ) : (
                        '—'
                      ),
                  },
                  { key: 'course', label: t('الدورة'), render: (r) => r.enrollment?.course?.name || '—' },
                  { key: 'amount', label: t('المبلغ'), render: (r) => amountCell(r.amountMinor) },
                  { key: 'reason', label: t('السبب'), render: (r) => r.reason || '—' },
                  { key: 'status', label: t('الحالة'), render: (r) => <StatusBadge kind="refund" value={r.status} /> },
                  {
                    key: 'actions',
                    label: t('إجراء'),
                    render: (r) => (
                      <div className="cell-actions">
                        {r.status === 'initiated' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-soft"
                            onClick={() => handleRefundTransition(r, 'under_review')}
                          >
                            {t('مراجعة')}
                          </button>
                        )}
                        {r.status === 'under_review' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRefundTransition(r, 'approved')}
                          >
                            {t('موافقة')}
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRefundTransition(r, 'processed')}
                          >
                            {t('صرف المبلغ')}
                          </button>
                        )}
                        {(r.status === 'initiated' || r.status === 'under_review') && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-danger-text"
                            onClick={() => handleRefundTransition(r, 'rejected')}
                          >
                            {t('رفض')}
                          </button>
                        )}
                        {printButton('refund', r.id, t('طباعة سند الاسترداد'))}
                      </div>
                    ),
                  },
                ]}
              />
              <p className="finance-table-foot">
                {t('تُطلب الاستردادات من صفحة الطالب (تبويب الدورات)، وتُراجَع وتُصرف من هنا.')}
              </p>
            </div>
          )}
        </>
      )}

      <Modal
        open={showOwnerModal}
        onClose={() => setShowOwnerModal(false)}
        title={t('سحب المالك')}
        description={t('يُسجَّل السحب كحركة خارجة من صندوق الأكاديمية.')}
      >
        <form onSubmit={handleOwnerWithdrawal}>
          <FormError message={error} />
          <div className="form-group">
            <label htmlFor="owner-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="owner-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={ownerForm.amountMinor}
              onChange={(e) => setOwnerForm({ ...ownerForm, amountMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="owner-reason">{t('السبب')}</label>
            <textarea
              id="owner-reason"
              required
              rows={2}
              value={ownerForm.reason}
              onChange={(e) => setOwnerForm({ ...ownerForm, reason: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="owner-date">{t('التاريخ')}</label>
            <input
              id="owner-date"
              type="date"
              required
              value={ownerForm.spentAt}
              onChange={(e) => setOwnerForm({ ...ownerForm, spentAt: e.target.value })}
            />
          </div>
          <PrintAfterCheck checked={printAfter} onChange={setPrintAfter} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ السحب')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowOwnerModal(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        title={t('طلب سحب من المحفظة')}
        description={t('يُراجع الطلب من الإدارة أو المحاسبة قبل صرفه.')}
      >
        <form onSubmit={handleWalletWithdrawal}>
          <FormError message={error} />
          <div className="form-group">
            <label htmlFor="wallet-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="wallet-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={walletForm.amountMinor}
              onChange={(e) => setWalletForm({ ...walletForm, amountMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="wallet-reason">{t('السبب')}</label>
            <textarea
              id="wallet-reason"
              required
              rows={2}
              value={walletForm.reason}
              onChange={(e) => setWalletForm({ ...walletForm, reason: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الإرسال…') : t('إرسال الطلب')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowWalletModal(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title={t('مصروف جديد')}
        description={t('اختر الفئة وأدخل المبلغ وتاريخ الصرف.')}
      >
        <form onSubmit={handleExpense}>
          <FormError message={error} />
          <div className="form-group">
            <label htmlFor="expense-category">{t('الفئة')}</label>
            <select
              id="expense-category"
              required
              value={expenseForm.categoryId}
              onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
            >
              <option value="">{t('— اختر الفئة —')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {td(c.labelAr)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="expense-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="expense-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={expenseForm.amountMinor}
              onChange={(e) => setExpenseForm({ ...expenseForm, amountMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="expense-reason">{t('السبب')}</label>
            <input
              id="expense-reason"
              required
              value={expenseForm.reason}
              onChange={(e) => setExpenseForm({ ...expenseForm, reason: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="expense-date">{t('التاريخ')}</label>
            <input
              id="expense-date"
              type="date"
              required
              value={expenseForm.spentAt}
              onChange={(e) => setExpenseForm({ ...expenseForm, spentAt: e.target.value })}
            />
          </div>
          <PrintAfterCheck checked={printAfter} onChange={setPrintAfter} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الحفظ…') : t('حفظ المصروف')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowExpenseModal(false)}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
