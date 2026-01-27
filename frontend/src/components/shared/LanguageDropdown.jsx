import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/useIsMobile';

const LanguageDropdown = ({ type = 'interface', variant = 'default' }) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const isMobile = useIsMobile();

  const languages = [
    { code: 'en', name: 'English (US)', flag: '' },
    { code: 'pt-BR', name: 'Português (BR)', flag: '' },
    { code: 'es-ES', name: 'Español (ES)', flag: '' }
  ];

  const currentLanguage = type === 'interface'
    ? i18n.language
    : localStorage.getItem('answerLanguage') || 'match';

  const getCurrentLabel = () => {
    if (currentLanguage === 'match') {
      return t('settings.language.matchInterface');
    }
    const lang = languages.find(l => l.code === currentLanguage || l.code === currentLanguage.split('-')[0]);
    return lang ? lang.name : 'English (US)';
  };

  const handleSelect = (code) => {
    if (type === 'interface') {
      i18n.changeLanguage(code);
      localStorage.setItem('userLanguage', code);
    } else {
      localStorage.setItem('answerLanguage', code);
    }
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  // Use 'click' instead of 'mousedown' for better mobile compatibility
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Use 'click' for both mouse and touch - it fires after touch events complete
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, []);

  // Pill variant styles (cylindrical, transparent background)
  const isPill = variant === 'pill';

  const buttonStyles = isPill ? {
    width: 'auto',
    minWidth: 'auto',
    height: 40,
    padding: '0 16px',
    borderRadius: 100,
    border: '1px solid #E6E6EC',
    background: 'transparent',
    fontSize: 14,
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: '500',
    color: '#171717',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitUserSelect: 'none'
  } : {
    width: isMobile ? '100%' : 'auto',
    minWidth: isMobile ? 'auto' : 220,
    height: 44,
    padding: '0 16px',
    borderRadius: 12,
    border: '1px solid #E6E6EC',
    background: '#F5F5F7',
    fontSize: 14,
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: '500',
    color: '#171717',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
    transition: 'all 0.2s ease',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitUserSelect: 'none'
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: isPill ? 'auto' : (isMobile ? '100%' : 'auto') }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={buttonStyles}
        onMouseEnter={(e) => {
          if (isPill) {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
            e.currentTarget.style.borderColor = '#D1D1D6';
          } else {
            e.currentTarget.style.background = '#ECECEF';
            e.currentTarget.style.borderColor = '#D1D1D6';
          }
        }}
        onMouseLeave={(e) => {
          if (isPill) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#E6E6EC';
          } else {
            e.currentTarget.style.background = '#F5F5F7';
            e.currentTarget.style.borderColor = '#E6E6EC';
          }
        }}
      >
        {isPill ? (
          <>
            <span>{getCurrentLabel()}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            >
              <path d="M4 6L8 10L12 6" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12H22" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 2C14.5013 4.73835 15.9228 8.29203 16 12C15.9228 15.708 14.5013 19.2616 12 22C9.49872 19.2616 8.07725 15.708 8 12C8.07725 8.29203 9.49872 4.73835 12 2Z" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{getCurrentLabel()}</span>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            >
              <path d="M4 6L8 10L12 6" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: isPill ? 48 : 52,
          right: isPill ? 0 : 'auto',
          left: isPill ? 'auto' : 0,
          minWidth: 220,
          background: 'white',
          border: '1px solid #E6E6EC',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
          zIndex: 99999,
          overflow: 'hidden',
          animation: 'dropdownFadeIn 0.15s ease-out'
        }}>
          {type === 'answer' && (
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect('match');
              }}
              role="button"
              tabIndex={0}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                background: currentLanguage === 'match' ? '#F5F5F7' : 'white',
                borderBottom: '1px solid #F3F4F6',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                color: '#171717',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'background 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F7'}
              onMouseLeave={(e) => e.currentTarget.style.background = currentLanguage === 'match' ? '#F5F5F7' : 'white'}
            >
              {currentLanguage === 'match' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span style={{ marginLeft: currentLanguage === 'match' ? 0 : 26 }}>
                {t('settings.language.matchInterface')}
              </span>
            </div>
          )}

          {languages.map((lang, index) => (
            <div
              key={lang.code}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(lang.code);
              }}
              role="button"
              tabIndex={0}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                background: (currentLanguage === lang.code || currentLanguage.startsWith(lang.code.split('-')[0])) ? '#F5F5F7' : 'white',
                borderBottom: index < languages.length - 1 ? '1px solid #F3F4F6' : 'none',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                color: '#171717',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'background 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F7'}
              onMouseLeave={(e) => e.currentTarget.style.background = (currentLanguage === lang.code || currentLanguage.startsWith(lang.code.split('-')[0])) ? '#F5F5F7' : 'white'}
            >
              {(currentLanguage === lang.code || currentLanguage.startsWith(lang.code.split('-')[0])) && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="#171717" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              <span style={{ marginLeft: (currentLanguage === lang.code || currentLanguage.startsWith(lang.code.split('-')[0])) ? 0 : 26 }}>
                {lang.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default LanguageDropdown;
