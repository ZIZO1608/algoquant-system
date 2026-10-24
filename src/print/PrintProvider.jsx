import { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from 'react';

const PrintDialog = lazy(() => import('./PrintDialog'));

const PrintContext = createContext(null);

/**
 * App-wide print dialog. Any page opens a document with
 *   const openPrint = usePrint();
 *   openPrint('payment', paymentId);          // payment | expense | refund | owner_withdrawal | wallet_withdrawal | statement
 * The dialog (and the print code) loads only when first used.
 */
export function PrintProvider({ children }) {
  const [job, setJob] = useState(null);
  const open = useCallback((type, id, extra = {}) => {
    if (!type || !id) return;
    setJob({ type, id, key: `${type}:${id}:${Date.now()}`, ...extra });
  }, []);
  const close = useCallback(() => setJob(null), []);
  const value = useMemo(() => open, [open]);

  return (
    <PrintContext.Provider value={value}>
      {children}
      {job && (
        <Suspense fallback={null}>
          <PrintDialog key={job.key} job={job} onClose={close} />
        </Suspense>
      )}
    </PrintContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrint() {
  const open = useContext(PrintContext);
  if (!open) throw new Error('usePrint must be used within PrintProvider');
  return open;
}
