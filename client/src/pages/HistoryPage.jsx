/**
 * src/pages/HistoryPage.jsx
 * Paginated campaign history from MongoDB.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
  History, ChevronLeft, ChevronRight, Mail,
  Trash2, Users, RefreshCw, FlaskConical, CheckCircle, XCircle
} from 'lucide-react';

const statusConfig = {
  draft: { label: 'Draft', cls: 'bg-slate-700 text-slate-300' },
  sending: { label: 'Sending', cls: 'bg-blue-900/60 text-blue-300' },
  completed: { label: 'Completed', cls: 'bg-green-900/60 text-green-300' },
  'dry-run': { label: 'Dry-Run ✓', cls: 'bg-amber-900/60 text-amber-300' },
  failed: { label: 'Failed', cls: 'bg-red-900/60 text-red-300' },
};

function CampaignRow({ campaign, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const s = statusConfig[campaign.status] ?? statusConfig.draft;

  return (
    <div className="border-b border-slate-700/50 last:border-0">
      <div
        className="flex items-center gap-4 px-6 py-4 hover:bg-slate-700/20 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
          <Mail size={15} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-100 truncate">{campaign.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {campaign.subject} · {new Date(campaign.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users size={12} />
            {campaign.stats?.total ?? 0}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
            {s.label}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(campaign._id); }}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-950/30 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-4 bg-slate-800/50">
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Total', val: campaign.stats?.total ?? 0, icon: Users, cls: 'text-slate-300' },
              { label: 'Dry-Run OK', val: campaign.stats?.dryRun ?? 0, icon: FlaskConical, cls: 'text-amber-400' },
              { label: 'Sent', val: campaign.stats?.sent ?? 0, icon: CheckCircle, cls: 'text-green-400' },
              { label: 'Failed', val: campaign.stats?.failed ?? 0, icon: XCircle, cls: 'text-red-400' },
            ].map(({ label, val, icon: Icon, cls }) => (
              <div key={label} className="bg-slate-700/40 rounded-xl p-3 text-center">
                <Icon size={14} className={`${cls} mx-auto mb-1`} />
                <p className={`text-lg font-bold ${cls}`}>{val}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Mode: <span className="text-amber-400 font-medium">{campaign.mode ?? 'dry-run'}</span> ·
            Created: {new Date(campaign.createdAt).toLocaleString()}
            {campaign.completedAt && ` · Completed: ${new Date(campaign.completedAt).toLocaleString()}`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCampaigns = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/campaigns?page=${page}&limit=10`);
      setCampaigns(data.campaigns);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(1); }, [fetchCampaigns]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.delete(`/campaigns/${id}`);
      toast.success('Campaign deleted');
      fetchCampaigns(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Email History</h2>
            <p className="text-slate-400 text-sm mt-1">
              {pagination.total} campaign{pagination.total !== 1 ? 's' : ''} total
            </p>
          </div>
          <button
            onClick={() => fetchCampaigns(pagination.page)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-700">
            <History size={16} className="text-slate-400" />
            <h3 className="font-semibold text-slate-100">All Campaigns</h3>
            <span className="ml-auto text-xs text-slate-500">Click a row to expand</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-700/40 animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <History size={40} className="mb-3 opacity-30" />
              <p className="font-medium">No campaigns found</p>
              <p className="text-sm mt-1">Campaigns you create will appear here</p>
            </div>
          ) : (
            campaigns.map((c) => (
              <CampaignRow key={c._id} campaign={c} onDelete={handleDelete} />
            ))
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
              <p className="text-sm text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchCampaigns(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => fetchCampaigns(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
