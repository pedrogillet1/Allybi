import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRoute, AUTH_MODES } from '../constants/routes';
import { ReactComponent as CheckCircle } from '../assets/check-circle.svg';

const PasswordChanged = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div style={{width: '100%', height: '100%', background: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <div style={{width: 500, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 32, display: 'flex'}}>
                <div style={{width: 80, height: 80, background: '#D1FAE5', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                    <div style={{width: 60, height: 60, background: '#A7F3D0', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                        <CheckCircle style={{width: 32, height: 32, color: 'white'}} />
                    </div>
                </div>
                <div style={{alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, display: 'flex'}}>
                    <div style={{alignSelf: 'stretch', textAlign: 'center', color: '#32302C', fontSize: 30, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '40px'}}>{t('passwordChanged.congratulations')}</div>
                    <div style={{alignSelf: 'stretch', textAlign: 'center', color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '24px'}}>{t('passwordChanged.passwordReset')}</div>
                </div>
                <button onClick={() => navigate(buildRoute.auth(AUTH_MODES.LOGIN))} style={{width: '100%', height: 52, background: 'rgba(24, 24, 24, 0.90)', borderRadius: 14, border: 'none', cursor: 'pointer'}}>
                    <div style={{color: 'white', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px'}}>{t('passwordChanged.backToLogin')}</div>
                </button>
            </div>
        </div>
    );
};

export default PasswordChanged;
