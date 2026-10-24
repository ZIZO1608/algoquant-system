import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider, useI18n } from './i18n';
import { ToastProvider, useToast } from './components/Toast';
import { DialogProvider } from './components/DialogProvider';
import { PrintProvider } from './print/PrintProvider';
import { AppLoading } from './components/Skeleton';
import { canAccessPath, firstAllowedPath } from './utils/navAccess';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CrmList = lazy(() => import('./pages/CrmList'));
const CrmDetail = lazy(() => import('./pages/CrmDetail'));
const CoursesList = lazy(() => import('./pages/CoursesList'));
const CourseDetail = lazy(() => import('./pages/CourseDetail'));
const Tasks = lazy(() => import('./pages/Tasks'));
const StudentsList = lazy(() => import('./pages/StudentsList'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const Finance = lazy(() => import('./pages/Finance'));
const EmployeeWallets = lazy(() => import('./pages/EmployeeWallets'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));
const SiteChats = lazy(() => import('./pages/SiteChats'));
const EvalPage = lazy(() => import('./pages/EvalPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PrivilegeRoute({ children }) {
  const { isAuthenticated, authChecked, hasPrivilege } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const location = useLocation();
  const blocked =
    isAuthenticated && authChecked && !canAccessPath(location.pathname, hasPrivilege);

  // Say why the page changed. A silent bounce to the dashboard reads like a broken link,
  // which matters most when the address came from a colleague or a notification.
  useEffect(() => {
    if (blocked) toast.error(t('ليس لديك صلاحية لفتح هذه الصفحة.'));
  }, [blocked, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!authChecked) return <AppLoading />;
  if (blocked) return <Navigate to={firstAllowedPath(hasPrivilege)} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/eval/:token" element={<EvalPage />} />
        <Route path="/" element={<PrivilegeRoute><Dashboard /></PrivilegeRoute>} />
        <Route path="/crm" element={<PrivilegeRoute><CrmList /></PrivilegeRoute>} />
        <Route path="/crm/:id" element={<PrivilegeRoute><CrmDetail /></PrivilegeRoute>} />
        <Route path="/courses" element={<PrivilegeRoute><CoursesList /></PrivilegeRoute>} />
        <Route path="/courses/:id" element={<PrivilegeRoute><CourseDetail /></PrivilegeRoute>} />
        <Route path="/tasks" element={<PrivilegeRoute><Tasks /></PrivilegeRoute>} />
        <Route path="/students" element={<PrivilegeRoute><StudentsList /></PrivilegeRoute>} />
        <Route path="/students/:id" element={<PrivilegeRoute><StudentDetail /></PrivilegeRoute>} />
        <Route path="/finance" element={<PrivilegeRoute><Finance /></PrivilegeRoute>} />
        <Route path="/employee-wallets" element={<PrivilegeRoute><EmployeeWallets /></PrivilegeRoute>} />
        <Route path="/reports" element={<PrivilegeRoute><Reports /></PrivilegeRoute>} />
        <Route path="/settings" element={<PrivilegeRoute><Settings /></PrivilegeRoute>} />
        <Route path="/chat" element={<PrivilegeRoute><Chat /></PrivilegeRoute>} />
        <Route path="/site-chats" element={<PrivilegeRoute><SiteChats /></PrivilegeRoute>} />
        <Route path="*" element={<PrivilegeRoute><NotFound /></PrivilegeRoute>} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppProvider>
          <BrowserRouter>
            <SocketProvider>
              <ToastProvider>
                <DialogProvider>
                  <PrintProvider>
                    <AppRoutes />
                  </PrintProvider>
                </DialogProvider>
              </ToastProvider>
            </SocketProvider>
          </BrowserRouter>
        </AppProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
