import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <Shield size={36} color="#60a5fa" />
        </div>
        <h1 style={styles.title}>Koda Admin</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrap}>
              <input
                style={{ ...styles.input, paddingRight: 42 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <button
                type="button"
                style={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
              </button>
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={submitting}>
            {submitting ? <Loader size={18} className="spinning" /> : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    padding: 20,
  },
  card: {
    background: '#1e293b',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 380,
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'rgba(96,165,250,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 4px',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    margin: '0 0 28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    textAlign: 'left',
  },
  label: {
    display: 'block',
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
  },
  error: {
    background: 'rgba(239,68,68,0.1)',
    color: '#f87171',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
  },
  button: {
    padding: '11px 0',
    borderRadius: 8,
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
};

export default AdminLogin;
