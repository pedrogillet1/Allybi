import { useMemo } from 'react';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';

const MAIN_TYPES = {
  pdf: 'pdf', docx: 'docx', doc: 'docx',
  xlsx: 'xlsx', xls: 'xlsx',
  pptx: 'pptx', ppt: 'pptx',
  png: 'png', jpg: 'jpg', jpeg: 'jpg',
  mov: 'mov', mp4: 'mp4',
};

const COLOR_MAP = {
  png: '#22C55E', jpg: '#16A34A', pdf: '#A23C38',
  docx: '#5280EF', xlsx: '#10B981', pptx: '#E45554',
  mov: '#3B82F6', mp4: '#A855F7', other: '#6B7280',
};

const ICON_MAP = {
  png: pngIcon, jpg: jpgIcon, pdf: pdfIcon,
  docx: docIcon, xlsx: xlsIcon, pptx: pptxIcon,
  mov: movIcon, mp4: mp4Icon, other: null,
};

const LABEL_MAP = {
  png: 'PNG', jpg: 'JPG', pdf: 'PDF',
  docx: 'DOC', xlsx: 'XLS', pptx: 'PPTX',
  mov: 'MOV', mp4: 'MP4', other: 'Other',
};

function getExt(doc) {
  return (doc.filename || doc.name || '').split('.').pop()?.toLowerCase() || '';
}

function normalize(ext) {
  return MAIN_TYPES[ext] || 'other';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Computes file breakdown by type from a documents array.
 * Returns { breakdown, total } where breakdown is an array of
 * { type, label, icon, color, count, size, sizeFormatted, percent }
 * sorted descending by count, limited to types with count > 0.
 */
export function useFileBreakdown(documents) {
  return useMemo(() => {
    const buckets = {};
    let total = 0;

    (documents || []).forEach(doc => {
      const type = normalize(getExt(doc));
      if (!buckets[type]) buckets[type] = { count: 0, size: 0 };
      buckets[type].count++;
      buckets[type].size += (doc.fileSize || 0);
      total++;
    });

    const breakdown = Object.entries(buckets)
      .map(([type, { count, size }]) => ({
        type,
        label: LABEL_MAP[type] || type.toUpperCase(),
        icon: ICON_MAP[type] || null,
        color: COLOR_MAP[type] || COLOR_MAP.other,
        count,
        size,
        sizeFormatted: formatBytes(size),
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { breakdown, total };
  }, [documents]);
}
