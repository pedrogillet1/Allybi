import React from 'react';
import { useTranslation } from 'react-i18next';
import SearchIcon from './icons/SearchIcon';
import { ReactComponent as UploadIconMenu } from '../assets/Logout-black.svg';
import NotificationCenter from './NotificationCenter';
import { useIsMobile, useMobileBreakpoints } from '../hooks/useIsMobile';

const Header = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const mobile = useMobileBreakpoints();

  // ADAPTIVE SIZING - MOBILE ONLY
  const headerHeight = isMobile ? mobile.headerHeight : 84;
  const headerPadding = isMobile ? `0 ${mobile.padding.base}px` : '0 20px';
  const controlGap = isMobile ? mobile.gap : 12;
  const searchHeight = isMobile ? (mobile.isSmallPhone ? 40 : 44) : 52;
  const fontSize = isMobile ? mobile.fontSize.base : 16;
  const searchPadding = isMobile ? `${mobile.padding.sm}px ${mobile.padding.base}px` : '10px 12px';

  // MOBILE ONLY: Hide greeting on mobile, show compact search
  if (isMobile) {
    return (
      <div style={{
        alignSelf: 'stretch',
        height: headerHeight,
        paddingLeft: 16,
        paddingRight: mobile.padding.base,
        background: 'white',
        borderBottom: '1px #E6E6EC solid',
        justifyContent: 'space-between',
        alignItems: 'center',
        display: 'flex',
        gap: controlGap
      }}>
        {/* Search Bar - Full width on mobile */}
        <div style={{
          flex: 1,
          height: searchHeight,
          padding: searchPadding,
          background: '#F5F5F5',
          boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)',
          overflow: 'hidden',
          borderRadius: 100,
          outline: '1px #E6E6EC solid',
          outlineOffset: '-1px',
          justifyContent: 'flex-start',
          alignItems: 'center',
          gap: 6,
          display: 'flex'
        }}>
          <SearchIcon />
          <div style={{
            color: '#9E9E9E',
            fontSize: fontSize,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '500',
            lineHeight: '24px',
            wordWrap: 'break-word'
          }}>
            {mobile.isSmallPhone ? t('common.searchShort') : t('common.searchDocumentsPlaceholder')}
          </div>
        </div>

        {/* Upload Button - Icon only on mobile */}
        <div style={{
          width: mobile.buttonSize,
          height: mobile.buttonSize,
          minWidth: mobile.buttonSize,
          background: '#F5F5F5',
          boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)',
          borderRadius: '50%',
          outline: '1px #E6E6EC solid',
          outlineOffset: '-1px',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          cursor: 'pointer'
        }}>
          <UploadIconMenu style={{width: 20, height: 20}} />
        </div>

        {/* Notifications */}
        <NotificationCenter />
      </div>
    );
  }

  // DESKTOP VERSION - Unchanged
  return (
    <div style={{alignSelf: 'stretch', height: 84, paddingLeft: 20, paddingRight: 20, background: 'white', borderBottom: '1px #E6E6EC solid', justifyContent: 'space-between', alignItems: 'center', display: 'inline-flex'}}>
        <div style={{textAlign: 'center', color: '#32302C', fontSize: 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: 30, wordWrap: 'break-word'}}>{t('header.welcomeBack', { name: 'Mark' })}</div>
        <div style={{justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex'}}>
            <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 12, display: 'inline-flex'}}>
                <div style={{height: 52, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'inline-flex'}}>
                    <div style={{height: 52, paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)', overflow: 'hidden', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'flex'}}>
                        <div style={{justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex'}}>
                            <SearchIcon />
                            <div style={{color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 24, wordWrap: 'break-word'}}>{t('common.searchPlaceholder')}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 12, display: 'inline-flex'}}>
                <div style={{height: 52, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 6, display: 'inline-flex'}}>
                    <div style={{height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)', overflow: 'hidden', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 6, display: 'flex'}}>
                        <div style={{justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex'}}>
                            <UploadIconMenu style={{width: 20, height: 20}} />
                            <div style={{color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: 24, wordWrap: 'break-word'}}>{t('documents.uploadDocument')}</div>
                        </div>
                    </div>
                </div>
            </div>
            <NotificationCenter />
        </div>
    </div>
  );
};

export default Header;
