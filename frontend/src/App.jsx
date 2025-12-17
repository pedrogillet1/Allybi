import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { FileProvider } from './context/FileContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsStore';
import { OnboardingProvider } from './context/OnboardingContext';
import { ToastStack } from './components/Notifications';
import { logPerformanceMetrics } from './utils/performance';
import { useIsMobile } from './hooks/useIsMobile';
import { ROUTES, AUTH_MODES, buildRoute } from './constants/routes';
import './i18n/config';
import './styles/designSystem.css';
import './styles/safari-fixes.css';
import './styles/koda-markdown.css'; // Koda Markdown Contract CSS
import UnifiedAuth from './components/UnifiedAuth';
import Authentication from './components/Authentication';
import PhoneNumber from './components/PhoneNumber';
import Verification from './components/Verification';
import VerifyEmail from './components/VerifyEmail';
import PhoneNumberPending from './components/PhoneNumberPending';
import VerificationPending from './components/VerificationPending';
import VerifyRecoveryEmail from './components/VerifyRecoveryEmail';
import VerifyRecoveryPhone from './components/VerifyRecoveryPhone';
import Upload from './components/Upload';
import RecoverAccess from './components/RecoverAccess';
import ForgotPassword from './components/ForgotPassword';
import ForgotPasswordCode from './components/ForgotPasswordCode';
import ForgotPasswordEmailSent from './components/ForgotPasswordEmailSent';
import ForgotPasswordVerification from './components/ForgotPasswordVerification';
import SetNewPassword from './components/SetNewPassword';
import PasswordChanged from './components/PasswordChanged';
import ChatScreen from './components/ChatScreen';
import OAuthCallback from './components/OAuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import Documents from './components/Documents';
import DocumentsPage from './components/DocumentsPage';
import Dashboard from './components/Dashboard';
import CategoryDetail from './components/CategoryDetail';
import DocumentViewer from './components/DocumentViewer';
import UploadHub from './components/UploadHub';
import Settings from './components/Settings';
import FileTypeDetail from './components/FileTypeDetail';
import Upgrade from './components/Upgrade';

// Admin Dashboard
import {
  AdminRoute,
  AdminOverview,
  AdminUsers,
  AdminConversations,
  AdminDocuments,
  AdminSystemHealth,
  AdminCosts,
  AdminRealtime
} from './components/admin';

function App() {
  const isMobile = useIsMobile();

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
      <DocumentsProvider>
        <FileProvider>
          <ToastProvider>
            <NotificationsProvider>
              <OnboardingProvider>
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

            {/* ADMIN DASHBOARD ROUTES */}
            <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/conversations" element={<AdminRoute><AdminConversations /></AdminRoute>} />
            <Route path="/admin/documents" element={<AdminRoute><AdminDocuments /></AdminRoute>} />
            <Route path="/admin/system" element={<AdminRoute><AdminSystemHealth /></AdminRoute>} />
            <Route path="/admin/costs" element={<AdminRoute><AdminCosts /></AdminRoute>} />
            <Route path="/admin/realtime" element={<AdminRoute><AdminRealtime /></AdminRoute>} />
                  </Routes>
                  {/* Global toast notifications */}
                  <ToastStack />
                </div>
              </Router>
              </OnboardingProvider>
            </NotificationsProvider>
          </ToastProvider>
        </FileProvider>
      </DocumentsProvider>
    </AuthProvider>
  );
}

export default App;
