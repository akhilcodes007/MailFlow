/**
 * client/src/pages/VerifyEmailPage.jsx
 * Reads token from URL and verifies user email address.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Zap, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Mail } from 'lucide-react';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'No verification token provided in the URL.'
  );
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function verify() {
      try {
        const { data } = await api.post('/auth/verify-email', { token });
        if (isMounted) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully! You can now log in.');
          toast.success('Email verified successfully!');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setMessage(
            err.response?.data?.message ||
              'Invalid or expired verification link. Please request a new verification email.'
          );
        }
      }
    }

    verify();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      const { data } = await api.post('/auth/resend-verification', { email: resendEmail });
      toast.success(data.message || 'Verification link sent!');
      setResendSent(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend verification link.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 text-center">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-xl mb-4">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Email Verification</h1>
          </div>

          {/* Verifying State */}
          {status === 'verifying' && (
            <div className="py-6 space-y-4">
              <div className="w-12 h-12 mx-auto border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-300">Verifying your email address with MailFlow...</p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="py-4 space-y-5">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Verification Complete</h3>
                <p className="text-sm text-slate-300 mt-2">{message}</p>
              </div>
              <Link
                to="/login"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
              >
                Sign In to Your Account <ArrowRight size={16} />
              </Link>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="py-4 space-y-5">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Verification Failed</h3>
                <p className="text-sm text-rose-300/90 mt-2">{message}</p>
              </div>

              {/* Resend box */}
              {resendSent ? (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs">
                  A fresh verification email has been sent if an unverified account exists. Check your inbox!
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-3 pt-2">
                  <p className="text-xs text-slate-400">Enter your email to receive a new link:</p>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                      className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resending}
                    className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                    {resending ? 'Sending...' : 'Resend Verification Link'}
                  </button>
                </form>
              )}

              <div className="pt-2">
                <Link to="/login" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Back to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
