import React, { useState } from 'react';
import { Btn, Panel } from '../kit';

type Props = {
  onSuccess: (user: { username: string; walletAddress: string; privateKey: string }) => void;
};

export function AuthModal({ onSuccess }: Props) {
  const [isLogin, setIsLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    // Use relative endpoint so requests automatically proxy to backend over Vite / Cloudflare tunnel
    const baseUrl = '';

    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Server error. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Sign In">
      <div className="frame" style={{ width: 'min(92%, 360px)', padding: 18 }}>
        <h2 className="title" style={{ fontSize: 32, marginBottom: 8 }}>
          {isLogin ? 'Log In' : 'Create Account'}
        </h2>
        <p className="small-text muted" style={{ marginBottom: 14 }}>
          {isLogin
            ? 'Sign in to access your Base Sepolia wallet & stake.'
            : 'Register to get a new empty Base Sepolia wallet.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="small-text muted" style={{ display: 'block', marginBottom: 4 }}>Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. shadow_runner"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                background: '#1d1525',
                color: '#fff',
                border: '1px solid var(--gold)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label className="small-text muted" style={{ display: 'block', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                background: '#1d1525',
                color: '#fff',
                border: '1px solid var(--gold)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13, background: 'rgba(239, 68, 68, 0.1)', padding: '6px 8px', borderRadius: 4 }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <Btn tone="gold" big block disabled={loading}>
              {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up & Create Wallet'}
            </Btn>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
          >
            {isLogin ? "Need an account? Sign Up" : 'Already have an account? Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}
