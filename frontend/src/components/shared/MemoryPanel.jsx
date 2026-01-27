import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { ReactComponent as TrashIcon } from '../assets/Trash can.svg';

const SECTION_LABELS = {
  USER_PREFERENCES: 'User Preferences',
  WORK_CONTEXT: 'Work Context',
  PERSONAL_FACTS: 'Personal Facts',
  GOALS: 'Goals',
  COMMUNICATION_STYLE: 'Communication Style',
  RELATIONSHIPS: 'Relationships'
};

const SECTION_EMOJIS = {
  USER_PREFERENCES: '�',
  WORK_CONTEXT: '=�',
  PERSONAL_FACTS: '=d',
  GOALS: '<�',
  COMMUNICATION_STYLE: '=�',
  RELATIONSHIPS: '>'
};

const MemoryPanel = ({ showMemoryPanel, setShowMemoryPanel }) => {
  const { t } = useTranslation();
  const [memories, setMemories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Get translated section labels
  const getSectionLabel = (section) => {
    const labels = {
      USER_PREFERENCES: t('memory.userPreferences'),
      WORK_CONTEXT: t('memory.workContext'),
      PERSONAL_FACTS: t('memory.personalFacts'),
      GOALS: t('memory.goals'),
      COMMUNICATION_STYLE: t('memory.communicationStyle'),
      RELATIONSHIPS: t('memory.relationships')
    };
    return labels[section] || section;
  };

  useEffect(() => {
    if (showMemoryPanel) {
      fetchMemories();
    }
  }, [showMemoryPanel, selectedSection]);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const params = selectedSection !== 'all' ? { section: selectedSection } : {};
      const response = await api.get('/api/memories', { params });
      setMemories(response.data.memories || []);
      setStats(response.data.stats || null);
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    if (deleteConfirmId !== memoryId) {
      setDeleteConfirmId(memoryId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await api.delete(`/api/memories/${memoryId}`);
      setMemories(memories.filter(m => m.id !== memoryId));
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  const handleClearAll = async () => {
    const confirmMessage = selectedSection !== 'all'
      ? t('memory.confirmClearSection')
      : t('memory.confirmClearAll');
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const params = selectedSection !== 'all' ? { section: selectedSection } : {};
      await api.delete('/api/memories', { params });
      setMemories([]);
      fetchMemories(); // Refresh to get updated stats
    } catch (error) {
      console.error('Failed to clear memories:', error);
    }
  };

  const groupMemoriesBySection = () => {
    const grouped = {};
    memories.forEach(memory => {
      if (!grouped[memory.section]) {
        grouped[memory.section] = [];
      }
      grouped[memory.section].push(memory);
    });
    return grouped;
  };

  if (!showMemoryPanel) return null;

  const groupedMemories = groupMemoriesBySection();
  const sections = Object.keys(SECTION_LABELS);

  return (
    <>
      {/* Dark Overlay */}
      <div
        onClick={() => setShowMemoryPanel(false)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, rgba(17, 19, 21, 0.50) 0%, rgba(17, 19, 21, 0.90) 100%)',
          zIndex: 999
        }}
      />

      {/* Memory Panel */}
      <div style={{
        width: 520,
        height: 824,
        position: 'fixed',
        left: 84,
        top: 68,
        background: 'white',
        borderRadius: 14,
        zIndex: 1000,
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 32,
        paddingBottom: 32,
        overflow: 'hidden',
        flexDirection: 'column',
        display: 'flex'
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20, justifyContent: 'space-between', alignItems: 'center', display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: '#F5F5F5', borderRadius: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 20 }}>
              🧠
            </div>
            <div>
              <div style={{ color: '#32302C', fontSize: 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' }}>
                {t('memory.memorySystem')}
              </div>
              {stats && (
                <div style={{ color: '#6C6B6E', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '500' }}>
                  {t('memory.memoriesAcrossSections', { count: stats.total, sections: stats.bySection ? Object.keys(stats.bySection).length : 0 })}
                </div>
              )}
            </div>
          </div>
          <div
            onClick={() => setShowMemoryPanel(false)}
            style={{ width: 36, height: 36, background: '#171717', borderRadius: 100, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* Section Filter */}
        <div style={{ marginBottom: 20 }}>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            style={{
              width: '100%',
              height: 40,
              paddingLeft: 12,
              paddingRight: 12,
              background: '#F5F5F5',
              border: '1px solid #E6E6EC',
              borderRadius: 8,
              color: '#32302C',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="all">{t('memory.allSections')} ({memories.length})</option>
            {sections.map(section => {
              const count = stats?.bySection?.[section] || 0;
              return (
                <option key={section} value={section}>
                  {SECTION_EMOJIS[section]} {getSectionLabel(section)} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Clear All Button */}
        {memories.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={handleClearAll}
              style={{
                width: '100%',
                height: 36,
                background: '#FEF3F2',
                border: '1px solid #FEE4E2',
                borderRadius: 8,
                color: '#D92D20',
                fontSize: 13,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <TrashIcon style={{ width: 14, height: 14, fill: '#D92D20' }} />
              {selectedSection !== 'all' ? t('memory.clearSection') : t('memory.clearAll')}
            </button>
          </div>
        )}

        {/* Memories List */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans' }}>{t('memory.loadingMemories')}</div>
            </div>
          ) : memories.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 16 }}>
              <div style={{ fontSize: 64, opacity: 0.3 }}>🧠</div>
              <div style={{ color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textAlign: 'center' }}>
                {t('memory.noMemoriesYet')}
              </div>
              <div style={{ color: '#B9B9B9', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', textAlign: 'center', maxWidth: 320 }}>
                {t('memory.noMemoriesDescription')}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedSection === 'all' ? (
                sections.map(section => {
                  const sectionMemories = groupedMemories[section] || [];
                  if (sectionMemories.length === 0) return null;

                  return (
                    <div key={section} style={{ marginBottom: 12 }}>
                      <div style={{
                        color: '#32302C',
                        fontSize: 13,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: '700',
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span>{SECTION_EMOJIS[section]}</span>
                        <span>{getSectionLabel(section)}</span>
                        <span style={{ color: '#6C6B6E', fontWeight: '600' }}>({sectionMemories.length})</span>
                      </div>
                      {sectionMemories.map(memory => (
                        <MemoryItem
                          key={memory.id}
                          memory={memory}
                          onDelete={handleDeleteMemory}
                          deleteConfirmId={deleteConfirmId}
                          t={t}
                        />
                      ))}
                    </div>
                  );
                })
              ) : (
                memories.map(memory => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    onDelete={handleDeleteMemory}
                    deleteConfirmId={deleteConfirmId}
                    t={t}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const MemoryItem = ({ memory, onDelete, deleteConfirmId, t }) => {
  const isDeleteConfirm = deleteConfirmId === memory.id;
  const createdDate = new Date(memory.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div style={{
      background: '#FAFAFA',
      border: '1px solid #E6E6EC',
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      {/* Content */}
      <div style={{
        color: '#32302C',
        fontSize: 13,
        fontFamily: 'Plus Jakarta Sans',
        fontWeight: '500',
        lineHeight: '18px'
      }}>
        {memory.content}
      </div>

      {/* Metadata Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Importance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              background: memory.importance >= 8 ? '#FEF3F2' : memory.importance >= 5 ? '#FFF4ED' : '#F9FAFB',
              border: `1px solid ${memory.importance >= 8 ? '#FEE4E2' : memory.importance >= 5 ? '#FECDCA' : '#E6E6EC'}`,
              borderRadius: 6,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2
            }}>
              <span style={{
                fontSize: 11,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                color: memory.importance >= 8 ? '#D92D20' : memory.importance >= 5 ? '#DC6803' : '#6C6B6E'
              }}>
                {memory.importance}/10
              </span>
            </div>
          </div>

          {/* Access Count */}
          <div style={{
            color: '#6C6B6E',
            fontSize: 11,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '500'
          }}>
            {t('memory.usedCount', { count: memory.accessCount || 0 })}
          </div>

          {/* Created Date */}
          <div style={{
            color: '#B9B9B9',
            fontSize: 11,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '500'
          }}>
            {createdDate}
          </div>
        </div>

        {/* Delete Button */}
        <div
          onClick={() => onDelete(memory.id)}
          style={{
            width: 28,
            height: 28,
            background: isDeleteConfirm ? '#FEF3F2' : '#F5F5F5',
            border: isDeleteConfirm ? '1px solid #FEE4E2' : 'none',
            borderRadius: 6,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <TrashIcon style={{
            width: 14,
            height: 14,
            fill: isDeleteConfirm ? '#D92D20' : '#6C6B6E'
          }} />
        </div>
      </div>
    </div>
  );
};

export default MemoryPanel;
