import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentsProvider } from './context/DocumentsContext';
import { FileProvider } from './context/FileContext';
import { NotificationsProvider } from './context/NotificationsStore';
import { OnboardingProvider } from './context/OnboardingContext';
import { ToastContainer } from './components/toasts';
import { useNotifications } from './context/NotificationsStore';
import { logPerformanceMetrics } from './utils/browser/performance';
import { useIsMobile } from './hooks/useIsMobile';
import { useVisualViewportVars } from './hooks/useVisualViewportVars';
import { ROUTES } from './constants/routes';
import { AuthModalProvider } from './context/AuthModalContext';
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
import IntegrationsPage from './components/integrations/IntegrationsPage';
import GmailDetailPage from './components/integrations/GmailDetailPage';
import LegalPage from './components/legal/LegalPage';
import FirstDocumentUpload from './components/onboarding/FirstDocumentUpload';

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

// Root route: unauthenticated users see signup/login, authenticated users see chat
// Defined at module level so React keeps a stable component reference across renders.
function RootRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <div style={{ width: '100%', height: '100vh', background: 'white' }} />;
  }
  if (isAuthenticated) return <ChatScreen />;
  return <UnifiedAuth variant="page" />;
}

// Inner component that uses NotificationsStore hook
function AppContent() {
  const isMobile = useIsMobile();
  const { activeToasts, removeToast, showWarning } = useNotifications();

  // Initialize viewport CSS variables for mobile
  useVisualViewportVars({ enabled: isMobile });

  useEffect(() => {
    const handleDocumentSkipped = (event) => {
      const detail = event?.detail || {};
      const documentId = typeof detail.documentId === 'string' ? detail.documentId : null;
      const filename = typeof detail.filename === 'string' ? detail.filename : 'This file';
      const reason = typeof detail.reason === 'string' ? detail.reason : 'No extractable text content';

      showWarning('File uploaded but not searchable', {
        eventKey: 'documents.skipped.hidden',
        message: `${filename} has no extractable text and is hidden from Library.`,
        details: reason,
        duration: 8000,
        meta: {
          scope: 'upload',
          source: 'documentsContext',
          relatedIds: documentId ? [documentId] : [],
          dedupeKey: documentId ? `document-skipped:${documentId}` : `document-skipped:${filename}`,
        },
      });
    };

    window.addEventListener('koda:document-skipped', handleDocumentSkipped);
    return () => window.removeEventListener('koda:document-skipped', handleDocumentSkipped);
  }, [showWarning]);

  function RouterLayer() {
    const location = useLocation();

    // Auth routes are now full pages, so use location directly
    const bgLocation = location;

    // Auth modal disabled: auth routes render as full pages
    const modalVisible = false;
    const modalContent = null;

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

              {/* Full-page auth routes (not modal) */}
              <Route path={ROUTES.LOGIN} element={<UnifiedAuth variant="page" />} />
              <Route path={ROUTES.SIGNUP} element={<UnifiedAuth variant="page" />} />
              <Route path={ROUTES.AUTH} element={<UnifiedAuth variant="page" />} />
              <Route path={ROUTES.AUTHENTICATION} element={<Authentication variant="page" />} />
              <Route path={ROUTES.VERIFY_EMAIL} element={<VerifyEmail variant="page" />} />
              <Route path={ROUTES.PHONE_NUMBER_PENDING} element={<PhoneNumberPending variant="page" />} />
              <Route path={ROUTES.VERIFICATION_PENDING} element={<VerificationPending variant="page" />} />
              <Route path={ROUTES.AUTH_CALLBACK} element={<OAuthCallback variant="page" />} />
              <Route path={ROUTES.PHONE_NUMBER} element={<PhoneNumber variant="page" />} />
              <Route path={ROUTES.VERIFY_PHONE} element={<Verification variant="page" />} />
              <Route path={ROUTES.RECOVER_ACCESS} element={<RecoverAccess variant="page" />} />
              <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword variant="page" />} />
              <Route path={ROUTES.FORGOT_PASSWORD_CODE} element={<ForgotPasswordCode />} />
              <Route path={ROUTES.FORGOT_PASSWORD_EMAIL_SENT} element={<ForgotPasswordEmailSent variant="page" />} />
              <Route path={ROUTES.FORGOT_PASSWORD_VERIFICATION} element={<ForgotPasswordVerification variant="page" />} />
              <Route path={ROUTES.SET_NEW_PASSWORD} element={<SetNewPassword variant="page" />} />
              <Route path={ROUTES.PASSWORD_CHANGED} element={<PasswordChanged />} />
              <Route path={ROUTES.VERIFY_RECOVERY_EMAIL} element={<VerifyRecoveryEmail />} />
              <Route path={ROUTES.VERIFY_RECOVERY_PHONE} element={<VerifyRecoveryPhone />} />

              {/* Legal pages (public) */}
              <Route path={ROUTES.TERMS_OF_USE} element={<LegalPage />} />
              <Route path={ROUTES.PRIVACY_POLICY} element={<LegalPage />} />

              {/* Root: auth screen if not signed in, chat if signed in */}
              <Route path="/" element={<RootRoute />} />
              <Route path={ROUTES.CHAT_CONVERSATION} element={<ChatScreen />} />
              <Route path={ROUTES.CHAT} element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />

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
              <Route path={ROUTES.INTEGRATIONS} element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
              <Route path={ROUTES.INTEGRATIONS_GMAIL} element={<ProtectedRoute><GmailDetailPage /></ProtectedRoute>} />
              <Route path={ROUTES.UPGRADE} element={<ProtectedRoute><Upgrade /></ProtectedRoute>} />
              <Route path={ROUTES.FIRST_UPLOAD} element={<ProtectedRoute><FirstDocumentUpload /></ProtectedRoute>} />

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
