import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import cleanDocumentName from '../../utils/cleanDocumentName';
import LeftNav from './LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import FeedbackModal from '../shared/FeedbackModal';
import RecoveryVerificationBanner from '../auth/RecoveryVerificationBanner';
import FileBreakdownDonut from '../shared/FileBreakdownDonut';
import LanguageCard from '../shared/LanguageCard';
import { useNotifications } from '../../context/NotificationsStore';
import { useDocuments } from '../../context/DocumentsContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import profileUserIcon from '../../assets/profile-user-icon.svg';
import { ReactComponent as LayersIcon } from '../../assets/Layers.svg';
import keyIcon from '../../assets/password-key.svg';
import { ReactComponent as BellIcon } from '../../assets/Bell-1.svg';
import { ReactComponent as SettingsFilledIcon } from '../../assets/Settings-filled.svg';
import { ReactComponent as Document2Icon } from '../../assets/Document 2.svg';
import { ReactComponent as InfoCircleIcon } from '../../assets/Info circle.svg';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import { ReactComponent as PlusWhiteIcon } from '../../assets/plus-white.svg';
import { ReactComponent as HideIcon } from '../../assets/Hide.svg';
import { ReactComponent as CheckCircleIcon } from '../../assets/check-circle.svg';
import storageIcon from '../../assets/storage-icon.svg';
import imacIcon from '../../assets/imac-icon.svg';
import profileIcon from '../../assets/profile-icon.svg';
import logoutIcon from '../../assets/logout-icon.svg';
import SettingsRow, { UserAvatar, StatusPill, SettingsButton } from '../settings/SettingsRow';
import SettingsIcon from '../settings/SettingsIcon';
import StorageCard from '../settings/StorageCard';
import { ReactComponent as CheckDoubleIcon } from '../../assets/check-double_svgrepo.com.svg';
import { ReactComponent as ExpandIcon } from '../../assets/expand.svg';
import { ReactComponent as CollapseIcon } from '../../assets/collapse.svg';
import { ReactComponent as UploadIconMenu } from '../../assets/upload.svg';
import pdfIcon from '../../assets/pdf-icon.png';
import jpgIcon from '../../assets/jpg-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';
import crownIcon from '../../assets/crown.png';
import api from '../../services/api';
import LogoutModal from '../auth/LogoutModal';
import { ROUTES, buildRoute } from '../../constants/routes';

// Log Out Icon (SVG component)
const LogOutIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H9M16 17L21 12M21 12L16 7M21 12H9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round" />
  </svg>
);

