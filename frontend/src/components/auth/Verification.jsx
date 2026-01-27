import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_AUTH_REDIRECT } from '../constants/routes';
import backArrow from '../assets/arrow-narrow-left.svg';

const Verification = () => {
    const { t } = useTranslation();
    const [code, setCode] = useState(new Array(6).fill(''));
    const [timer, setTimer] = useState(30);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [changeNumberHover, setChangeNumberHover] = useState(false);
    const [resendHover, setResendHover] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const inputsRef = useRef([]);
    const { user, verifyPendingPhone } = useAuth();

    const phoneNumber = location.state?.phoneNumber || '';

    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prevTimer) => (prevTimer > 0 ? prevTimer - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleResendCode = async () => {
        if (timer === 0) {
            setIsLoading(true);
            setError('');

            try {
                // Check if this is a pending registration (from location state)
                const email = location.state?.email;
                const isPendingRegistration = !!email;

                let response;
                if (isPendingRegistration) {
                    // Pending user registration - resend via add-phone endpoint
                    response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/pending/add-phone`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: email,
                            phoneNumber: phoneNumber
                        })
                    });
                } else {
                    // Existing user - requires auth
                    const token = localStorage.getItem('accessToken');
                    response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/verify/send-phone`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ phoneNumber })
                    });
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || t('verification.failedToResendCode'));
                }

                setTimer(30);
                console.log('✅ Verification code resent');
            } catch (error) {
                console.error('Error resending code:', error);
                setError(error.message || t('verification.failedToResendCode'));
            } finally {
                setIsLoading(false);
            }
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
            // Check if this is a pending registration (from location state)
            const email = location.state?.email;
            const isPendingRegistration = !!email;

            if (isPendingRegistration) {
                // Pending user registration - use AuthContext method
                await verifyPendingPhone({
                    email: email,
                    code: verificationCode
                });

                console.log('✅ Phone verified successfully');
                localStorage.removeItem('pendingEmail'); // Clean up
                navigate(DEFAULT_AUTH_REDIRECT);
            } else {
                // Existing user adding phone - requires auth
                const token = localStorage.getItem('accessToken');
                const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/verify/phone`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ code: verificationCode })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || t('settings.errors.invalidVerificationCode'));
                }

                console.log('✅ Phone verified successfully');
                navigate(DEFAULT_AUTH_REDIRECT);
            }
        } catch (error) {
            console.error('Error verifying code:', error);
            setError(error.message || t('settings.errors.invalidVerificationCode'));
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
                    💬
                </div>

                <h1 style={{
                    fontSize: '32px',
                    fontWeight: '600',
                    textAlign: 'center',
                    margin: 0,
                    marginBottom: '16px'
                }}>
                    {t('verification.twoStepVerification')}
                </h1>

                <p style={{
                    fontSize: '16px',
                    color: '#666',
                    textAlign: 'center',
                    margin: 0,
                    marginBottom: '32px',
                    lineHeight: '1.5'
                }}>
                    {t('verification.keepAccountSafe')}
                </p>

                {/* Phone Display */}
                <div style={{
                    width: '100%',
                    textAlign: 'left',
                    marginBottom: '24px'
                }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <div style={{color: '#181818', fontSize: 14, fontWeight: '600'}}>{t('verification.phone')}</div>
                        <div
                            onClick={() => navigate('/phone-number')}
                            onMouseEnter={() => setChangeNumberHover(true)}
                            onMouseLeave={() => setChangeNumberHover(false)}
                            style={{
                                cursor: 'pointer',
                                color: '#181818',
                                fontSize: 14,
                                fontWeight: '600',
                                transform: changeNumberHover ? 'scale(1.05)' : 'scale(1)',
                                transition: 'transform 0.2s ease'
                            }}
                        >
                            {t('verification.changeNumber')}
                        </div>
                    </div>
                    <div style={{color: '#181818', fontSize: 16, fontWeight: '500'}}>{phoneNumber.replace(/(\d{3})(?=\d{3}$)/, '••• ')}</div>
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
                        {t('verification.enterCode')}
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

                {/* Resend Code */}
                <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: '24px'}}>
                    <span style={{color: '#6C6B6E', fontSize: 14, fontWeight: '500'}}>{t('verification.didntGetCode')}</span>
                    <span
                        onClick={handleResendCode}
                        onMouseEnter={() => timer === 0 && setResendHover(true)}
                        onMouseLeave={() => setResendHover(false)}
                        style={{
                            cursor: timer === 0 ? 'pointer' : 'default',
                            color: '#181818',
                            fontSize: 14,
                            fontWeight: '600',
                            transform: resendHover && timer === 0 ? 'scale(1.05)' : 'scale(1)',
                            transition: 'transform 0.2s ease'
                        }}
                    >
                        {timer > 0 ? t('verification.resendIn', { time: `00:${timer.toString().padStart(2, '0')}` }) : t('verification.clickToResend')}
                    </span>
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
                        opacity: isLoading ? 0.6 : 1
                    }}
                >
                    {isLoading ? t('verification.verifying') : t('verification.verifyAndContinue')}
                </button>
            </div>
        </div>
    );
};

export default Verification;
