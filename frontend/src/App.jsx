import React, { useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { FileProvider } from './context/FileContext';
import { NotificationsProvider } from './context/NotificationsStore';
import { OnboardingProvider } from './context/OnboardingContext';
import { ToastContainer } from './components/toasts';
import { useNotifications } from './context/NotificationsStore';
import { logPerformanceMetrics } from './utils/browser/performance';
import { useIsMobile } from './hooks/useIsMobile';
import { useVisualViewportVars } from './hooks/useVisualViewportVars';
import { ROUTES, AUTH_MODES, buildRoute } from './constants/routes';
import { useAuth } from './context/AuthContext';
import { AuthModalProvider, isAuthPathname, useAuthModal } from './context/AuthModalContext';
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
import PptxStudio from './components/documents/studio/PptxStudio';
import UploadHub from './components/upload/UploadHub';
import Settings from './components/app-shell/Settings';
import FileTypeDetail from './components/shared/FileTypeDetail';
import Upgrade from './components/app-shell/Upgrade';
import MobileBottomNav from './components/app-shell/MobileBottomNav';
import SwipeableTabViewport from './components/app-shell/SwipeableTabViewport';
import AuthModalShell from './components/auth/AuthModalShell';
import SignedOutSignInButton from './components/auth/SignedOutSignInButton';

// Dev-only Chat Contract Harness
import ChatContractHarness from './pages/ChatContractHarness';
import SlidesDeckHarness from './pages/SlidesDeckHarness';

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

  // Initialize viewport CSS variables for mobile
  useVisualViewportVars({ enabled: isMobile });

  function RouterLayer() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const authModal = useAuthModal();

    const authRoute = isAuthPathname(location.pathname);
    const fallbackBg = useMemo(() => ({ pathname: '/', search: '', hash: '', state: null, key: 'auth_bg' }), []);
    const bgLocation =
      authRoute
        ? (authModal.backgroundLocation || fallbackBg)
        : location;

    // Hard rule: once logged in, auth modal must not be visible.
    const modalVisible =
      !isAuthenticated &&
      (authModal.isOpen || authRoute);

    const modalContent = (authRoute && !isAuthenticated) ? (
      <Routes>
        <Route path={ROUTES.AUTH} element={<UnifiedAuth variant="modal" />} />
        {/* Legacy aliases */}
        <Route path={ROUTES.LOGIN} element={<Navigate to={buildRoute.auth(AUTH_MODES.LOGIN)} replace />} />
        <Route path={ROUTES.SIGNUP} element={<Navigate to={buildRoute.auth(AUTH_MODES.SIGNUP)} replace />} />

        <Route path={ROUTES.AUTHENTICATION} element={<Authentication variant="modal" />} />
        <Route path={ROUTES.VERIFY_EMAIL} element={<VerifyEmail variant="modal" />} />
        <Route path={ROUTES.PHONE_NUMBER_PENDING} element={<PhoneNumberPending variant="modal" />} />
        <Route path={ROUTES.VERIFICATION_PENDING} element={<VerificationPending variant="modal" />} />
        <Route path={ROUTES.AUTH_CALLBACK} element={<OAuthCallback variant="modal" />} />
        <Route path={ROUTES.PHONE_NUMBER} element={<PhoneNumber variant="modal" />} />
        <Route path={ROUTES.VERIFY_PHONE} element={<Verification variant="modal" />} />

        {/* Password recovery flow */}
        <Route path={ROUTES.RECOVER_ACCESS} element={<RecoverAccess variant="modal" />} />
        <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword variant="modal" />} />
        <Route path={ROUTES.FORGOT_PASSWORD_CODE} element={<ForgotPasswordCode />} />
        <Route path={ROUTES.FORGOT_PASSWORD_EMAIL_SENT} element={<ForgotPasswordEmailSent variant="modal" />} />
        <Route path={ROUTES.FORGOT_PASSWORD_VERIFICATION} element={<ForgotPasswordVerification variant="modal" />} />
        <Route path={ROUTES.SET_NEW_PASSWORD} element={<SetNewPassword variant="modal" />} />
        <Route path={ROUTES.PASSWORD_CHANGED} element={<PasswordChanged />} />

        {/* Recovery verification (currently unused, kept for parity) */}
        <Route path={ROUTES.VERIFY_RECOVERY_EMAIL} element={<VerifyRecoveryEmail />} />
        <Route path={ROUTES.VERIFY_RECOVERY_PHONE} element={<VerifyRecoveryPhone />} />
      </Routes>
    ) : (!isAuthenticated ? (
      <UnifiedAuth variant="modal" />
    ) : null);

    return (
      <>
        {/* Background app UI (blocked when signed out) */}
        <div
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'auto',
            filter: modalVisible ? 'blur(0px)' : 'none',
          }}
        >
          <SwipeableTabViewport>
            <Routes location={bgLocation}>
              {/* ADMIN LOGIN — must be before AdminRoute catch-all */}
              <Route path={ROUTES.ADMIN_LOGIN} element={<AdminLogin />} />

              {/* Public background: chat is always renderable */}
              <Route path="/" element={<ChatScreen />} />
              <Route path={ROUTES.CHAT} element={<ChatScreen />} />

              {/* Protected app routes */}
              <Route path={ROUTES.UPLOAD} element={<ProtectedRoute><Upload /></ProtectedRoute>} />
              <Route path={ROUTES.UPLOAD_HUB} element={<ProtectedRoute><UploadHub /></ProtectedRoute>} />
              <Route path={ROUTES.HOME} element={<ProtectedRoute><Documents /></ProtectedRoute>} />
              <Route path={ROUTES.DOCUMENTS} element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
              <Route path={ROUTES.CATEGORY} element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
              <Route path={ROUTES.FOLDER} element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
              <Route path={ROUTES.DOCUMENT_STUDIO} element={<ProtectedRoute><PptxStudio /></ProtectedRoute>} />
              <Route path={ROUTES.DOCUMENT} element={<ProtectedRoute><DocumentViewer /></ProtectedRoute>} />
              <Route path={ROUTES.DASHBOARD} element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path={ROUTES.SETTINGS} element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path={ROUTES.FILE_TYPE} element={<ProtectedRoute><FileTypeDetail /></ProtectedRoute>} />
              <Route path={ROUTES.UPGRADE} element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />

              {/* DEV-ONLY ROUTES */}
              {process.env.NODE_ENV === 'development' && (
                <>
                  <Route path="/dev/chat-harness" element={<ChatContractHarness />} />
                  <Route path="/dev/slides-deck-harness" element={<SlidesDeckHarness />} />
                </>
              )}

              {/* ADMIN DASHBOARD ROUTES */}
              <Route path={ROUTES.ADMIN} element={<AdminRoute><AdminOverview /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_USERS} element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_FILES} element={<AdminRoute><AdminFiles /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_QUERIES} element={<AdminRoute><AdminQueries /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_QUALITY} element={<AdminRoute><AdminQuality /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_LLM} element={<AdminRoute><AdminLLM /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_RELIABILITY} element={<AdminRoute><AdminReliability /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_SECURITY} element={<AdminRoute><AdminSecurity /></AdminRoute>} />
              <Route path={ROUTES.ADMIN_API_METRICS} element={<AdminRoute><AdminApiMetrics /></AdminRoute>} />
            </Routes>
          </SwipeableTabViewport>

          {/* Mobile Bottom Navigation - only visible on mobile */}
          <MobileBottomNav />

          {/* Unified toast system (top-center, Koda design) */}
          <ToastContainer toasts={activeToasts} onDismiss={removeToast} />
        </div>

        {/* Signed-out affordance */}
        <SignedOutSignInButton />

        {/* Auth modal */}
        <AuthModalShell isVisible={modalVisible}>
          {modalContent}
        </AuthModalShell>
      </>
    );
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthModalProvider>
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
          <RouterLayer />
        </div>
      </AuthModalProvider>
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
