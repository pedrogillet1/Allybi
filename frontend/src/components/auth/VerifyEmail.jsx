import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_AUTH_REDIRECT } from '../constants/routes';
import backArrow from '../assets/arrow-narrow-left.svg';

const VerifyEmail = () => {
    const { t } = useTranslation();
    const [code, setCode] = useState(new Array(6).fill(''));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isResending, setIsResending] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [resendHover, setResendHover] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const inputsRef = useRef([]);
    const { verifyPendingEmail, resendPendingEmail } = useAuth();

    // Get email from navigation state or localStorage
    const email = location.state?.email || localStorage.getItem('pendingEmail') || '';

    // Send initial verification code when component mounts
    React.useEffect(() => {
        const sendInitialCode = async () => {
            if (email) {
                try {
                    await resendPendingEmail({ email });
                    console.log('✅ Initial verification code sent');
                } catch (error) {
                    console.error('Error sending initial code:', error);
                    setError(t('auth.verifyEmail.sendFailed'));
                }
            }
        };
        sendInitialCode();
    }, []); // Empty dependency array - only run once on mount

    // Countdown timer effect
    React.useEffect(() => {
        if (resendCountdown > 0) {
            const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCountdown]);

    const handleResendCode = async () => {
        if (resendCountdown > 0) return;

        setIsResending(true);
        setError('');
        setSuccessMessage('');

        try {
            await resendPendingEmail({ email });
            setSuccessMessage(t('auth.verifyEmail.codeResent'));
            setResendCountdown(60); // 60 seconds cooldown

            // Clear success message after 5 seconds
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
            console.error('Error resending code:', error);
            setError(error.message || 'Failed to resend code');
        } finally {
            setIsResending(false);
        }
    };

    const handleVerify = async () => {
        const verificationCode = code.join('');
        if (verificationCode.length !== 6) {
            setError(t('auth.verifyEmail.incompleteCode'));
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await verifyPendingEmail({ email, code: verificationCode });

            console.log('✅ Email verified successfully');
            // Navigate to chat after successful verification
            navigate(DEFAULT_AUTH_REDIRECT);
        } catch (error) {
            console.error('Error verifying email:', error);
            setError(error.message || 'Invalid verification code');
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e, index) => {
        const { value } = e.target;
        if (/^[0-9]$/.test(value) || value === '') {
            const newCode = [...code];
            newCode[index] = value;
            setCode(newCode);

            if (value !== '' && index < 5) {
                inputsRef.current[index + 1].focus();
            }
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData) {
            const newCode = [...code];
            for (let i = 0; i < pastedData.length && i < 6; i++) {
                newCode[i] = pastedData[i];
            }
            setCode(newCode);
            // Focus the next empty input or the last one
            const nextIndex = Math.min(pastedData.length, 5);
            inputsRef.current[nextIndex]?.focus();
        }
    };

    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace' && code[index] === '' && index > 0) {
            inputsRef.current[index - 1].focus();
        }
    };

    const isVerifyDisabled = code.join('').length !== 6;

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#FFF',
            position: 'relative'
        }}>
            {/* Back Button */}
            <button
                onClick={() => navigate(-1)}
                style={{
                    position: 'absolute',
                    top: '24px',
                    left: '24px',
                    background: 'none',
                    border: 'none',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#000',
                    padding: 0
                }}
            >
                ← {t('common.back')}
            </button>

            {/* Content Container */}
            <div style={{
                width: '100%',
                maxWidth: '400px',
                margin: '0 auto',
                padding: '0 24px',
                boxSizing: 'border-box',
                paddingTop: '140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
            }}>
                {/* Icon */}
                <div style={{
                    marginBottom: '32px',
                    fontSize: '72px',
                    textShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                }}>
                    📧
                </div>

                <h1 style={{
                    fontSize: '32px',
                    fontWeight: '600',
                    textAlign: 'center',
                    margin: 0,
                    marginBottom: '16px'
                }}>
                    {t('auth.verifyEmail.title')}
                </h1>

                <p style={{
                    fontSize: '16px',
                    color: '#666',
                    textAlign: 'center',
                    margin: 0,
                    marginBottom: '32px',
                    lineHeight: '1.5'
                }}>
                    {t('auth.verifyEmail.subtitle')}
                </p>

                {/* Email Display */}
                <div style={{
                    width: '100%',
                    textAlign: 'left',
                    marginBottom: '24px'
                }}>
                    <div style={{color: '#181818', fontSize: 14, fontWeight: '600', marginBottom: '8px'}}>{t('auth.verifyEmail.email')}</div>
                    <div style={{color: '#181818', fontSize: 16, fontWeight: '500'}}>{email}</div>
                </div>

                {/* Code Input */}
                <div style={{
                    width: '100%',
                    marginBottom: '24px'
                }}>
                    <label style={{
                        display: 'block',
                        color: '#32302C',
                        fontSize: 14,
                        fontWeight: '600',
                        marginBottom: '12px',
                        textAlign: 'left'
                    }}>
                        {t('auth.verifyEmail.enterCode')}
                    </label>
                    <div style={{display: 'flex', justifyContent: 'center', gap: 12}}>
                        {code.map((digit, index) => (
                            <input
                                key={index}
                                ref={el => inputsRef.current[index] = el}
                                type="text"
                                maxLength="1"
                                value={digit}
                                onChange={(e) => handleChange(e, index)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                onPaste={handlePaste}
                                onFocus={() => setFocusedIndex(index)}
                                onBlur={() => setFocusedIndex(-1)}
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    textAlign: 'center',
                                    fontSize: 24,
                                    fontWeight: '600',
                                    color: '#32302C',
                                    background: 'transparent',
                                    borderRadius: '50%',
                                    border: `1px solid ${focusedIndex === index ? '#181818' : '#E6E6EC'}`,
                                    outline: 'none',
                                    transform: focusedIndex === index ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'transform 0.2s ease, border-color 0.2s ease'
                                }}
                            />
                        ))}
                    </div>
                </div>

                {error && (
                    <div style={{
                        width: '100%',
                        background: '#FEE2E2',
                        color: '#DC2626',
                        padding: '12px 16px',
                        borderRadius: 26,
                        fontSize: 14,
                        marginBottom: '16px',
                        boxSizing: 'border-box'
                    }}>
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div style={{
                        width: '100%',
                        background: '#D1FAE5',
                        color: '#059669',
                        padding: '12px 16px',
                        borderRadius: 26,
                        fontSize: 14,
                        marginBottom: '16px',
                        boxSizing: 'border-box'
                    }}>
                        {successMessage}
                    </div>
                )}

                {/* Verify Button */}
                <button
                    onClick={handleVerify}
                    disabled={isVerifyDisabled || isLoading}
                    style={{
                        width: '100%',
                        height: '52px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isVerifyDisabled || isLoading ? '#F5F5F5' : '#181818',
                        border: 'none',
                        borderRadius: '26px',
                        cursor: isVerifyDisabled || isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: isVerifyDisabled || isLoading ? '#6C6B6E' : 'white',
                        opacity: isLoading ? 0.6 : 1,
                        marginBottom: '16px'
                    }}
                >
                    {isLoading ? t('auth.verifyEmail.verifying') : t('auth.verifyEmail.verifyContinue')}
                </button>

                {/* Resend Code */}
                <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4}}>
                    <span style={{color: '#6C6B6E', fontSize: 14, fontWeight: '500'}}>
                        {t('auth.verifyEmail.didntReceive')}
                    </span>
                    <button
                        onClick={handleResendCode}
                        onMouseEnter={() => !(resendCountdown > 0 || isResending) && setResendHover(true)}
                        onMouseLeave={() => setResendHover(false)}
                        disabled={resendCountdown > 0 || isResending}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: resendCountdown > 0 || isResending ? '#6C6B6E' : '#181818',
                            fontSize: 14,
                            fontWeight: '600',
                            cursor: resendCountdown > 0 || isResending ? 'not-allowed' : 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                            transform: resendHover && !(resendCountdown > 0 || isResending) ? 'scale(1.05)' : 'scale(1)',
                            transition: 'transform 0.2s ease'
                        }}
                    >
                        {isResending ? t('auth.verifyEmail.resending') : resendCountdown > 0 ? t('auth.verifyEmail.resendCountdown', { seconds: resendCountdown }) : t('auth.verifyEmail.resendCode')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
