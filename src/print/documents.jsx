import { useDoc } from './docContext';
import { formatDocNumber } from './printSettings';

/**
 * Printed documents. Each renders one copy inside the print frame; the frame repeats it per
 * copy and lays the copies out on the chosen paper. Styles: document.css (pd-* classes).
 * Text goes through the document's own t() (useDoc), so it prints in the document language.
 */

const LOGO_SRC = '/brand/logo-mark-512.png';

function logoUrl() {
  return typeof window === 'undefined' ? LOGO_SRC : `${window.location.origin}${LOGO_SRC}`;
}

/* ── Building blocks ─────────────────────────────────────────────────────────── */

function DocHeader({ number, date, copyLabel }) {
  const c = useDoc();
  const { org, look } = c.settings;
  const lines = [
    org.address && <span key="a">{org.address}</span>,
    org.phones && (
      <span key="p" className="pd-ltr">
        {org.phones}
      </span>
    ),
    org.email && (
      <span key="e" className="pd-ltr">
        {org.email}
      </span>
    ),
    org.website && (
      <span key="w" className="pd-ltr">
        {org.website}
      </span>
    ),
    org.registration && <span key="r">{c.t('رقم السجل: {value}', { value: c.iso(org.registration) })}</span>,
  ].filter(Boolean);

  return (
    <header className="pd-head">
      <div className="pd-org">
        {look.showLogo && <img className="pd-logo" src={logoUrl()} alt="" />}
        <div className="pd-org-text">
          <div className="pd-org-name">{org.name || '—'}</div>
          {org.tagline && <div className="pd-org-tagline">{org.tagline}</div>}
          {lines.length > 0 && <div className="pd-org-lines">{lines}</div>}
        </div>
      </div>
      <div className="pd-title-block">
        <div className="pd-title">{c.title}</div>
        <dl className="pd-meta">
          {number && (
            <div>
              <dt>{c.t('الرقم')}</dt>
              <dd className="pd-number pd-ltr">{number}</dd>
            </div>
          )}
          <div>
            <dt>{c.t('التاريخ')}</dt>
            <dd>{date}</dd>
          </div>
        </dl>
        {copyLabel && <div className="pd-copy">{copyLabel}</div>}
      </div>
    </header>
  );
}

