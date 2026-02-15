import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LeftNav from './LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import LanguageDropdown from '../shared/LanguageDropdown';
import { useNotifications } from '../../context/NotificationsStore';
import { useDocuments } from '../../context/DocumentsContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ReactComponent as HideIcon } from '../../assets/Hide.svg';
import { ReactComponent as CheckCircleIcon } from '../../assets/check-circle.svg';
import api from '../../services/api';
import LogoutModal from '../auth/LogoutModal';
import IntegrationsCard from '../home/IntegrationsCard';
import FileInsightsCard from '../home/FileInsightsCard';

// ─── Tokens (identical to Home / Upload / Integrations) ───
const F = 'Plus Jakarta Sans, sans-serif';
const C = {
  bg: '#F1F0EF', surface: '#FFFFFF', border: '#E6E6EC', hover: '#F5F5F5',
  text: '#32302C', muted: '#6C6B6E', primary: '#181818', primaryH: '#0F0F0F',
  success: '#34A853', error: '#D92D20', errorBg: '#FEF3F2',
};
const SHADOW = '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)';

// ── Inline SVG icons (20px, stroke 1.8, currentColor) ──
const Icons = {
  layers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  ),
  key: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  database: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  logOut: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  globe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  fileText: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  chevronR: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  externalLink: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  lock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  ),
  cookie: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="8" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/><circle cx="10" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>
    </svg>
  ),
  checkSquare: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
};

const SECTION_ICONS = {
  general: Icons.layers,
  storage: Icons.database,
  about: Icons.info,
};

