import React from 'react';
import folderIcon from '../assets/folder_icon.svg';

/**
 * CategoryIcon Component
 * Renders either a folder SVG icon or an emoji based on the category's emoji value
 *
 * @param {string} emoji - The emoji or special identifier ('__FOLDER_SVG__')
 * @param {object} style - Optional inline styles to apply
 * @param {string} className - Optional CSS class name
 */
const CategoryIcon = ({ emoji, style = {}, className = '', size = 40 }) => {
  // Use folder SVG for: special identifier, null/empty, or default folder emoji
  const useFolderSvg = !emoji || emoji === '__FOLDER_SVG__' || emoji === '📁';

  if (useFolderSvg) {
    return (
      <img
        src={folderIcon}
        alt="Folder"
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
          ...style
        }}
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size,
        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
        ...style
      }}
    >
      {emoji}
    </span>
  );
};

export default CategoryIcon;
