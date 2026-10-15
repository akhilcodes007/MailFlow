/**
 * client/src/pages/SettingsPage.jsx
 * Safe Configuration Health & Status page:
 * - Shows MongoDB and SendGrid provider configuration status without exposing secrets
 * - Documents Webhook setup and sender verification
 * - Manages consent suppression list (unsubscribes & bounces)
 */
import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Database,
  Mail,
  Webhook,
  Sliders,
  RefreshCw,
  UserX,
  Trash2,
  Plus,
} from 'lucide-react';

export default function SettingsPage() {
  const [statusData, setStatusData] = useState(null);
  const [suppressions, setSuppressions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSuppressionEmail, setNewSuppressionEmail] = useState('');
  const [newSuppressionReason, setNewSuppressionReason] = useState('unsubscribe');
  const [addingSuppression, setAddingSuppression] = useState(false);

  const fetchStatusAndSuppressions = async () => {
    setLoading(true);
    try {
      const [configRes, suppRes] = await Promise.all([
        api.get('/health/config'),
        api.get('/campaigns/suppressions'),
      ]);
      setStatusData(configRes.data.status);
      setSuppressions(suppRes.data.suppressions || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch status settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndSuppressions();
  }, []);

  const handleAddSuppression = async (e) => {
    e.preventDefault();
    if (!newSuppressionEmail.trim()) return;

    setAddingSuppression(true);
    try {
      await api.post('/campaigns/suppressions', {
        email: newSuppressionEmail.trim(),
        reason: newSuppressionReason,
      });
      toast.success('Address added to suppression list');
      setNewSuppressionEmail('');
      fetchStatusAndSuppressions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add suppression');
    } finally {
      setAddingSuppression(false);
    }
  };

  const handleRemoveSuppression = async (email) => {
    if (!window.confirm(`Remove ${email} from suppression list?`)) return;
    try {
      await api.delete(`/campaigns/suppressions/${encodeURIComponent(email)}`);
      toast.success('Suppression removed');
      setSuppressions(suppressions.filter((s) => s.email !== email));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove suppression');
    }
  };

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
              Settings & System Health
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Verify platform configuration, email provider readiness, and suppression lists safely.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchStatusAndSuppressions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-200 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-slate-800 border border-slate-700/50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── STATUS CARDS ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Database */}
              <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center text-emerald-400">
                      <Database size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">MongoDB Atlas</h4>
                      <p className="text-xs text-slate-400">Database Persistence</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-700 text-emerald-300">
                    {statusData?.database?.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-700/60">
                  <div className="flex justify-between">
                    <span>State:</span>
                    <span className="text-slate-200 font-mono">{statusData?.database?.state}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cluster Node:</span>
                    <span className="text-slate-200 font-mono">Atlas Replica Set</span>
                  </div>
                </div>
              </div>

              {/* Email Provider */}
              <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-950/80 border border-violet-800 flex items-center justify-center text-violet-400">
                      <Mail size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Twilio SendGrid</h4>
                      <p className="text-xs text-slate-400">Outbound Email Delivery</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      statusData?.emailProvider?.configured
                        ? 'bg-blue-950/80 border border-blue-700 text-blue-300'
                        : 'bg-amber-950/80 border border-amber-700 text-amber-300'
                    }`}
                  >
                    {statusData?.emailProvider?.configured ? 'Live Ready' : 'Dry-Run Mode'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-700/60">
                  <div className="flex justify-between">
                    <span>Sender Name:</span>
                    <span className="text-slate-200">{statusData?.emailProvider?.senderName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Masked From Email:</span>
                    <span className="text-slate-200 font-mono">{statusData?.emailProvider?.senderEmailMasked}</span>
                  </div>
                </div>
              </div>

              {/* Webhook Configuration */}
              <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-400">
                      <Webhook size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Delivery Webhook</h4>
                      <p className="text-xs text-slate-400">SendGrid Event Webhook</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 border border-indigo-700 text-indigo-300">
                    Endpoint Ready
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-700/60">
                  <div className="flex justify-between">
                    <span>Endpoint:</span>
                    <span className="text-slate-200 font-mono">{statusData?.webhook?.endpoint}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Signature Verification:</span>
                    <span className="text-slate-200">
                      {statusData?.webhook?.signatureVerificationConfigured ? 'Enabled (Signed)' : 'Optional (Dev)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Platform Limits */}
              <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800 flex items-center justify-center text-amber-400">
                      <Sliders size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Limits & Protection</h4>
                      <p className="text-xs text-slate-400">Security & Concurrency</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
                    Active
                  </span>
                </div>
                <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-700/60">
                  <div className="flex justify-between">
                    <span>Max Recipients/Campaign:</span>
                    <span className="text-slate-200 font-bold">{statusData?.limits?.maxRecipientsPerCampaign}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rate Limit Max:</span>
                    <span className="text-slate-200 font-mono">
                      {statusData?.limits?.rateLimitMax} reqs / {statusData?.limits?.rateLimitWindowMinutes}m
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SUPPRESSION / UNSUBSCRIBE MANAGEMENT ──────────────────────── */}
            <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <UserX className="w-5 h-5 text-rose-400" />
                    Consent & Suppression List ({suppressions.length})
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Emails on this list are automatically blocked from campaigns to ensure compliance.
                  </p>
                </div>
              </div>

              {/* Add address form */}
              <form onSubmit={handleAddSuppression} className="flex flex-wrap gap-2 text-xs">
                <input
                  type="email"
                  value={newSuppressionEmail}
                  onChange={(e) => setNewSuppressionEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <select
                  value={newSuppressionReason}
                  onChange={(e) => setNewSuppressionReason(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
                >
                  <option value="unsubscribe">Unsubscribe</option>
                  <option value="bounce">Hard Bounce</option>
                  <option value="complaint">Complaint</option>
                  <option value="manual">Manual Suppression</option>
                </select>
                <button
                  type="submit"
                  disabled={addingSuppression}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Plus size={14} /> Add Suppression
                </button>
              </form>

              {/* List */}
              <div className="border border-slate-700/60 rounded-xl max-h-56 overflow-y-auto bg-slate-900/40">
                {suppressions.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500 italic">
                    No suppressed addresses recorded.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800 text-slate-400 sticky top-0 border-b border-slate-700">
                      <tr>
                        <th className="py-2 px-3">Email Address</th>
                        <th className="py-2 px-3">Reason</th>
                        <th className="py-2 px-3">Added Date</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {suppressions.map((s) => (
                        <tr key={s._id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-slate-200">{s.email}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-rose-300 capitalize">
                              {s.reason}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSuppression(s.email)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
