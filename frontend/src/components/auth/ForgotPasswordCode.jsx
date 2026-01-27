import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import backArrow from '../assets/arrow-narrow-left.svg';
import blockIcon from '../assets/block.svg';

const ForgotPasswordCode = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [timer, setTimer] = useState(14);
    const [isResending, setIsResending] = useState(false);

    // Get contact info from previous screen
    const contactInfo = location.state?.contactInfo || '';
    const method = location.state?.method || 'email';

    // Countdown timer
    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => {
                setTimer(prev => prev - 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [timer]);

    const handleResend = async () => {
        if (timer > 0 || isResending) return;

        setIsResending(true);
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: method === 'email' ? contactInfo : undefined,
                    phoneNumber: method === 'message' ? contactInfo : undefined,
                }),
            });

            if (response.ok) {
                setTimer(14); // Restart countdown
                // Could add a toast notification here
            }
        } catch (error) {
            console.error('Failed to resend:', error);
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div style={{display: 'flex', width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', background: '#FFFFFF'}}>
            {/* Back Button */}
            <div onClick={() => navigate(-1)} style={{alignSelf: 'flex-start', justifyContent: 'center', alignItems: 'center', gap: 4, display: 'flex', cursor: 'pointer', margin: '16px 0 0 16px'}}>
                <img src={backArrow} alt={t('common.back')} />
                <div style={{color: '#181818', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px'}}>{t('common.back')}</div>
            </div>

            {/* Main Content */}
            <section
                role="status"
                aria-labelledby="reset-title"
                style={{
                    maxWidth: 560,
                    margin: '0 auto',
                    paddingTop: 72,
                    paddingBottom: 72,
                    paddingLeft: 24,
                    paddingRight: 24,
                    textAlign: 'center',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}
            >
                {/* Icon Badge */}
                <div
                    aria-hidden="true"
                    style={{
                        width: 64,
                        height: 64,
                        margin: '0 auto 16px',
                        background: '#F6F6F6',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <img src={blockIcon} alt="" style={{width: 24, height: 24}} />
                </div>

                {/* Heading */}
                <h1
                    id="reset-title"
                    style={{
                        fontSize: 22,
                        fontWeight: 600,
                        color: '#000000',
                        letterSpacing: '-0.2px',
                        fontFamily: 'Plus Jakarta Sans',
                        marginBottom: 8
                    }}
                >
                    {t('forgotPassword.checkYourEmail')}
                </h1>

                {/* Body */}
                <p style={{
                    maxWidth: 480,
                    margin: '0 auto',
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: '#6B6B6B',
                    fontFamily: 'Plus Jakarta Sans',
                    marginBottom: 32
                }}>
                    {t('forgotPassword.secureLinkSent')}<br />
                    <strong style={{color: '#000000', fontWeight: 500, wordBreak: 'break-word'}}>{contactInfo}</strong>
                </p>

                {/* Primary Button */}
                <button
                    onClick={() => navigate('/login')}
                    style={{
                        width: 180,
                        height: 44,
                        margin: '0 auto',
                        background: '#000000',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 500,
                        fontFamily: 'Plus Jakarta Sans',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        outline: 'none'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    onFocus={(e) => {
                        e.currentTarget.style.outline = '2px solid #000000';
                        e.currentTarget.style.outlineOffset = '2px';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.outline = 'none';
                    }}
                >
                    {t('passwordChanged.backToLogin')}
                </button>

                {/* Resend Row */}
                <p
                    id="resend"
                    aria-live="polite"
                    style={{
                        marginTop: 16,
                        fontSize: 13,
                        color: '#7A7A7A',
                        fontFamily: 'Plus Jakarta Sans'
                    }}
                >
                    {t('forgotPassword.didntGetEmailLower')}{' '}
                    {timer > 0 ? (
                        <span style={{color: '#B3B3B3'}}>
                            {t('forgotPassword.resendIn', { time: `00:${String(timer).padStart(2, '0')}` })}
                        </span>
                    ) : (
                        <button
                            onClick={handleResend}
                            disabled={isResending}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontFamily: 'Plus Jakarta Sans',
                                fontSize: 13,
                                fontWeight: 500,
                                color: '#000000',
                                cursor: isResending ? 'default' : 'pointer',
                                textDecoration: 'none',
                                outline: 'none'
                            }}
                            onMouseEnter={(e) => !isResending && (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                            onFocus={(e) => {
                                e.currentTarget.style.outline = '2px solid #000000';
                                e.currentTarget.style.outlineOffset = '2px';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.outline = 'none';
                            }}
                        >
                            {isResending ? t('common.sending') : t('common.resend')}
                        </button>
                    )}
                </p>

                {/* Back Link */}
                <a
                    href="/login"
                    onClick={(e) => {
                        e.preventDefault();
                        navigate('/login');
                    }}
                    style={{
                        marginTop: 24,
                        display: 'inline-block',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#000000',
                        fontFamily: 'Plus Jakarta Sans',
                        textDecoration: 'none',
                        outline: 'none'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    onFocus={(e) => {
                        e.currentTarget.style.outline = '2px solid #000000';
                        e.currentTarget.style.outlineOffset = '2px';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.outline = 'none';
                    }}
                >
                    {t('passwordChanged.backToLogin')}
                </a>
            </section>
        </div>
    );
};

export default ForgotPasswordCode;
