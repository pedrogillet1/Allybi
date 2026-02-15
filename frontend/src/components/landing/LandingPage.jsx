import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import gmailSvg from '../../assets/Gmail.svg';
import outlookSvg from '../../assets/outlook.svg';
import slackSvg from '../../assets/slack.svg';
import allybiKnotBlack from '../../assets/allybi-knot-black.svg';

const FONT = 'Plus Jakarta Sans, sans-serif';

function Section({ children, style }) {
  return (
    <section style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '0 24px',
      width: '100%',
      boxSizing: 'border-box',
      ...style,
    }}>
      {children}
    </section>
  );
}

function FeatureCard({ icon, title, description, isMobile }) {
  return (
    <div style={{
      flex: 1,
      minWidth: isMobile ? '100%' : 0,
      background: 'white',
      borderRadius: 16,
      border: '1px solid #E6E6EC',
      boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
      padding: isMobile ? 24 : 32,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'transform 160ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 160ms ease',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(24,24,24,0.08), 0 16px 28px rgba(24,24,24,0.10)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)';
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1 }}>{icon}</div>
      <h3 style={{
        margin: 0, fontSize: 18, fontWeight: 600, color: '#32302C',
        fontFamily: FONT, lineHeight: '24px',
      }}>
        {title}
      </h3>
      <p style={{
        margin: 0, fontSize: 14, fontWeight: 400, color: '#55534E',
        fontFamily: FONT, lineHeight: '20px',
      }}>
        {description}
      </p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F1F0EF',
      fontFamily: FONT,
      overflowX: 'hidden',
    }}>
      {/* Nav */}
      <nav style={{
        padding: isMobile ? '16px 20px' : '20px 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={allybiKnotBlack} alt="" style={{ height: 26, width: 26 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#181818', letterSpacing: '-0.02em' }}>
            Allybi
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            style={{
              height: 40, padding: '0 20px', borderRadius: 9999,
              border: '1px solid #E6E6EC', background: 'white',
              cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 14, color: '#32302C', transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            Log in
          </button>
          <button
            onClick={() => navigate(ROUTES.SIGNUP)}
            style={{
              height: 40, padding: '0 20px', borderRadius: 9999,
              border: 'none', background: '#181818',
              cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 14, color: 'white', transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0F0F0F'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#181818'; }}
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <Section style={{
        paddingTop: isMobile ? 48 : 80,
        paddingBottom: isMobile ? 48 : 80,
        textAlign: 'center',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: isMobile ? 32 : 48,
          fontWeight: 600,
          color: '#32302C',
          lineHeight: isMobile ? '40px' : '56px',
          maxWidth: 720,
          marginLeft: 'auto',
          marginRight: 'auto',
          letterSpacing: '-0.02em',
        }}>
          Allybi helps teams search, edit, and automate work across business files
        </h1>
        <p style={{
          margin: '20px auto 0',
          fontSize: isMobile ? 16 : 18,
          fontWeight: 400,
          color: '#55534E',
          lineHeight: isMobile ? '24px' : '28px',
          maxWidth: 560,
        }}>
          Connect tools like Gmail, Slack, and Outlook, then ask Allybi to find answers in your own documents and spreadsheets with clear, source-backed results.
        </p>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginTop: 36,
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => navigate(ROUTES.SIGNUP)}
            style={{
              height: 48, padding: '0 28px', borderRadius: 9999,
              border: 'none', background: '#181818',
              cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 16, color: 'white', transition: 'background 120ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0F0F0F'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#181818'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Upload your files
          </button>
          <button
            onClick={() => navigate(ROUTES.CHAT)}
            style={{
              height: 48, padding: '0 28px', borderRadius: 9999,
              border: '1px solid #E6E6EC', background: 'white',
              cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 16, color: '#32302C', transition: 'background 120ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Try Allybi free
          </button>
        </div>
      </Section>

      {/* Features */}
      <Section style={{
        paddingBottom: isMobile ? 48 : 80,
      }}>
        <div style={{
          display: 'flex',
          gap: 20,
          flexDirection: isMobile ? 'column' : 'row',
        }}>
          <FeatureCard
            isMobile={isMobile}
            icon="&#9889;"
            title="Lightning fast"
            description="Get answers in seconds, not minutes. Allybi indexes your files as soon as they are connected or uploaded."
          />
          <FeatureCard
            isMobile={isMobile}
            icon="&#127919;"
            title="Pinpoint accuracy"
            description="Every answer references the exact page and paragraph. No hallucinations — just grounded facts from your own files."
          />
          <FeatureCard
            isMobile={isMobile}
            icon="&#128274;"
            title="Version confidence"
            description="Always know which version of a document an answer comes from. Allybi tracks updates so your team stays on current data."
          />
        </div>
      </Section>

      {/* Security */}
      <Section style={{
        paddingBottom: isMobile ? 48 : 80,
      }}>
        <div style={{
          background: 'white',
          borderRadius: 20,
          border: '1px solid #E6E6EC',
          boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
          padding: isMobile ? '32px 24px' : '48px 56px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 24 : 48,
          alignItems: isMobile ? 'flex-start' : 'center',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 600,
              color: '#32302C', lineHeight: isMobile ? '32px' : '40px',
            }}>
              Your data stays yours
            </h2>
            <p style={{
              margin: '12px 0 0', fontSize: 16, fontWeight: 400,
              color: '#55534E', lineHeight: '24px',
            }}>
              We built Allybi with privacy at its core. Your documents are encrypted, never used for model training, and you stay in full control.
            </p>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            minWidth: isMobile ? '100%' : 280,
          }}>
            {[
              { label: 'End-to-end encryption', desc: 'Files encrypted at rest and in transit' },
              { label: 'Never used for training', desc: 'Your data is yours, period' },
              { label: 'SOC 2 ready infrastructure', desc: 'Enterprise-grade security controls' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: '#34A853', fontSize: 18, lineHeight: 1, marginTop: 2 }}>&#10003;</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#32302C', lineHeight: '20px' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: '#6C6B6E', lineHeight: '18px' }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Integrations strip */}
      <Section style={{
        paddingBottom: isMobile ? 48 : 80,
        textAlign: 'center',
      }}>
        <h2 style={{
          margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 600,
          color: '#32302C', lineHeight: '32px',
        }}>
          Connect your tools
        </h2>
        <p style={{
          margin: '8px 0 28px', fontSize: 14, fontWeight: 400,
          color: '#55534E', lineHeight: '20px',
        }}>
          Pull in documents from the tools you already use.
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: isMobile ? 24 : 40,
          flexWrap: 'wrap',
        }}>
          {[
            { icon: gmailSvg, label: 'Gmail' },
            { icon: slackSvg, label: 'Slack' },
            { icon: outlookSvg, label: 'Outlook' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{
                width: 64,
                height: 64,
                background: 'white',
                borderRadius: 16,
                border: '1px solid #E6E6EC',
                boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <img src={item.icon} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
              </div>
              <span style={{
                fontSize: 14, fontWeight: 600, color: '#32302C',
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Bottom CTA */}
      <Section style={{
        paddingBottom: isMobile ? 64 : 96,
        textAlign: 'center',
      }}>
        <div style={{
          background: '#181818',
          borderRadius: 24,
          padding: isMobile ? '40px 24px' : '56px 48px',
        }}>
          <h2 style={{
            margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 600,
            color: 'white', lineHeight: isMobile ? '32px' : '40px',
          }}>
            Ready to get started?
          </h2>
          <p style={{
            margin: '12px 0 28px', fontSize: 16, fontWeight: 400,
            color: 'rgba(255,255,255,0.7)', lineHeight: '24px',
          }}>
            Upload your first document and see the difference in seconds.
          </p>
          <button
            onClick={() => navigate(ROUTES.SIGNUP)}
            style={{
              height: 48, padding: '0 32px', borderRadius: 9999,
              border: 'none', background: 'white',
              cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 16, color: '#181818', transition: 'background 120ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Start for free
          </button>
        </div>
      </Section>

      {/* Footer */}
      <footer style={{
        padding: '24px 48px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 400,
        color: '#6C6B6E',
        lineHeight: '18px',
      }}>
        <div style={{ marginBottom: 8 }}>
          &copy; {new Date().getFullYear()} Allybi. All rights reserved.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(ROUTES.PRIVACY_POLICY)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#6C6B6E',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: FONT,
              fontSize: 13,
              padding: 0,
            }}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => navigate(ROUTES.TERMS_OF_USE)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#6C6B6E',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: FONT,
              fontSize: 13,
              padding: 0,
            }}
          >
            Terms of Use
          </button>
        </div>
      </footer>
    </div>
  );
}
