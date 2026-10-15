/**
 * client/src/pages/HistoryPage.jsx
 * Paginated campaign history from MongoDB with search, status filtering,
 * recipient summary and direct link to detailed recipient logs.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import {
  History,
  ChevronLeft,
  ChevronRight,
  Mail,
  Trash2,
  Users,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle,
  XCircle,
  FlaskConical,
} from 'lucide-react';

const statusConfig = {
  draft: { label: 'Draft', cls: 'bg-slate-700 text-slate-300' },
  sending: { label: 'Sending...', cls: 'bg-blue-900/60 text-blue-300 animate-pulse' },
  completed: { label: 'Completed', cls: 'bg-emerald-950/80 border border-emerald-700 text-emerald-300' },
  'dry-run': { label: 'Dry-Run OK', cls: 'bg-amber-950/80 border border-amber-700 text-amber-300' },
  failed: { label: 'Failed', cls: 'bg-rose-950/80 border border-rose-700 text-rose-300' },
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
        <div className="w-10 h-10 rounded-xl bg-slate-750 border border-slate-700 flex items-center justify-center flex-shrink-0">
          <Mail size={16} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-100 truncate">{campaign.name}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {campaign.subject} · {new Date(campaign.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Users size={13} className="text-slate-400" />
            <span>{campaign.stats?.total ?? 0}</span>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
          <Link
            to={`/campaigns/${campaign._id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-950/40 hover:text-blue-300 transition-all text-xs flex items-center gap-1"
            title="View recipient details"
          >
            <ExternalLink size={14} />
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(campaign._id);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all"
            title="Delete campaign"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-4 bg-slate-800/60 border-t border-slate-700/30">
          <div className="grid grid-cols-4 gap-3 my-3">
            {[
              { label: 'Audience Total', val: campaign.stats?.total ?? 0, icon: Users, cls: 'text-slate-200' },
              { label: 'Dry-Run Simulation', val: campaign.stats?.dryRun ?? 0, icon: FlaskConical, cls: 'text-amber-400' },
              { label: 'Delivered / Live', val: campaign.stats?.delivered ?? 0, icon: CheckCircle, cls: 'text-emerald-400' },
              { label: 'Failed Dispatches', val: campaign.stats?.failed ?? 0, icon: XCircle, cls: 'text-rose-400' },
            ].map(({ label, val, icon: Icon, cls }) => (
              <div key={label} className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 text-center">
                <Icon size={14} className={`${cls} mx-auto mb-1`} />
                <p className={`text-base font-bold ${cls}`}>{val}</p>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <p>
              Mode: <span className="text-amber-300 font-semibold">{campaign.mode ?? 'dry-run'}</span>
              {campaign.completedAt && ` · Completed: ${new Date(campaign.completedAt).toLocaleTimeString()}`}
            </p>
            <Link
              to={`/campaigns/${campaign._id}`}
              className="text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              Inspect Per-Recipient Statuses & Errors →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchCampaigns = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        let url = `/campaigns?page=${page}&limit=10`;
        if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
        if (statusFilter !== 'all') url += `&status=${statusFilter}`;

        const { data } = await api.get(url);
        setCampaigns(data.campaigns);
        setPagination(data.pagination);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter]
  );

  useEffect(() => {
    fetchCampaigns(1);
  }, [fetchCampaigns]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
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
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Campaign History</h2>
            <p className="text-sm text-slate-400 mt-1">
              {pagination.total} total campaign{pagination.total !== 1 ? 's' : ''} stored in database
            </p>
          </div>

          <button
            onClick={() => fetchCampaigns(pagination.page)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Search & Filters */}
        <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by campaign name or subject..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="dry-run">Dry-Run Simulation</option>
            <option value="completed">Live Completed</option>
            <option value="sending">Sending</option>
            <option value="failed">Failed</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Table container */}
        <div className="bg-slate-800 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-700/60 bg-slate-800/80">
            <History size={16} className="text-slate-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Dispatched Campaigns</h3>
            <span className="ml-auto text-xs text-slate-500">Click any row to view breakdown</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-750 animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <History size={40} className="mb-3 opacity-30" />
              <p className="font-semibold text-slate-300">No campaigns found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search criteria or create a campaign</p>
            </div>
          ) : (
            campaigns.map((c) => <CampaignRow key={c._id} campaign={c} onDelete={handleDelete} />)
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-900/40 text-xs text-slate-400">
              <p>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchCampaigns(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => fetchCampaigns(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors"
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
