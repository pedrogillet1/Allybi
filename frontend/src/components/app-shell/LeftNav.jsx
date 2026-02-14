import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as DocumentIcon } from '../../assets/Document 2.svg';
import { ReactComponent as FolderIcon } from '../../assets/Folder.svg';
import { ReactComponent as Folder1Icon } from '../../assets/Folder1.svg';
import homeSidebarIcon from '../../assets/home-sidebar-icon.svg';
import chatSidebarIcon from '../../assets/chat-sidebar-icon.svg';
import { ReactComponent as LogoutIcon } from '../../assets/Logout-white.svg';
import notificationSidebarIcon from '../../assets/notification-sidebar-icon.svg';
import settingsSidebarIcon from '../../assets/settings-sidebar-icon.svg';
import uploadSidebarIcon from '../../assets/upload.svg';
import integrationsSidebarIcon from '../../assets/integrations-sidebar-icon.svg';
import { ReactComponent as SignoutIcon } from '../../assets/signout.svg';
import logoutSidebarIcon from '../../assets/logout-sidebar-icon.svg';
import { ReactComponent as ExpandIcon } from '../../assets/expand.svg';
import { ReactComponent as CollapseIcon } from '../../assets/collapse.svg';
import SidebarTooltip from './SidebarTooltip';
import { useIsMobile, useMobileBreakpoints } from '../../hooks/useIsMobile';
import { useAuth } from '../../context/AuthContext';
import useSidebarState from '../../hooks/useSidebarState';
import api from '../../services/api';
import kodaIcon from '../../assets/koda-knot-white.svg';
import { spacing, radius, typography } from '../../design/tokens';
import LogoutModal from '../auth/LogoutModal';
import { ROUTES } from '../../constants/routes';
import { emitAuthModalOpen } from '../../utils/authModalBus';

/**
 * LeftNav - Main sidebar navigation component
 *
 * Features:
 * - Expand/collapse with state persistence
 * - Responsive widths for different desktop sizes
 * - Tooltips in collapsed state
 * - Keyboard shortcut support (Cmd/Ctrl + Shift + L)
 * - Multi-tab synchronization
 * - Full accessibility support
 * - Smooth animations
 *
 * Responsive Behavior:
 * - Mobile (≤768px): Hidden (uses MobileBottomNav instead)
 * - Small Desktop (1024-1366px): 160px / 64px
 * - Medium Desktop (1367-1920px): 180px / 72px
 * - Large Desktop (1921px+): 200px / 80px
 */
