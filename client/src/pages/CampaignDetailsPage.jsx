/**
 * client/src/pages/CampaignDetailsPage.jsx
 * Detailed view for an individual campaign:
 * - Campaign metadata, subject, body preview
 * - Per-recipient status breakdown (pending, processing, accepted, delivered, bounced, failed, dry-run)
 * - Provider message IDs and error reasons
 * - "Retry Failed Recipients" action
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Users,
  RotateCcw,
  Search,
} from 'lucide-react';

const statusBadges = {
  delivered: { cls: 'bg-emerald-950/80 border-emerald-700 text-emerald-300', label: 'Delivered' },
  accepted: { cls: 'bg-blue-950/80 border-blue-700 text-blue-300', label: 'Accepted by SendGrid' },
  'dry-run': { cls: 'bg-amber-950/80 border-amber-700 text-amber-300', label: 'Dry-Run OK' },
  failed: { cls: 'bg-rose-950/80 border-rose-700 text-rose-300', label: 'Failed' },
  bounced: { cls: 'bg-purple-950/80 border-purple-700 text-purple-300', label: 'Bounced' },
  processing: { cls: 'bg-indigo-950/80 border-indigo-700 text-indigo-300', label: 'Processing' },
  pending: { cls: 'bg-slate-800 border-slate-700 text-slate-400', label: 'Pending' },
};

export default function CampaignDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [retrying, setRetrying] = useState(false);

  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/campaigns/${id}`);
      setCampaign(data.campaign);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch campaign details');
      navigate('/history');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const { data } = await api.post(`/campaigns/${id}/retry-failed`);
      toast.success(data.message || 'Retried failed recipients');
      fetchCampaign();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (loading || !campaign) {
    return (
      <Layout>
        <div className="p-8 max-w-5xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
          <div className="h-64 bg-slate-800 rounded-2xl animate-pulse" />
        </div>
      </Layout>
    );
  }

  // Filter recipients
  const filteredRecipients = (campaign.recipients || []).filter((r) => {
    const matchesSearch =
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      (r.name && r.name.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const failedCount = (campaign.recipients || []).filter((r) => r.status === 'failed').length;

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Navigation back */}
        <Link
          to="/history"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back to History
        </Link>

        {/* Campaign Header */}
        <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase font-bold tracking-wider text-blue-400">Campaign Details</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                  Mode: {campaign.mode}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
              <p className="text-xs text-slate-400 mt-1">
                Subject: <span className="text-slate-200 font-medium">{campaign.subject}</span>
              </p>
            </div>

            {failedCount > 0 && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={retrying}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RotateCcw size={14} className={retrying ? 'animate-spin' : ''} />
                Retry {failedCount} Failed
              </button>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-700/60">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <p className="text-lg font-bold text-white">{campaign.stats?.total || 0}</p>
              <p className="text-[11px] text-slate-400">Total Recipients</p>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <p className="text-lg font-bold text-emerald-400">{campaign.stats?.delivered || 0}</p>
              <p className="text-[11px] text-slate-400">Delivered</p>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <p className="text-lg font-bold text-amber-400">{campaign.stats?.dryRun || 0}</p>
              <p className="text-[11px] text-slate-400">Dry-Run OK</p>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <p className="text-lg font-bold text-rose-400">{campaign.stats?.failed || 0}</p>
              <p className="text-[11px] text-slate-400">Failed</p>
            </div>
          </div>
        </div>

        {/* Recipients Table with Search & Filters */}
        <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users size={18} className="text-blue-400" />
              Recipient Logs ({filteredRecipients.length})
            </h3>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email or name..."
                  className="bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="accepted">Accepted</option>
                <option value="dry-run">Dry-Run</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
          </div>

          <div className="border border-slate-700/60 rounded-xl overflow-hidden overflow-x-auto bg-slate-900/40">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Message ID / Note</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRecipients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      No matching recipients found.
                    </td>
                  </tr>
                ) : (
                  filteredRecipients.map((r, i) => {
                    const badge = statusBadges[r.status] || statusBadges.pending;
                    return (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-slate-200">{r.email}</td>
                        <td className="py-2.5 px-3 text-slate-400">{r.name || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {r.error ? (
                            <span className="text-rose-400" title={r.error}>
                              {r.error}
                            </span>
                          ) : (
                            r.providerMessageId || '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {r.sentAt || r.deliveredAt
                            ? new Date(r.sentAt || r.deliveredAt).toLocaleTimeString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