const Settings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { showSuccess, showError } = useNotifications();
  const { documents: contextDocuments, refreshAll } = useDocuments();
  const { open: openOnboarding } = useOnboarding();
  const { updateUser: updateAuthUser } = useAuth();
  const [activeSection, setActiveSection] = useState('general');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // Use context documents directly for consistency across the app
  const documents = contextDocuments;
  const [totalStorage, setTotalStorage] = useState(() => {
    // Load from cache for instant display
    const cached = sessionStorage.getItem('koda_settings_totalStorage');
    return cached ? parseInt(cached, 10) : 0;
  });
  const [storageLimit, setStorageLimit] = useState(() => {
    // Load from cache or default to 5GB (beta limit)
    const cached = sessionStorage.getItem('koda_settings_storageLimit');
    return cached ? parseInt(cached, 10) : 5 * 1024 * 1024 * 1024; // 5GB default
  });
  const [user, setUser] = useState(() => {
    // Load from cache for instant display
    const cached = localStorage.getItem('user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [profileImage, setProfileImage] = useState(() => {
    const cached = localStorage.getItem('user');
    if (cached) {
      try {
        const userData = JSON.parse(cached);
        return userData.profileImage || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [firstName, setFirstName] = useState(() => {
    const cached = localStorage.getItem('user');
    if (cached) {
      try {
        const userData = JSON.parse(cached);
        return userData.firstName || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  });
  const [lastName, setLastName] = useState(() => {
    const cached = localStorage.getItem('user');
    if (cached) {
      try {
        const userData = JSON.parse(cached);
        return userData.lastName || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  });
  const [phoneNumber, setPhoneNumber] = useState(() => {
    const cached = localStorage.getItem('user');
    if (cached) {
      try {
        const userData = JSON.parse(cached);
        return userData.phoneNumber || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Notification preferences
  const [accountUpdates, setAccountUpdates] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [chatDocumentLinks, setChatDocumentLinks] = useState(false);
  const [uploadConfirmations, setUploadConfirmations] = useState(false);
  const [encryptionAlerts, setEncryptionAlerts] = useState(true);
  const [featureAnnouncements, setFeatureAnnouncements] = useState(false);

  // Notifications popup
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);

  
  // Load notification preferences from localStorage
  useEffect(() => {
    const savedPreferences = localStorage.getItem('notificationPreferences');
    if (savedPreferences) {
      const prefs = JSON.parse(savedPreferences);
      setAccountUpdates(prefs.accountUpdates ?? true);
      setSecurityAlerts(prefs.securityAlerts ?? true);
      setChatDocumentLinks(prefs.chatDocumentLinks ?? false);
      setUploadConfirmations(prefs.uploadConfirmations ?? false);
      setEncryptionAlerts(prefs.encryptionAlerts ?? true);
      setFeatureAnnouncements(prefs.featureAnnouncements ?? false);
    }
  }, []);

  // Fetch user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/api/auth/me');
        const userData = response.data.user;
        setUser(userData);

        // Cache user data
        localStorage.setItem('user', JSON.stringify(userData));

        // Set form fields
        setFirstName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setPhoneNumber(userData.phoneNumber || '');
        setProfileImage(userData.profileImage || null);
      } catch (error) {
      }
    };

    fetchUser();
  }, []);

  // Fetch storage info from API
  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        const response = await api.get('/api/storage');
        if (response.data) {
          setTotalStorage(response.data.used || 0);
          setStorageLimit(response.data.limit || 5 * 1024 * 1024 * 1024);
          sessionStorage.setItem('koda_settings_totalStorage', (response.data.used || 0).toString());
          sessionStorage.setItem('koda_settings_storageLimit', (response.data.limit || 5 * 1024 * 1024 * 1024).toString());
        }
      } catch (error) {
      }
    };

    fetchStorageInfo();
  }, []);


  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    // Show 2 decimal places for GB and above, 1 decimal for MB, 0 for smaller
    const decimals = i >= 3 ? 2 : (i === 2 ? 1 : 0);
    return value.toFixed(decimals) + ' ' + sizes[i];
  };

  const getFileIcon = (doc) => {
    // Prioritize MIME type over file extension (more reliable for encrypted filenames)
    const mimeType = doc?.mimeType || '';
    const filename = doc?.filename || '';

    // ========== VIDEO FILES ==========
    if (mimeType === 'video/quicktime') return movIcon;
    if (mimeType === 'video/mp4') return mp4Icon;
    if (mimeType.startsWith('video/')) return mp4Icon;

    // ========== AUDIO FILES ==========
    if (mimeType.startsWith('audio/') || mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
      return mp3Icon;
    }

    // ========== DOCUMENT FILES ==========
    if (mimeType === 'application/pdf') return pdfIcon;
    if (mimeType.includes('word') || mimeType.includes('msword')) return docIcon;
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return xlsIcon;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return pptxIcon;
    if (mimeType === 'text/plain' || mimeType === 'text/csv') return txtIcon;

    // ========== IMAGE FILES ==========
    if (mimeType.startsWith('image/')) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpgIcon;
      if (mimeType.includes('png')) return pngIcon;
      return pngIcon;
    }

    // ========== FALLBACK: Extension-based check ==========
    if (filename) {
      const ext = filename.toLowerCase();
      if (ext.match(/\.(pdf)$/)) return pdfIcon;
      if (ext.match(/\.(doc|docx)$/)) return docIcon;
      if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
      if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
      if (ext.match(/\.(txt)$/)) return txtIcon;
      if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
      if (ext.match(/\.(png)$/)) return pngIcon;
      if (ext.match(/\.(mov)$/)) return movIcon;
      if (ext.match(/\.(mp4)$/)) return mp4Icon;
      if (ext.match(/\.(mp3|wav|aac|m4a)$/)) return mp3Icon;
    }

    return txtIcon;
  };

  const getInitials = (userData) => {
    if (!userData) return 'U';

    // Use firstName if available (single letter)
    if (userData.firstName) {
      return userData.firstName.charAt(0).toUpperCase();
    }

    // Fallback to email (single letter)
    if (userData.email) {
      const username = userData.email.split('@')[0];
      return username.charAt(0).toUpperCase();
    }

    return 'U';
  };

  // Helper to capitalize first letter of a string
  const capitalizeFirst = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveChanges = async () => {
    setProfileError('');

    try {
      // Update user profile
      const response = await api.patch('/api/users/me', {
        firstName,
        lastName,
        phoneNumber,
        profileImage
      });

      if (response.data.needsPhoneVerification) {
        showSuccess('Verification link sent to your phone!');
      } else {
        showSuccess(t('toasts.profileUpdatedSuccess'));
      }

      // Refresh user data
      const userResponse = await api.get('/api/auth/me');
      const userData = userResponse.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      updateAuthUser(userData);

      // Update form fields with the refreshed data
      setFirstName(userData.firstName || '');
      setLastName(userData.lastName || '');
      setPhoneNumber(userData.phoneNumber || '');
      setProfileImage(userData.profileImage || null);
    } catch (error) {
      // Check if it's a phone number already in use error
      if (error.response?.data?.field === 'phoneNumber' && error.response?.data?.error) {
        setProfileError(error.response.data.error);
      } else {
        showError(t('settings.errors.failedToUpdateProfile'));
      }
    }
  };

  const handleReplayOnboarding = () => {
    console.log('🔄 [Settings] Replaying onboarding...');
    // Open onboarding modal directly on Settings page (no navigation)
    openOnboarding(0, 'settings');
  };

  const handlePasswordChange = async () => {
    try {
      // Check if new password is provided
      if (!newPassword) {
        showError(t('passwordValidation.enterNewPassword'));
        return;
      }

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        showError(t('passwordValidation.passwordsDoNotMatch'));
        return;
      }

      // Validate password requirements
      if (newPassword.length < 8) {
        showError(t('passwordValidation.atLeast8Characters'));
        return;
      }

      if (!/[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword)) {
        showError(t('passwordValidation.mustContainSymbolOrNumber'));
        return;
      }

      // Check if password contains name or email
      if (user?.email?.includes(newPassword.toLowerCase()) ||
          user?.firstName?.toLowerCase().includes(newPassword.toLowerCase()) ||
          user?.lastName?.toLowerCase().includes(newPassword.toLowerCase())) {
        showError(t('passwordValidation.mustNotContainNameOrEmail'));
        return;
      }

      // Call API to change password
      const requestBody = { newPassword };

      // Only include currentPassword if it's provided
      if (currentPassword) {
        requestBody.currentPassword = currentPassword;
      }

      const response = await api.patch('/api/users/me/password', requestBody);

      showSuccess(response.data.message || t('settings.passwordChangedSuccess'));

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const errorMessage = error.response?.data?.error || t('settings.errors.failedToChangePassword');
      showError(errorMessage);
    }
  };

  const handleSaveNotificationPreferences = () => {
    try {
      const preferences = {
        accountUpdates,
        securityAlerts,
        chatDocumentLinks,
        uploadConfirmations,
        encryptionAlerts,
        featureAnnouncements
      };

      // Save to localStorage
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));

      showSuccess(t('settings.notificationPreferencesSaved'));
    } catch (error) {
      showError(t('settings.errors.failedToSaveNotificationPreferences'));
    }
  };

  // Helper function to get file type for sorting
  const getFileTypeForSort = (doc) => {
    const filename = doc?.filename || '';
    const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
    return ext || 'File';
  };

  // Helper function to get display file type
  const getFileTypeDisplay = (doc) => {
    const mimeType = doc?.mimeType || '';
    const filename = doc?.filename || '';
    const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';

    if (mimeType === 'application/pdf' || ext === 'PDF') return 'PDF';
    if (ext === 'DOC') return 'DOC';
    if (ext === 'DOCX') return 'DOCX';
    if (ext === 'XLS') return 'XLS';
    if (ext === 'XLSX') return 'XLSX';
    if (ext === 'PPT') return 'PPT';
    if (ext === 'PPTX') return 'PPTX';
    if (ext === 'TXT') return 'TXT';
    if (ext === 'CSV') return 'CSV';
    if (ext === 'PNG') return 'PNG';
    if (ext === 'JPG' || ext === 'JPEG') return 'JPG';
    if (ext === 'GIF') return 'GIF';
    if (ext === 'WEBP') return 'WEBP';
    if (ext === 'MP4') return 'MP4';
    if (ext === 'MOV') return 'MOV';
    if (ext === 'AVI') return 'AVI';
    if (ext === 'MKV') return 'MKV';
    if (ext === 'MP3') return 'MP3';
    if (ext === 'WAV') return 'WAV';
    if (ext === 'AAC') return 'AAC';
    if (ext === 'M4A') return 'M4A';

    return ext || 'File';
  };

  // Get 5 most recent documents (all documents, regardless of folder) from context
  const recentDocuments = [...contextDocuments]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const storagePercentage = (totalStorage / storageLimit) * 100;

  const handleClearCache = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmClearCache = async () => {
    try {
      // Delete all documents
      const deletePromises = documents.map(doc => api.delete(`/api/documents/${doc.id}`));
      await Promise.all(deletePromises);

      // Clear localStorage
      localStorage.clear();

      // Refresh context to reflect changes
      await refreshAll();
      setTotalStorage(0);

      showSuccess(t('settings.cacheClearedSuccess'));
    } catch (error) {
      showError(t('settings.errors.failedToClearCache'));
    } finally {
      setShowDeleteModal(false);
    }
  };

  const handleDeleteDocument = async (docId, e) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    try {
      await api.delete(`/api/documents/${docId}`);
      // Refresh context to reflect changes
      await refreshAll();
      // Refresh storage info
      const storageResponse = await api.get('/api/storage');
      if (storageResponse.data) {
        setTotalStorage(storageResponse.data.used || 0);
      }
    } catch (error) {
    }
  };

  return (
    <div data-page="settings" className="settings-page" style={{
  width: '100%',
  height: '100%',
  background: '#F4F4F6',
  overflow: 'hidden',
  justifyContent: 'flex-start',
  alignItems: isMobile ? 'stretch' : 'center',
  display: 'flex',
  flexDirection: isMobile ? 'column' : 'row'
}}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Settings Sidebar - Hidden on mobile */}
      {!isMobile && <div style={{
        width: isExpanded ? 260 : 64,
        height: '100vh',
        padding: 20,
        background: 'white',
        borderRight: '1px #E6E6EC solid',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: 20,
        display: 'flex',
        transition: 'width 300ms ease-in-out',
        overflow: 'hidden'
      }}>
        {/* Expanded Header with Collapse Button */}
        {isExpanded && (
          <div style={{ alignSelf: 'stretch', height: 44, justifyContent: 'space-between', alignItems: 'center', display: 'flex' }}>
            <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
              <SettingsFilledIcon style={{ width: 26, height: 26, transform: 'scale(1.15)', transformOrigin: 'center' }} />
              <div style={{ color: '#32302C', fontSize: 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '19.80px' }}>{t('settings.title')}</div>
            </div>
            <div
              onClick={() => setIsExpanded(false)}
              style={{
                width: 44,
                height: 44,
                background: 'transparent',
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                display: 'flex',
                cursor: 'pointer',
                transition: 'background 0.2s ease, transform 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <CollapseIcon style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)' }} />
            </div>
          </div>
        )}

        {/* Collapsed Expand Button */}
        {!isExpanded && (
          <div
            onClick={() => setIsExpanded(true)}
            style={{
              width: 44,
              height: 44,
              background: 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              cursor: 'pointer',
              alignSelf: 'center',
              borderRadius: 12,
              transition: 'background 0.2s ease-in-out, transform 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ExpandIcon style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)' }} />
          </div>
        )}

        <div style={{ alignSelf: 'stretch', flex: '1 1 0', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', display: 'flex' }}>
          <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: isExpanded ? 'flex-start' : 'center', display: 'flex', gap: isExpanded ? 0 : 12 }}>
            {/* General */}
            {isExpanded ? (
              <div
                onClick={() => setActiveSection('general')}
                style={{
                  alignSelf: 'stretch',
                  height: 44,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: activeSection === 'general' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  display: 'flex',
                  cursor: 'pointer',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayersIcon style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settings.general')}</div>
                </div>
                <img
                  src={chevronLeftIcon}
                  alt=""
                  style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }}
                />
              </div>
            ) : (
              <div
                onClick={() => setActiveSection('general')}
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: activeSection === 'general' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  transition: 'background 0.2s ease-in-out, transform 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; if (activeSection !== 'general') e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; if (activeSection !== 'general') e.currentTarget.style.background = 'transparent'; }}
              >
                <LayersIcon style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
              </div>
            )}

            {/* Profile */}
            {isExpanded ? (
              <div
                onClick={() => setActiveSection('profile')}
                style={{
                  alignSelf: 'stretch',
                  height: 44,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  background: activeSection === 'profile' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  display: 'flex',
                  cursor: 'pointer',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={profileUserIcon} alt="Profile" style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settingsPage.profile')}</div>
                </div>
                <img
                  src={chevronLeftIcon}
                  alt=""
                  style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }}
                />
              </div>
            ) : (
              <div
                onClick={() => setActiveSection('profile')}
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: activeSection === 'profile' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  transition: 'background 0.2s ease-in-out, transform 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; if (activeSection !== 'profile') e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; if (activeSection !== 'profile') e.currentTarget.style.background = 'transparent'; }}
              >
                <img src={profileUserIcon} alt="Profile" style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
              </div>
            )}

            {/* Password */}
            {isExpanded ? (
              <div
                onClick={() => setActiveSection('password')}
                style={{
                  alignSelf: 'stretch',
                  height: 44,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  background: activeSection === 'password' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  display: 'flex',
                  cursor: 'pointer',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={keyIcon} alt="Password" style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settingsPage.password')}</div>
                </div>
                <img
                  src={chevronLeftIcon}
                  alt=""
                  style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }}
                />
              </div>
            ) : (
              <div
                onClick={() => setActiveSection('password')}
                style={{
                  width: 44,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: activeSection === 'password' ? '#F5F5F5' : 'transparent',
                  borderRadius: 12,
                  transition: 'background 0.2s ease-in-out, transform 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; if (activeSection !== 'password') e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; if (activeSection !== 'password') e.currentTarget.style.background = 'transparent'; }}
              >
                <img src={keyIcon} alt="Password" style={{ width: 26, height: 26, filter: 'brightness(0) invert(0.2)', transform: 'scale(1.15)', transformOrigin: 'center' }} />
              </div>
            )}

          </div>
        </div>
      </div>}

      {/* Main Content */}
      <div className="settings-content" style={{
        flex: '1 1 0',
        height: '100%',
        minHeight: 0,
        width: isMobile ? '100%' : 'auto',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div data-settings-header="true" className="mobile-sticky-header" style={{ alignSelf: 'stretch', minHeight: isMobile ? 56 : 84, paddingLeft: isMobile ? 16 : 20, paddingRight: isMobile ? 16 : 20, paddingTop: isMobile ? 'max(env(safe-area-inset-top), 0px)' : 0, background: 'white', borderBottom: '1px #E6E6EC solid', justifyContent: 'space-between', alignItems: 'center', gap: 12, display: 'flex', position: isMobile ? 'sticky' : 'relative', top: isMobile ? 0 : 'auto', zIndex: isMobile ? 10 : 'auto', flexShrink: 0 }}>
          <div style={{ textAlign: 'left', color: '#32302C', fontSize: isMobile ? 18 : 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: isMobile ? '24px' : '30px', flex: isMobile ? 1 : 'auto' }}>
            {activeSection}
          </div>
        </div>

        {/* Mobile Section Tabs */}
        {isMobile && (
          <div style={{ alignSelf: 'stretch', padding: 12, background: 'white', borderBottom: '1px #E6E6EC solid', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
            {['general', 'profile', 'password'].map((section) => (
              <div
                key={section}
                onClick={() => setActiveSection(section)}
                style={{
                  padding: '8px 16px',
                  background: activeSection === section ? '#181818' : '#F5F5F5',
                  color: activeSection === section ? 'white' : '#32302C',
                  borderRadius: 100,
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textTransform: 'capitalize'
                }}
              >
                {section}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {activeSection === 'general' && (
        <div className="settings-form scrollable-content" style={{
          alignSelf: 'stretch',
          flex: '1 1 0',
          minHeight: 0,
          padding: isMobile ? 16 : 24,
          paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 24,
          overflow: 'auto',
          overflowX: 'hidden',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 14,
          display: 'flex',
          WebkitOverflowScrolling: 'touch'
        }}>
          {/* Recovery Verification Banner */}
          <RecoveryVerificationBanner />

          {/* Account Row */}
          <SettingsRow
            icon={
              <UserAvatar
                name={user && (user.firstName || user.lastName)
                  ? `${capitalizeFirst(user.firstName) || ''}`.trim()
                  : user?.email?.split('@')[0] || 'U'}
                image={user?.profileImage}
              />
            }
            title={user && (user.firstName || user.lastName)
              ? `${capitalizeFirst(user.firstName) || ''} ${capitalizeFirst(user.lastName) || ''}`.trim()
              : capitalizeFirst(user?.email?.split('@')[0]) || 'User'}
            description={user ? user.email : t('common.loading')}
            variant="navigation"
            onClick={() => setActiveSection('profile')}
          />

          {/* Introduction to Allybi */}
          <SettingsRow
            icon={<SettingsIcon src={imacIcon} alt="Introduction" />}
            title={t('onboarding.settingsCard.title')}
            description={t('onboarding.settingsCard.description')}
            variant="navigation"
            onClick={handleReplayOnboarding}
            rightElement={
              <span style={{
                color: '#6B7280',
                fontSize: 13,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontWeight: 500
              }}>
                {t('settings.replay', 'Replay')}
              </span>
            }
          />

          {/* Language & Region Card */}
          <LanguageCard />

          {/* Storage Card - Compact version */}
          <StorageCard
            usedBytes={totalStorage}
            totalBytes={storageLimit}
            onManage={() => navigate(ROUTES.DOCUMENTS)}
          />

          {/* Sign Out Row */}
          <SettingsRow
            icon={<SettingsIcon src={logoutIcon} alt="Sign Out" />}
            title={t('nav.signOut')}
            description={t('settings.logoutDescription', 'Sign out of your account')}
            variant="action"
            onClick={() => setShowLogoutModal(true)}
            hoverColor="#FEF2F2"
            showChevron={false}
          />
        </div>
        )}

        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div data-settings-form="true" className="settings-form scrollable-content" style={{
            alignSelf: 'stretch',
            flex: '1 1 0',
            minHeight: 0,
            padding: isMobile ? 16 : 20,
            paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 20,
            overflow: 'auto',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: isMobile ? 16 : 20,
            display: 'flex',
            WebkitOverflowScrolling: 'touch'
          }}>
            <div style={{ alignSelf: 'stretch', position: 'relative', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, display: 'flex' }}>
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  style={{
                    width: isMobile ? 80 : 120,
                    height: isMobile ? 80 : 120,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #E6E6EC'
                  }}
                />
              ) : (
                <div style={{
                  width: isMobile ? 80 : 120,
                  height: isMobile ? 80 : 120,
                  borderRadius: '50%',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#181818',
                  fontSize: isMobile ? 32 : 48,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '700',
                  border: '2px solid #E6E6EC'
                }}>
                  {user ? getInitials(user) : 'U'}
                </div>
              )}
              </div>
            <div style={{ alignSelf: 'stretch', flex: '0 0 auto', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 12 : 20, display: 'flex' }}>
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.firstName')}</div>
                  <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <input
                      type="text"
                      placeholder={t('settingsPage.firstName')}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.lastName')}</div>
                  <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <input
                      type="text"
                      placeholder={t('settingsPage.lastName')}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.email')}</div>
                  <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <input
                      type="email"
                      value={user ? user.email : ''}
                      readOnly
                      style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.phoneNumber')}</div>
                  <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: profileError ? '1px #DC2626 solid' : '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <input
                      type="tel"
                      placeholder={t('settingsPage.phonePlaceholder')}
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setProfileError('');
                      }}
                      style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                    />
                  </div>
                  {profileError && (
                    <div style={{ color: '#DC2626', background: '#FEE2E2', padding: '12px 16px', borderRadius: 26, fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', alignSelf: 'stretch' }}>
                      {profileError}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ alignSelf: 'stretch', borderRadius: 12, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 24, display: 'flex' }}>
              <div style={{ alignSelf: 'stretch', height: 52, borderRadius: 100, justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div
                  data-settings-submit="true"
                  className="save-button"
                  onClick={handleSaveChanges}
                  style={{ flex: '1 1 0', height: 52, background: 'rgba(24, 24, 24, 0.90)', overflow: 'hidden', borderRadius: 100, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
                >
                  <div style={{ color: 'white', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px' }}>{t('settingsPage.saveChanges')}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Password Section */}
        {activeSection === 'password' && (
          <div style={{ alignSelf: 'stretch', flex: '1 1 0', minHeight: 0, padding: isMobile ? 16 : 20, paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 20, overflow: 'auto', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 12 : 20, display: 'flex', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ alignSelf: 'stretch', flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: isMobile ? 20 : 32, display: 'flex' }}>
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 12 : 20, display: 'flex' }}>

                {/* Current Password */}
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                  <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                    <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.currentPassword')}</div>
                    <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                      />
                      <div
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        style={{ cursor: 'pointer' }}
                      >
                        <HideIcon style={{ width: 20, height: 20 }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* New Password */}
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                  <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                    <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.newPassword')}</div>
                    <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                      />
                      <div
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{ cursor: 'pointer' }}
                      >
                        <HideIcon style={{ width: 20, height: 20 }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confirm Password */}
                <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                  <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
                    <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settingsPage.confirmPassword')}</div>
                    <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px #E6E6EC solid', justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={{ flex: '1 1 0', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '24px', border: 'none', outline: 'none', background: 'transparent' }}
                      />
                      <div
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{ cursor: 'pointer' }}
                      >
                        <HideIcon style={{ width: 20, height: 20 }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Password Requirements */}
                <div style={{ flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 12, display: 'flex' }}>
                  <div style={{ justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <CheckCircleIcon
                      style={{
                        width: 20,
                        height: 20,
                        color: !newPassword || (!user?.email?.includes(newPassword) && !user?.firstName?.toLowerCase().includes(newPassword.toLowerCase()) && !user?.lastName?.toLowerCase().includes(newPassword.toLowerCase())) ? '#34A853' : 'rgba(50, 48, 44, 0.30)'
                      }}
                    />
                    <div style={{ color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', textTransform: 'capitalize', lineHeight: '24px' }}>{t('settingsPage.mustNotContain')}</div>
                  </div>
                  <div style={{ justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <CheckCircleIcon
                      style={{
                        width: 20,
                        height: 20,
                        color: newPassword.length >= 8 ? '#34A853' : 'rgba(50, 48, 44, 0.30)'
                      }}
                    />
                    <div style={{ color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', textTransform: 'capitalize', lineHeight: '24px' }}>{t('settingsPage.atLeast8Chars')}</div>
                  </div>
                  <div style={{ justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex' }}>
                    <CheckCircleIcon
                      style={{
                        width: 20,
                        height: 20,
                        color: /[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword) ? '#34A853' : 'rgba(50, 48, 44, 0.30)'
                      }}
                    />
                    <div style={{ color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', textTransform: 'capitalize', lineHeight: '24px' }}>{t('settingsPage.containsSymbolNumber')}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={{ alignSelf: 'stretch', borderRadius: 12, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 24, display: 'flex' }}>
              <div style={{ alignSelf: 'stretch', height: 52, borderRadius: 100, justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
                <div
                  data-settings-submit="true"
                  className="save-button"
                  onClick={handlePasswordChange}
                  style={{ flex: '1 1 0', height: 52, background: 'rgba(24, 24, 24, 0.90)', overflow: 'hidden', borderRadius: 100, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
                >
                  <div style={{ color: 'white', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px' }}>{t('settingsPage.saveChanges')}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications Panel */}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmClearCache}
        itemName={t('settings.cacheAndDocuments')}
        itemType="cache"
      />

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />

      {/* Logout Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
      />

    </div>
  );
};

export default Settings;
