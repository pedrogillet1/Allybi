import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import CategoryGrid from './CategoryGrid';
import FileBreakdownDonut from './FileBreakdownDonut';
import UpcomingActions from './UpcomingActions';
import QuickAccess from './QuickAccess';
import { useIsMobile, useMobileBreakpoints } from '../hooks/useIsMobile';
import LeftNav from './LeftNav';

const Dashboard = () => {
  const isMobile = useIsMobile();
  const mobile = useMobileBreakpoints();

  // Adaptive spacing - MOBILE ONLY changes
  const contentPadding = isMobile ? mobile.padding.base : 20;
  const contentGap = isMobile ? mobile.gap : 20;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#F5F5F5',
      overflow: 'hidden',
      justifyContent: 'flex-start',
      alignItems: 'center',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row' // MOBILE ONLY: Column layout
    }}>
      {/* Use LeftNav for mobile, Sidebar for desktop */}
      {isMobile ? <LeftNav /> : <Sidebar />}

      <div style={{
        flex: '1 1 0',
        height: '100%',
        width: isMobile ? '100%' : 'auto', // MOBILE ONLY: Full width
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        display: 'flex',
        overflow: 'hidden'
      }}>
        <Header />

        <div style={{
          alignSelf: 'stretch',
          flex: '1 1 0',
          padding: contentPadding, // ADAPTIVE padding
          overflow: 'auto',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          gap: contentGap, // ADAPTIVE gap
          display: 'flex',
          WebkitOverflowScrolling: 'touch' // MOBILE ONLY: Smooth scrolling
        }}>
          {/* Category Grid - full width on mobile */}
          <CategoryGrid />

          {/* File Breakdown and Actions - stack vertically on mobile */}
          <div style={{
            alignSelf: 'stretch',
            flex: '1 1 0',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: contentGap, // ADAPTIVE gap
            display: isMobile ? 'flex' : 'inline-flex',
            flexDirection: isMobile ? 'column' : 'row'
          }}>
            {/* File Breakdown - full width on mobile */}
            <div style={{
              flex: isMobile ? 'none' : '1 1 0',
              width: isMobile ? '100%' : 'auto',
              minHeight: isMobile ? (mobile.isSmallPhone ? '260px' : '300px') : 'auto' // ADAPTIVE height
            }}>
              <FileBreakdownDonut showEncryptionMessage={false} />
            </div>

            {/* Upcoming Actions and Quick Access - stack vertically */}
            <div style={{
              flex: isMobile ? 'none' : '1 1 0',
              width: isMobile ? '100%' : 'auto',
              alignSelf: 'stretch',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: contentGap, // ADAPTIVE gap
              display: 'flex'
            }}>
              <UpcomingActions />
              <QuickAccess />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
