import React from 'react';

const DocIcon = ({ isPreview }) => (
    <div style={{
        width: isPreview ? 65.55 : 40,
        height: isPreview ? 65.55 : 40,
        position: 'relative',
        transform: isPreview ? 'rotate(4deg)' : 'none',
        transformOrigin: 'top left'
    }}>
        <div style={{
            width: isPreview ? 55.39 : 33.6,
            height: isPreview ? 55.39 : 33.6,
            left: isPreview ? 7.29 : 4.4,
            top: isPreview ? 7.29 : 4.4,
            position: 'absolute',
            background: 'linear-gradient(180deg, #179BF6 0%, #006FBB 100%)',
            boxShadow: '0px 8.19px 27.31px rgba(0, 0, 0, 0.12)',
            borderRadius: isPreview ? 8.19 : 5
        }} />
        <div style={{
            width: isPreview ? 65.15 : 39.5,
            height: isPreview ? 39.80 : 24.1,
            left: isPreview ? 2.41 : 1.4,
            top: isPreview ? 15.08 : 9.1,
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.35)',
            boxShadow: '0px 5.46px 8.19px rgba(0, 0, 0, 0.15)',
            borderRadius: isPreview ? 8.19 : 5,
            border: '1.37px white solid',
            backdropFilter: 'blur(6.83px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontSize: isPreview ? 16 : 12,
            fontWeight: 'bold',
            fontFamily: 'Plus Jakarta Sans'
        }}>
            DOC
        </div>
    </div>
);

export default DocIcon;
