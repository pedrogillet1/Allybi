import React from 'react';

const JpgIcon = ({ isPreview }) => (
    <div style={{
        width: isPreview ? 90 : 40,
        height: isPreview ? 90 : 40,
        position: 'relative'
    }}>
        <div style={{
            width: isPreview ? 71.25 : 31.67,
            height: isPreview ? 71.25 : 31.67,
            left: isPreview ? 9.38 : 4.17,
            top: isPreview ? 9.37 : 4.17,
            position: 'absolute',
            background: 'linear-gradient(180deg, #23AF7C 0%, #005E4D 100%)',
            boxShadow: '0px 11.25px 37.5px rgba(0, 0, 0, 0.12)',
            borderRadius: isPreview ? 11.25 : 5
        }} />
        <div style={{
            width: isPreview ? 86.25 : 38.33,
            height: isPreview ? 48.75 : 21.67,
            left: isPreview ? 1.88 : 0.83,
            top: isPreview ? 20.62 : 9.17,
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.35)',
            boxShadow: '0px 7.5px 11.25px rgba(0, 0, 0, 0.15)',
            borderRadius: isPreview ? 11.25 : 5,
            border: '1.87px white solid',
            backdropFilter: 'blur(9.37px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontSize: isPreview ? 16 : 12,
            fontWeight: 'bold',
            fontFamily: 'Plus Jakarta Sans'
        }}>
            JPG
        </div>
    </div>
);

export default JpgIcon;
