import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { ArrowForwardIcon, HistoryIcon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { formatDateTime } from '../../utils/formatters';
import { statusInfo } from '../../utils/statusMaps';

/** Every status change of a student and of their enrollments, newest first. */
export default function StatusHistory({ history }) {
  const { t, td } = useI18n();
  if (!history?.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<HistoryIcon />}
          title={t('لا توجد تغييرات بعد')}
          hint={t('يظهر هنا كل تغيير في حالة الطالب أو في حالة تسجيله بالدورات، مع السبب ومن قام به.')}
        />
      </div>
    );
  }
  return (
    <div className="card">
      <ol className="status-timeline">
        {history.map((item) => {
          const kind = item.entityType === 'student' ? 'student' : 'enrollment';
          const tone = statusInfo(kind, item.toStatus).tone;
          return (
            <li key={item.id} className={`status-event tone-${tone}`}>
              <span className="status-event-dot" aria-hidden="true" />
              <div className="status-event-body">
                <div className="status-event-head">
                  <span className="status-event-scope">
                    {item.entityType === 'student'
                      ? t('حالة الطالب')
                      : t('دورة «{course}»', { course: item.course?.name || '—' })}
                  </span>
                  <span className="status-event-change">
                    <StatusBadge kind={kind} value={item.fromStatus} />
                    <ArrowForwardIcon size={14} />
                    <StatusBadge kind={kind} value={item.toStatus} />
                  </span>
                </div>
                {item.reason && <p className="status-event-reason">{td(item.reason)}</p>}
                <div className="status-event-meta tnum">
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {item.triggeredByType === 'system'
                      ? t('تلقائياً من النظام')
                      : item.triggeredBy?.fullName || t('موظف')}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
