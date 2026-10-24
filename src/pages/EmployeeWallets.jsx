import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { PageLoading } from '../components/Skeleton';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useDialog } from '../components/DialogProvider';
import { useI18n } from '../i18n';
import {
  formatAmountInput,
  formatDate,
  formatDateTime,
  formatMinor,
  getCurrencyLabel,
  initials,
  parseMinorInput,
} from '../utils/formatters';
import { walletsApi } from '../api/client';
import { AlertIcon, ExternalIcon, PlusIcon, PrinterIcon, WalletIcon } from '../components/icons';
import { usePrint } from '../print/PrintProvider';
import './EmployeeWallets.css';

/* Labels are Arabic source text, translated when rendered. */
/** Tab ids, also the values the ?tab= link uses. */
const WALLET_TABS = ['mine', 'all', 'requests'];

const TX_TYPE_LABELS = {
  credit_hours: 'أجر جلسات',
  credit_profit_share: 'حصة أرباح',
  credit_salary: 'راتب',
  debit_withdrawal: 'سحب',
  debit_advance: 'خصم سلفة',
  reversal_refund: 'عكس استرداد',
  reversal_session_cancel: 'إلغاء جلسة',
  adjustment: 'تعديل / سلفة',
};

const WITHDRAWAL_TOASTS = {
  under_review: 'تم تحويل الطلب إلى المراجعة',
  approved: 'تمت الموافقة على طلب السحب',
  rejected: 'تم رفض طلب السحب',
  paid: 'تم تسجيل دفع الطلب',
};

const employmentLabel = (isSalaried, t) => (isSalaried ? t('راتب ثابت') : t('بدون راتب ثابت'));

/** Tone derived from the transaction type prefix: credit_ / debit_ / reversal_ / adjustment */
function txTone(type = '') {
  if (type.startsWith('credit_')) return 'success';
  if (type.startsWith('debit_')) return 'danger';
  if (type.startsWith('reversal_')) return 'warning';
  return 'neutral';
}

function TxTypeBadge({ type }) {
  const { t } = useI18n();
  const label = TX_TYPE_LABELS[type];
  return <span className={`badge tone-${txTone(type)}`}>{label ? t(label) : type || '—'}</span>;
}

function SignedAmount({ value }) {
  const n = Number(value ?? 0);
  const negative = n < 0;
  return (
    <span className={negative ? 'amount-negative' : 'amount-positive'}>
      {negative ? '−' : '+'}
      {formatMinor(Math.abs(n))}
    </span>
  );
}

/** onOpen makes the name open that employee's wallet; without it the name is plain text. */
function PersonCell({ name, email, onOpen }) {
  return (
    <span className="cell-person">
      <span className="avatar">{initials(name)}</span>
      <span className="cell-stack">
        {onOpen ? (
          <button type="button" className="cell-name wallet-person-link" onClick={onOpen}>
            {name || '—'}
          </button>
        ) : (
          <span className="cell-name">{name || '—'}</span>
        )}
        {email && <span className="cell-muted ltr">{email}</span>}
      </span>
    </span>
  );
}

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

