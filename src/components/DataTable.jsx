import { useI18n } from '../i18n';
import './DataTable.css';

/**
 * columns: [{ key, label, render?, className?, width?, align? }]
 * rows: array of objects (row.id is the default key)
 */
export default function DataTable({
  columns,
  rows,
  onRowClick,
  className = '',
  emptyMessage,
  loading = false,
  minWidth,
  rowKey,
  dense = false,
  rowClassName,
}) {
  const { t } = useI18n();
  const clickable = typeof onRowClick === 'function';
  return (
    <div className={`table-scroll ${className}`.trim()}>
      <table className={`data-table ${dense ? 'dense' : ''}`.trim()} style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.className}
                style={{ width: col.width, textAlign: col.align }}
                scope="col"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            [0, 1, 2].map((i) => (
              <tr key={`sk-${i}`} className="skeleton-row">
                {columns.map((col) => (
                  <td key={col.key}>
                    <span className="skeleton" style={{ width: i % 2 ? '55%' : '75%', display: 'block' }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage ?? t('لا توجد بيانات')}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row) : row.id || i}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                className={`${clickable ? 'clickable' : ''} ${rowClassName ? rowClassName(row) : ''}`.trim()}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className} style={{ textAlign: col.align }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
