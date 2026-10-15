/**
 * client/src/pages/DashboardPage.jsx
 * Real-time stats fetched from MongoDB via /api/campaigns/stats.
 * Displays accurate counts for Total Campaigns, Recipients, Delivered, Dry-Run, and Failed.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import {
  BarChart3,
  Mail,
  Users,
  CheckCircle,
  Plus,
  RefreshCw,
  Clock,
  FlaskConical,
  ExternalLink,
} from 'lucide-react';

const statusBadges = {
  draft: 'bg-slate-700 text-slate-300',
  sending: 'bg-blue-900/60 text-blue-300',
  completed: 'bg-emerald-950/80 border border-emerald-700 text-emerald-300',
  'dry-run': 'bg-amber-950/80 border border-amber-700 text-amber-300',
  failed: 'bg-rose-950/80 border border-rose-700 text-rose-300',
};

function MetricCard({ icon: Icon, label, value, sub, gradient, textColor = 'text-white' }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-800 border border-slate-700/60 shadow-xl">
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${gradient}`} />
      <div className="relative">
        <div
          className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg`}
        >
          <Icon size={20} className="text-white" />
        </div>
        <p className={`text-3xl font-extrabold tracking-tight ${textColor}`}>{value ?? 0}</p>
        <p className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/campaigns/stats');
      setStats(data.stats);
      setRecent(data.recentCampaigns || []);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Campaign Analytics</h2>
            <p className="text-sm text-slate-400 mt-1">
              Real-time campaign telemetry and persistent delivery logs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link
              to="/compose"
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-violet-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-900/30 transition-all"
            >
              <Plus size={15} />
              New Campaign
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard
            icon={BarChart3}
            label="Total Campaigns"
            value={stats?.totalCampaigns}
            sub="Stored in MongoDB"
            gradient="from-blue-500 to-blue-700"
          />
          <MetricCard
            icon={Users}
            label="Total Recipients"
            value={stats?.totalRecipients}
            sub="Imported audience"
            gradient="from-violet-500 to-violet-700"
          />
          <MetricCard
            icon={CheckCircle}
            label="Delivered (Live)"
            value={stats?.totalDelivered}
            sub="Confirmed via SendGrid"
            gradient="from-emerald-500 to-emerald-700"
            textColor="text-emerald-400"
          />
          <MetricCard
            icon={FlaskConical}
            label="Dry-Run Processed"
            value={stats?.totalDryRun}
            sub="Safe simulations"
            gradient="from-amber-500 to-orange-600"
            textColor="text-amber-400"
          />
        </div>

        {/* Recent Campaigns Table */}
        <div className="bg-slate-800 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-slate-800/80">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Recent Campaigns</h3>
            </div>
            <Link to="/history" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
              View all history →
            </Link>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-750 animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Mail size={40} className="mb-3 opacity-30" />
              <p className="font-semibold text-slate-300">No campaigns dispatched yet</p>
              <p className="text-xs text-slate-500 mt-1">Create your first bulk email campaign</p>
              <Link
                to="/compose"
                className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                Compose Campaign
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/40">
              {recent.map((c) => (
                <Link
                  key={c._id}
                  to={`/campaigns/${c._id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-750/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-750 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Mail size={16} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-100 truncate group-hover:text-blue-300 transition-colors">
                      {c.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.stats?.total ?? 0} audience · {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      statusBadges[c.status] || 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {c.status}
                  </span>
                  <ExternalLink size={14} className="text-slate-500 group-hover:text-slate-300" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
