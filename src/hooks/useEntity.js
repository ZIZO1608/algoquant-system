import { useState, useEffect, useCallback, useRef } from 'react';

export function useEntity(fetcher, id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const requestId = id;
    try {
      const result = await fetcher(requestId);
      if (!mountedRef.current || requestId !== id) return;
      setData(result);
    } catch (err) {
      if (!mountedRef.current || requestId !== id) return;
      setError(err.message || 'Failed to load');
      setData(null);
    } finally {
      if (mountedRef.current && requestId === id) setLoading(false);
    }
  }, [fetcher, id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    fetcher(id)
      .then((result) => {
        if (!cancelled && mountedRef.current) setData(result);
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setError(err.message || 'Failed to load');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, id]);

  return { data, loading, error, reload, setData };
}
