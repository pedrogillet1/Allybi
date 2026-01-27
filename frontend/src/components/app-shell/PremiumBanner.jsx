import React from 'react';
import logoCopy from '../assets/Logo copy.svg';

const PremiumBanner = () => {
  return (
    <div style={{
      alignSelf: 'stretch',
      padding: '60px',
      position: 'relative',
      background: 'rgba(24, 24, 24, 0.90)',
      overflow: 'hidden',
      borderRadius: 20,
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      minHeight: 200
    }}>
      {/* KODA Logo on LEFT side - LARGE */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingLeft: 0
      }}>
        <img
          src={logoCopy}
          alt="KODA"
          style={{
            height: 140,
            width: 'auto',
            objectFit: 'contain'
          }}
        />
      </div>
    </div>
  );
};

export default PremiumBanner;