export default function EmployeeWallets() {
  const { hasPrivilege } = useApp();
  const { t, td } = useI18n();
  const toast = useToast();
  const { confirm } = useDialog();
  const openPrint = usePrint();
  const isManager = hasPrivilege('admin') || hasPrivilege('accountant');

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const urlWallet = searchParams.get('wallet');
  const defaultTab = isManager ? 'all' : 'mine';
  const [tab, setTab] = useState(WALLET_TABS.includes(urlTab) ? urlTab : defaultTab);
  const [mine, setMine] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [pendingAdvances, setPendingAdvances] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  // Holds an API message or an Arabic fallback key; shown through td() so it follows the language toggle.
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAdvance, setShowAdvance] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [withdrawForm, setWithdrawForm] = useState({ amountMinor: '', reason: '' });

  const currency = getCurrencyLabel();

  const txColumns = useMemo(
    () => [
      { key: 'type', label: t('النوع'), render: (tx) => <TxTypeBadge type={tx.type} /> },
      { key: 'amount', label: t('المبلغ'), render: (tx) => <SignedAmount value={tx.amountMinor} /> },
      {
        key: 'balanceAfter',
        label: t('الرصيد بعد الحركة'),
        render: (tx) => <span className="tnum">{formatMinor(tx.balanceAfterMinor)}</span>,
      },
      // Ledger reasons are generated by the server ("راتب 2026-09", "جلسة 3 — …") or typed by the requester.
      { key: 'reason', label: t('السبب'), render: (tx) => td(tx.reason) || '—' },
      { key: 'date', label: t('التاريخ'), render: (tx) => <span className="cell-muted">{formatDateTime(tx.createdAt)}</span> },
      {
        key: 'print',
        label: '',
        render: (tx) =>
          tx.type === 'debit_withdrawal' && tx.referenceType === 'wallet_withdrawal' && tx.referenceId ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => openPrint('wallet_withdrawal', tx.referenceId)}
              aria-label={t('طباعة سند الصرف')}
              title={t('طباعة سند الصرف')}
            >
              <PrinterIcon size={18} />
            </button>
          ) : null,
      },
    ],
    [t, td, openPrint]
  );

  const detailTxColumns = useMemo(() => txColumns.filter((c) => c.key !== 'balanceAfter'), [txColumns]);

  const advanceColumns = useMemo(
    () => [
      { key: 'amount', label: t('المبلغ'), render: (a) => <strong className="tnum">{formatMinor(a.amountMinor)}</strong> },
      { key: 'status', label: t('الحالة'), render: (a) => <StatusBadge kind="advance" value={a.status} /> },
      { key: 'date', label: t('تاريخ الطلب'), render: (a) => <span className="cell-muted">{formatDate(a.requestedAt)}</span> },
    ],
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const me = await walletsApi.me();
      setMine(me);
      if (isManager) {
        const [list, advances, withdrawals] = await Promise.all([
          walletsApi.list().catch(() => []),
          walletsApi.pendingAdvances().catch(() => []),
          walletsApi.pendingWithdrawals().catch(() => []),
        ]);
        setWallets(list);
        setPendingAdvances(advances);
        setPendingWithdrawals(withdrawals);
      }
    } catch (err) {
      setError(err.message || 'تعذر تحميل المحافظ');
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => { load(); }, [load]);

  const openWallet = useCallback(
    async (ownerId) => {
      try {
        const detail = await walletsApi.get(ownerId);
        setSelected(detail);
      } catch (err) {
        toast.error(err.message || t('تعذّر فتح تفاصيل المحفظة'));
      }
    },
    // toast and t are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // The open tab and the open wallet live in the address, so both can be linked to.
  useEffect(() => {
    if (WALLET_TABS.includes(urlTab) && urlTab !== tab) setTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!urlWallet) {
      setSelected(null);
      return;
    }
    if (selected?.employee?.id === urlWallet) return;
    openWallet(urlWallet);
  }, [urlWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (key, value, fallback) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const selectTab = (id) => {
    setTab(id);
    setParam('tab', id, defaultTab);
  };

  const showWallet = (ownerId) => setParam('wallet', ownerId);
  const closeWallet = () => setParam('wallet', null);

  const openAdvance = () => {
    setError('');
    setShowAdvance(true);
  };
  const closeAdvance = () => {
    setShowAdvance(false);
    setError('');
  };
  const openWithdraw = () => {
    setError('');
    setShowWithdraw(true);
  };
  const closeWithdraw = () => {
    setShowWithdraw(false);
    setError('');
  };

  const handleAdvance = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await walletsApi.requestAdvance({ amountMinor: parseMinorInput(advanceAmount) });
      setShowAdvance(false);
      setAdvanceAmount('');
      toast.success(t('تم إرسال طلب السلفة'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await walletsApi.requestWithdrawal({
        amountMinor: parseMinorInput(withdrawForm.amountMinor),
        reason: withdrawForm.reason,
      });
      setShowWithdraw(false);
      setWithdrawForm({ amountMinor: '', reason: '' });
      toast.success(t('تم إرسال طلب السحب'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceTransition = async (id, toStatus) => {
    if (toStatus === 'rejected') {
      const ok = await confirm({
        title: t('رفض طلب السلفة'),
        message: t('سيتم رفض طلب السلفة نهائياً ولن يُضاف المبلغ إلى محفظة الموظف. هل تريد المتابعة؟'),
        confirmLabel: t('رفض الطلب'),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await walletsApi.transitionAdvance(id, toStatus);
      toast.success(toStatus === 'approved' ? t('تم اعتماد طلب السلفة') : t('تم رفض طلب السلفة|toast'));
      await load();
      if (selected?.employee?.id) await openWallet(selected.employee.id);
    } catch (err) {
      toast.error(err.message || t('تعذّر تنفيذ الإجراء'));
    }
  };

  const handleWithdrawalTransition = async (id, toStatus) => {
    if (toStatus === 'rejected') {
      const ok = await confirm({
        title: t('رفض طلب السحب'),
        message: t('سيتم رفض طلب السحب ولن يُصرف المبلغ من المحفظة. هل تريد المتابعة؟'),
        confirmLabel: t('رفض الطلب'),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await walletsApi.transitionWithdrawal(id, toStatus);
      toast.success(t(WITHDRAWAL_TOASTS[toStatus] || 'تم تحديث الطلب'));
      await load();
      // The payout is the moment the employee signs the voucher.
      if (toStatus === 'paid') openPrint('wallet_withdrawal', id);
    } catch (err) {
      toast.error(err.message || t('تعذّر تنفيذ الإجراء'));
    }
  };

  const mySalaried = mine?.employee?.isSalaried;
  const canRequestAdvance = !!mySalaried;
  // Withdrawing more than the balance is refused by the server, so say so before the click.
  const myBalanceMinor = Number(mine?.wallet?.balanceMinor ?? 0);
  const canWithdraw = myBalanceMinor > 0;
  const requestCount = pendingAdvances.length + pendingWithdrawals.length;
  const showMine = (tab === 'mine' || !isManager) && mine;
  const myTransactions = mine?.transactions || [];
  const myAdvances = mine?.advances || [];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('محافظ الموظفين')}</h1>
          <p className="page-subtitle">{t('الأرصدة والسلف وطلبات السحب')}</p>
        </div>
        <div className="page-header-actions">
          {canRequestAdvance && (
            <button type="button" className="btn btn-secondary" onClick={openAdvance}>
              <PlusIcon />
              {t('طلب سلفة|verb')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={openWithdraw}
            disabled={!canWithdraw}
            title={canWithdraw ? undefined : t('لا يوجد رصيد في محفظتك للسحب منه')}
          >
            <WalletIcon />
            {t('طلب سحب')}
          </button>
        </div>
      </div>

      {!showAdvance && !showWithdraw && <FormError message={error} />}

      {isManager && (
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => selectTab('mine')}>
            {t('محفظتي')}
          </button>
          <button type="button" className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => selectTab('all')}>
            {t('كل المحافظ')}
            {wallets.length > 0 && <span className="tab-count">{wallets.length}</span>}
          </button>
          <button type="button" className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => selectTab('requests')}>
            {t('الطلبات')}
            {requestCount > 0 && <span className="tab-count">{requestCount}</span>}
          </button>
        </div>
      )}

      {loading ? (
        <PageLoading title={false} tiles={1} rows={4} />
      ) : (
        <>
          {showMine && (
            <div className="wallet-stack">
              <section className="card wallet-balance-card">
                <div className="wallet-balance-glow" aria-hidden="true" />
                <div className="wallet-balance-main">
                  <span className="wallet-balance-chip">
                    <WalletIcon size={26} />
                  </span>
                  <div className="wallet-balance-text">
                    <span className="wallet-balance-label">{t('رصيد محفظتك')}</span>
                    <span className="wallet-balance-value tnum">{formatMinor(mine.wallet?.balanceMinor)}</span>
                  </div>
                </div>
                <div className="wallet-balance-meta">
                  <span className="badge tone-neutral plain">{employmentLabel(mySalaried, t)}</span>
                  {mySalaried && mine.employee?.monthlySalaryMinor != null && (
                    <span className="wallet-balance-salary">
                      {t('الراتب الشهري')}
                      <strong className="tnum">{formatMinor(mine.employee.monthlySalaryMinor)}</strong>
                    </span>
                  )}
                </div>
              </section>

              <div className="card card-flush wallet-table-card">
                <div className="card-header-row">
                  <h3 className="card-title">{t('الحركات')}</h3>
                  <span className="muted-text">{t('{count} حركة', { count: myTransactions.length })}</span>
                </div>
                {myTransactions.length === 0 ? (
                  <EmptyState
                    icon={<WalletIcon />}
                    title={t('لا توجد حركات بعد')}
                    hint={t('ستظهر هنا أجور الجلسات وحصص الأرباح والسحوبات فور تسجيلها.')}
                  />
                ) : (
                  <DataTable rows={myTransactions} columns={txColumns} />
                )}
              </div>

              {myAdvances.length > 0 && (
                <div className="card card-flush wallet-table-card">
                  <div className="card-header-row">
                    <h3 className="card-title">{t('طلبات السلفة')}</h3>
                    <span className="muted-text">{t('{count} طلب', { count: myAdvances.length })}</span>
                  </div>
                  <DataTable rows={myAdvances} columns={advanceColumns} />
                </div>
              )}
            </div>
          )}

          {isManager && tab === 'all' && (
            <div className="card card-flush wallet-table-card">
              <div className="card-header-row">
                <h3 className="card-title">{t('محافظ الموظفين')}</h3>
                <span className="muted-text">{t('{count} محفظة', { count: wallets.length })}</span>
              </div>
              {wallets.length === 0 ? (
                <EmptyState icon={<WalletIcon />} title={t('لا توجد محافظ')} />
              ) : (
                <DataTable
                  rows={wallets}
                  columns={[
                    {
                      key: 'employee',
                      label: t('الموظف'),
                      render: (w) => <PersonCell name={w.owner?.fullName} email={w.owner?.email} />,
                    },
                    {
                      key: 'type',
                      label: t('نوع التوظيف'),
                      render: (w) => <span className="badge tone-neutral plain">{employmentLabel(w.owner?.isSalaried, t)}</span>,
                    },
                    {
                      key: 'balance',
                      label: t('الرصيد'),
                      render: (w) => <strong className="tnum">{formatMinor(w.balanceMinor)}</strong>,
                    },
                    {
                      key: 'actions',
                      label: '',
                      align: 'end',
                      render: (w) => (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => showWallet(w.ownerId || w.owner?.id)}
                        >
                          <ExternalIcon />
                          {t('التفاصيل')}
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          )}

          {isManager && tab === 'requests' && (
            <div className="wallet-stack">
              <div className="card card-flush wallet-table-card">
                <div className="card-header-row">
                  <h3 className="card-title">{t('طلبات السلفة')}</h3>
                  {pendingAdvances.length > 0 && (
                    <span className="badge tone-warning">{t('{count} بانتظار القرار', { count: pendingAdvances.length })}</span>
                  )}
                </div>
                {pendingAdvances.length === 0 ? (
                  <EmptyState icon={<WalletIcon />} title={t('لا توجد طلبات معلقة')} />
                ) : (
                  <DataTable
                    rows={pendingAdvances}
                    columns={[
                      {
                        key: 'employee',
                        label: t('الموظف'),
                        render: (a) => (
                          <PersonCell
                            name={a.employee?.fullName}
                            email={a.employee?.email}
                            onOpen={a.employee?.id ? () => showWallet(a.employee.id) : undefined}
                          />
                        ),
                      },
                      {
                        key: 'amount',
                        label: t('المبلغ'),
                        render: (a) => <strong className="tnum">{formatMinor(a.amountMinor)}</strong>,
                      },
                      {
                        key: 'date',
                        label: t('تاريخ الطلب'),
                        render: (a) => <span className="cell-muted">{formatDate(a.requestedAt)}</span>,
                      },
                      {
                        key: 'actions',
                        label: t('إجراء'),
                        render: (a) => (
                          <span className="cell-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleAdvanceTransition(a.id, 'approved')}
                            >
                              {t('اعتماد')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-text btn-sm"
                              onClick={() => handleAdvanceTransition(a.id, 'rejected')}
                            >
                              {t('رفض')}
                            </button>
                          </span>
                        ),
                      },
                    ]}
                  />
                )}
              </div>

              <div className="card card-flush wallet-table-card">
                <div className="card-header-row">
                  <h3 className="card-title">{t('طلبات السحب')}</h3>
                  {pendingWithdrawals.length > 0 && (
                    <span className="badge tone-warning">{t('{count} قيد المعالجة', { count: pendingWithdrawals.length })}</span>
                  )}
                </div>
                {pendingWithdrawals.length === 0 ? (
                  <EmptyState icon={<WalletIcon />} title={t('لا توجد طلبات معلقة')} />
                ) : (
                  <DataTable
                    rows={pendingWithdrawals}
                    columns={[
                      {
                        key: 'employee',
                        label: t('الموظف'),
                        render: (w) => (
                          <PersonCell
                            name={w.wallet?.owner?.fullName}
                            email={w.wallet?.owner?.email}
                            onOpen={w.wallet?.owner?.id ? () => showWallet(w.wallet.owner.id) : undefined}
                          />
                        ),
                      },
                      {
                        key: 'amount',
                        label: t('المبلغ'),
                        render: (w) => <strong className="tnum">{formatMinor(w.amountMinor)}</strong>,
                      },
                      { key: 'status', label: t('الحالة'), render: (w) => <StatusBadge kind="withdrawal" value={w.status} /> },
                      { key: 'reason', label: t('السبب'), render: (w) => w.reason || '—' },
                      {
                        key: 'actions',
                        label: t('إجراء'),
                        render: (w) => (
                          <span className="cell-actions">
                            {w.status === 'requested' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleWithdrawalTransition(w.id, 'under_review')}
                              >
                                {t('مراجعة')}
                              </button>
                            )}
                            {w.status === 'under_review' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleWithdrawalTransition(w.id, 'approved')}
                                >
                                  {t('موافقة')}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger-text btn-sm"
                                  onClick={() => handleWithdrawalTransition(w.id, 'rejected')}
                                >
                                  {t('رفض')}
                                </button>
                              </>
                            )}
                            {w.status === 'approved' && (
                              <button
                                type="button"
                                className="btn btn-soft btn-sm"
                                onClick={() => handleWithdrawalTransition(w.id, 'paid')}
                              >
                                {t('تم الدفع')}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => openPrint('wallet_withdrawal', w.id)}
                              aria-label={t('طباعة سند الصرف')}
                              title={t('طباعة سند الصرف')}
                            >
                              <PrinterIcon size={18} />
                            </button>
                          </span>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!selected}
        onClose={closeWallet}
        title={selected?.employee?.fullName || t('تفاصيل المحفظة')}
        description={selected?.employee?.email ? <span className="ltr">{selected.employee.email}</span> : undefined}
        size="lg"
      >
        {selected && (
          <div className="wallet-detail">
            <div className="wallet-detail-summary">
              <div className="wallet-detail-stat">
                <span className="wallet-detail-label">{t('الرصيد الحالي')}</span>
                <strong className="wallet-detail-value tnum">{formatMinor(selected.wallet?.balanceMinor)}</strong>
              </div>
              {selected.employee?.isSalaried && selected.employee?.monthlySalaryMinor != null && (
                <div className="wallet-detail-stat">
                  <span className="wallet-detail-label">{t('الراتب الشهري')}</span>
                  <strong className="wallet-detail-value tnum">{formatMinor(selected.employee.monthlySalaryMinor)}</strong>
                </div>
              )}
              <span className="badge tone-neutral plain">{employmentLabel(selected.employee?.isSalaried, t)}</span>
            </div>

            <h4 className="wallet-detail-heading">{t('الحركات')}</h4>
            {(selected.transactions || []).length === 0 ? (
              <EmptyState icon={<WalletIcon />} title={t('لا توجد حركات')} />
            ) : (
              <div className="wallet-detail-table">
                <DataTable dense rows={selected.transactions} columns={detailTxColumns} />
              </div>
            )}

            {(selected.advances || []).length > 0 && (
              <>
                <h4 className="wallet-detail-heading">{t('السلف')}</h4>
                <div className="wallet-detail-table">
                  <DataTable dense rows={selected.advances} columns={advanceColumns} />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showAdvance} onClose={closeAdvance} title={t('طلب سلفة راتب')}>
        <form onSubmit={handleAdvance}>
          <p className="modal-hint">
            {t('تُضاف السلفة إلى محفظتك عند اعتماد المدير، وتُخصم من راتبك الشهري القادم.')}
          </p>
          <FormError message={error} />
          <div className="form-group">
            <label htmlFor="advance-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="advance-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(formatAmountInput(e.target.value))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الإرسال…') : t('إرسال الطلب')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeAdvance}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showWithdraw} onClose={closeWithdraw} title={t('طلب سحب من المحفظة')}>
        <form onSubmit={handleWithdraw}>
          <p className="modal-hint">
            {t('يُراجع طلب السحب من الإدارة أو المحاسبة قبل صرفه من رصيد محفظتك.')}
          </p>
          <FormError message={error} />
          <div className="form-group">
            <label htmlFor="withdraw-amount">{t('المبلغ ({currency})', { currency })}</label>
            <input
              id="withdraw-amount"
              type="text"
              inputMode="numeric"
              required
              className="ltr"
              placeholder="1,000"
              value={withdrawForm.amountMinor}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, amountMinor: formatAmountInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="withdraw-reason">{t('السبب')}</label>
            <textarea
              id="withdraw-reason"
              required
              rows={2}
              value={withdrawForm.reason}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, reason: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('جاري الإرسال…') : t('إرسال الطلب')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeWithdraw}>
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
