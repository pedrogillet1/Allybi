import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as AddIcon } from '../assets/add.svg';
import { ReactComponent as CheckIcon } from '../assets/check.svg';
import { ReactComponent as SearchIcon } from '../assets/Search.svg';
import { useIsMobile } from '../hooks/useIsMobile';
import CategoryIcon from './CategoryIcon';
import folderIcon from '../assets/folder_icon.svg';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const CreateCategoryModal = ({ isOpen, onClose, onCreateCategory, uploadedDocuments = [], preSelectedDocumentId = null }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [categoryName, setCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('__FOLDER_SVG__');
  const [documents, setDocuments] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [nameError, setNameError] = useState(false);
  const [documentsError, setDocumentsError] = useState(false);
  const [showAllEmojis, setShowAllEmojis] = useState(false);

  // Debug: Log when preSelectedDocumentId changes
  useEffect(() => {
  }, [preSelectedDocumentId]);

  const emojis = [
    // Default folder icon (folder_icon.svg)
    '__FOLDER_SVG__',
    // Common & Popular
    '📄', '📋', '📝', '📌', '📎', '🔖', '📚',
    // Work & Business
    '💼', '📊', '📈', '📉', '💰', '💵', '💳', '🏢', '🏦', '📞',
    // Travel & Places
    '✈️', '🌍', '🗺️', '🏠', '🏥', '🏪',
    // Food & Drink
    '🍕', '🍔', '🍟', '🍎', '🍊', '🍇', '🥗', '☕', '🍷', '🍺',
    // Activities & Hobbies
    '⚽', '🏀', '🎾', '🎮', '🎨', '🎬', '📷', '🎵', '🎸',
    // Symbols & Objects
    '⭐', '❤️', '💙', '💚', '💛', '🔥', '💡', '🔔', '🎯', '🎁',
    // Education & Science
    '🎓', '🔬', '🔭', '⚗️', '🧪', '💻', '⌨️', '🖥️',
    // Nature & Animals
    '🌲', '🌳', '🌴', '🌵', '🌺', '🌻', '🌼', '🐶', '🐱', '🐭',
    // Weather & Time
    '☀️', '⛅', '☁️', '🌧️', '⛈️', '🌈', '⏰', '⏳', '⌛', '📅',
    // Misc
    '🎉', '🎊', '🎈', '🎀', '🎪', '🎭', '🔑', '🔒', '🔓', '🛠️'
  ];

  // Stable reference for uploadedDocuments to prevent infinite loops
  const uploadedDocsRef = React.useRef(uploadedDocuments);
  React.useEffect(() => {
    uploadedDocsRef.current = uploadedDocuments;
  }, [uploadedDocuments]);

  // Fetch ALL documents directly from API when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchAllDocuments = async () => {
        try {
          setLoading(true);
          // Fetch ALL documents with a high limit to ensure we get everything
          const response = await api.get('/api/documents?limit=1000');
          const allDocuments = response.data.documents || [];
          setDocuments(allDocuments);

          // Pre-select documents if provided via uploadedDocuments or preSelectedDocumentId
          const currentUploadedDocs = uploadedDocsRef.current;
          if (currentUploadedDocs && currentUploadedDocs.length > 0) {
            // Extract document IDs from uploadedDocuments array
            const preselectedIds = currentUploadedDocs.map(doc => doc.id).filter(Boolean);
            setSelectedDocuments(preselectedIds);
          } else if (preSelectedDocumentId) {
            setSelectedDocuments([preSelectedDocumentId]);
          } else {
            setSelectedDocuments([]);
          }
          setLoading(false);
        } catch (error) {
          console.error('Failed to fetch documents:', error);
          setDocuments([]);
          setSelectedDocuments([]);
          setLoading(false);
        }
      };

      fetchAllDocuments();
      // Reset form when modal opens
      setCategoryName('');
      setSelectedEmoji('__FOLDER_SVG__');
      setSearchQuery('');
      setNameError(false);
      setDocumentsError(false);
      setShowAllEmojis(false);
    }
  }, [isOpen, preSelectedDocumentId]);

  const toggleDocumentSelection = (docId) => {
    setSelectedDocuments(prev => {
      const newSelection = prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId];

      // Clear documents error if at least one document is selected
      if (newSelection.length > 0) {
        setDocumentsError(false);
      }

      return newSelection;
    });
  };

  const handleCreate = () => {
    // ✅ Auth check: Redirect to signup if not authenticated
    if (!isAuthenticated) {
      navigate('/signup');
      return;
    }

    let hasError = false;

    // Check if category name is empty
    if (!categoryName.trim()) {
      setNameError(true);
      hasError = true;
    } else {
      setNameError(false);
    }

    // Documents are optional - no validation needed
    setDocumentsError(false);

    // If there are errors, don't proceed
    if (hasError) {
      return;
    }

    // Notify parent component (which will create the category and add documents)
    onCreateCategory({
      name: categoryName,
      emoji: selectedEmoji,
      files: selectedDocuments.length,
      selectedDocuments: selectedDocuments
    });

    // Reset form
    setCategoryName('');
    setSelectedEmoji('__FOLDER_SVG__');
    setSelectedDocuments([]);
    setSearchQuery('');
    setNameError(false);
    setDocumentsError(false);
    onClose();
  };

  // Filter documents based on search query, then sort: selected first, unselected after
  const filteredDocuments = React.useMemo(() => {
    // First, filter by search query
    const filtered = documents.filter(doc =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Then separate into selected and unselected
    const selected = filtered.filter(doc => selectedDocuments.includes(doc.id));
    const unselected = filtered.filter(doc => !selectedDocuments.includes(doc.id));

    // Return selected documents first, then unselected
    return [...selected, ...unselected];
  }, [documents, searchQuery, selectedDocuments]);

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
    if (ext.match(/\.(doc|docx)$/)) return docIcon;
    if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
    if (ext.match(/\.(txt)$/)) return txtIcon;
    if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
    if (ext.match(/\.(mov)$/)) return movIcon;
    if (ext.match(/\.(mp4)$/)) return mp4Icon;
    return docIcon; // Default icon
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: isMobile ? 'flex-end' : 'center',
        zIndex: 1000,
        padding: isMobile ? 0 : 16,
        paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 16
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 500,
          maxHeight: isMobile ? '90vh' : '85vh',
          background: 'white',
          borderRadius: isMobile ? '14px 14px 0 0' : 14,
          outline: '1px #E6E6EC solid',
          outlineOffset: '-1px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          paddingLeft: 18,
          paddingRight: 18,
          paddingTop: 18,
          paddingBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ width: 30, height: 30, opacity: 0 }} />
          <div style={{
            width: 304,
            textAlign: 'center',
            color: '#32302C',
            fontSize: 18,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '700',
            lineHeight: '26px'
          }}>
            {t('modals.createCategory.title')}
          </div>
          <div
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              background: 'white',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 14, color: '#323232' }}>✕</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#E6E6EC', flexShrink: 0 }} />

        {/* Scrollable Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          paddingTop: 18,
          paddingBottom: 18,
          WebkitOverflowScrolling: 'touch'
        }}>
          {/* Category Name Input */}
          <div style={{
            paddingLeft: 18,
            paddingRight: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
          <div style={{
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            lineHeight: '20px'
          }}>
            {t('modals.createCategory.nameLabel')}
          </div>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => {
              setCategoryName(e.target.value);
              if (e.target.value.trim()) {
                setNameError(false);
              }
            }}
            placeholder={t('modals.createCategory.namePlaceholder')}
            style={{
              height: 52,
              paddingLeft: 24,
              paddingRight: 24,
              background: '#F5F5F5',
              borderRadius: 100,
              outline: nameError ? '2px #DC2626 solid' : '1px #E6E6EC solid',
              outlineOffset: '-1px',
              border: 'none',
              color: '#32302C',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '400',
              lineHeight: '24px'
            }}
          />
        </div>

        {/* Category Emoji Selector */}
        <div style={{
          paddingLeft: 18,
          paddingRight: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{
              color: '#32302C',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: '20px'
            }}>
              {t('modals.createCategory.emojiLabel')}
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
              {showAllEmojis ? t('modals.createCategory.showLess') : t('modals.createCategory.seeAll')}
            </button>
          </div>
          <div style={{
            alignSelf: 'stretch',
            display: 'flex',
            flexWrap: showAllEmojis ? 'wrap' : 'nowrap',
            gap: 12,
            maxHeight: showAllEmojis ? 200 : 'auto',
            overflowY: showAllEmojis ? 'auto' : 'visible',
            overflowX: showAllEmojis ? 'visible' : 'hidden'
          }}>
            {(showAllEmojis ? emojis : emojis.slice(0, 7)).map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSelectedEmoji(emoji)}
                style={{
                  width: 52,
                  height: 52,
                  background: selectedEmoji === emoji ? '#E6E6EC' : 'transparent',
                  borderRadius: 100,
                  border: 'none',
                  justifyContent: 'center',
                  alignItems: 'center',
                  display: 'flex',
                  cursor: 'pointer',
                  fontSize: 32,
                  flexShrink: 0,
                  transition: 'transform 0.2s ease, background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <CategoryIcon emoji={emoji} size={32} />
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#E6E6EC' }} />

        {/* Select Documents */}
        <div style={{
          paddingLeft: 18,
          paddingRight: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            lineHeight: '20px'
          }}>
            {t('modals.createCategory.addDocuments')}
          </div>

          {/* Search Bar */}
          <div style={{
            position: 'relative',
            marginBottom: 8
          }}>
            <SearchIcon style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: '#6C6B6E'
            }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('modals.createCategory.searchPlaceholder')}
              style={{
                width: '100%',
                height: 48,
                paddingLeft: 44,
                paddingRight: 20,
                background: '#F5F5F5',
                borderRadius: 100,
                outline: documentsError ? '2px #DC2626 solid' : '1px #E6E6EC solid',
                outlineOffset: '-1px',
                border: 'none',
                color: '#32302C',
                fontSize: 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '400',
                lineHeight: '20px'
              }}
            />
          </div>

          {/* Documents List */}
          <div style={{
            flexDirection: 'column',
            gap: 12,
            display: 'flex',
            maxHeight: 228,
            overflowY: 'auto'
          }}>
            {loading ? (
              <div style={{
                textAlign: 'center',
                padding: 20,
                color: '#6C6B6E',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {t('modals.createCategory.loading')}
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 20,
                color: '#6C6B6E',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans'
              }}>
                {searchQuery ? t('modals.createCategory.noSearchResults') : documents.length === 0 ? t('modals.createCategory.noDocumentsInLibrary') : t('modals.createCategory.noDocuments')}
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => toggleDocumentSelection(doc.id)}
                  style={{
                    alignSelf: 'stretch',
                    padding: 14,
                    background: selectedDocuments.includes(doc.id) ? '#F0F0F0' : '#F5F5F5',
                    borderRadius: 18,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 12,
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
                  <img
                    src={getFileIcon(doc.filename)}
                    alt="File icon"
                    style={{
                      width: 40,
                      height: 40,
                      imageRendering: '-webkit-optimize-contrast',
                      objectFit: 'contain',
                      shapeRendering: 'geometricPrecision',
                      flexShrink: 0,
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                    }}
                  />
                  <div style={{
                    flex: '1 1 0',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: 6,
                    display: 'flex',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: '100%',
                      color: '#32302C',
                      fontSize: 16,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      lineHeight: '22.40px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'left'
                    }}>
                      {doc.filename}
                    </div>
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
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      background: selectedDocuments.includes(doc.id) ? '#171717' : 'white',
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
                      <CheckIcon style={{width: 16, height: 16, color: 'white'}} />
                    ) : (
                      <AddIcon style={{width: 16, height: 16, color: '#171717'}} />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        {/* End of Scrollable Content Area */}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#E6E6EC', flexShrink: 0 }} />

        {/* Action Buttons */}
        <div style={{
          paddingLeft: 18,
          paddingRight: 18,
          paddingTop: 18,
          paddingBottom: 18,
          display: 'flex',
          gap: 8,
          flexShrink: 0
        }}>
          <div
            onClick={onClose}
            style={{
              flex: 1,
              height: 52,
              background: '#F5F5F5',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{
              color: '#323232',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              textTransform: 'capitalize',
              lineHeight: '24px'
            }}>
              {t('modals.createCategory.cancel')}
            </div>
          </div>
          <div
            onClick={handleCreate}
            style={{
              flex: 1,
              height: 52,
              background: 'rgba(24, 24, 24, 0.90)',
              borderRadius: 100,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{
              color: 'white',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              textTransform: 'capitalize',
              lineHeight: '24px'
            }}>
              {t('modals.createCategory.create')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCategoryModal;
