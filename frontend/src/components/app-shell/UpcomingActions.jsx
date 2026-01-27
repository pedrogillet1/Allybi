import React from 'react';
import { useTranslation } from 'react-i18next';

const UpcomingActions = () => {
  const { t } = useTranslation();
  return (
    <div style={{alignSelf: 'stretch', padding: 14, background: 'white', boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)', borderRadius: 14, outline: '1px #E6E6EC solid', outlineOffset: '-1px', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 20, display: 'flex'}}>
        <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: 24, wordWrap: 'break-word'}}>{t('upcomingActions.title')}</div>
        <div style={{alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, display: 'inline-flex'}}>
            <div style={{flex: '1 1 0', padding: 14, background: '#F5F5F5', borderRadius: 18, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex'}}>
                <div style={{width: 24, height: 24, position: 'relative'}}>
                    <div style={{width: 20, height: 20, left: 2, top: 2, position: 'absolute', borderRadius: 5, outline: '1.50px #32302C solid', outlineOffset: '-0.75px'}} />
                    <div style={{width: 4, height: 8, left: 12, top: 7, position: 'absolute', outline: '1.50px #32302C solid', outlineOffset: '-0.75px'}} />
                </div>
                <div style={{flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'inline-flex'}}>
                    <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: 22.40, wordWrap: 'break-word'}}>{t('upcomingActions.idExpires')}</div>
                </div>
                <div style={{width: 44, height: 44, position: 'relative', background: 'white', borderRadius: 100, outline: '1px rgba(55, 53, 47, 0.09) solid', outlineOffset: '-1px'}}>
                    <div style={{width: 20, height: 20, left: 32, top: 32, position: 'absolute', transform: 'rotate(-180deg)', transformOrigin: 'top left', overflow: 'hidden'}}>
                        <div style={{width: 13.33, height: 10, left: 3.33, top: 5, position: 'absolute', outline: '1.67px rgba(55, 53, 47, 0.85) solid', outlineOffset: '-0.83px'}} />
                    </div>
                </div>
            </div>
            <div style={{flex: '1 1 0', padding: 14, background: '#F5F5F5', borderRadius: 18, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex'}}>
                <div style={{width: 24, height: 24, position: 'relative'}}>
                    <div style={{width: 13, height: 20, left: 22.50, top: 8.50, position: 'absolute', transform: 'rotate(90deg)', transformOrigin: 'top left', borderRadius: 4, outline: '1.50px #32302C solid', outlineOffset: '-0.75px'}} />
                    <div style={{width: 6, height: 3, left: 9.50, top: 2.50, position: 'absolute', borderRadius: 1, outline: '1.50px #32302C solid', outlineOffset: '-0.75px'}} />
                </div>
                <div style={{flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'inline-flex'}}>
                    <div style={{alignSelf: 'stretch', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: 22.40, wordWrap: 'break-word'}}>{t('upcomingActions.uploadDoctorReceipt')}</div>
                </div>
                <div style={{width: 44, height: 44, position: 'relative', background: 'white', borderRadius: 100, outline: '1px rgba(55, 53, 47, 0.09) solid', outlineOffset: '-1px'}}>
                    <div style={{width: 20, height: 20, left: 32, top: 32, position: 'absolute', transform: 'rotate(-180deg)', transformOrigin: 'top left', overflow: 'hidden'}}>
                        <div style={{width: 13.33, height: 10, left: 3.33, top: 5, position: 'absolute', outline: '1.67px rgba(55, 53, 47, 0.85) solid', outlineOffset: '-0.83px'}} />
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default UpcomingActions;
