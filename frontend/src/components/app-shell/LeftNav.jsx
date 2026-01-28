import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as DocumentIcon } from '../../assets/Document 2.svg';
import { ReactComponent as FolderIcon } from '../../assets/Folder.svg';
import { ReactComponent as Folder1Icon } from '../../assets/Folder1.svg';
import { ReactComponent as HouseIcon } from '../../assets/House.svg';
import { ReactComponent as MessageIcon } from '../../assets/Message circle.svg';
import { ReactComponent as LogoutIcon } from '../../assets/Logout-white.svg';
import { ReactComponent as NotificationIcon } from '../../assets/Bell-white.svg';
import { ReactComponent as SettingsIcon } from '../../assets/Settings.svg';
import { ReactComponent as SignoutIcon } from '../../assets/signout.svg';
import { ReactComponent as SidebarIcon } from '../../assets/sidebar-icon.svg';
import LogoutModal from '../auth/LogoutModal';
import SidebarTooltip from './SidebarTooltip';
import { useIsMobile, useMobileBreakpoints } from '../../hooks/useIsMobile';
import { useAuth } from '../../context/AuthContext';
import useSidebarState from '../../hooks/useSidebarState';
import api from '../../services/api';
import kodaIcon from '../../assets/main-logo-b.svg';
import { spacing, radius, typography } from '../../design/tokens';

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

    // Handle auth button click - Sign In or Sign Out based on authentication
    const handleAuthButtonClick = () => {
        if (user) {
            setShowLogoutModal(true);
            setIsMobileMenuOpen(false);
        } else {
            navigate('/login');
            setIsMobileMenuOpen(false);
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
        borderRadius: 100,
        cursor: 'pointer',
        background: isActive ? 'rgba(255, 255, 255, 0.10)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
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

    // Toggle button icon (double caret)
    const ToggleIcon = () => (
        <SidebarIcon
            style={{
                width: 24,
                height: 24,
                transition: 'transform 0.3s ease',
            }}
        />
    );

    return (
        <div
            style={{
                width: currentWidth,
                height: '100%',
                background: '#181818',
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
                        paddingTop: 20,
                        paddingBottom: 0,
                    }}
                >
                    {/* Logo */}
                    <div
                        onClick={isExpanded ? () => navigate('/home') : toggle}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            borderRadius: 100,
                            width: 44,
                            height: 44,
                            transition: 'background 0.2s ease, transform 0.15s ease',
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
                        aria-label={isExpanded ? 'Go to home' : 'Expand sidebar'}
                    >
                        <img
                            style={{
                                height: 44,
                                width: 44,
                                objectFit: 'contain',
                            }}
                            src={kodaIcon}
                            alt="KODA Logo"
                        />
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
                        marginTop: 16,
                    }}
                >
                    {/* Home */}
                    <SidebarTooltip text={t('nav.home')} show={!isExpanded}>
                        <div
                            onClick={() => navigate('/home')}
                            style={getButtonStyle(location.pathname === '/home')}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === '/home')}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === '/home')}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.home')}
                            aria-current={location.pathname === '/home' ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate('/home');
                                }
                            }}
                        >
                            <HouseIcon style={{ width: 24, height: 24, flexShrink: 0, color: 'white' }} />
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: typography.body.size,
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
                            onClick={() => navigate('/chat')}
                            style={getButtonStyle(location.pathname === '/chat')}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === '/chat')}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === '/chat')}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.chat')}
                            aria-current={location.pathname === '/chat' ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate('/chat');
                                }
                            }}
                        >
                            <MessageIcon style={{ width: 24, height: 24, color: 'white', flexShrink: 0 }} />
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: typography.body.size,
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
                            onClick={() => navigate('/upload-hub')}
                            style={getButtonStyle(location.pathname === '/upload-hub')}
                            onMouseEnter={(e) => handleButtonHover(e, location.pathname === '/upload-hub')}
                            onMouseLeave={(e) => handleButtonLeave(e, location.pathname === '/upload-hub')}
                            role="button"
                            tabIndex={0}
                            aria-label={t('nav.upload')}
                            aria-current={location.pathname === '/upload-hub' ? 'page' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate('/upload-hub');
                                }
                            }}
                        >
                            <LogoutIcon style={{ width: 24, height: 24, flexShrink: 0 }} />
                            {isExpanded && (
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: typography.body.size,
                                        fontWeight: typography.bodyStrong.weight,
                                        fontFamily: typography.body.family,
                                    }}
                                >
                                    {t('nav.upload')}
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
                        <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <NotificationIcon style={{ width: 24, height: 24 }} />
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
                                    fontSize: typography.body.size,
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
                        onClick={() => navigate('/settings')}
                        style={getButtonStyle(location.pathname === '/settings')}
                        onMouseEnter={(e) => handleButtonHover(e, location.pathname === '/settings')}
                        onMouseLeave={(e) => handleButtonLeave(e, location.pathname === '/settings')}
                        role="button"
                        tabIndex={0}
                        aria-label={t('nav.settings')}
                        aria-current={location.pathname === '/settings' ? 'page' : undefined}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                navigate('/settings');
                            }
                        }}
                    >
                        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <SettingsIcon style={{ width: 24, height: 24, color: 'white' }} />
                        </div>
                        {isExpanded && (
                            <span
                                style={{
                                    color: 'white',
                                    fontSize: typography.body.size,
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
                        data-action="logout"
                        className="logout-button"
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
                            <SignoutIcon style={{ width: 24, height: 24, color: 'white', flexShrink: 0 }} />
                        {isExpanded && (
                            <span
                                style={{
                                    color: 'white',
                                    fontSize: typography.body.size,
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
