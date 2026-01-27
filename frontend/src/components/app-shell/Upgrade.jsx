import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LeftNav from './LeftNav';
import NotificationPanel from './NotificationPanel';
import { ReactComponent as Right3Icon } from '../assets/Right 3.svg';
import { ReactComponent as CheckCircleIcon } from '../assets/check-circle.svg';
import { useIsMobile } from '../hooks/useIsMobile';

const Upgrade = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' or 'yearly'
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);

  return (
    <div style={{
      width: '100%',
      height: isMobile ? 'auto' : '100vh',
      minHeight: isMobile ? '100vh' : 'auto',
      background: '#F5F5F5',
      overflow: isMobile ? 'visible' : 'hidden',
      justifyContent: 'flex-start',
      alignItems: 'center',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Main Content */}
      <div style={{ flex: '1 1 0', height: '100vh', width: isMobile ? '100%' : 'auto', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex' }}>
        {/* Header */}
        <div style={{ alignSelf: 'stretch', height: isMobile ? 56 : 120, paddingLeft: isMobile ? 16 : 20, paddingRight: 20, paddingTop: isMobile ? 16 : 20, paddingBottom: isMobile ? 16 : 20, background: 'white', borderBottom: '1px #E6E6EC solid', justifyContent: 'space-between', alignItems: 'center', gap: 12, display: 'flex', flexDirection: isMobile ? 'row' : 'row' }}>
          <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, display: 'flex' }}>
            {/* Breadcrumb */}
            <div style={{ justifyContent: 'flex-start', alignItems: 'center', display: 'flex' }}>
              <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex' }}>
                <div
                  onClick={() => navigate('/settings')}
                  style={{ paddingTop: 4, paddingBottom: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
                >
                  <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px' }}>{t('settings.title')}</div>
                </div>
                <Right3Icon style={{ width: 16, height: 16 }} />
                <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, background: '#F9FAFB', borderRadius: 6, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                  <div style={{ color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '20px' }}>{t('upgrade.upgradePlan')}</div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', color: '#32302C', fontSize: 20, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '30px' }}>{t('upgrade.choosePlan')}</div>
          </div>

          {/* Billing Toggle */}
          <div style={{ width: 497, padding: 6, background: '#F5F5F5', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
            <div
              onClick={() => setBillingPeriod('monthly')}
              style={{ flex: '1 1 0', height: 36, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: billingPeriod === 'monthly' ? 'white' : 'transparent', borderRadius: 100, justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', cursor: 'pointer' }}
            >
              <div style={{ color: billingPeriod === 'monthly' ? '#32302C' : '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('upgrade.payMonthly')}</div>
            </div>
            <div
              onClick={() => setBillingPeriod('yearly')}
              style={{ flex: '1 1 0', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 6, justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', cursor: 'pointer', background: billingPeriod === 'yearly' ? 'white' : 'transparent' }}
            >
              <div style={{ color: billingPeriod === 'yearly' ? '#32302C' : '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '19.60px' }}>{t('upgrade.payYearly')}</div>
              <div style={{ height: 22, paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6, background: '#FBBC04', borderRadius: 100, justifyContent: 'center', alignItems: 'center', gap: 6, display: 'flex' }}>
                <div style={{ color: 'black', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '600' }}>{t('upgrade.save20')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ alignSelf: 'stretch', flex: '1 1 0', padding: 20, overflow: 'auto', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 20, display: 'flex' }}>
          {/* Hero Banner */}
          <div style={{ alignSelf: 'stretch', paddingLeft: 60, paddingRight: 60, paddingTop: 70, paddingBottom: 70, position: 'relative', background: 'rgba(24, 24, 24, 0.90)', overflow: 'hidden', borderRadius: 20, justifyContent: 'space-between', alignItems: 'center', gap: 10, display: 'flex' }}>
            <div style={{ flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 40, display: 'flex', zIndex: 1 }}>
              <div style={{ alignSelf: 'stretch', color: '#F8F8F8', fontSize: 40, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '50px' }}>
                {t('upgrade.heroTitle')}
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.80)', fontSize: 24, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '34px', maxWidth: 594 }}>
                {t('upgrade.heroSubtitle')}
              </div>
            </div>

            {/* Right side decorative element */}
            <div style={{width: '100%', maxWidth: 632.76, height: 341.83, position: 'relative', background: '#18181B', overflow: 'hidden', borderRadius: 10.58}}>
              <div style={{width: 200.93, height: 200.93, left: 452.10, top: 70.50, position: 'absolute', borderRadius: 21.15, border: '0.88px white solid'}} />
              <div style={{width: 200.93, height: 200.93, left: -20.27, top: 70.50, position: 'absolute', borderRadius: 21.15, border: '0.88px white solid'}} />
              <div style={{width: 200.93, height: 200.93, left: -20.27, top: -165.68, position: 'absolute', borderRadius: 21.15, border: '0.88px white solid'}} />
              <div style={{width: 200.93, height: 200.93, left: 215.91, top: -165.68, position: 'absolute', borderRadius: 21.15, border: '0.88px white solid'}} />
              <div style={{width: 200.93, height: 200.93, left: 452.10, top: -165.68, position: 'absolute', borderRadius: 21.15, border: '0.88px white solid'}} />
              <div style={{width: 498.81, height: 379.83, left: 66.98, top: -49.35, position: 'absolute', opacity: 0.30, background: 'radial-gradient(ellipse 57.09% 57.09% at 50.00% 50.00%, rgba(255, 255, 255, 0.50) 0%, rgba(0, 0, 0, 0) 85%)', borderRadius: 9999}} />
              <div style={{width: 200.93, height: 200.93, left: 215.91, top: 70.50, position: 'absolute', background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, rgba(255, 255, 255, 0) 100%)', borderRadius: 21.15, border: '0.88px white solid'}} />
            </div>
          </div>

          {/* Pricing Cards */}
          <div style={{ alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 20, display: 'flex' }}>
            {/* Free Plan */}
            <PricingCard
              t={t}
              title={t('upgrade.freePlan')}
              price="$0"
              period={t('upgrade.month')}
              description={t('upgrade.freeDescription')}
              features={[t('upgrade.storage1GB'), t('upgrade.user1'), t('upgrade.ltdAI')]}
              isCurrent={true}
            />

            {/* Personal Plan */}
            <PricingCard
              t={t}
              title={t('upgrade.personalPlan')}
              price={billingPeriod === 'monthly' ? '$4.99' : '$59.99'}
              period={billingPeriod === 'monthly' ? t('upgrade.month') : t('upgrade.year')}
              description={t('upgrade.personalDescription')}
              features={[t('upgrade.storage5GB'), t('upgrade.user1'), t('upgrade.standardAI')]}
              isCurrent={false}
            />

            {/* Premium Plan */}
            <PricingCard
              t={t}
              title={t('upgrade.premiumPlan')}
              price={billingPeriod === 'monthly' ? '$9.99' : '$119.88'}
              period={billingPeriod === 'monthly' ? t('upgrade.month') : t('upgrade.year')}
              description={t('upgrade.premiumDescription')}
              features={[t('upgrade.storage50GB'), t('upgrade.user1'), t('upgrade.enhancedAI')]}
              isCurrent={false}
              badge={t('upgrade.save20')}
            />

            {/* Family Plan */}
            <PricingCard
              t={t}
              title={t('upgrade.familyPlan')}
              price={billingPeriod === 'monthly' ? '$14.99' : '$179.99'}
              period={billingPeriod === 'monthly' ? t('upgrade.month') : t('upgrade.year')}
              description={t('upgrade.familyDescription')}
              features={[t('upgrade.storage100GB'), t('upgrade.users5'), t('upgrade.enhancedAI')]}
              isCurrent={false}
            />
          </div>

          {/* Footer */}
          <div style={{ alignSelf: 'stretch', padding: 20, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, display: 'flex' }}>
            <div style={{ textAlign: 'center', color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '400', lineHeight: '20px' }}>
              {t('upgrade.termsFooter')} <span style={{ color: '#181818', fontWeight: '600' }}>{t('upgrade.terms')}</span> {t('upgrade.and')} <span style={{ color: '#181818', fontWeight: '600' }}>{t('upgrade.privacyPolicy')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Panel */}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />
    </div>
  );
};

// Pricing Card Component
const PricingCard = ({ t, title, price, period, description, features, isCurrent, badge }) => {
  return (
    <div style={{ flex: '1 1 0', background: 'white', overflow: 'hidden', borderRadius: 16, outline: '1px #E6E6EC solid', outlineOffset: '-1px', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', display: 'flex' }}>
      {/* Header */}
      <div style={{ alignSelf: 'stretch', padding: 20, borderBottom: '1px #E3E3E3 solid', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 24, display: 'flex' }}>
        <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 16, display: 'flex' }}>
          <div style={{ alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', gap: 16, display: 'flex' }}>
            <div style={{ flex: '1 1 0', color: '#101828', fontSize: 18, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '26px' }}>{title}</div>
            {badge && (
              <div style={{ height: 22, paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6, background: '#FBBC04', borderRadius: 100, justifyContent: 'center', alignItems: 'center', gap: 6, display: 'flex' }}>
                <div style={{ color: 'black', fontSize: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: '600' }}>{badge}</div>
              </div>
            )}
          </div>
          <div style={{ alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 4, display: 'flex' }}>
            <div style={{ color: '#101828', fontSize: 40, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '50px' }}>{price}</div>
            <div style={{ paddingBottom: 6, color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '20px' }}>/ {period}</div>
          </div>
        </div>
        <div style={{ alignSelf: 'stretch', color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', lineHeight: '20px' }}>{description}</div>

        {/* Button */}
        {isCurrent ? (
          <div style={{ alignSelf: 'stretch', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', borderRadius: 14, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex' }}>
            <div style={{ color: '#323232', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px' }}>{t('upgrade.current')}</div>
          </div>
        ) : (
          <div style={{ alignSelf: 'stretch', height: 52, background: 'rgba(24, 24, 24, 0.90)', borderRadius: 14, justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}>
            <div style={{ color: 'white', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', textTransform: 'capitalize', lineHeight: '24px' }}>{t('upgrade.upgradeNow')}</div>
          </div>
        )}
      </div>

      {/* Features */}
      <div style={{ alignSelf: 'stretch', padding: 20, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 24, display: 'flex' }}>
        <div style={{ alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 16, display: 'flex' }}>
          {features.map((feature, index) => (
            <div key={index} style={{ alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex' }}>
              <CheckCircleIcon style={{ width: 20, height: 20, color: '#34A853' }} />
              <div style={{ flex: '1 1 0', color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500', textTransform: 'capitalize', lineHeight: '20px' }}>{feature}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Upgrade;
