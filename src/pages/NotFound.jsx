import { Link } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import EmptyState from '../components/EmptyState';
import { SearchIcon } from '../components/icons';
import { useI18n } from '../i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <AppShell>
      <EmptyState
        icon={<SearchIcon />}
        title={t('الصفحة غير موجودة')}
        hint={t('الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.')}
        action={
          <Link to="/" className="btn btn-primary">
            {t('العودة إلى لوحة التحكم')}
          </Link>
        }
      />
    </AppShell>
  );
}
