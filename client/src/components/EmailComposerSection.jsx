/**
 * client/src/components/EmailComposerSection.jsx
 * Email composer with:
 * - Subject input & personalization tags ({{name}}, {{email}})
 * - Safe HTML & plain-text editor with quick formatting snippets
 * - Real-time preview rendered with DOMPurify sanitization
 * - Admin test-email dispatch action
 * - Send confirmation modal with irreversible warnings and Dry-run / Live toggle
 */
import { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Send,
  Eye,
  Code2,
  Sparkles,
  FlaskConical,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function EmailComposerSection({
  campaignName,
  subject,
  body,
  fromName,
  fromEmail,
  validRecipients = [],
  onSubjectChange,
  onBodyChange,
  onFromNameChange,
  onFromEmailChange,
  onConfirmSend,
  isSending = false,
}) {
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState('dry-run'); // 'dry-run' | 'live'
  const [testSending, setTestSending] = useState(false);

  // Sample recipient for preview merge tags
  const sampleRecipient = validRecipients[0] || { name: 'Alex Johnson', email: 'alex@example.com' };

  // Render preview HTML with personalization tags substituted and DOMPurify sanitized
  const renderedPreviewHtml = DOMPurify.sanitize(
    (body || '<p class="text-slate-500 italic">No message body entered yet.</p>')
      .replace(/\{\{\s*name\s*\}\}/gi, sampleRecipient.name || 'Alex')
      .replace(/\{\{\s*email\s*\}\}/gi, sampleRecipient.email || 'alex@example.com'),
    {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'b', 'i', 'strong', 'em',
        'strike', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'div', 'span', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'pre', 'code'
      ],
      ALLOWED_ATTR: ['href', 'target', 'style', 'class', 'src', 'alt', 'width', 'height', 'border'],
    }
  );

  const renderedPreviewSubject = (subject || 'No subject')
    .replace(/\{\{\s*name\s*\}\}/gi, sampleRecipient.name || 'Alex')
    .replace(/\{\{\s*email\s*\}\}/gi, sampleRecipient.email || 'alex@example.com');

  // Insert merge tag into textarea
  const insertTag = (tag) => {
    onBodyChange((prev) => `${prev || ''} ${tag} `);
    toast.success(`Inserted ${tag}`);
  };

  // Insert HTML snippet
  const insertSnippet = (snippet) => {
    onBodyChange((prev) => `${prev || ''}\n${snippet}\n`);
    toast.success('Snippet added');
  };

  // ── Test email to Admin ──────────────────────────────────────────────────
  const handleSendTestEmail = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject line before testing');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter email body content before testing');
      return;
    }

    setTestSending(true);
    try {
      const { data } = await api.post('/campaigns/test-email', {
        subject,
        body,
        fromName,
        fromEmail,
        mode: selectedMode,
      });

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || 'Test send failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch test email');
    } finally {
      setTestSending(false);
    }
  };

  // Trigger modal confirmation
  const handlePreSendCheck = (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error('Subject line is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Email body is required');
      return;
    }
    if (validRecipients.length === 0) {
      toast.error('At least one valid recipient is required');
      return;
    }
    setShowConfirmModal(true);
  };

  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-400" />
            Message Composer
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Personalize content using merge tags like <code className="text-violet-300">{'{{name}}'}</code> and <code className="text-violet-300">{'{{email}}'}</code>.
          </p>
        </div>

        {/* Editor vs Preview tabs */}
        <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'editor'
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 size={13} /> Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye size={13} /> Live Preview
          </button>
        </div>
      </div>

      {/* ── SENDER & SUBJECT DETAILS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Sender Name (Optional)
          </label>
          <input
            type="text"
            value={fromName}
            onChange={(e) => onFromNameChange(e.target.value)}
            placeholder="e.g. MailFlow Updates"
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Sender Email (Optional, verified in SendGrid)
          </label>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => onFromEmailChange(e.target.value)}
            placeholder="Leave empty to use configured SENDGRID_FROM_EMAIL"
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-slate-300">
            Subject Line <span className="text-red-400">*</span>
          </label>
          <span className="text-[11px] text-slate-500">{subject.length}/200 chars</span>
        </div>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          maxLength={200}
          placeholder="e.g. Important announcement for {{name}}"
          className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* ── EDITOR TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div className="space-y-3">
          {/* Tag & Snippet Quick Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/70 border border-slate-700/60 rounded-xl text-xs">
            <span className="text-slate-400 font-medium px-1 flex items-center gap-1">
              <Sparkles size={13} className="text-violet-400" /> Insert Tag:
            </span>
            <button
              type="button"
              onClick={() => insertTag('{{name}}')}
              className="px-2.5 py-1 bg-violet-950/60 hover:bg-violet-900/80 border border-violet-800 text-violet-300 rounded-lg text-xs font-mono transition-colors"
            >
              {'{{name}}'}
            </button>
            <button
              type="button"
              onClick={() => insertTag('{{email}}')}
              className="px-2.5 py-1 bg-violet-950/60 hover:bg-violet-900/80 border border-violet-800 text-violet-300 rounded-lg text-xs font-mono transition-colors"
            >
              {'{{email}}'}
            </button>

            <span className="text-slate-600 px-1">|</span>

            <span className="text-slate-400 font-medium px-1">Snippets:</span>
            <button
              type="button"
              onClick={() => insertSnippet('<h2>Headline Title</h2>')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
            >
              Heading
            </button>
            <button
              type="button"
              onClick={() =>
                insertSnippet(
                  '<a href="https://example.com" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Call To Action</a>'
                )
              }
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
            >
              Button Link
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors"
            >
              Divider
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Email Body (HTML and Plain Text supported) <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={9}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={`<h1>Hello {{name}},</h1>\n<p>Thank you for being part of MailFlow. We are delighted to share...</p>`}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
            />
          </div>
        </div>
      )}

      {/* ── LIVE PREVIEW TAB ──────────────────────────────────────────────── */}
      {activeTab === 'preview' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-700">
            <div>
              Simulating for: <strong className="text-white">{sampleRecipient.name}</strong> ({sampleRecipient.email})
            </div>
            <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
              Sanitized with DOMPurify
            </span>
          </div>

          <div className="bg-white text-slate-900 rounded-xl p-6 min-h-60 border border-slate-300 shadow-inner overflow-auto font-sans">
            <div className="border-b border-slate-200 pb-3 mb-4">
              <p className="text-xs text-slate-500">
                <strong>Subject:</strong> {renderedPreviewSubject}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                <strong>From:</strong> {fromName || 'MailFlow'} &lt;{fromEmail || 'Configured SendGrid Sender'}&gt;
              </p>
            </div>
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
            />
          </div>
        </div>
      )}

      {/* ── ACTIONS BAR ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-700/60">
        <button
          type="button"
          onClick={handleSendTestEmail}
          disabled={testSending}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {testSending ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FlaskConical size={14} className="text-amber-400" />
          )}
          Send Test to Admin
        </button>

        <button
          type="button"
          onClick={handlePreSendCheck}
          disabled={isSending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-violet-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-violet-900/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {isSending ? 'Sending Campaign...' : `Launch Campaign (${validRecipients.length} recipients)`}
        </button>
      </div>

      {/* ── CONFIRMATION MODAL ────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Confirm Campaign Launch</h4>
                <p className="text-xs text-slate-400">Review settings before dispatch</p>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4 space-y-2.5 text-xs border border-slate-700/60">
              <div className="flex justify-between">
                <span className="text-slate-400">Campaign:</span>
                <span className="font-semibold text-white">{campaignName || 'Untitled'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Subject:</span>
                <span className="font-semibold text-white truncate max-w-xs">{subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Valid Recipients:</span>
                <span className="font-bold text-emerald-400">{validRecipients.length} addresses</span>
              </div>
            </div>

            {/* Mode selection toggle */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">Execution Mode:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMode('dry-run')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedMode === 'dry-run'
                      ? 'bg-amber-950/60 border-amber-600 text-white'
                      : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs mb-0.5">
                    <FlaskConical size={14} /> DRY-RUN Mode
                  </div>
                  <p className="text-[11px] text-slate-400">Simulates send safely. No real emails sent.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMode('live')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedMode === 'live'
                      ? 'bg-blue-950/60 border-blue-600 text-white'
                      : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs mb-0.5">
                    <Send size={14} /> LIVE Delivery
                  </div>
                  <p className="text-[11px] text-slate-400">Sends real emails via Twilio SendGrid.</p>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-300 flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> Campaign execution is permanent. Once started, emails cannot be recalled.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  onConfirmSend(selectedMode);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg transition-all"
              >
                Confirm & Launch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