function Fields({ rows }) {
  const visible = rows.filter(Boolean).filter((r) => r.value !== undefined && r.value !== null && r.value !== '');
  if (!visible.length) return null;
  return (
    <dl className="pd-fields">
      {visible.map((r) => (
        <div key={r.label} className={`pd-field ${r.wide ? 'is-wide' : ''}`}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AmountBox({ label, value }) {
  const c = useDoc();
  return (
    <div className="pd-amount">
      <div className="pd-amount-label">{label}</div>
      <div className="pd-amount-value">
        {c.amount(value)}
        <small>{c.currency}</small>
      </div>
      {c.show('amountWords') && <div className="pd-amount-words">{c.words(value)}</div>}
    </div>
  );
}

function Summary({ items }) {
  const c = useDoc();
  return (
    <div className="pd-summary">
      {items.filter(Boolean).map((item) => (
        <div key={item.label} className={`pd-sum ${item.className || ''}`}>
          <span>{item.label}</span>
          <strong>{c.money(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function Banner({ tone, children }) {
  return <div className={`pd-banner tone-${tone}`}>{children}</div>;
}

function Watermark({ text, warn }) {
  if (!text) return null;
  return (
    <div className={`pd-watermark ${warn ? 'is-warn' : ''}`} aria-hidden="true">
      <span>{text}</span>
    </div>
  );
}

function Steps({ history, kind }) {
  const c = useDoc();
  if (!c.show('history') || !history?.length) return null;
  return (
    <div className="pd-steps">
      {history.map((h, i) => (
        <span key={`${h.toStatus}-${i}`}>
          <b>{c.status(kind, h.toStatus)}</b>
          {' · '}
          {c.date(h.at)}
          {h.by?.fullName ? ` · ${h.by.fullName}` : ''}
        </span>
      ))}
    </div>
  );
}

function Signatures({ names = [] }) {
  const c = useDoc();
  const boxes = c.signatures.map((label, i) => ({ label, name: names[i] })).filter((b) => b.label);
  if (!boxes.length) return null;
  return (
    <section className="pd-signs" style={{ '--sign-cols': Math.min(3, boxes.length) }}>
      {boxes.map((b, i) => (
        <div key={`${b.label}-${i}`} className="pd-sign">
          <div className="pd-sign-line" />
          <div className="pd-sign-label">{b.label}</div>
          {b.name && <div className="pd-sign-name">{b.name}</div>}
        </div>
      ))}
    </section>
  );
}

function DocFooter() {
  const c = useDoc();
  const { text, look } = c.settings;
  const note = c.doc.note?.trim();
  if (!text.footer && !text.terms && !note && !look.showPrintedAt) return null;
  return (
    <footer className="pd-foot">
      {text.footer && <div className="pd-foot-main">{text.footer}</div>}
      {note && <div className="pd-terms">{note}</div>}
      {text.terms && <div className="pd-terms">{text.terms}</div>}
      {look.showPrintedAt && (
        <div className="pd-foot-meta">
          <span>{c.t('طُبع في {date}', { date: c.dateTime(new Date()) })}</span>
          <span className="pd-ltr">{c.settings.org.name}</span>
        </div>
      )}
    </footer>
  );
}

function Sheet({ header, watermark, children, signatures }) {
  return (
    <article className="pd-doc">
      <div className="pd-doc-inner">
        {watermark}
        {header}
        <div className="pd-rule" />
        <section className="pd-body">{children}</section>
        <div className="pd-spacer" />
        {signatures}
        <DocFooter />
      </div>
    </article>
  );
}

function person(p) {
  return p?.fullName || '';
}

function withPhone(name, phone, show) {
  if (!show || !phone) return name;
  // The outer span keeps the page direction, so its start margin is the gap after the name.
  return (
    <>
      {name}
      <span className="pd-sub">
        <bdi className="pd-ltr">{phone}</bdi>
      </span>
    </>
  );
}

/* ── Documents ───────────────────────────────────────────────────────────────── */

function PaymentReceipt({ data, copyLabel }) {
  const c = useDoc();
  const e = data.enrollment || {};
  const remaining = Number(e.remainingAfterMinor ?? 0);
  const voided = data.voided;
  return (
    <Sheet
      header={<DocHeader number={c.number(data.number)} date={c.dateTime(data.issuedAt)} copyLabel={copyLabel} />}
      watermark={voided ? <Watermark text={c.t('ملغى|receipt')} /> : null}
      signatures={<Signatures names={[person(data.receivedBy), data.student?.fullName]} />}
    >
      {voided && (
        <Banner tone="danger">
          {voided.reason
            ? c.t('هذا الوصل ملغى — {reason}', { reason: c.iso(voided.reason) })
            : c.t('هذا الوصل ملغى')}
        </Banner>
      )}
      <Fields
        rows={[
          {
            label: c.t('استلمنا من'),
            value: withPhone(data.student?.fullName, data.student?.phone, c.show('studentPhone')),
          },
          c.show('method') && { label: c.t('طريقة الدفع'), value: c.method(data.method) },
          {
            label: c.t('وذلك عن'),
            value: c.show('course')
              ? c.t('دفعة من رسوم «{course}»', { course: c.iso(data.course?.name || '—') })
              : c.t('دفعة من الرسوم'),
            wide: true,
          },
          c.show('receivedBy') && { label: c.t('المستلم'), value: person(data.receivedBy) },
          c.show('note') && data.note && { label: c.t('ملاحظة'), value: c.td(data.note), wide: true },
        ]}
      />
      <AmountBox label={c.t('المبلغ المستلم')} value={data.amountMinor} />
      {c.show('balance') && (
        <Summary
          items={[
            { label: c.t('رسوم الدورة'), value: e.totalPriceMinor },
            { label: c.t('المدفوع سابقاً'), value: e.paidBeforeMinor },
            { label: c.t('إجمالي المدفوع'), value: e.paidAfterMinor, className: 'is-key' },
            { label: c.t('المتبقي'), value: remaining, className: remaining > 0 ? 'is-due' : 'is-ok' },
          ]}
        />
      )}
      {!voided && c.show('balance') && remaining === 0 && (
        <Banner tone="success">{c.t('تم سداد رسوم الدورة بالكامل')}</Banner>
      )}
    </Sheet>
  );
}

function ExpenseVoucher({ data, copyLabel }) {
  const c = useDoc();
  return (
    <Sheet
      header={<DocHeader number={c.number(data.number)} date={c.date(data.issuedAt)} copyLabel={copyLabel} />}
      watermark={data.deleted ? <Watermark text={c.t('محذوف')} /> : null}
      signatures={<Signatures names={[person(data.createdBy)]} />}
    >
      {data.deleted && <Banner tone="danger">{c.t('هذا المصروف محذوف من السجلات')}</Banner>}
      <Fields
        rows={[
          { label: c.t('البيان'), value: data.reason || '—', wide: true },
          c.show('category') && { label: c.t('الفئة'), value: c.td(data.category?.labelAr) },
          c.show('course') && data.course && { label: c.t('الدورة'), value: data.course.name },
          { label: c.t('تاريخ الصرف'), value: c.date(data.issuedAt) },
          c.show('createdBy') && { label: c.t('سجّله'), value: person(data.createdBy) },
        ]}
      />
      <AmountBox label={c.t('المبلغ المصروف')} value={data.amountMinor} />
    </Sheet>
  );
}

function RefundVoucher({ data, copyLabel }) {
  const c = useDoc();
  const processed = data.status === 'processed';
  const e = data.enrollment || {};
  let watermark = null;
  if (data.status === 'rejected') watermark = <Watermark text={c.status('refund', 'rejected')} />;
  else if (!processed) watermark = <Watermark text={c.t('غير منفّذ')} warn />;
  return (
    <Sheet
      header={<DocHeader number={c.number(data.number)} date={c.date(data.issuedAt)} copyLabel={copyLabel} />}
      watermark={watermark}
      signatures={<Signatures names={[person(data.initiatedBy), '', data.student?.fullName]} />}
    >
      {!processed && (
        <Banner tone={data.status === 'rejected' ? 'danger' : 'warn'}>
          {c.t('حالة الاسترداد: {status}', { status: c.status('refund', data.status) })}
        </Banner>
      )}
      <Fields
        rows={[
          {
            label: c.t('يُصرف إلى'),
            value: withPhone(data.student?.fullName, data.student?.phone, c.show('studentPhone')),
          },
          c.show('course') && { label: c.t('الدورة'), value: data.course?.name },
          { label: c.t('سبب الاسترداد'), value: data.reason, wide: true },
          { label: c.t('تاريخ الطلب'), value: c.date(data.requestedAt) },
          processed && { label: c.t('تاريخ الصرف'), value: c.date(data.processedAt) },
        ]}
      />
      <AmountBox label={c.t('مبلغ الاسترداد')} value={data.amountMinor} />
      {c.show('balance') && (
        <Summary
          items={[
            { label: c.t('رسوم الدورة'), value: e.totalPriceMinor },
            { label: c.t('المدفوع حالياً'), value: e.amountPaidMinor, className: 'is-key' },
          ]}
        />
      )}
      <Steps history={data.history} kind="refund" />
    </Sheet>
  );
}

function OwnerWithdrawalVoucher({ data, copyLabel }) {
  const c = useDoc();
  return (
    <Sheet
      header={<DocHeader number={c.number(data.number)} date={c.date(data.issuedAt)} copyLabel={copyLabel} />}
      signatures={<Signatures names={[person(data.createdBy)]} />}
    >
      <Fields
        rows={[
          { label: c.t('البيان'), value: data.reason || '—', wide: true },
          { label: c.t('تاريخ السحب'), value: c.date(data.issuedAt) },
          c.show('createdBy') && { label: c.t('سجّله'), value: person(data.createdBy) },
        ]}
      />
      <AmountBox label={c.t('المبلغ المسحوب')} value={data.amountMinor} />
    </Sheet>
  );
}

function WalletWithdrawalVoucher({ data, copyLabel }) {
  const c = useDoc();
  const paid = data.status === 'paid';
  const closed = data.status === 'rejected' || data.status === 'cancelled';
  let watermark = null;
  if (closed) watermark = <Watermark text={c.status('withdrawal', data.status)} />;
  else if (!paid) watermark = <Watermark text={c.t('غير مدفوع بعد')} warn />;
  return (
    <Sheet
      header={<DocHeader number={c.number(data.number)} date={c.date(data.issuedAt)} copyLabel={copyLabel} />}
      watermark={watermark}
      signatures={<Signatures names={[person(data.reviewedBy), person(data.employee)]} />}
    >
      {!paid && (
        <Banner tone={closed ? 'danger' : 'warn'}>
          {c.t('حالة الطلب: {status}', { status: c.status('withdrawal', data.status) })}
        </Banner>
      )}
      <Fields
        rows={[
          { label: c.t('يُصرف إلى'), value: person(data.employee) },
          { label: c.t('تاريخ الطلب'), value: c.date(data.requestedAt) },
          { label: c.t('البيان'), value: c.td(data.reason) || '—', wide: true },
          paid && { label: c.t('تاريخ الدفع'), value: c.date(data.paidAt) },
          c.show('reviewedBy') && data.reviewedBy && { label: c.t('اعتمده'), value: person(data.reviewedBy) },
        ]}
      />
      <AmountBox label={c.t('المبلغ')} value={data.amountMinor} />
      <Steps history={data.history} kind="withdrawal" />
    </Sheet>
  );
}

function StudentStatement({ data, copyLabel }) {
  const c = useDoc();
  const student = data.student || {};
  const totals = data.totals || {};
  const balance = Number(totals.balanceMinor ?? 0);
  // Receipt rolls are too narrow for six columns: courses and entries print as stacked lines.
  const roll = c.format === 'roll';
  const entryLabel = (entry) => {
    if (entry.kind === 'charge') return c.t('رسوم دورة «{course}»', { course: c.iso(entry.courseName) });
    if (entry.kind === 'refund') return c.t('استرداد — «{course}»', { course: c.iso(entry.courseName) });
    return c.t('دفعة — «{course}»', { course: c.iso(entry.courseName) });
  };
  const entryRef = (entry) => {
    if (entry.kind === 'charge') return '';
    const prefix = c.settings.docs[entry.kind === 'refund' ? 'refund' : 'payment'].prefix;
    return formatDocNumber(prefix, entry.number, c.settings.look.numberPadding);
  };
  return (
    <Sheet
      header={<DocHeader date={c.date(data.issuedAt)} copyLabel={copyLabel} />}
      signatures={<Signatures />}
    >
      <div className="pd-party">
        <div>
          <div className="pd-party-name">{student.fullName}</div>
          <div className="pd-party-lines">
            {student.phone && <span className="pd-ltr">{student.phone}</span>}
            {student.email && <span className="pd-ltr">{student.email}</span>}
            <span>{c.t('طالب منذ {date}', { date: c.date(student.createdAt) })}</span>
          </div>
        </div>
        <span className={`pd-chip tone-${c.tone('student', student.status)}`}>
          {c.status('student', student.status)}
        </span>
      </div>

      <div className="pd-tiles">
        <div className="pd-tile">
          <span>{c.t('إجمالي الرسوم')}</span>
          <strong>{c.money(totals.chargesMinor)}</strong>
        </div>
        <div className="pd-tile is-ok">
          <span>{c.t('إجمالي المدفوع')}</span>
          <strong>{c.money(totals.paidMinor)}</strong>
        </div>
        <div className="pd-tile">
          <span>{c.t('المسترد')}</span>
          <strong>{c.money(totals.refundedMinor)}</strong>
        </div>
        <div className={`pd-tile ${balance > 0 ? 'is-due' : 'is-ok'}`}>
          <span>{c.t('الرصيد المستحق')}</span>
          <strong>{c.money(Math.max(0, balance))}</strong>
        </div>
      </div>

      {c.show('courses') && roll && (
        <>
          <h3 className="pd-h">{c.t('الدورات')}</h3>
          <ul className="pd-list">
            {(data.courses || []).map((row) => {
              const due = Math.max(0, Number(row.balanceMinor ?? 0));
              const att = row.attendance || {};
              return (
                <li key={row.enrollmentId}>
                  <div className="pd-list-head">
                    <b>{row.course?.name}</b>
                    <span>{c.status('enrollment', row.enrollmentStatus)}</span>
                  </div>
                  <div className="pd-list-line">
                    <span>{c.t('الرسوم')}</span>
                    <span>{c.money(row.totalPriceMinor)}</span>
                  </div>
                  <div className="pd-list-line">
                    <span>{c.t('المدفوع')}</span>
                    <span>{c.money(Number(row.paidMinor ?? 0) - Number(row.refundedMinor ?? 0))}</span>
                  </div>
                  <div className={`pd-list-line ${due > 0 ? 'pd-due' : 'pd-ok'}`}>
                    <span>{c.t('المتبقي')}</span>
                    <b>{c.money(due)}</b>
                  </div>
                  {c.show('attendance') && att.marked > 0 && (
                    <div className="pd-list-line pd-muted">
                      <span>{c.t('الحضور')}</span>
                      <span>{c.t('{attended} من {marked}', { attended: att.attended, marked: att.marked })}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {c.show('courses') && !roll && (
        <>
          <h3 className="pd-h">{c.t('الدورات')}</h3>
          <table className="pd-table">
            <thead>
              <tr>
                <th>{c.t('الدورة')}</th>
                <th>{c.t('الحالة')}</th>
                {c.show('attendance') && <th>{c.t('الحضور')}</th>}
                <th className="num">{c.t('الرسوم')}</th>
                <th className="num">{c.t('المدفوع')}</th>
                <th className="num">{c.t('المتبقي')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.courses || []).map((row) => {
                const due = Math.max(0, Number(row.balanceMinor ?? 0));
                const att = row.attendance || {};
                return (
                  <tr key={row.enrollmentId}>
                    <td>
                      {row.course?.name}
                      <div className="pd-muted">{c.date(row.enrolledAt)}</div>
                    </td>
                    <td>{c.status('enrollment', row.enrollmentStatus)}</td>
                    {c.show('attendance') && (
                      <td>
                        {att.marked
                          ? c.t('{attended} من {marked}', { attended: att.attended, marked: att.marked })
                          : '—'}
                      </td>
                    )}
                    <td className="num">{c.amount(row.totalPriceMinor)}</td>
                    <td className="num">{c.amount(Number(row.paidMinor ?? 0) - Number(row.refundedMinor ?? 0))}</td>
                    <td className={`num ${due > 0 ? 'pd-due' : 'pd-ok'}`}>{c.amount(due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {c.show('ledger') && roll && (
        <>
          <h3 className="pd-h">{c.t('الحركات المالية')}</h3>
          {(data.ledger || []).length === 0 && <p className="pd-muted">{c.t('لا توجد حركات بعد')}</p>}
          <ul className="pd-list">
            {(data.ledger || []).map((entry, i) => {
              const debit = Number(entry.debitMinor);
              return (
                <li key={`${entry.kind}-${entry.enrollmentId}-${i}`}>
                  <div className="pd-list-head">
                    <span>{entryLabel(entry)}</span>
                  </div>
                  <div className="pd-list-line pd-muted">
                    <span>
                      {c.date(entry.date)}
                      {entryRef(entry) && (
                        <>
                          {' · '}
                          <bdi className="pd-ltr">{entryRef(entry)}</bdi>
                        </>
                      )}
                    </span>
                    <b className={debit ? '' : 'pd-ok'}>
                      <bdi className="pd-ltr">
                        {debit ? '+' : '−'}
                        {c.amount(debit || entry.creditMinor)}
                      </bdi>
                    </b>
                  </div>
                  <div className="pd-list-line">
                    <span>{c.t('الرصيد')}</span>
                    <span>{c.amount(entry.balanceMinor)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="pd-list-line pd-list-total">
            <span>{c.t('الرصيد المستحق ({currency})', { currency: c.currency })}</span>
            <b>{c.amount(Math.max(0, balance))}</b>
          </div>
        </>
      )}

      {c.show('ledger') && !roll && (
        <>
          <h3 className="pd-h">{c.t('الحركات المالية')}</h3>
          <table className="pd-table">
            <thead>
              <tr>
                <th>{c.t('التاريخ')}</th>
                <th>{c.t('البيان')}</th>
                <th>{c.t('المرجع')}</th>
                <th className="num">{c.t('مدين')}</th>
                <th className="num">{c.t('دائن')}</th>
                <th className="num">{c.t('الرصيد')}</th>
              </tr>
            </thead>
            <tbody>
              {(data.ledger || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="pd-muted">
                    {c.t('لا توجد حركات بعد')}
                  </td>
                </tr>
              )}
              {(data.ledger || []).map((entry, i) => (
                <tr key={`${entry.kind}-${entry.enrollmentId}-${i}`}>
                  <td className="pd-nowrap">{c.date(entry.date)}</td>
                  <td>
                    {entryLabel(entry)}
                    {entry.kind === 'payment' && entry.method && (
                      <span className="pd-muted"> · {c.method(entry.method)}</span>
                    )}
                  </td>
                  <td className="pd-ltr pd-nowrap">{entryRef(entry)}</td>
                  <td className="num">{Number(entry.debitMinor) ? c.amount(entry.debitMinor) : ''}</td>
                  <td className="num">{Number(entry.creditMinor) ? c.amount(entry.creditMinor) : ''}</td>
                  <td className="num">{c.amount(entry.balanceMinor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>{c.t('الرصيد المستحق ({currency})', { currency: c.currency })}</td>
                <td className="num">{c.amount(Math.max(0, balance))}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </Sheet>
  );
}

const RENDERERS = {
  payment: PaymentReceipt,
  expense: ExpenseVoucher,
  refund: RefundVoucher,
  owner_withdrawal: OwnerWithdrawalVoucher,
  wallet_withdrawal: WalletWithdrawalVoucher,
  statement: StudentStatement,
};

export function DocumentCopy({ type, data, copyLabel }) {
  const Renderer = RENDERERS[type];
  return Renderer ? <Renderer data={data} copyLabel={copyLabel} /> : null;
}
