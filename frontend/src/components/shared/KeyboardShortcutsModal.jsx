import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './KeyboardShortcutsModal.css';

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { keys: [`${cmdKey}`, 'Enter'], action: t('keyboardShortcuts.sendMessage') },
    { keys: [`${cmdKey}`, 'K'], action: t('keyboardShortcuts.focusSearch') },
    { keys: [`${cmdKey}`, 'N'], action: t('keyboardShortcuts.newConversation') },
    { keys: [`${cmdKey}`, 'Shift', 'C'], action: t('keyboardShortcuts.copyLastResponse') },
    { keys: ['Esc'], action: t('keyboardShortcuts.cancelGeneration') },
    { keys: [`${cmdKey}`, '/'], action: t('keyboardShortcuts.showThisMenu') },
    { keys: ['↑'], action: t('keyboardShortcuts.editLastMessage') },
    { keys: [`${cmdKey}`, 'Shift', 'L'], action: t('keyboardShortcuts.toggleSidebar') },
  ];

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h2>{t('keyboardShortcuts.title')}</h2>
          <button className="shortcuts-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="shortcuts-list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item">
              <div className="shortcut-keys">
                {shortcut.keys.map((key, i) => (
                  <React.Fragment key={i}>
                    <kbd>{key}</kbd>
                    {i < shortcut.keys.length - 1 && <span className="shortcut-plus">+</span>}
                  </React.Fragment>
                ))}
              </div>
              <div className="shortcut-action">{shortcut.action}</div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-tip">{t('keyboardShortcuts.pressEscToClose')}</span>
        </div>
      </div>
    </div>
  );
}
