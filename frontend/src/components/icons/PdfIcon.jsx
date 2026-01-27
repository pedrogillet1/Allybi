import React from 'react';

const PdfIcon = ({ isPreview }) => (
    <div style={{
        width: isPreview ? 65.42 : 40,
        height: isPreview ? 65.42 : 40,
        position: 'relative',
        transform: isPreview ? 'rotate(-4deg)' : 'none',
        transformOrigin: 'top left'
    }}>
        <div style={{
            width: isPreview ? 55.27 : 33.6,
            height: isPreview ? 55.27 : 33.6,
            left: isPreview ? 7.27 : 4.4,
            top: isPreview ? 7.27 : 4.4,
            position: 'absolute',
            background: 'linear-gradient(180deg, #F14B54 0%, #88252B 100%)',
            boxShadow: '0px 8.18px 27.26px rgba(0, 0, 0, 0.12)',
            borderRadius: isPreview ? 8.18 : 5
        }} />
        <div style={{
            width: isPreview ? 65.01 : 39.5,
            height: isPreview ? 39.72 : 24.1,
            left: isPreview ? 2.41 : 1.4,
            top: isPreview ? 15.05 : 9.1,
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.35)',
            boxShadow: '0px 5.45px 8.18px rgba(0, 0, 0, 0.15)',
            borderRadius: isPreview ? 8.18 : 5,
            border: '1.36px white solid',
            backdropFilter: 'blur(6.81px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontSize: isPreview ? 16 : 12,
            fontWeight: 'bold',
            fontFamily: 'Plus Jakarta Sans'
        }}>
            PDF
        </div>
    </div>
);

export default PdfIcon;
