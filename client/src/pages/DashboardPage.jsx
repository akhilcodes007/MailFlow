/**
 * src/pages/DashboardPage.jsx
 * Real-time stats fetched from DB via /api/campaigns/stats.
 * No hardcoded numbers — everything comes from MongoDB.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import {
  BarChart3, Mail, Users, CheckCircle, XCircle,
  TrendingUp, Plus, RefreshCw, Clock, FlaskConical
} from 'lucide-react';

const statusColors = {
  draft: 'bg-slate-700 text-slate-300',
  sending: 'bg-blue-900/60 text-blue-300',
  completed: 'bg-green-900/60 text-green-300',
  'dry-run': 'bg-amber-900/60 text-amber-300',
  failed: 'bg-red-900/60 text-red-300',
};

function StatCard({ icon: Icon, label, value, sub, gradient }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 bg-slate-800 border border-slate-700/50 shadow-lg`}>
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${gradient}`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
          <Icon size={20} className="text-white" />
        </div>
        <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm font-medium text-slate-300 mt-1">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/campaigns/stats');
      setStats(data.stats);
      setRecent(data.recentCampaigns);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <Layout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Dashboard</h2>
            <p className="text-slate-400 text-sm mt-1">Real-time stats from MongoDB</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-sm transition-all disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link
              to="/compose"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-medium shadow-lg transition-all"
            >
              <Plus size={15} />
              New Campaign
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Stats grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-slate-800 border border-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            <StatCard icon={BarChart3} label="Total Campaigns" value={stats?.totalCampaigns ?? 0} gradient="from-blue-500 to-blue-700" />
            <StatCard icon={Users} label="Total Recipients" value={stats?.totalRecipients ?? 0} gradient="from-violet-500 to-violet-700" />
            <StatCard icon={CheckCircle} label="Emails Sent" value={stats?.totalSent ?? 0} sub="Live sends" gradient="from-green-500 to-emerald-700" />
            <StatCard icon={FlaskConical} label="Dry-Run Processed" value={stats?.totalDryRun ?? 0} sub="Simulated sends" gradient="from-amber-500 to-orange-600" />
          </div>
        )}

        {/* Recent campaigns */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <h3 className="font-semibold text-slate-100">Recent Campaigns</h3>
            </div>
            <Link to="/history" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-700/50 animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Mail size={40} className="mb-3 opacity-30" />
              <p className="font-medium">No campaigns yet</p>
              <p className="text-sm mt-1">Create your first campaign to get started</p>
              <Link
                to="/compose"
                className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors"
              >
                Create Campaign
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {recent.map((c) => (
                <div key={c._id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-700/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Mail size={16} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-100 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.stats?.total ?? 0} recipients · {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[c.status] ?? 'bg-slate-700 text-slate-300'}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
