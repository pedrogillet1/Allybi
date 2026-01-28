import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { FileProvider } from './context/FileContext';
import { NotificationsProvider } from './context/NotificationsStore';
import { OnboardingProvider } from './context/OnboardingContext';
import { ToastContainer } from './components/toasts';
import { useNotifications } from './context/NotificationsStore';
import { logPerformanceMetrics } from './utils/browser/performance';
import { useIsMobile } from './hooks/useIsMobile';
import { ROUTES, AUTH_MODES, buildRoute } from './constants/routes';
import './i18n/config';
import './styles/designSystem.css';
import './styles/safari-fixes.css';
import './styles/koda-markdown.css'; // Koda Markdown Contract CSS
import UnifiedAuth from './components/auth/UnifiedAuth';
import Authentication from './components/auth/Authentication';
import PhoneNumber from './components/auth/PhoneNumber';
import Verification from './components/auth/Verification';
import VerifyEmail from './components/auth/VerifyEmail';
import PhoneNumberPending from './components/auth/PhoneNumberPending';
import VerificationPending from './components/auth/VerificationPending';
import VerifyRecoveryEmail from './components/auth/VerifyRecoveryEmail';
import VerifyRecoveryPhone from './components/auth/VerifyRecoveryPhone';
import Upload from './components/upload/Upload';
import RecoverAccess from './components/auth/RecoverAccess';
import ForgotPassword from './components/auth/ForgotPassword';
import ForgotPasswordCode from './components/auth/ForgotPasswordCode';
import ForgotPasswordEmailSent from './components/auth/ForgotPasswordEmailSent';
import ForgotPasswordVerification from './components/auth/ForgotPasswordVerification';
import SetNewPassword from './components/auth/SetNewPassword';
import PasswordChanged from './components/auth/PasswordChanged';
import ChatScreen from './components/chat/ChatScreen';
import OAuthCallback from './components/auth/OAuthCallback';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Documents from './components/documents/Documents';
import DocumentsPage from './components/documents/DocumentsPage';
import Dashboard from './components/app-shell/Dashboard';
import CategoryDetail from './components/library/CategoryDetail';
import DocumentViewer from './components/documents/DocumentViewer';
import UploadHub from './components/upload/UploadHub';
import Settings from './components/app-shell/Settings';
import FileTypeDetail from './components/shared/FileTypeDetail';
import Upgrade from './components/app-shell/Upgrade';

// Dev-only Chat Contract Harness
import ChatContractHarness from './pages/ChatContractHarness';

// Admin Dashboard
import {
  AdminRoute,
  AdminLogin,
  AdminOverview,
  AdminUsers,
  AdminFiles,
  AdminQueries,
  AdminQuality,
  AdminLLM,
  AdminReliability,
  AdminSecurity,
  AdminApiMetrics,
} from './components/admin';
import { AdminAuthProvider } from './context/AdminAuthContext';

// Inner component that uses NotificationsStore hook
function AppContent() {
  const isMobile = useIsMobile();
  const { activeToasts, removeToast } = useNotifications();

  return (
    <Router>
      <div style={{
        width: '100%',
        height: isMobile ? '100dvh' : '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : 'auto',
        left: isMobile ? 0 : 'auto',
        right: isMobile ? 0 : 'auto',
        bottom: isMobile ? 0 : 'auto',
        zIndex: 1
      }}>
        <Routes>
            {/* ADMIN LOGIN — must be before ProtectedRoute catch-all */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* ✅ DEFAULT ROUTE: Chat screen is the first page users see (protected) */}
            <Route path="/" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
            <Route path={ROUTES.CHAT} element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />

            {/* AUTH ROUTES */}
            <Route path={ROUTES.AUTH} element={<UnifiedAuth />} />
            {/* Legacy routes - redirect to unified auth */}
            <Route path={ROUTES.LOGIN} element={<Navigate to={buildRoute.auth(AUTH_MODES.LOGIN)} replace />} />
            <Route path={ROUTES.SIGNUP} element={<Navigate to={buildRoute.auth(AUTH_MODES.SIGNUP)} replace />} />
            <Route path={ROUTES.AUTHENTICATION} element={<Authentication />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/phone-number-pending" element={<PhoneNumberPending />} />
            <Route path="/verification-pending" element={<VerificationPending />} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/phone-number" element={<PhoneNumber />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/upload-hub" element={<ProtectedRoute><UploadHub /></ProtectedRoute>} />

            {/* PASSWORD RECOVERY FLOW (LINK-BASED - NEW) */}
            <Route path="/recover-access" element={<RecoverAccess />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/forgot-password-verification" element={<ForgotPasswordVerification />} />
            <Route path="/set-new-password" element={<SetNewPassword />} />
            <Route path="/password-changed" element={<PasswordChanged />} />

            {/* RECOVERY VERIFICATION ROUTES */}
            <Route path="/verify-recovery-email" element={<VerifyRecoveryEmail />} />
            <Route path="/verify-recovery-phone" element={<VerifyRecoveryPhone />} />
            <Route path="/home" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
            <Route path="/category/:categoryName" element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
            <Route path="/folder/:folderId" element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
            <Route path="/document/:documentId" element={<ProtectedRoute><DocumentViewer /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/filetype/:fileType" element={<ProtectedRoute><FileTypeDetail /></ProtectedRoute>} />
            <Route path="/upgrade" element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />

            {/* DEV-ONLY ROUTES */}
            {process.env.NODE_ENV === 'development' && (
              <Route path="/dev/chat-harness" element={<ChatContractHarness />} />
            )}

            {/* ADMIN DASHBOARD ROUTES */}
            <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/files" element={<AdminRoute><AdminFiles /></AdminRoute>} />
            <Route path="/admin/queries" element={<AdminRoute><AdminQueries /></AdminRoute>} />
            <Route path="/admin/quality" element={<AdminRoute><AdminQuality /></AdminRoute>} />
            <Route path="/admin/llm" element={<AdminRoute><AdminLLM /></AdminRoute>} />
            <Route path="/admin/reliability" element={<AdminRoute><AdminReliability /></AdminRoute>} />
            <Route path="/admin/security" element={<AdminRoute><AdminSecurity /></AdminRoute>} />
            <Route path="/admin/api-metrics" element={<AdminRoute><AdminApiMetrics /></AdminRoute>} />
        </Routes>

        {/* Unified toast system (top-center, Koda design) */}
        <ToastContainer toasts={activeToasts} onDismiss={removeToast} />
      </div>
    </Router>
  );
}

function App() {
  // Log performance metrics on mount (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          logPerformanceMetrics();
        }, 1000);
      });
    }
  }, []);

  return (
    <AuthProvider>
      <AdminAuthProvider>
        <DocumentsProvider>
          <FileProvider>
            <NotificationsProvider>
              <OnboardingProvider>
                <AppContent />
              </OnboardingProvider>
            </NotificationsProvider>
          </FileProvider>
        </DocumentsProvider>
      </AdminAuthProvider>
    </AuthProvider>
  );
}

export default App;
