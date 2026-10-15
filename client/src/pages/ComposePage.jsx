/**
 * client/src/pages/ComposePage.jsx
 * Full end-to-end bulk email workflow:
 * 1. Campaign Metadata
 * 2. Recipient Import & Validation (CSV, Excel, Manual, Column selection, Deduplication)
 * 3. Message Composition & Live Preview with DOMPurify
 * 4. Test Email to Admin
 * 5. Campaign Launch (Dry-run or Live) with Live Progress Tracking
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import RecipientImportSection from '../components/RecipientImportSection';
import EmailComposerSection from '../components/EmailComposerSection';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  CheckCircle,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function ComposePage() {
  const navigate = useNavigate();

  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState([]);

  const [isSending, setIsSending] = useState(false);
  const [progressData, setProgressData] = useState(null);
  const [completedCampaign, setCompletedCampaign] = useState(null);

  // ── Polling progress when sending ─────────────────────────────────────────
  const pollCampaignProgress = async (campaignId) => {
    try {
      const { data } = await api.get(`/campaigns/${campaignId}/progress`);
      if (data.success) {
        setProgressData(data);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'dry-run') {
          return true; // Finished
        }
      }
    } catch {
      // Continue polling
    }
    return false;
  };

  // ── Launch Campaign Handler ───────────────────────────────────────────────
  const handleLaunchCampaign = async (mode) => {
    if (!campaignName.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }
    if (recipients.length === 0) {
      toast.error('Please import at least one valid recipient');
      return;
    }

    setIsSending(true);
    setProgressData({
      total: recipients.length,
      processed: 0,
      progressPercent: 0,
      status: 'sending',
    });

    try {
      // 1. Create campaign in MongoDB
      const createRes = await api.post('/campaigns', {
        name: campaignName.trim(),
        subject: subject.trim(),
        body: body.trim(),
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        recipients,
        mode,
      });

      const newCampaign = createRes.data.campaign;
      toast.success('Campaign registered. Processing dispatch...');

      // 2. Dispatch the campaign
      const sendPromise = api.post(`/campaigns/${newCampaign._id}/send`, { mode });

      // Poll progress while waiting
      const interval = setInterval(async () => {
        const isDone = await pollCampaignProgress(newCampaign._id);
        if (isDone) clearInterval(interval);
      }, 1000);

      const sendRes = await sendPromise;
      clearInterval(interval);

      // Fetch final details
      const finalRes = await api.get(`/campaigns/${newCampaign._id}`);
      setCompletedCampaign(finalRes.data.campaign);
      toast.success(sendRes.data.message || 'Campaign finished!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch campaign');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
            <Sparkles size={14} /> MailFlow Campaign Engine
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Create & Dispatch Campaign</h2>
          <p className="text-sm text-slate-400 mt-1">
            Import audience, compose personalized content, and safely execute delivery with Twilio SendGrid.
          </p>
        </div>

        {/* ── PROGRESS MODAL WHILE SENDING ─────────────────────────────────── */}
        {isSending && progressData && (
          <div className="bg-slate-800 border border-blue-500/50 rounded-2xl p-6 shadow-2xl animate-pulse space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500 flex items-center justify-center text-blue-400">
                  <Clock size={18} className="animate-spin" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Sending in Progress...</h4>
                  <p className="text-xs text-slate-400">
                    Dispatched {progressData.processed} of {progressData.total} recipients
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-blue-400">{progressData.progressPercent}%</span>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-blue-500 to-violet-500 h-full transition-all duration-300"
                style={{ width: `${progressData.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* ── SUCCESS RESULT CARD ─────────────────────────────────────────── */}
        {completedCampaign ? (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-700 flex items-center justify-center text-emerald-400">
                <CheckCircle size={26} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Campaign Execution Finished</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Campaign: <span className="text-white font-medium">{completedCampaign.name}</span> · Mode:{' '}
                  <span className="text-amber-400 font-semibold">{completedCampaign.mode}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 text-center">
                <p className="text-2xl font-bold text-white">{completedCampaign.stats?.total || 0}</p>
                <p className="text-xs text-slate-400 mt-1">Total Audience</p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 text-center">
                <p className="text-2xl font-bold text-emerald-400">{completedCampaign.stats?.delivered || 0}</p>
                <p className="text-xs text-slate-400 mt-1">Delivered</p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 text-center">
                <p className="text-2xl font-bold text-amber-400">{completedCampaign.stats?.dryRun || 0}</p>
                <p className="text-xs text-slate-400 mt-1">Dry-Run OK</p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 text-center">
                <p className="text-2xl font-bold text-rose-400">{completedCampaign.stats?.failed || 0}</p>
                <p className="text-xs text-slate-400 mt-1">Failed</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                View History & Recipient Details <ArrowRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedCampaign(null);
                  setCampaignName('');
                  setSubject('');
                  setBody('');
                  setRecipients([]);
                }}
                className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
              >
                Start Another Campaign
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Campaign Name Input */}
            <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                1. Campaign Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Product Update Newsletter - October"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 2. Recipient Import Section */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 px-1">
                2. Recipients & Audience Import
              </div>
              <RecipientImportSection onRecipientsChange={setRecipients} />
            </div>

            {/* 3. Message Composition Section */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 px-1">
                3. Message Content & Preview
              </div>
              <EmailComposerSection
                campaignName={campaignName}
                subject={subject}
                body={body}
                fromName={fromName}
                fromEmail={fromEmail}
                validRecipients={recipients}
                onSubjectChange={setSubject}
                onBodyChange={setBody}
                onFromNameChange={setFromName}
                onFromEmailChange={setFromEmail}
                onConfirmSend={handleLaunchCampaign}
                isSending={isSending}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