// ═══════════════════════════════════════════════
const Settings = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { showSuccess, showError } = useNotifications();
  const { documents: contextDocuments, refreshAll } = useDocuments();
  const { updateUser: updateAuthUser } = useAuth();

  // ─── Section nav config (inside component for i18n) ───
  const SECTIONS = [
    { key: 'general', label: t('settings.general') },
    { key: 'storage', label: t('settings.storage') },
    { key: 'about', label: t('settings.about') },
  ];

  // ─── URL-based section nav ───
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('section') || 'general';
  const setActiveSection = (key) => setSearchParams({ section: key }, { replace: true });

  // ─── UI state ───
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);

  // ─── User / profile state ───
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [profileImage, setProfileImage] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.profileImage || null; } catch { return null; }
  });
  const [firstName, setFirstName] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.firstName || ''; } catch { return ''; }
  });
  const [lastName, setLastName] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.lastName || ''; } catch { return ''; }
  });
  const [phoneNumber, setPhoneNumber] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.phoneNumber || ''; } catch { return ''; }
  });
  const [profileError, setProfileError] = useState('');

  // ─── Password state ───
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // ─── Storage state ───
  const [totalStorage, setTotalStorage] = useState(() => {
    const c = sessionStorage.getItem('koda_settings_totalStorage');
    return c ? parseInt(c, 10) : 0;
  });
  const [storageLimit, setStorageLimit] = useState(() => {
    const c = sessionStorage.getItem('koda_settings_storageLimit');
    return c ? parseInt(c, 10) : 5 * 1024 * 1024 * 1024;
  });

  // ─── Data fetching ───
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/api/auth/me');
        const u = r.data.user;
        setUser(u); localStorage.setItem('user', JSON.stringify(u));
        setFirstName(u.firstName || ''); setLastName(u.lastName || '');
        setPhoneNumber(u.phoneNumber || ''); setProfileImage(u.profileImage || null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/api/storage');
        if (r.data) {
          setTotalStorage(r.data.used || 0);
          setStorageLimit(r.data.limit || 5 * 1024 * 1024 * 1024);
          sessionStorage.setItem('koda_settings_totalStorage', String(r.data.used || 0));
          sessionStorage.setItem('koda_settings_storageLimit', String(r.data.limit || 5 * 1024 * 1024 * 1024));
        }
      } catch {}
    })();
  }, []);

  // ─── Helpers ───
  const fmtBytes = (b) => {
    if (b === 0) return '0 B';
    const s = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(i >= 3 ? 2 : (i === 2 ? 1 : 0)) + ' ' + s[i];
  };

  const getInitials = (u) => {
    if (!u) return 'U';
    if (u.firstName) return u.firstName.charAt(0).toUpperCase();
    if (u.email) return u.email.split('@')[0].charAt(0).toUpperCase();
    return 'U';
  };

  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  const displayName = user && (user.firstName || user.lastName)
    ? `${cap(user.firstName) || ''} ${cap(user.lastName) || ''}`.trim()
    : cap(user?.email?.split('@')[0]) || 'User';

  const storagePct = storageLimit > 0 ? (totalStorage / storageLimit) * 100 : 0;

  // ─── Handlers ───
  const handleImageUpload = (e) => {
    const f = e.target.files[0];
    if (f && f.type.startsWith('image/')) {
      const r = new FileReader();
      r.onloadend = () => setProfileImage(r.result);
      r.readAsDataURL(f);
    }
  };

  const handleSaveProfile = async () => {
    setProfileError('');
    try {
      await api.patch('/api/users/me', { firstName, lastName, phoneNumber, profileImage });
      showSuccess(t('toasts.profileUpdatedSuccess'));
      const r = await api.get('/api/auth/me');
      const u = r.data.user;
      setUser(u); localStorage.setItem('user', JSON.stringify(u)); updateAuthUser(u);
      setFirstName(u.firstName || ''); setLastName(u.lastName || '');
      setPhoneNumber(u.phoneNumber || ''); setProfileImage(u.profileImage || null);
      setShowProfileModal(false);
    } catch (err) {
      if (err.response?.data?.field === 'phoneNumber') setProfileError(err.response.data.error);
      else showError(t('settings.errors.failedToUpdateProfile'));
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword) { showError(t('passwordValidation.enterNewPassword')); return; }
    if (newPassword !== confirmPassword) { showError(t('passwordValidation.passwordsDoNotMatch')); return; }
    if (newPassword.length < 8) { showError(t('passwordValidation.atLeast8Characters')); return; }
    if (!/[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword)) { showError(t('passwordValidation.mustContainSymbolOrNumber')); return; }
    try {
      const body = { newPassword };
      if (currentPassword) body.currentPassword = currentPassword;
      const r = await api.patch('/api/users/me/password', body);
      showSuccess(r.data.message || t('settings.passwordChangedSuccess'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setShowPasswordModal(false);
    } catch (err) {
      showError(err.response?.data?.error || t('settings.errors.failedToChangePassword'));
    }
  };

  // ═══════════════════════════════════════════════
  //  ROW COMPONENT (consistent 60px height, 16px pad)
  // ═══════════════════════════════════════════════
  const Row = ({ icon, title, desc, right, onClick, isLast, danger }) => {
    const [h, setH] = useState(false);
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => onClick && setH(true)}
        onMouseLeave={() => setH(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px', minHeight: 60,
          borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
          cursor: onClick ? 'pointer' : 'default',
          background: h ? C.hover : 'transparent',
          transition: 'background 120ms ease',
        }}
      >
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: C.hover,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: danger ? C.error : C.muted,
          }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: danger ? C.error : C.text, fontFamily: F, lineHeight: '20px' }}>
            {title}
          </div>
          {desc && (
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, fontFamily: F, lineHeight: '18px', marginTop: 1 }}>
              {desc}
            </div>
          )}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
        {onClick && !right && (
          <span style={{ color: C.muted, flexShrink: 0 }}>{Icons.chevronR}</span>
        )}
      </div>
    );
  };

  // ─── Pill button ───
  const Btn = ({ children, primary, danger, onClick, style: s = {} }) => {
    const [h, setH] = useState(false);
    return (
      <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{
          height: 34, padding: '0 16px', borderRadius: 9999,
          background: primary ? (h ? C.primaryH : C.primary) : (h ? (danger ? C.errorBg : C.hover) : C.surface),
          border: primary ? 'none' : `1px solid ${C.border}`,
          color: primary ? 'white' : danger ? C.error : C.text,
          cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: 13,
          transition: 'background 120ms ease', whiteSpace: 'nowrap', ...s,
        }}
      >
        {children}
      </button>
    );
  };

  // ═══════════════════════════════════════════════
  //  SECTION RENDERERS
  // ═══════════════════════════════════════════════

  const renderGeneral = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW }}>
        <Row
          icon={
            profileImage
              ? <img src={profileImage} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
              : <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: F, fontWeight: 700, fontSize: 15 }}>{getInitials(user)}</div>
          }
          title={displayName}
          desc={user?.email || ''}
          right={<Btn onClick={() => setShowProfileModal(true)}>{t('settings.editProfile')}</Btn>}
        />
        <Row
          icon={Icons.key}
          title={t('settings.password')}
          desc={t('settings.passwordDesc')}
          right={<Btn onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordModal(true); }}>{t('settings.changePassword')}</Btn>}
        />
        {/* Language row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', minHeight: 60, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.muted }}>
            {Icons.globe}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: F, lineHeight: '20px' }}>
              {t('settings.language.title')}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, fontFamily: F, lineHeight: '18px', marginTop: 1 }}>
              {t('settings.language.desc')}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <LanguageDropdown type="interface" variant="pill" />
          </div>
        </div>
        <Row
          icon={Icons.logOut}
          title={t('settings.signOut')}
          desc={t('settings.signOutDesc')}
          right={<Btn danger onClick={() => setShowLogoutModal(true)}>{t('settings.signOut')}</Btn>}
          isLast
        />
      </div>
      <IntegrationsCard />
    </div>
  );

  const renderStorage = () => {
    const barColor = storagePct > 90 ? C.error : storagePct > 70 ? '#F59E0B' : C.primary;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW, overflow: 'hidden', padding: '24px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: F }}>{fmtBytes(totalStorage)}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: C.muted, fontFamily: F }}>{t('settings.storageOf', { limit: fmtBytes(storageLimit) })}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.hover, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${Math.min(storagePct, 100)}%`, transition: 'width 500ms ease' }} />
          </div>
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.muted, fontFamily: F }}>{t('settings.storageUsed', { percent: storagePct.toFixed(1) })}</span>
          </div>
        </div>
        <div className="settings-file-insights">
          <FileInsightsCard />
        </div>
      </div>
    );
  };

  const renderAbout = () => {
    const extRight = <span style={{ color: C.muted, display: 'flex' }}>{Icons.externalLink}</span>;
    const openUrl = (url) => () => window.open(url, '_blank', 'noopener,noreferrer');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Version card */}
        <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW, overflow: 'hidden' }}>
          <Row
            icon={Icons.shield}
            title={t('settings.version')}
            desc={t('settings.versionDesc')}
            right={<span style={{ fontSize: 13, fontWeight: 600, color: C.muted, fontFamily: F }}>0.1.0 (Beta)</span>}
            isLast
          />
        </div>
        {/* Legal & Policies card */}
        <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, fontFamily: F }}>
            {t('settings.legalAndPolicies')}
          </div>
          <Row
            icon={Icons.fileText}
            title={t('settings.termsOfService')}
            desc={t('settings.termsOfServiceDesc')}
            onClick={openUrl('https://www.getkoda.io/terms.html')}
            right={extRight}
          />
          <Row
            icon={Icons.shield}
            title={t('settings.privacyPolicy')}
            desc={t('settings.privacyPolicyDesc')}
            onClick={openUrl('https://www.getkoda.io/privacy.html')}
            right={extRight}
          />
          <Row
            icon={Icons.cookie}
            title={t('settings.cookiePolicy')}
            desc={t('settings.cookiePolicyDesc')}
            onClick={openUrl('https://www.getkoda.io/cookies.html')}
            right={extRight}
          />
          <Row
            icon={Icons.lock}
            title={t('settings.securityPolicy')}
            desc={t('settings.securityPolicyDesc')}
            onClick={openUrl('https://www.getkoda.io/security.html')}
            right={extRight}
          />
          <Row
            icon={Icons.checkSquare}
            title={t('settings.acceptableUsePolicy')}
            desc={t('settings.acceptableUsePolicyDesc')}
            onClick={openUrl('https://www.getkoda.io/acceptable-use.html')}
            right={extRight}
            isLast
          />
        </div>
      </div>
    );
  };

  const renderers = { general: renderGeneral, storage: renderStorage, about: renderAbout };

  // ── Password field helper ──
  const PwField = ({ label, value, onChange, show, toggleShow, placeholder }) => (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: F, display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', height: 44, borderRadius: 9999, border: `1px solid ${C.border}`, background: C.surface, paddingRight: 12, overflow: 'hidden' }}>
        <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, height: '100%', padding: '0 16px', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: F, color: C.text }} />
        <div onClick={toggleShow} style={{ cursor: 'pointer', display: 'flex', color: C.muted }}>
          <HideIcon style={{ width: 18, height: 18 }} />
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════
  return (
    <div data-page="settings" style={{
      width: '100%', height: isMobile ? 'auto' : '100vh', minHeight: isMobile ? '100vh' : 'auto',
      background: C.bg, overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex', flexDirection: isMobile ? 'column' : 'row',
    }}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      <div style={{ flex: 1, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* ── Header ── */}
        <div style={{
          minHeight: isMobile ? 56 : 72, paddingLeft: isMobile ? 16 : 48, paddingRight: isMobile ? 16 : 48,
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 600, color: C.text, fontFamily: F, lineHeight: '30px' }}>
              {t('settings.title')}
            </h1>
            {!isMobile && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.muted, fontFamily: F, lineHeight: '18px' }}>
                {t('settings.headerSubtitle')}
              </p>
            )}
          </div>
        </div>

        {/* ── Mobile tabs ── */}
        {isMobile && (
          <div style={{
            padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`,
            display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, WebkitOverflowScrolling: 'touch',
          }}>
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                style={{
                  padding: '6px 14px', borderRadius: 9999, border: 'none',
                  background: activeSection === s.key ? C.primary : C.hover,
                  color: activeSection === s.key ? 'white' : C.text,
                  fontFamily: F, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Constrain FileInsightsCard icon row in Settings — prevents wide space-evenly spreading */}
        <style>{`
          .settings-file-insights div:has(> [data-testid="file-insight-icon"]) {
            justify-content: flex-start !important;
          }
        `}</style>

        {/* ── Content ── */}
        <div style={{ flex: 1, padding: isMobile ? 16 : '24px 48px', overflowY: 'auto', maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: 20, alignItems: 'start' }}>

            {/* ── Left: Section nav ── */}
            {!isMobile && (
              <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW, overflow: 'hidden', position: 'sticky', top: 0, paddingTop: 8, paddingBottom: 8 }}>
                {SECTIONS.map(s => {
                  const active = activeSection === s.key;
                  return (
                    <button key={s.key} onClick={() => setActiveSection(s.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 16px)',
                        height: 44, padding: '0 16px', border: 'none', textAlign: 'left',
                        background: active ? C.hover : 'transparent',
                        borderRadius: 10,
                        margin: '0 8px',
                        cursor: 'pointer', transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = C.hover; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? C.hover : 'transparent'; }}
                    >
                      <span style={{ color: active ? C.text : C.muted, display: 'flex', transition: 'color 120ms ease' }}>
                        {SECTION_ICONS[s.key]}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: active ? 600 : 500, color: C.text, fontFamily: F, lineHeight: '20px' }}>
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Right: Content ── */}
            <div style={{ minWidth: 0 }}>
              {renderers[activeSection]?.() || renderGeneral()}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PROFILE MODAL ═══ */}
      {showProfileModal && (
        <div onClick={() => setShowProfileModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 24px 48px rgba(0,0,0,0.16)', margin: isMobile ? 16 : 0, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text, fontFamily: F }}>{t('settings.editProfile')}</h2>
              <button onClick={() => setShowProfileModal(false)} aria-label="Close"
                style={{ width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>&#x2715;</button>
            </div>

            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <label style={{ cursor: 'pointer', position: 'relative' }}>
                {profileImage
                  ? <img src={profileImage} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.border}` }} />
                  : <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: F, fontWeight: 700, fontSize: 26, border: `2px solid ${C.border}` }}>{getInitials(user)}</div>
                }
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: C.primary, border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </div>
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'First name', value: firstName, onChange: setFirstName, type: 'text', ph: 'First name' },
                { label: 'Last name', value: lastName, onChange: setLastName, type: 'text', ph: 'Last name' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: F, display: 'block', marginBottom: 6 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.ph} value={f.value} onChange={(e) => f.onChange(e.target.value)}
                    style={{ width: '100%', height: 42, padding: '0 16px', borderRadius: 9999, border: `1px solid ${C.border}`, background: C.surface, fontSize: 14, fontFamily: F, color: C.text, outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms ease' }}
                    onFocus={(e) => { e.target.style.borderColor = '#A2A2A7'; }} onBlur={(e) => { e.target.style.borderColor = C.border; }} />
                </div>
              ))}

              {/* Email (read-only) */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: F, display: 'block', marginBottom: 6 }}>Email</label>
                <input type="email" value={user?.email || ''} readOnly
                  style={{ width: '100%', height: 42, padding: '0 16px', borderRadius: 9999, border: `1px solid ${C.border}`, background: C.hover, fontSize: 14, fontFamily: F, color: C.muted, outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed' }} />
              </div>

              {/* Phone */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: F, display: 'block', marginBottom: 6 }}>Phone number</label>
                <input type="tel" placeholder="+1 (555) 000-0000" value={phoneNumber}
                  onChange={(e) => { setPhoneNumber(e.target.value); setProfileError(''); }}
                  style={{ width: '100%', height: 42, padding: '0 16px', borderRadius: 9999, border: `1px solid ${profileError ? C.error : C.border}`, background: C.surface, fontSize: 14, fontFamily: F, color: C.text, outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms ease' }}
                  onFocus={(e) => { if (!profileError) e.target.style.borderColor = '#A2A2A7'; }} onBlur={(e) => { if (!profileError) e.target.style.borderColor = C.border; }} />
                {profileError && (
                  <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 10, background: C.errorBg, color: C.error, fontSize: 13, fontFamily: F, fontWeight: 500 }}>{profileError}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowProfileModal(false)} style={{ height: 38, padding: '0 18px', fontSize: 14 }}>Cancel</Btn>
              <Btn primary onClick={handleSaveProfile} style={{ height: 38, padding: '0 18px', fontSize: 14 }}>Save changes</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PASSWORD MODAL ═══ */}
      {showPasswordModal && (
        <div onClick={() => setShowPasswordModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 24px 48px rgba(0,0,0,0.16)', margin: isMobile ? 16 : 0, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text, fontFamily: F }}>{t('settings.changePassword')}</h2>
              <button onClick={() => setShowPasswordModal(false)} aria-label="Close"
                style={{ width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>&#x2715;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PwField label="Current password" value={currentPassword} onChange={setCurrentPassword} show={showCurrentPw} toggleShow={() => setShowCurrentPw(!showCurrentPw)} placeholder="Enter current password" />
              <PwField label="New password" value={newPassword} onChange={setNewPassword} show={showNewPw} toggleShow={() => setShowNewPw(!showNewPw)} placeholder="Enter new password" />
              <PwField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} show={showConfirmPw} toggleShow={() => setShowConfirmPw(!showConfirmPw)} placeholder="Confirm new password" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {[
                  { met: !newPassword || (!user?.email?.includes(newPassword) && !user?.firstName?.toLowerCase().includes(newPassword.toLowerCase()) && !user?.lastName?.toLowerCase().includes(newPassword.toLowerCase())), label: 'Must not contain your name or email' },
                  { met: newPassword.length >= 8, label: 'At least 8 characters' },
                  { met: /[!@#$%^&*(),.?":{}|<>0-9]/.test(newPassword), label: 'Contains a symbol or number' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircleIcon style={{ width: 16, height: 16, color: r.met ? C.success : 'rgba(50,48,44,0.25)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: F }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowPasswordModal(false)} style={{ height: 38, padding: '0 18px', fontSize: 14 }}>Cancel</Btn>
              <Btn primary onClick={handlePasswordChange} style={{ height: 38, padding: '0 18px', fontSize: 14 }}>Change password</Btn>
            </div>
          </div>
        </div>
      )}

      <NotificationPanel showNotificationsPopup={showNotificationsPopup} setShowNotificationsPopup={setShowNotificationsPopup} />
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
};

export default Settings;
