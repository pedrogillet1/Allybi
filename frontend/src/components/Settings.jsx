import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../context/OnboardingContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import LeftNav from './LeftNav';
import NotificationPanel from './NotificationPanel';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import FeedbackModal from './FeedbackModal';
import RecoveryVerificationBanner from './RecoveryVerificationBanner';
import FileBreakdownDonut from './FileBreakdownDonut';
import LanguageCard from './LanguageCard';
import LogoutModal from './LogoutModal';
import { useToast } from '../context/ToastContext';
import { useDocuments } from '../context/DocumentsContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { ReactComponent as DonutIcon } from '../assets/Donut.svg';
import { ReactComponent as UserIcon } from '../assets/User.svg';
import { ReactComponent as LayersIcon } from '../assets/Layers.svg';
import { ReactComponent as KeyIcon } from '../assets/Key.svg';
import { ReactComponent as BellIcon } from '../assets/Bell-1.svg';
import { ReactComponent as SettingsFilledIcon } from '../assets/Settings-filled.svg';
import { ReactComponent as Document2Icon } from '../assets/Document 2.svg';
import { ReactComponent as ImageIcon } from '../assets/Image.svg';
import { ReactComponent as SpreadsheetIcon } from '../assets/spreadsheet.svg';
import { ReactComponent as InfoCircleIcon } from '../assets/Info circle.svg';
import { ReactComponent as XCloseIcon } from '../assets/x-close.svg';
import { ReactComponent as Right3Icon } from '../assets/Right 3.svg';
import { ReactComponent as PlusWhiteIcon } from '../assets/plus-white.svg';
import { ReactComponent as HideIcon } from '../assets/Hide.svg';
import { ReactComponent as CheckCircleIcon } from '../assets/check-circle.svg';
import storageIcon from '../assets/storage-icon.svg';
import { ReactComponent as CheckDoubleIcon } from '../assets/check-double_svgrepo.com.svg';
import { ReactComponent as ExpandIcon } from '../assets/expand.svg';
import { ReactComponent as UploadIconMenu } from '../assets/Logout-black.svg';
import pdfIcon from '../assets/pdf-icon.png';
import jpgIcon from '../assets/jpg-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import crownIcon from '../assets/crown.png';
import api from '../services/api';

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
  const { showSuccess, showError } = useToast();
  const { documents: contextDocuments } = useDocuments();
  const { open: openOnboarding } = useOnboarding();
  const [activeSection, setActiveSection] = useState('general');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [documents, setDocuments] = useState(() => {
    // Load from cache for instant display
    const cached = sessionStorage.getItem('koda_settings_documents');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [fileData, setFileData] = useState(() => {
    // Load from cache for instant display
    const cached = sessionStorage.getItem('koda_settings_fileData');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
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
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

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

  // Fetch documents and calculate statistics
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await api.get('/api/documents');
        const docs = response.data.documents || [];
        setDocuments(docs);

        // Calculate file breakdown by type
        const breakdown = {
          spreadsheet: { count: 0, size: 0 },
          document: { count: 0, size: 0 },
          image: { count: 0, size: 0 },
          other: { count: 0, size: 0 }
        };

        docs.forEach(doc => {
          const filename = doc.filename.toLowerCase();
          const mimeType = doc.mimeType || '';
          const size = doc.fileSize || 0;

          // Check for Excel/Spreadsheet files (by MIME type or extension)
          if (mimeType.includes('sheet') || mimeType.includes('excel') || filename.match(/\.(xls|xlsx|csv)$/)) {
            breakdown.spreadsheet.count++;
            breakdown.spreadsheet.size += size;
          } else if (filename.match(/\.(pdf|doc|docx|txt|rtf|odt)$/)) {
            breakdown.document.count++;
            breakdown.document.size += size;
          } else if (filename.match(/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/)) {
            breakdown.image.count++;
            breakdown.image.size += size;
          } else {
            breakdown.other.count++;
            breakdown.other.size += size;
          }
        });

        // Format file data for chart
        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 B';
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(1024));
          return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        };

        const chartData = [
          { name: 'Spreadsheet', value: breakdown.spreadsheet.count, color: '#181818', size: formatBytes(breakdown.spreadsheet.size) },
          { name: 'Document', value: breakdown.document.count, color: '#000000', size: formatBytes(breakdown.document.size) },
          { name: 'Image', value: breakdown.image.count, color: '#A8A8A8', size: formatBytes(breakdown.image.size) },
          { name: 'Other', value: breakdown.other.count, color: '#D9D9D9', size: formatBytes(breakdown.other.size) }
        ];
        setFileData(chartData);

        // Cache all settings data
        sessionStorage.setItem('koda_settings_documents', JSON.stringify(docs));
        sessionStorage.setItem('koda_settings_fileData', JSON.stringify(chartData));
      } catch (error) {
      }
    };

    fetchDocuments();
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
      const response = await api.put('/api/users/profile', {
        firstName,
        lastName,
        phoneNumber,
        profileImage
      });

      // Check if phone verification is needed
      if (response.data.needsPhoneVerification) {
        setShowPhoneVerification(true);
        showSuccess(t('toasts.verificationCodeSent'));
      } else {
        showSuccess(t('toasts.profileUpdatedSuccess'));

        // Refresh user data
        const userResponse = await api.get('/api/auth/me');
        const userData = userResponse.data.user;
        setUser(userData);

        // Update form fields with the refreshed data
        setFirstName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setPhoneNumber(userData.phoneNumber || '');
        setProfileImage(userData.profileImage || null);
      }
    } catch (error) {
      // Check if it's a phone number already in use error
      if (error.response?.data?.field === 'phoneNumber' && error.response?.data?.error) {
        setProfileError(error.response.data.error);
      } else {
        showError(t('settings.errors.failedToUpdateProfile'));
      }
    }
  };

  const handleVerifyPhone = async () => {
    try {
      const response = await api.post('/api/users/verify-phone', {
        code: verificationCode
      });

      showSuccess(t('settings.phoneVerifiedSuccess'));
      setShowPhoneVerification(false);
      setVerificationCode('');

      // Update user with verified phone
      setUser(response.data.user);
    } catch (error) {
      showError(error.response?.data?.error || t('settings.errors.invalidVerificationCode'));
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

      const response = await api.put('/api/users/change-password', requestBody);

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

      // Reset state
      setDocuments([]);
      setTotalStorage(0);
      setFileData([]);

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
      // Refresh documents
      const response = await api.get('/api/documents');
      const docs = response.data.documents || [];
      setDocuments(docs);

      // Recalculate storage and file breakdown
      const total = docs.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);
      setTotalStorage(total);

      const breakdown = {
        video: { count: 0, size: 0 },
        document: { count: 0, size: 0 },
        image: { count: 0, size: 0 },
        other: { count: 0, size: 0 }
      };

      docs.forEach(doc => {
        const filename = doc.filename.toLowerCase();
        const size = doc.fileSize || 0;

        if (filename.match(/\.(mp4|avi|mov|wmv|flv|mkv|webm)$/)) {
          breakdown.video.count++;
          breakdown.video.size += size;
        } else if (filename.match(/\.(pdf|doc|docx|txt|rtf|odt)$/)) {
          breakdown.document.count++;
          breakdown.document.size += size;
        } else if (filename.match(/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/)) {
          breakdown.image.count++;
          breakdown.image.size += size;
        } else {
          breakdown.other.count++;
          breakdown.other.size += size;
        }
      });

      setFileData([
        { name: 'Video', value: breakdown.video.count, color: '#181818', size: formatBytes(breakdown.video.size) },
        { name: 'Document', value: breakdown.document.count, color: '#000000', size: formatBytes(breakdown.document.size) },
        { name: 'Image', value: breakdown.image.count, color: '#A8A8A8', size: formatBytes(breakdown.image.size) },
        { name: 'Other', value: breakdown.other.count, color: '#D9D9D9', size: formatBytes(breakdown.other.size) }
      ]);
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
        width: isExpanded ? 314 : 64,
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
              <SettingsFilledIcon style={{ width: 20, height: 20 }} />
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
              <ExpandIcon style={{ width: 20, height: 20, transform: 'rotate(180deg)' }} />
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
            <ExpandIcon style={{ width: 20, height: 20 }} />
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
                  <LayersIcon style={{ width: 20, height: 20 }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settings.general')}</div>
                </div>
                <Right3Icon style={{ width: 20, height: 20 }} />
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
                <LayersIcon style={{ width: 20, height: 20 }} />
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
                  <UserIcon style={{ width: 20, height: 20 }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settingsPage.profile')}</div>
                </div>
                <Right3Icon style={{ width: 20, height: 20 }} />
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
                <UserIcon style={{ width: 20, height: 20 }} />
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
                  <KeyIcon style={{ width: 20, height: 20 }} />
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('settingsPage.password')}</div>
                </div>
                <Right3Icon style={{ width: 20, height: 20 }} />
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
                <KeyIcon style={{ width: 20, height: 20 }} />
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
          padding: isMobile ? 16 : 32,
          paddingBottom: isMobile ? 80 : 32,
          overflow: 'auto',
          overflowX: 'hidden',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: isMobile ? 12 : 16,
          display: 'flex',
          WebkitOverflowScrolling: 'touch'
        }}>
          {/* Recovery Verification Banner */}
          <RecoveryVerificationBanner />

          {/* Language & Region Card */}
          <LanguageCard />

          {/* Introduction to Koda - Replay Onboarding */}
          <div
            onClick={handleReplayOnboarding}
            style={{
              alignSelf: 'stretch',
              padding: isMobile ? 16 : 24,
              background: 'white',
              borderRadius: isMobile ? 12 : 20,
              border: '2px solid #E6E6EC',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: isMobile ? 12 : 20,
              display: 'flex',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#F5F5F5'}
            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
          >
            {/* Icon - iMac emoji with shadow (matching LanguageCard pattern) */}
            <div style={{
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 42,
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))'
            }}>
              🖥️
            </div>

            {/* Text content */}
            <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
              <div style={{
                color: '#32302C',
                fontSize: 20,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                lineHeight: '28px'
              }}>
                {t('onboarding.settingsCard.title')}
              </div>
              <div style={{
                color: '#6C6B6E',
                fontSize: 15,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                lineHeight: '20px'
              }}>
                {t('onboarding.settingsCard.description')}
              </div>
            </div>

            {/* Chevron icon */}
            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Right3Icon style={{ width: 24, height: 24 }} />
            </div>
          </div>

          {/* Profile Card - Row 1 */}
          <div
            onClick={() => setActiveSection('profile')}
            style={{ alignSelf: 'stretch', padding: isMobile ? 16 : 24, background: 'white', borderRadius: isMobile ? 12 : 20, border: '2px solid #E6E6EC', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)', justifyContent: 'flex-start', alignItems: 'center', gap: isMobile ? 12 : 20, display: 'flex', cursor: 'pointer', transition: 'background 0.2s ease' }}
            onMouseOver={(e) => e.currentTarget.style.background = '#F5F5F5'}
            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
          >
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt="Profile"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))'
                }}
              />
            ) : (
              <div style={{
                width: 56,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 42,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                color: '#181818',
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))'
              }}>
                {user ? getInitials(user) : 'U'}
              </div>
            )}
            <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
              <div style={{ color: '#32302C', fontSize: 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '28px' }}>
                {user && (user.firstName || user.lastName)
                  ? `${capitalizeFirst(user.firstName) || ''} ${capitalizeFirst(user.lastName) || ''}`.trim()
                  : capitalizeFirst(user?.email.split('@')[0]) || 'User'}
              </div>
              <div style={{ color: '#6C6B6E', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '20px' }}>
                {user ? user.email : t('common.loading')}
              </div>
            </div>
          </div>

          {/* Cards Grid - 2x2 layout */}
          <div style={{
            alignSelf: 'stretch',
            display: isMobile ? 'flex' : 'grid',
            flexDirection: isMobile ? 'column' : undefined,
            gridTemplateColumns: isMobile ? undefined : '1fr 1fr',
            gridTemplateRows: isMobile ? undefined : 'auto auto',
            gap: isMobile ? 12 : 24
          }}>
            {/* Beta Access */}
            <div style={{ padding: isMobile ? 16 : 24, background: 'white', borderRadius: isMobile ? 12 : 20, border: '2px solid #E6E6EC', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 8 : 12, display: 'flex' }}>
              <img src={crownIcon} alt="Crown" style={{ width: 100, height: 80, objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))' }} />
              <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 4 : 8, display: 'flex' }}>
                <div style={{ color: '#32302C', fontSize: isMobile ? 24 : 32, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: isMobile ? '32px' : '40px' }}>{t('settingsPage.betaAccess')}</div>
                <div style={{ color: '#6C6B6E', fontSize: isMobile ? 13 : 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '20px' }}>
                  {t('settingsPage.betaSubtitle')}
                </div>
                {!isMobile && <div style={{ color: '#6C6B6E', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '22px', marginTop: 8 }}>
                  {t('settingsPage.betaDescription')}
                </div>}
              </div>
              <button
                onClick={() => setShowFeedbackModal(true)}
                style={{
                  paddingLeft: 18,
                  paddingRight: 18,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: '#F3F3F5',
                  borderRadius: 100,
                  border: '1px #E2E2E6 solid',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  alignSelf: 'flex-start'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#E8E8EC'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#F3F3F5'}
              >
                <div style={{
                  color: '#181818',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  lineHeight: '24px'
                }}>
                  {t('settingsPage.sendFeedback')}
                </div>
              </button>
            </div>

            {/* Storage */}
            <div style={{
              padding: isMobile ? 16 : 24,
              background: 'white',
              borderRadius: isMobile ? 12 : 20,
              border: '2px solid #E6E6EC',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: isMobile ? 12 : 16,
              display: 'flex',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
              cursor: 'default'
            }}
            >
              {/* Storage Icon */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', marginBottom: 8 }}>
                <img src={storageIcon} alt="Storage" style={{ width: 100, height: 80, objectFit: 'contain' }} />
              </div>

              {/* Header */}
              <div style={{ color: '#32302C', fontSize: 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' }}>{t('settingsPage.storage')}</div>

              {/* Storage amount */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ color: '#32302C', fontSize: isMobile ? 28 : 40, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '1' }}>{formatBytes(totalStorage)}</span>
                <span style={{ color: '#B9B9B9', fontSize: isMobile ? 16 : 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '600' }}>/ {formatBytes(storageLimit)}</span>
              </div>

              {/* Progress bar */}
              <div style={{ width: '100%', marginTop: isMobile ? 4 : 8 }}>
                <div style={{
                  width: '100%',
                  height: isMobile ? 8 : 12,
                  background: '#E2E2E6',
                  borderRadius: 100,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(storagePercentage, 100)}%`,
                    height: '100%',
                    background: storagePercentage > 90 ? '#EF4444' : storagePercentage > 70 ? '#F59E0B' : 'rgba(24, 24, 24, 0.90)',
                    borderRadius: 100,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 8,
                  color: '#6C6B6E',
                  fontSize: isMobile ? 11 : 12,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500'
                }}>
                  <span>{Math.round(storagePercentage)}% {t('settingsPage.used')}</span>
                  <span>{formatBytes(storageLimit - totalStorage)} {t('settingsPage.available')}</span>
                </div>
              </div>
            </div>

            {/* File Breakdown */}
            <div style={{ display: 'flex' }}>
              <FileBreakdownDonut showEncryptionMessage={false} compact={true} semicircle={true} style={{ flex: 1, height: '100%' }} />
            </div>

            {/* Recently Added */}
            <div style={{ padding: isMobile ? 16 : 24, background: 'white', borderRadius: isMobile ? 12 : 20, border: '2px solid #E6E6EC', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)', flexDirection: 'column', display: 'flex' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? 12 : 24 }}>
                <div style={{ color: '#32302C', fontSize: isMobile ? 16 : 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' }}>{t('settingsPage.recentlyAdded')}</div>
                <button
                  onClick={() => navigate('/documents')}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: '#6C6B6E',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: 8,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F5F5F5';
                    e.currentTarget.style.color = '#32302C';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#6C6B6E';
                  }}
                >
                  {t('settingsPage.seeAll')}
                </button>
              </div>

              {recentDocuments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {/* Table Header - Static, no sorting */}
                  {!isMobile && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      gap: 12,
                      padding: '10px 14px',
                      borderBottom: '1px solid #E6E6EC',
                      marginBottom: 4
                    }}>
                      <div style={{ color: '#6C6B6E', fontSize: 11, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'uppercase' }}>{t('documents.tableHeaders.name')}</div>
                      <div style={{ color: '#6C6B6E', fontSize: 11, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'uppercase' }}>{t('documents.tableHeaders.type')}</div>
                      <div style={{ color: '#6C6B6E', fontSize: 11, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'uppercase' }}>{t('documents.tableHeaders.size')}</div>
                      <div style={{ color: '#6C6B6E', fontSize: 11, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'uppercase' }}>{t('documents.tableHeaders.date')}</div>
                    </div>
                  )}
                  {recentDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="document-row"
                      onClick={() => navigate(`/document/${doc.id}`)}
                      style={isMobile ? {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: 14,
                        background: 'white',
                        border: '1px solid #E6E6EC',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        minHeight: 72,
                        boxSizing: 'border-box'
                      } : {
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                        gap: 12,
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'white',
                        border: '1px solid #E6E6EC',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F7F7F9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                      }}
                    >
                      {isMobile ? (
                        <>
                          <img src={getFileIcon(doc)} alt="File icon" style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))' }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.filename}
                            </div>
                            <div style={{ color: '#6C6B6E', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', marginTop: 2 }}>
                              {formatBytes(doc.fileSize)} • {new Date(doc.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                            <img src={getFileIcon(doc)} alt="File icon" style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))' }} />
                            <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.filename}
                            </div>
                          </div>
                          <div style={{ color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans' }}>{getFileTypeDisplay(doc)}</div>
                          <div style={{ color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans' }}>{formatBytes(doc.fileSize)}</div>
                          <div style={{ color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans' }}>{new Date(doc.createdAt).toLocaleDateString()}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{alignSelf: 'stretch', flex: '1 1 0', paddingLeft: 40, paddingRight: 40, paddingTop: 60, paddingBottom: 60, background: '#F5F5F5', overflow: 'hidden', borderRadius: 20, outline: '2px rgba(108, 107, 110, 0.40) solid', outlineOffset: '-2px', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 32, display: 'flex'}}>
                  <Document2Icon style={{width: 80, height: 80, opacity: 0.3}} />
                  <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 4, display: 'flex'}}>
                    <div style={{alignSelf: 'stretch', justifyContent: 'center', alignItems: 'flex-start', gap: 6, display: 'inline-flex'}}>
                      <div style={{color: '#32302C', fontSize: 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '30px', wordWrap: 'break-word'}}>{t('settingsPage.noDocumentYet')}</div>
                    </div>
                    <div style={{width: 366, textAlign: 'center', color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '24px', wordWrap: 'break-word'}}>{t('settingsPage.noDocumentDescription')}</div>
                  </div>
                  <div style={{width: 340, borderRadius: 12, justifyContent: 'center', alignItems: 'flex-start', gap: 8, display: 'inline-flex'}}>
                    <div style={{width: 166, height: 52, borderRadius: 14, justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex'}}>
                      <div
                        onClick={() => navigate('/upload-hub')}
                        style={{flex: '1 1 0', alignSelf: 'stretch', paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: 'white', overflow: 'hidden', borderRadius: 14, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', cursor: 'pointer'}}>
                        <div style={{color: '#323232', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px', wordWrap: 'break-word'}}>{t('settingsPage.selectFiles')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Log Out Card - Mobile Only */}
            {isMobile && (
              <button
                onClick={() => setShowLogoutModal(true)}
                style={{
                  alignSelf: 'stretch',
                  padding: '16px 20px',
                  background: 'white',
                  borderRadius: 12,
                  border: '2px solid #E6E6EC',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#FEF2F2';
                  e.currentTarget.style.borderColor = '#FFEBEE';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#E6E6EC';
                }}
              >
                {/* Log Out Icon */}
                <div style={{ color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOutIcon />
                </div>

                {/* Log Out Text */}
                <div style={{
                  color: '#EF4444',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  lineHeight: '24px'
                }}>
                  {t('nav.signOut')}
                </div>
              </button>
            )}
          </div>
        </div>
        )}

        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div data-settings-form="true" className="settings-form scrollable-content" style={{
            alignSelf: 'stretch',
            flex: '1 1 0',
            minHeight: 0,
            padding: isMobile ? 16 : 20,
            paddingBottom: isMobile ? 80 : 20,
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
          <div style={{ alignSelf: 'stretch', flex: '1 1 0', minHeight: 0, padding: isMobile ? 16 : 20, paddingBottom: isMobile ? 80 : 20, overflow: 'auto', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 12 : 20, display: 'flex' }}>
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

      {/* Phone Verification Modal */}
      {showPhoneVerification && (
        <>
          {/* Dark Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998
            }}
          />

          {/* Verification Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            background: 'white',
            borderRadius: 16,
            padding: 32,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
              {t('settingsPage.verifyPhone')}
            </h2>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' }}>
              {t('settingsPage.enterVerificationCode')} {phoneNumber}
            </p>

            <input
              type="text"
              placeholder={t('settingsPage.enter6DigitCode')}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              style={{
                width: '100%',
                height: 52,
                padding: '14px 16px',
                fontSize: 16,
                border: '1px solid #E0E0E0',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 16,
                textAlign: 'center',
                letterSpacing: '4px',
                fontSize: 24,
                fontWeight: '600'
              }}
            />

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setShowPhoneVerification(false);
                  setVerificationCode('');
                }}
                style={{
                  flex: 1,
                  height: 52,
                  background: '#F5F5F5',
                  border: '1px solid #E0E0E0',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleVerifyPhone}
                disabled={verificationCode.length !== 6}
                style={{
                  flex: 1,
                  height: 52,
                  background: verificationCode.length === 6 ? '#181818' : '#666',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: '600',
                  cursor: verificationCode.length === 6 ? 'pointer' : 'not-allowed'
                }}
              >
                {t('settingsPage.verify')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Settings;
