/**
 * DebugOverlay Component
 *
 * Shows intent classification debug info for verification testing.
 * Hidden behind a toggle (press Ctrl+Shift+D to show/hide).
 *
 * Displays:
 * - intent: Primary classified intent
 * - domain: DOCUMENTS, PRODUCT, GENERAL, etc.
 * - depth: D1-D5 analytical depth level
 * - confidence: 0.00 - 1.00 confidence score
 * - blocked_by_negatives: boolean
 * - streaming_state: header|body|done
 */

import React, { useState, useEffect, useCallback } from 'react';

const DebugOverlay = ({ intentData, streamingState, isVisible: externalVisible, onToggle }) => {
  // Default to VISIBLE for testing - toggle with Ctrl+Shift+D or Cmd+Shift+D
  const [isVisible, setIsVisible] = useState(externalVisible !== undefined ? externalVisible : true);

  // Handle keyboard shortcut (Ctrl+Shift+D or Cmd+Shift+D on Mac) to toggle visibility
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      setIsVisible(prev => {
        const newValue = !prev;
        if (onToggle) onToggle(newValue);
        return newValue;
      });
    }
  }, [onToggle]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Sync with external visibility control
  useEffect(() => {
    if (externalVisible !== undefined) {
      setIsVisible(externalVisible);
    }
  }, [externalVisible]);

  if (!isVisible) return null;

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#10B981'; // Green
    if (confidence >= 0.6) return '#F59E0B'; // Yellow
    return '#EF4444'; // Red
  };

  const getDepthColor = (depth) => {
    const colors = {
      'D1': '#6B7280', // Gray - surface
      'D2': '#3B82F6', // Blue - extraction
      'D3': '#8B5CF6', // Purple - analysis
      'D4': '#EC4899', // Pink - deep
      'D5': '#EF4444', // Red - multi-step
    };
    return colors[depth] || '#6B7280';
  };

  const getStreamingColor = (state) => {
    const colors = {
      'idle': '#6B7280',
      'header': '#F59E0B',
      'body': '#3B82F6',
      'done': '#10B981',
    };
    return colors[state] || '#6B7280';
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      fontFamily: 'Monaco, Consolas, monospace',
      fontSize: 11,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: '#E5E7EB',
      padding: 12,
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      minWidth: 280,
      maxWidth: 350,
      border: '1px solid #374151',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: '1px solid #374151',
      }}>
        <span style={{ fontWeight: 'bold', color: '#F59E0B' }}>DEBUG OVERLAY</span>
        <span style={{ fontSize: 9, color: '#6B7280' }}>Ctrl+Shift+D to hide</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Intent */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>intent:</span>
          <span style={{ color: '#F9FAFB', fontWeight: 'bold' }}>
            {intentData?.intent || 'waiting...'}
          </span>
        </div>

        {/* Domain */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>domain:</span>
          <span style={{ color: '#60A5FA' }}>
            {intentData?.domain || '-'}
          </span>
        </div>

        {/* Depth */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>depth:</span>
          <span style={{
            color: getDepthColor(intentData?.depth),
            fontWeight: 'bold'
          }}>
            {intentData?.depth || '-'}
          </span>
        </div>

        {/* Confidence */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>confidence:</span>
          <span style={{
            color: getConfidenceColor(intentData?.confidence || 0),
            fontWeight: 'bold'
          }}>
            {intentData?.confidence ? intentData.confidence.toFixed(2) : '-'}
          </span>
        </div>

        {/* Family */}
        {intentData?.family && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9CA3AF' }}>family:</span>
            <span style={{ color: '#A78BFA' }}>
              {intentData.family}
            </span>
          </div>
        )}

        {/* Sub-intent */}
        {intentData?.subIntent && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9CA3AF' }}>sub_intent:</span>
            <span style={{ color: '#F472B6' }}>
              {intentData.subIntent}
            </span>
          </div>
        )}

        {/* Blocked by negatives */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF' }}>blocked_by_negatives:</span>
          <span style={{
            color: intentData?.blockedByNegatives ? '#EF4444' : '#10B981'
          }}>
            {intentData?.blockedByNegatives ? 'true' : 'false'}
          </span>
        </div>

        {/* Multi-intent flag */}
        {intentData?.multiIntent && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9CA3AF' }}>multi_intent:</span>
            <span style={{ color: '#F59E0B' }}>true</span>
          </div>
        )}

        {/* Streaming state */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          paddingTop: 6,
          borderTop: '1px solid #374151',
        }}>
          <span style={{ color: '#9CA3AF' }}>streaming_state:</span>
          <span style={{
            color: getStreamingColor(streamingState),
            fontWeight: 'bold'
          }}>
            {streamingState || 'idle'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DebugOverlay;
