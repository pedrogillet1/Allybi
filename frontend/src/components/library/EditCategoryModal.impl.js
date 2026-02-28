import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../context/NotificationsStore';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as SearchIcon } from '../../assets/Search.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import { ReactComponent as CheckIcon } from '../../assets/check.svg';
import { useIsMobile } from '../../hooks/useIsMobile';
import api from '../../services/api';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import folderIcon from '../../assets/folder_icon.svg';

const EditCategoryModal = ({ isOpen, onClose, category, onUpdate }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { showError } = useNotifications();
  const [categoryName, setCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('__FOLDER_SVG__');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]);
  const [showAllEmojis, setShowAllEmojis] = useState(false);

  const defaultEmojis = ['__FOLDER_SVG__', '🏠', '💼', '📊', '📄', '🎓', '💰'];
  const allEmojis = [
    '__FOLDER_SVG__', '🏠', '💼', '📊', '📄', '🎓', '💰',
    '🏥', '🎯', '🎨', '🎭', '🎬', '🎮', '🎲', '🎵', '🎸', '🏀', '⚽',
    '✈', '🚀', '🗼', '🏰', '🌋', '🏞', '🏖', '🏝'
  ];

  const emojiOptions = showAllEmojis ? allEmojis : defaultEmojis;

  useEffect(() => {
    if (isOpen && category) {
      setCategoryName(category.name);
      setSelectedEmoji(category.emoji || '__FOLDER_SVG__');
      fetchCategoryDocuments();
      fetchAllDocuments();
    }
  }, [isOpen, category]);

  const fetchCategoryDocuments = async () => {
    try {
      const response = await api.get(`/api/documents?folderId=${category.id}`);
      const docs = response.data.documents || [];
      setDocuments(docs);
      setSelectedDocuments(docs.map(d => d.id));
    } catch (error) {
    }
  };

  const fetchAllDocuments = async () => {
    try {
      const response = await api.get('/api/documents');
      setAllDocuments(response.data.documents || []);
    } catch (error) {
    }
  };

  const toggleDocumentSelection = (docId) => {
    setSelectedDocuments(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const handleConfirm = async () => {
    try {
      // Update category name and emoji
      const response = await api.patch(`/api/folders/${category.id}`, {
        name: categoryName,
        emoji: selectedEmoji
      });

      // Update document assignments
      const currentDocIds = documents.map(d => d.id);
      const toAdd = selectedDocuments.filter(id => !currentDocIds.includes(id));
      const toRemove = currentDocIds.filter(id => !selectedDocuments.includes(id));
      // Add documents to category
      for (const docId of toAdd) {
        await api.patch(`/api/documents/${docId}`, {
          folderId: category.id
        });
      }

      // Remove documents from category
      for (const docId of toRemove) {
        await api.patch(`/api/documents/${docId}`, {
          folderId: null
        });
      }

      // Call onUpdate callback BEFORE closing modal
      if (onUpdate) {
        await onUpdate();
      }

      // Close modal after refresh completes
      onClose();

    } catch (error) {
      showError(t('alerts.failedToUpdateCategory', { error: error.response?.data?.message || error.message }));
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename) => {
    if (!filename) return docIcon;
    const ext = filename.toLowerCase();
    if (ext.match(/\.(pdf)$/)) return pdfIcon;
    if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
    if (ext.match(/\.(png)$/)) return pngIcon;
    if (ext.match(/\.(docx?|doc)$/)) return docIcon;
    if (ext.match(/\.(xlsx?|xls)$/)) return xlsIcon;
    if (ext.match(/\.(pptx?|ppt)$/)) return pptxIcon;
    if (ext.match(/\.(txt)$/)) return txtIcon;
    return docIcon; // Default fallback
  };

  const filteredDocuments = allDocuments.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? '0 16px' : 16,
        paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 450,
          maxHeight: isMobile ? 'calc(90vh - 70px)' : '85vh',
          background: 'white',
          borderRadius: 14,
          outline: '1px #E6E6EC solid',
          outlineOffset: '-1px',
          flexDirection: 'column',
          display: 'flex',
          overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: isMobile ? 14 : 18,
          paddingRight: isMobile ? 14 : 18,
          paddingTop: isMobile ? 14 : 18,
          paddingBottom: isMobile ? 14 : 18,
          justifyContent: 'space-between',
          alignItems: 'center',
          display: 'flex',
          flexShrink: 0
        }}>
          <div style={{width: 30, height: 30, opacity: 0}} />
          <div style={{
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 12,
            display: 'flex'
          }}>
            <div style={{
              flex: 1,
              textAlign: 'center',
              color: '#32302C',
              fontSize: isMobile ? 16 : 18,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              lineHeight: '26px'
            }}>
              {t('modals.editCategory.title')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 4,
              paddingBottom: 4,
              background: 'white',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <CloseIcon style={{width: 18, height: 18}} />
          </button>
        </div>

        <div style={{alignSelf: 'stretch', height: 1, background: '#E6E6EC', flexShrink: 0}} />

        {/* Scrollable Content */}
        <div style={{
          alignSelf: 'stretch',
          flex: 1,
          overflowY: 'auto',
          paddingLeft: isMobile ? 14 : 18,
          paddingRight: isMobile ? 14 : 18,
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 14 : 18
        }}>
          {/* Category Name */}
          <div style={{
            alignSelf: 'stretch',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 6,
            display: 'flex'
          }}>
            <div style={{
              color: '#32302C',
              fontSize: isMobile ? 13 : 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: '20px'
            }}>
              {t('modals.editCategory.categoryName')}
            </div>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              style={{
                alignSelf: 'stretch',
                height: isMobile ? 44 : 52,
                paddingLeft: isMobile ? 16 : 24,
                paddingRight: isMobile ? 16 : 24,
                paddingTop: 10,
                paddingBottom: 10,
                background: '#F5F5F5',
                overflow: 'hidden',
                borderRadius: 100,
                outline: '1px #E6E6EC solid',
                outlineOffset: '-1px',
                border: 'none',
                color: '#32302C',
                fontSize: isMobile ? 14 : 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '400',
                lineHeight: '24px'
              }}
            />
          </div>

          {/* Category Emoji */}
          <div style={{
            alignSelf: 'stretch',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: isMobile ? 8 : 12,
            display: 'flex'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              alignSelf: 'stretch'
            }}>
              <div style={{
                color: '#32302C',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                lineHeight: '20px'
              }}>
                {t('modals.editCategory.categoryEmoji')}
              </div>
              <button
                onClick={() => setShowAllEmojis(!showAllEmojis)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  color: '#32302C',
                  transition: 'opacity 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {showAllEmojis ? t('modals.editCategory.showLess') : t('modals.editCategory.seeAll')}
              </button>
            </div>
            <div
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              style={{
              alignSelf: 'stretch',
              display: 'flex',
              flexWrap: showAllEmojis ? 'wrap' : 'nowrap',
              gap: isMobile ? 8 : 12,
              maxHeight: showAllEmojis ? 200 : 'auto',
              overflowY: showAllEmojis ? 'auto' : 'visible',
              overflowX: showAllEmojis ? 'visible' : 'auto',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x',
            }}>
              {emojiOptions.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setSelectedEmoji(emoji)}
                  style={{
                    width: isMobile ? 42 : 52,
                    height: isMobile ? 42 : 52,
                    background: selectedEmoji === emoji ? '#E6E6EC' : 'transparent',
                    borderRadius: 100,
                    border: 'none',
                    justifyContent: 'center',
                    alignItems: 'center',
                    display: 'flex',
                    cursor: 'pointer',
                    fontSize: isMobile ? 24 : 32,
                    flexShrink: 0,
                    transition: 'transform 0.2s ease, background 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {emoji === '__FOLDER_SVG__' ? (
                    <img
                      src={folderIcon}
                      alt="Folder"
                      style={{
                        width: isMobile ? 24 : 32,
                        height: isMobile ? 24 : 32
                      }}
                    />
                  ) : (
                    emoji
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Add Documents Section */}
          <div style={{
            alignSelf: 'stretch',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: isMobile ? 10 : 16,
            display: 'flex'
          }}>
            <div style={{
              alignSelf: 'stretch',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              display: 'flex'
            }}>
              <div style={{
                flex: '1 1 0',
                color: '#32302C',
                fontSize: isMobile ? 14 : 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                textTransform: 'capitalize',
                lineHeight: '24px'
              }}>
                {t('modals.editCategory.addDocuments')}
              </div>
            </div>

            {/* Search */}
            <div style={{
              alignSelf: 'stretch',
              height: isMobile ? 40 : 48,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: isMobile ? 8 : 10,
              paddingBottom: isMobile ? 8 : 10,
              background: '#F5F5F5',
              boxShadow: '0px 0px 8px 1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 8,
              display: 'flex'
            }}>
              <SearchIcon style={{width: isMobile ? 20 : 24, height: isMobile ? 20 : 24, filter: 'brightness(0) invert(0.2)'}} />
              <input
                type="text"
                placeholder={t('modals.editCategory.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: '1 1 0',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#32302C',
                  fontSize: isMobile ? 14 : 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  lineHeight: '24px'
                }}
              />
            </div>

            {/* Document List */}
            <div style={{
              alignSelf: 'stretch',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: 8,
              display: 'flex',
              maxHeight: 300,
              overflowY: 'auto'
            }}>
              {filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => toggleDocumentSelection(doc.id)}
                  style={{
                    alignSelf: 'stretch',
                    padding: isMobile ? 10 : 14,
                    background: selectedDocuments.includes(doc.id) ? '#F0F0F0' : '#F5F5F5',
                    borderRadius: isMobile ? 12 : 18,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: isMobile ? 10 : 12,
                    display: 'flex',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedDocuments.includes(doc.id)) {
                      e.currentTarget.style.background = '#EBEBEB';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedDocuments.includes(doc.id)) {
                      e.currentTarget.style.background = '#F5F5F5';
                    }
                  }}
                >
                  <img src={getFileIcon(doc.filename)} alt="File" style={{width: isMobile ? 30 : 40, height: isMobile ? 30 : 40, flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'}} />
                  <div style={{
                    flex: '1 1 0',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: isMobile ? 2 : 6,
                    display: 'flex',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: '100%',
                      color: '#32302C',
                      fontSize: isMobile ? 13 : 16,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      lineHeight: isMobile ? '18px' : '22.40px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'left'
                    }}>
                      {cleanDocumentName(doc.filename)}
                    </div>
                    {!isMobile && (
                      <div style={{
                        width: '100%',
                        color: '#6C6B6E',
                        fontSize: 14,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '500',
                        lineHeight: '15.40px',
                        textAlign: 'left'
                      }}>
                        {formatFileSize(doc.fileSize)}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      width: isMobile ? 34 : 44,
                      height: isMobile ? 34 : 44,
                      background: selectedDocuments.includes(doc.id) ? '#E4E4E8' : 'white',
                      borderRadius: 100,
                      outline: '1px rgba(55, 53, 47, 0.09) solid',
                      outlineOffset: '-1px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {selectedDocuments.includes(doc.id) ? (
                      <CheckIcon style={{width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, color: '#000000'}} />
                    ) : (
                      <AddIcon style={{width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, filter: 'brightness(0) invert(0.2)'}} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{alignSelf: 'stretch', height: 1, background: '#E6E6EC', flexShrink: 0}} />

        {/* Footer Buttons */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: isMobile ? 14 : 18,
          paddingRight: isMobile ? 14 : 18,
          paddingTop: isMobile ? 12 : 18,
          paddingBottom: isMobile ? 12 : 18,
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 8,
          display: 'flex',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            style={{
              flex: '1 1 0',
              height: isMobile ? 44 : 52,
              paddingLeft: isMobile ? 14 : 18,
              paddingRight: isMobile ? 14 : 18,
              paddingTop: 10,
              paddingBottom: 10,
              background: '#F5F5F5',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              border: 'none',
              cursor: 'pointer',
              color: '#323232',
              fontSize: isMobile ? 14 : 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              textTransform: 'capitalize',
              lineHeight: '24px'
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: '1 1 0',
              height: isMobile ? 44 : 52,
              background: 'rgba(24, 24, 24, 0.90)',
              overflow: 'hidden',
              borderRadius: 100,
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              fontSize: isMobile ? 14 : 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              textTransform: 'capitalize',
              lineHeight: '24px'
            }}
          >
            {t('modals.editCategory.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditCategoryModal;
