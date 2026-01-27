import React from 'react';
import PdfIcon from './PdfIcon';
import JpgIcon from './JpgIcon';
import DocIcon from './DocIcon';

const FileIcons = () => (
    <div style={{width: 288.44, height: 90, position: 'relative'}}>
        <div style={{position: 'absolute', left: 50.08, top: 24.42}}><PdfIcon isPreview={true} /></div>
        <div style={{position: 'absolute', left: 172.97, top: 19.86}}><DocIcon isPreview={true} /></div>
        <div style={{position: 'absolute', left: 99.12, top: 0}}><JpgIcon isPreview={true} /></div>
    </div>
);

export default FileIcons;
