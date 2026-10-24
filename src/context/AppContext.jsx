import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  authApi,
  leadsApi,
  coursesApi,
  tasksApi,
  studentsApi,
  settingsApi,
  setTokens,
  clearTokens,
} from '../api/client';
import { setCurrencyLabel } from '../utils/formatters';

const AppContext = createContext(null);

// Shared lists the backend only lets some privileges read (mirrors requirePrivileges on
// GET /leads and GET /students). Asking without the privilege just returns 403.
const LIST_ACCESS = {
  leads: ['sales'],
  students: ['operation', 'sales', 'accountant'],
};

function canReadList(privileges, list) {
  if (!privileges?.length) return false;
  return privileges.includes('admin') || LIST_ACCESS[list].some((code) => privileges.includes(code));
}

export function AppProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('algo_access_token'));
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(() => !localStorage.getItem('algo_access_token'));
  const [courses, setCourses] = useState([]);
  const [leads, setLeads] = useState([]);
  const [students, setStudents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  // The signed-in employee, readable from callbacks without re-creating them.
  const userRef = useRef(null);

  const refreshData = useCallback(async () => {
    if (!localStorage.getItem('algo_access_token')) return;
    const privileges = userRef.current?.privileges;
    const load = (allowed, request, label) =>
      allowed
        ? request().catch((err) => {
            console.error(`Failed to load ${label}:`, err);
            return [];
          })
        : Promise.resolve([]);

    setLoading(true);
    try {
      const [leadsData, coursesData, tasksData, studentsData] = await Promise.all([
        load(canReadList(privileges, 'leads'), () => leadsApi.list(), 'leads'),
        load(true, () => coursesApi.list(), 'courses'),
        load(true, () => tasksApi.list(), 'tasks'),
        load(canReadList(privileges, 'students'), () => studentsApi.list(), 'students'),
      ]);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await settingsApi.get();
      if (s && typeof s === 'object') {
        setSettings(s);
        if (s.currencyLabel) setCurrencyLabel(s.currencyLabel);
      }
    } catch {
      // settings are optional for rendering
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    // Load the employee first: which lists to fetch depends on their privileges.
    authApi
      .me()
      .then((me) => {
        if (cancelled) return;
        userRef.current = me;
        setUser(me);
        setAuthChecked(true);
        refreshData();
      })
      .catch(() => {
        if (cancelled) return;
        clearTokens();
        setIsAuthenticated(false);
        setAuthChecked(true);
      });
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshData, loadSettings]);

  const login = useCallback(
    async (email, password) => {
      const result = await authApi.login(email, password);
      setTokens(result.accessToken, result.refreshToken);
      userRef.current = result.employee;
      setUser(result.employee);
      setAuthChecked(true);
      setIsAuthenticated(true);
      await refreshData();
      return result;
    },
    [refreshData]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    clearTokens();
    userRef.current = null;
    setIsAuthenticated(false);
    setUser(null);
    setCourses([]);
    setLeads([]);
    setStudents([]);
    setTasks([]);
  }, []);

  const updateLeadStatus = useCallback(
    async (leadId, status, reason) => {
      await leadsApi.transition(leadId, status, reason);
      await refreshData();
    },
    [refreshData]
  );

  const transitionTask = useCallback(
    async (taskId, toStatus) => {
      await tasksApi.transition(taskId, toStatus);
      await refreshData();
    },
    [refreshData]
  );

  const hasPrivilege = useCallback(
    (code) => user?.privileges?.includes('admin') || user?.privileges?.includes(code),
    [user]
  );

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        authChecked,
        user,
        login,
        logout,
        courses,
        leads,
        students,
        tasks,
        settings,
        loading,
        refreshData,
        loadSettings,
        transitionTask,
        updateLeadStatus,
        hasPrivilege,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
