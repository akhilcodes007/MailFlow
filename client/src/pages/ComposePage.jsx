/**
 * src/pages/ComposePage.jsx
 * Create and dry-run a bulk email campaign.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';
import { Send, Plus, Trash2, FlaskConical, Info } from 'lucide-react';

const BLANK_RECIPIENT = { email: '', name: '' };
const MAX_RECIPIENTS = 500;

export default function ComposePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    subject: '',
    fromName: '',
    fromEmail: '',
    body: '',
  });
  const [recipients, setRecipients] = useState([{ ...BLANK_RECIPIENT }]);
  const [bulkText, setBulkText] = useState('');
  const [useBulk, setUseBulk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});

  // ── Recipient helpers ─────────────────────────────────────────────────────
  const addRecipient = () => {
    if (recipients.length >= MAX_RECIPIENTS) return;
    setRecipients([...recipients, { ...BLANK_RECIPIENT }]);
  };

  const removeRecipient = (i) => {
    if (recipients.length === 1) return;
    setRecipients(recipients.filter((_, idx) => idx !== i));
  };

  const updateRecipient = (i, field, value) => {
    const updated = [...recipients];
    updated[i] = { ...updated[i], [field]: value };
    setRecipients(updated);
  };

  const parseBulkRecipients = () => {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const parsed = lines.map((line) => {
      const [email, name] = line.split(',').map((s) => s.trim());
      return { email: email || '', name: name || '' };
    });
    return parsed.slice(0, MAX_RECIPIENTS);
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Campaign name is required';
    if (!form.subject.trim()) e.subject = 'Subject is required';
    if (!form.body.trim()) e.body = 'Email body is required';
    const recs = useBulk ? parseBulkRecipients() : recipients;
    if (recs.length === 0) e.recipients = 'At least one recipient is required';
    if (recs.some((r) => !r.email)) e.recipients = 'All recipients must have an email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Create campaign ───────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const recs = useBulk ? parseBulkRecipients() : recipients.filter((r) => r.email);
      const { data } = await api.post('/campaigns', { ...form, recipients: recs });
      setCreatedId(data.campaign._id);
      toast.success('Campaign saved! Ready to dry-run.');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create campaign';
      const apiErrors = err.response?.data?.errors;
      if (apiErrors) {
        const map = {};
        apiErrors.forEach((e) => { map[e.field] = e.message; });
        setErrors(map);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Dry-run send ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!createdId) return;
    setSending(true);
    try {
      const { data } = await api.post(`/campaigns/${createdId}/send`);
      setResult(data);
      toast.success('Dry-run completed!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const Field = ({ label, error, children }) => (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );

  const inputClass = "w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Compose Campaign</h2>
          <p className="text-slate-400 text-sm mt-1">
            All sends are dry-run in Phase 1 — no real emails are dispatched.
          </p>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-800/40 mb-6">
          <FlaskConical size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <strong>DRY-RUN mode active.</strong> Campaigns are processed and stored in MongoDB, but no emails are actually sent to recipients. This is intentional for Phase 1.
          </p>
        </div>

        {result ? (
          /* Result card after send */
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-900/50 flex items-center justify-center">
                <FlaskConical size={20} className="text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Dry-Run Complete</h3>
                <p className="text-sm text-slate-400">{result.message}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-white">{result.campaign?.stats?.total ?? 0}</p>
                <p className="text-xs text-slate-400 mt-1">Total</p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-400">{result.campaign?.stats?.dryRun ?? 0}</p>
                <p className="text-xs text-slate-400 mt-1">Dry-Run OK</p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{result.campaign?.stats?.failed ?? 0}</p>
                <p className="text-xs text-slate-400 mt-1">Failed</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/history')}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                View in History
              </button>
              <button
                onClick={() => { setResult(null); setCreatedId(null); setForm({ name:'',subject:'',fromName:'',fromEmail:'',body:'' }); setRecipients([{...BLANK_RECIPIENT}]); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
              >
                New Campaign
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Campaign meta */}
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-slate-100 mb-2">Campaign Details</h3>
              <Field label="Campaign Name" error={errors.name}>
                <input className={inputClass} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Q4 Newsletter" />
              </Field>
              <Field label="Email Subject" error={errors.subject}>
                <input className={inputClass} value={form.subject} onChange={(e) => setForm({...form, subject: e.target.value})} placeholder="Your subject line here" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="From Name (optional)">
                  <input className={inputClass} value={form.fromName} onChange={(e) => setForm({...form, fromName: e.target.value})} placeholder="MailFlow" />
                </Field>
                <Field label="From Email (optional)">
                  <input className={inputClass} type="email" value={form.fromEmail} onChange={(e) => setForm({...form, fromEmail: e.target.value})} placeholder="noreply@example.com" />
                </Field>
              </div>
              <Field label="Email Body (HTML supported)" error={errors.body}>
                <textarea
                  className={`${inputClass} min-h-36 resize-y font-mono text-xs`}
                  value={form.body}
                  onChange={(e) => setForm({...form, body: e.target.value})}
                  placeholder={`<h1>Hello {{name}},</h1>\n<p>Your email content here...</p>`}
                />
              </Field>
            </div>

            {/* Recipients */}
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-100">Recipients</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUseBulk(!useBulk)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    {useBulk ? 'Individual entries' : 'Bulk paste'}
                  </button>
                </div>
              </div>

              {errors.recipients && (
                <p className="text-xs text-red-400 mb-3">{errors.recipients}</p>
              )}

              {useBulk ? (
                <div>
                  <p className="text-xs text-slate-500 mb-2">One per line: <code className="text-slate-400">email@example.com, Display Name</code></p>
                  <textarea
                    className={`${inputClass} min-h-36 resize-y font-mono text-xs`}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`alice@example.com, Alice Smith\nbob@example.com, Bob Jones`}
                  />
                  <p className="text-xs text-slate-500 mt-2">{parseBulkRecipients().length} / {MAX_RECIPIENTS} recipients parsed</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recipients.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        type="email"
                        value={r.email}
                        onChange={(e) => updateRecipient(i, 'email', e.target.value)}
                        placeholder="email@example.com"
                        required
                      />
                      <input
                        className={`${inputClass} flex-1`}
                        value={r.name}
                        onChange={(e) => updateRecipient(i, 'name', e.target.value)}
                        placeholder="Display Name"
                      />
                      <button
                        type="button"
                        onClick={() => removeRecipient(i)}
                        disabled={recipients.length === 1}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 disabled:opacity-30 transition-all"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {recipients.length < MAX_RECIPIENTS && (
                    <button
                      type="button"
                      onClick={addRecipient}
                      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mt-2 transition-colors"
                    >
                      <Plus size={15} /> Add recipient
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {!createdId ? (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  {loading ? 'Saving…' : 'Save Campaign'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium text-sm shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FlaskConical size={16} />}
                  {sending ? 'Processing…' : 'Run Dry-Run Send'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
