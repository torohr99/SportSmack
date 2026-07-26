'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function VerifyOTP() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const { checkUserLoggedIn } = useAuth();

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!userId) {
      setError('Invalid request. No user ID found.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axios.post('http://localhost:5000/api/auth/verify', { userId, code });
      if (res.data.token) {
        localStorage.setItem('smack_token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        await checkUserLoggedIn(); // Update global auth state
        router.push('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Verify Email</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center' }}>
          We've sent a 6-digit verification code to your email. Please enter it below to activate your account.
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleVerify} className="auth-form">
          <div className="form-group">
            <label htmlFor="code">6-Digit Code</label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength="6"
              required
              className="auth-input"
              style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.2rem' }}
            />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
