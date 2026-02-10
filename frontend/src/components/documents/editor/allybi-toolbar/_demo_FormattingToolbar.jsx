import React, { useState } from 'react';
import './FormattingToolbar.css';

// Import SVG icons (adjust paths based on your project structure)
import BoldIcon from './icons/bold.svg';
import ItalicIcon from './icons/italic.svg';
import UnderlineIcon from './icons/underline.svg';
import StrikethroughIcon from './icons/strikethrough.svg';
import TextColorIcon from './icons/text-color.svg';
import AlignLeftIcon from './icons/align-left.svg';
import AlignCenterIcon from './icons/align-center.svg';
import AlignRightIcon from './icons/align-right.svg';
import AlignJustifyIcon from './icons/align-justify.svg';
import ListBulletIcon from './icons/list-bullet.svg';
import ListNumberedIcon from './icons/list-numbered.svg';
import PlusIcon from './icons/plus.svg';
import MinusIcon from './icons/minus.svg';

const FormattingToolbar = () => {
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });

  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Calibri');
  const [alignment, setAlignment] = useState('left');
  const [zoom, setZoom] = useState(100);

  const toggleFormat = (format) => {
    setActiveFormats(prev => ({
      ...prev,
      [format]: !prev[format]
    }));
  };

  const handleFontSizeChange = (e) => {
    setFontSize(Number(e.target.value));
  };

  const handleFontFamilyChange = (e) => {
    setFontFamily(e.target.value);
  };

  const handleAlignment = (align) => {
    setAlignment(align);
  };

  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 2, 72));
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 2, 8));
  };

  const increaseZoom = () => {
    setZoom(prev => Math.min(prev + 10, 200));
  };

  const decreaseZoom = () => {
    setZoom(prev => Math.max(prev - 10, 50));
  };

  return (
    <div className="formatting-toolbar">
      {/* Undo/Redo/Font */}
      <div className="toolbar-section">
        <button className="toolbar-btn text-btn" title="Undo">Undo</button>
        <button className="toolbar-btn text-btn" title="Redo">Redo</button>
        <div className="toolbar-divider"></div>
        <select 
          className="toolbar-select font-select"
          value={fontFamily}
          onChange={handleFontFamilyChange}
          title="Font Family"
        >
          <option value="Calibri">Calibri</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
          <option value="Verdana">Verdana</option>
        </select>
      </div>

      {/* Font Size */}
      <div className="toolbar-section">
        <input 
          type="number"
          className="toolbar-input font-size-input"
          value={fontSize}
          onChange={handleFontSizeChange}
          min="8"
          max="72"
          title="Font Size"
        />
        <button 
          className="toolbar-btn icon-btn"
          onClick={decreaseFontSize}
          title="Decrease Font Size"
        >
          <img src={MinusIcon} alt="Decrease" />
        </button>
        <button 
          className="toolbar-btn icon-btn"
          onClick={increaseFontSize}
          title="Increase Font Size"
        >
          <img src={PlusIcon} alt="Increase" />
        </button>
      </div>

      {/* Text Formatting */}
      <div className="toolbar-section">
        <button 
          className={`toolbar-btn icon-btn ${activeFormats.bold ? 'active' : ''}`}
          onClick={() => toggleFormat('bold')}
          title="Bold (Ctrl+B)"
        >
          <img src={BoldIcon} alt="Bold" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${activeFormats.italic ? 'active' : ''}`}
          onClick={() => toggleFormat('italic')}
          title="Italic (Ctrl+I)"
        >
          <img src={ItalicIcon} alt="Italic" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${activeFormats.underline ? 'active' : ''}`}
          onClick={() => toggleFormat('underline')}
          title="Underline (Ctrl+U)"
        >
          <img src={UnderlineIcon} alt="Underline" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${activeFormats.strikethrough ? 'active' : ''}`}
          onClick={() => toggleFormat('strikethrough')}
          title="Strikethrough"
        >
          <img src={StrikethroughIcon} alt="Strikethrough" />
        </button>
      </div>

      {/* Text Color & Style */}
      <div className="toolbar-section">
        <button 
          className="toolbar-btn icon-btn"
          title="Text Color"
        >
          <img src={TextColorIcon} alt="Text Color" />
        </button>
        <button className="toolbar-btn text-btn" title="Style">Style</button>
        <button className="toolbar-btn text-btn" title="Clear Formatting">Clear</button>
      </div>

      {/* Lists */}
      <div className="toolbar-section">
        <button 
          className="toolbar-btn icon-btn"
          title="Bullet List"
        >
          <img src={ListBulletIcon} alt="Bullets" />
        </button>
        <button 
          className="toolbar-btn icon-btn"
          title="Numbered List"
        >
          <img src={ListNumberedIcon} alt="Numbers" />
        </button>
      </div>

      {/* Alignment */}
      <div className="toolbar-section">
        <button 
          className={`toolbar-btn icon-btn ${alignment === 'left' ? 'active' : ''}`}
          onClick={() => handleAlignment('left')}
          title="Align Left"
        >
          <img src={AlignLeftIcon} alt="Left" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${alignment === 'center' ? 'active' : ''}`}
          onClick={() => handleAlignment('center')}
          title="Align Center"
        >
          <img src={AlignCenterIcon} alt="Center" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${alignment === 'right' ? 'active' : ''}`}
          onClick={() => handleAlignment('right')}
          title="Align Right"
        >
          <img src={AlignRightIcon} alt="Right" />
        </button>
        <button 
          className={`toolbar-btn icon-btn ${alignment === 'justify' ? 'active' : ''}`}
          onClick={() => handleAlignment('justify')}
          title="Justify"
        >
          <img src={AlignJustifyIcon} alt="Justify" />
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="toolbar-section">
        <button 
          className="toolbar-btn icon-btn"
          onClick={decreaseZoom}
          title="Zoom Out"
        >
          <img src={MinusIcon} alt="Zoom Out" />
        </button>
        <div className="zoom-display">{zoom}%</div>
        <button 
          className="toolbar-btn icon-btn"
          onClick={increaseZoom}
          title="Zoom In"
        >
          <img src={PlusIcon} alt="Zoom In" />
        </button>
      </div>
    </div>
  );
};

export default FormattingToolbar;