const LeftNav = ({ onNotificationClick, hamburgerTop = 16 }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const mobile = useMobileBreakpoints();
    const { user } = useAuth();

    // Sidebar state management
    const { isExpanded, toggle, currentWidth } = useSidebarState();

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
    const [logoHovered, setLogoHovered] = useState(false);

    // Handle auth button click - Sign In or Sign Out based on authentication
    const handleAuthButtonClick = () => {
        if (user) {
            setShowLogoutModal(true);
            setIsMobileMenuOpen(false);
        } else {
            // Navigate to full login page (not modal)
            setIsMobileMenuOpen(false);
            window.location.href = ROUTES.LOGIN;
        }
    };

    // Close mobile menu when route changes
    useEffect(() => {
        if (isMobile) {
            setIsMobileMenuOpen(false);
        }
    }, [location.pathname, isMobile]);

    // Mobile: No sidebar - navigation handled by MobileBottomNav
    if (isMobile) {
        return null;
    }

    // Shared button style generator
    const getButtonStyle = (isActive) => ({
        padding: isExpanded ? '0 8px 0 10px' : 0,
        borderRadius: 12,
        cursor: 'pointer',
        background: isActive ? 'rgba(255, 255, 255, 0.10)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        justifyContent: isExpanded ? 'flex-start' : 'center',
        width: isExpanded ? '100%' : 44,
        height: 44,
        transition: 'background 0.2s ease, transform 0.15s ease',
        position: 'relative',
    });

    const handleButtonHover = (e, isActive) => {
        e.currentTarget.style.transform = 'scale(1.04)';
        if (!isActive) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }
    };

    const handleButtonLeave = (e, isActive) => {
        e.currentTarget.style.transform = 'scale(1)';
        if (!isActive) {
            e.currentTarget.style.background = 'transparent';
        }
    };

    // Toggle button icon (double chevron)
    const ToggleIcon = () => (
        <CollapseIcon
            style={{
                width: 32,
                height: 32,
                transition: 'transform 0.3s ease',
                filter: 'brightness(0) invert(1)',
            }}
        />
    );

    return (
        <div
            style={{
                width: currentWidth,
                height: '100%',
                background: '#222222',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: isExpanded ? 'flex-start' : 'center',
                paddingTop: 0,
                paddingBottom: spacing.xl,
                transition: 'width 0.3s ease',
                position: 'relative',
                flexShrink: 0,
            }}
            role="navigation"
            aria-label="Main navigation"
            aria-expanded={isExpanded}
        >
            {/* Top Section - Logo and Toggle */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isExpanded ? 'stretch' : 'center',
                    width: '100%',
                    paddingLeft: isExpanded ? 16 : 0,
                    paddingRight: isExpanded ? 16 : 0,
                }}
            >
                {/* Logo and Toggle Button */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: isExpanded ? 'space-between' : 'center',
                        alignItems: 'center',
                        width: '100%',
                        paddingTop: 28,
                        paddingBottom: 0,
                    }}
                >
                    {/* Logo */}
                    <div
                        onClick={isExpanded ? () => navigate(ROUTES.HOME) : toggle}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isExpanded ? 'flex-start' : 'center',
                            cursor: 'pointer',
                            borderRadius: 100,
                            width: isExpanded ? 'auto' : 44,
                            height: 44,
                            transition: 'background 0.2s ease, transform 0.15s ease',
                            position: 'relative',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.transform = 'scale(1.04)';
                            if (!isExpanded) setLogoHovered(true);
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.transform = 'scale(1)';
                            setLogoHovered(false);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={isExpanded ? 'Go to home' : 'Expand sidebar'}
                    >
                        {/* Logo image */}
                        <img
                            style={{
                                height: 44,
                                width: 44,
                                objectFit: 'contain',
                                opacity: (!isExpanded && logoHovered) ? 0 : 1,
                                transition: 'opacity 0.25s ease',
                            }}
                            src={kodaIcon}
                            alt="KODA Logo"
                        />
                        {/* Expand icon overlay - visible on hover when collapsed */}
                        {!isExpanded && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: 44,
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: logoHovered ? 1 : 0,
                                    transition: 'opacity 0.25s ease',
                                    pointerEvents: 'none',
                                }}
                            >
                                <ExpandIcon
                                    style={{
                                        width: 32,
                                        height: 32,
                                        filter: 'brightness(0) invert(1)',
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Toggle arrows - only when expanded */}
                    {isExpanded && (
                        <div
                            onClick={toggle}
                            style={{
                                padding: spacing.sm,
                                borderRadius: 100,
                                cursor: 'pointer',
                                background: 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s ease, transform 0.15s ease',
                                width: 44,
                                height: 44,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.transform = 'scale(1.04)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Collapse sidebar"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggle();
                                }
                            }}
                        >
                            <ToggleIcon />
                        </div>
                    )}
                </div>

                {/* Navigation Items */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: spacing.lg,
                        width: '100%',
                        alignItems: isExpanded ? 'stretch' : 'center',
                        marginTop: 24,
                    }}
                >
                    {/* Home */}
                    <SidebarTooltip text={t('nav.home')} show={!isExpanded}>
                        <div
                            onClick={() => navigate(ROUTES.HOME)}
                            style={getButtonStyle(location.pathname === ROUTES.HOME)}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === ROUTES.HOME)}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === ROUTES.HOME)}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.home')}
                            aria-current={location.pathname === ROUTES.HOME ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(ROUTES.HOME);
                                }
                            }}
                        >
                            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <img src={homeSidebarIcon} alt="" style={{ width: 26, height: 26 }} />
                            </div>
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: '16px',
                                        fontWeight: typography.bodyStrong.weight,
                                        fontFamily: typography.body.family,
                                    }}
                                >
                                    {t('nav.home')}
                                </span>
                            )}
                        </div>
                    </SidebarTooltip>

                    {/* Chat */}
                    <SidebarTooltip text={t('nav.chat')} show={!isExpanded}>
                        <div
                            onClick={() => navigate(ROUTES.CHAT)}
                            style={getButtonStyle(location.pathname === ROUTES.CHAT)}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === ROUTES.CHAT)}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === ROUTES.CHAT)}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.chat')}
                            aria-current={location.pathname === ROUTES.CHAT ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(ROUTES.CHAT);
                                }
                            }}
                        >
                            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <img src={chatSidebarIcon} alt="" style={{ width: 26, height: 26 }} />
                            </div>
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: '16px',
                                        fontWeight: typography.bodyStrong.weight,
                                        fontFamily: typography.body.family,
                                    }}
                                >
                                    {t('nav.chat')}
                                </span>
                            )}
                        </div>
                    </SidebarTooltip>

                    {/* Upload */}
                    <SidebarTooltip text={t('nav.upload')} show={!isExpanded}>
                        <div
                            onClick={() => navigate(ROUTES.UPLOAD_HUB)}
                            style={getButtonStyle(location.pathname === ROUTES.UPLOAD_HUB)}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === ROUTES.UPLOAD_HUB)}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === ROUTES.UPLOAD_HUB)}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.upload')}
                            aria-current={location.pathname === ROUTES.UPLOAD_HUB ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(ROUTES.UPLOAD_HUB);
                                }
                            }}
                        >
                            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <img
                                    src={uploadSidebarIcon}
                                    alt=""
                                    style={{ width: 26, height: 26 }}
                                />
                            </div>
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: '16px',
                                        fontWeight: typography.bodyStrong.weight,
                                        fontFamily: typography.body.family,
                                    }}
                                >
                                    {t('nav.upload')}
                                </span>
                            )}
                        </div>
                    </SidebarTooltip>

                    {/* Integrations */}
                    <SidebarTooltip text="Integrations" show={!isExpanded}>
                        <div
                            onClick={() => navigate(ROUTES.INTEGRATIONS)}
                            style={getButtonStyle(location.pathname === ROUTES.INTEGRATIONS)}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === ROUTES.INTEGRATIONS)}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === ROUTES.INTEGRATIONS)}
                            role="button"
                            tabIndex={0}
                            aria-label="Integrations"
                            aria-current={location.pathname === ROUTES.INTEGRATIONS ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(ROUTES.INTEGRATIONS);
                                }
                            }}
                        >
                            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <img src={integrationsSidebarIcon} alt="" style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)' }} />
                            </div>
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: '16px',
                                        fontWeight: typography.bodyStrong.weight,
                                        fontFamily: typography.body.family,
                                    }}
                                >
                                    Integrations
                                </span>
                            )}
                        </div>
                    </SidebarTooltip>
                </div>
            </div>

            {/* Bottom Section */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isExpanded ? 'stretch' : 'center',
                    gap: 16,
                    width: '100%',
                    paddingLeft: isExpanded ? 16 : 0,
                    paddingRight: isExpanded ? 16 : 0,
                }}
            >
                {/* Notifications */}
                <SidebarTooltip text={t('nav.notifications')} show={!isExpanded}>
                    <div
                        onClick={onNotificationClick}
                        style={getButtonStyle(false)}
                        onMouseEnter={(e) => handleButtonHover(e, false)}
                        onMouseLeave={(e) => handleButtonLeave(e, false)}
                        role="button"
                        tabIndex={0}
                        aria-label={t('nav.notifications')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onNotificationClick?.();
                            }
                        }}
                    >
                        <div style={{ position: 'relative', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <img src={notificationSidebarIcon} alt="" style={{ width: 26, height: 26 }} />
                            {hasUnreadNotifications && (
                                <div
                                    style={{
                                        width: 8,
                                        height: 8,
                                        position: 'absolute',
                                        right: -2,
                                        top: -2,
                                        background: '#D92D20',
                                        borderRadius: 9999,
                                    }}
                                    aria-label="Unread notifications"
                                />
                            )}
                        </div>
                        {isExpanded && (
                            <span
                                style={{
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: typography.bodyStrong.weight,
                                    fontFamily: typography.body.family,
                                }}
                            >
                                {t('nav.notifications')}
                            </span>
                        )}
                    </div>
                </SidebarTooltip>

                    {/* Settings */}
                <SidebarTooltip text={t('nav.settings')} show={!isExpanded}>
                    <div
                        onClick={() => navigate(ROUTES.SETTINGS)}
                        style={getButtonStyle(location.pathname === ROUTES.SETTINGS)}
                        onMouseEnter={(e) => handleButtonHover(e, location.pathname === ROUTES.SETTINGS)}
                        onMouseLeave={(e) => handleButtonLeave(e, location.pathname === ROUTES.SETTINGS)}
                        role="button"
                        tabIndex={0}
                        aria-label={t('nav.settings')}
                        aria-current={location.pathname === ROUTES.SETTINGS ? 'page' : undefined}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate(ROUTES.SETTINGS);
                            }
                        }}
                    >
                        <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <img
                                src={settingsSidebarIcon}
                                alt=""
                                style={{ width: 26, height: 26 }}
                            />
                        </div>
                        {isExpanded && (
                            <span
                                style={{
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: typography.bodyStrong.weight,
                                    fontFamily: typography.body.family,
                                }}
                            >
                                {t('nav.settings')}
                            </span>
                        )}
                    </div>
                </SidebarTooltip>

                {/* Sign In/Out */}
                <SidebarTooltip text={user ? t('nav.signOut') : t('nav.signIn')} show={!isExpanded}>
                    <div
                        {...(user ? { 'data-action': 'logout', className: 'logout-button' } : {})}
                        onClick={handleAuthButtonClick}
                        style={getButtonStyle(false)}
                        onMouseEnter={(e) => handleButtonHover(e, false)}
                        onMouseLeave={(e) => handleButtonLeave(e, false)}
                        role="button"
                        tabIndex={0}
                        aria-label={user ? t('nav.signOut') : t('nav.signIn')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleAuthButtonClick();
                            }
                        }}
                    >
                            <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <img src={logoutSidebarIcon} alt="" style={{ width: 26, height: 26 }} />
                            </div>
                        {isExpanded && (
                            <span
                                style={{
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: typography.bodyStrong.weight,
                                    fontFamily: typography.body.family,
                                }}
                            >
                                {user ? t('nav.signOut') : t('nav.signIn')}
                            </span>
                        )}
                    </div>
                </SidebarTooltip>
            </div>

            {/* Logout Modal */}
            <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
        </div>
    );
};

export default LeftNav;
