import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

/* ─── Icons ──────────────────────────────────────────── */
const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ─── Fallback content ───────────────────────────────── */
const FALLBACK = {
  terms: {
    title: 'Terms of Use',
    body: `Last updated: February 2026

1. Acceptance of Terms
By accessing or using Koda ("the Service"), you agree to be bound by these Terms of Use. If you do not agree to all the terms and conditions, you may not use the Service.

2. Use of the Service
You may use Koda solely for lawful purposes and in accordance with these Terms. You agree not to use the Service in any way that violates any applicable law or regulation.

3. User Accounts
You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.

4. Intellectual Property
The Service and its original content, features, and functionality are owned by Koda and are protected by international copyright, trademark, and other intellectual property laws.

5. User Content
You retain ownership of any content you upload to the Service. By uploading content, you grant Koda a limited license to process, store, and display that content as necessary to provide the Service.

6. Privacy
Your use of the Service is also governed by our Privacy Policy.

7. Termination
We may terminate or suspend your account at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.

8. Limitation of Liability
The Service is provided "as is" without warranties of any kind. In no event shall Koda be liable for any indirect, incidental, special, or consequential damages.

9. Changes to Terms
We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.

10. Contact
If you have questions about these Terms, please contact us at support@getkoda.ai.`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `Last updated: February 2026

1. Information We Collect
We collect information you provide directly to us, such as your name, email address, and any files you upload to the Service.

2. How We Use Your Information
We use the information we collect to provide, maintain, and improve the Service, to communicate with you, and to protect our users.

3. Information Sharing
We do not sell or share your personal information with third parties except as described in this policy or with your consent.

4. Data Storage and Security
We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, or destruction.

5. Your Rights
You have the right to access, correct, or delete your personal information. You may also request a copy of your data or ask us to restrict processing.

6. Cookies
We use essential cookies to provide the Service. We do not use tracking or advertising cookies.

7. Data Retention
We retain your data for as long as your account is active or as needed to provide the Service. You may request deletion of your data at any time.

8. Children's Privacy
The Service is not intended for users under 16 years of age. We do not knowingly collect information from children.

9. Changes to This Policy
We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page.

10. Contact
If you have questions about this Privacy Policy, please contact us at support@getkoda.ai.`,
  },
};

/* ─── Component ──────────────────────────────────────── */
export default function LegalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const isTerms = location.pathname.includes('/terms');
  const pageKey = isTerms ? 'terms' : 'privacy';

  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const slug = isTerms ? 'terms-of-use' : 'privacy-policy';
    const url = `https://getkoda.ai/${slug}`;

    (async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('fetch failed');
        const html = await res.text();

        // Extract text content from HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const main = doc.querySelector('main') || doc.querySelector('article') || doc.body;
        const text = main?.innerText?.trim();

        if (!cancelled && text && text.length > 100) {
          setContent({ title: isTerms ? 'Terms of Use' : 'Privacy Policy', body: text });
        } else {
          throw new Error('content too short');
        }
      } catch {
        if (!cancelled) setContent(FALLBACK[pageKey]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isTerms, pageKey]);

  const title = content?.title || FALLBACK[pageKey].title;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#F1F0EF',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Header bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#F1F0EF',
        borderBottom: '1px solid #E6E6EC',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: isMobile ? '14px 16px' : '14px 32px',
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#32302C',
            transition: 'background 160ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#E6E6EC'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <BackIcon />
        </button>
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 16,
          fontWeight: 600,
          color: '#32302C',
        }}>
          {title}
        </span>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: isMobile ? '24px 20px 48px' : '32px 32px 64px',
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '64px 0',
          }}>
            <div style={{
              width: 28,
              height: 28,
              border: '3px solid #E6E6EC',
              borderTopColor: '#181818',
              borderRadius: '50%',
              animation: 'legalSpin 0.8s linear infinite',
            }} />
            <style>{`@keyframes legalSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{
            background: '#FFFFFF',
            borderRadius: 16,
            border: '1px solid #E6E6EC',
            boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
            padding: isMobile ? '24px 20px' : '40px 40px',
          }}>
            <h1 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: '#32302C',
              margin: '0 0 24px 0',
            }}>
              {content?.title || title}
            </h1>
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 15,
              lineHeight: 1.7,
              color: '#44434A',
              whiteSpace: 'pre-wrap',
            }}>
              {content?.body || FALLBACK[pageKey].body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
