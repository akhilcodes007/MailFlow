/**
 * client/src/components/RecipientImportSection.jsx
 * Recipient Import component matching the observable reference workflow:
 * - Drag-and-drop / file picker for CSV, XLSX, XLS
 * - Automatic column detection & manual column mapping override
 * - Manual chip/text entry
 * - Interactive preview table with Valid / Invalid / Duplicates filtering
 * - Inline edit & deletion
 * - CSV report download of invalid rows
 */
import { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Trash2,
  Edit2,
  Check,
  Plus,
  AlertTriangle,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  parseFile,
  validateAndClassifyRecipients,
  parseManualRecipientsText,
  downloadInvalidReport,
  MAX_RECIPIENTS_LIMIT,
} from '../lib/recipientParser';

export default function RecipientImportSection({ onRecipientsChange, initialRecipients = [] }) {
  const [mode, setMode] = useState('file'); // 'file' | 'manual'
  const [fileData, setFileData] = useState(null); // { rows, headers, emailCol, nameCol, fileName }
  const [manualText, setManualText] = useState('');
  const [manualChipInput, setManualChipInput] = useState('');
  const [rawList, setRawList] = useState(initialRecipients);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'valid' | 'invalid' | 'duplicates'
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ email: '', name: '' });
  const fileInputRef = useRef(null);

  // Compute classified lists
  const classified = validateAndClassifyRecipients(rawList);

  const notifyChange = (updatedList) => {
    setRawList(updatedList);
    const result = validateAndClassifyRecipients(updatedList);
    onRecipientsChange(result.valid);
  };

  // ── File Upload Handler ──────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseFile(file);
      setFileData({
        rows: parsed.rows,
        headers: parsed.headers,
        emailCol: parsed.detectedEmailCol || parsed.headers[0] || '',
        nameCol: parsed.detectedNameCol || '',
        fileName: file.name,
      });

      // Extract list using detected email column
      const eCol = parsed.detectedEmailCol || parsed.headers[0];
      const nCol = parsed.detectedNameCol;

      const extracted = parsed.rows.map((row) => ({
        email: String(row[eCol] || '').trim(),
        name: nCol ? String(row[nCol] || '').trim() : '',
      }));

      notifyChange(extracted);
      toast.success(`Imported ${extracted.length} rows from ${file.name}`);
    } catch (err) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Column mapping change ────────────────────────────────────────────────
  const handleColumnChange = (emailKey, nameKey) => {
    if (!fileData) return;
    setFileData({ ...fileData, emailCol: emailKey, nameCol: nameKey });

    const extracted = fileData.rows.map((row) => ({
      email: String(row[emailKey] || '').trim(),
      name: nameKey ? String(row[nameKey] || '').trim() : '',
    }));

    notifyChange(extracted);
    toast.success('Column mapping updated');
  };

  // ── Manual Chip Add ──────────────────────────────────────────────────────
  const handleAddChip = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = manualChipInput.trim();
      if (!val) return;
      const parsed = parseManualRecipientsText(val);
      if (parsed.length > 0) {
        notifyChange([...rawList, ...parsed]);
        setManualChipInput('');
      }
    }
  };

  // ── Bulk Manual Paste ────────────────────────────────────────────────────
  const handleApplyManualText = () => {
    const parsed = parseManualRecipientsText(manualText);
    if (parsed.length === 0) {
      toast.error('No emails found in pasted text');
      return;
    }
    notifyChange(parsed);
    toast.success(`Parsed ${parsed.length} recipients`);
  };

  // ── Row Deletion & Editing ───────────────────────────────────────────────
  const handleDeleteRow = (item) => {
    const updated = rawList.filter((r) => r.email !== item.email);
    notifyChange(updated);
    toast.success('Recipient removed');
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditValues({ email: item.email, name: item.name || '' });
  };

  const handleSaveEdit = (originalItem) => {
    const updated = rawList.map((r) => {
      if (r.email === originalItem.email) {
        return { email: editValues.email, name: editValues.name };
      }
      return r;
    });
    setEditingId(null);
    notifyChange(updated);
    toast.success('Recipient updated');
  };

  // Filter rows for display in preview table
  let displayRows = [];
  if (filterTab === 'valid') displayRows = classified.valid;
  else if (filterTab === 'invalid') displayRows = classified.invalid;
  else if (filterTab === 'duplicates') displayRows = classified.duplicates;
  else {
    displayRows = [
      ...classified.valid.map((r) => ({ ...r, category: 'valid' })),
      ...classified.invalid.map((r) => ({ ...r, category: 'invalid' })),
      ...classified.duplicates.map((r) => ({ ...r, category: 'duplicate' })),
    ];
  }

  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Recipients Import
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Import from CSV, Excel (.xlsx, .xls) or enter addresses manually.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'file' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            File Upload
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'manual' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual Entry
          </button>
        </div>
      </div>

      {/* ── FILE UPLOAD MODE ──────────────────────────────────────────────── */}
      {mode === 'file' && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length > 0) {
                fileInputRef.current.files = e.dataTransfer.files;
                handleFileUpload({ target: { files: e.dataTransfer.files } });
              }
            }}
            className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/40 hover:bg-slate-900/80 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group text-center"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,.xlsx,.xls"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-sm font-medium text-slate-200">
              Click to browse or drag & drop file here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports CSV, Excel (.xlsx, .xls) up to 5MB (max {MAX_RECIPIENTS_LIMIT} recipients)
            </p>
          </div>

          {/* Column mapping controls */}
          {fileData && (
            <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold">{fileData.fileName}</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-slate-400">Email column:</label>
                <select
                  value={fileData.emailCol}
                  onChange={(e) => handleColumnChange(e.target.value, fileData.nameCol)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {fileData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-slate-400">Name column (optional):</label>
                <select
                  value={fileData.nameCol}
                  onChange={(e) => handleColumnChange(fileData.emailCol, e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {fileData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL ENTRY MODE ─────────────────────────────────────────────── */}
      {mode === 'manual' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Quick Chip Input (Press Enter or comma to add):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualChipInput}
                onChange={(e) => setManualChipInput(e.target.value)}
                onKeyDown={handleAddChip}
                placeholder="Type an email (e.g. alex@example.com) and press Enter..."
                className="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualChipInput.trim()) {
                    const parsed = parseManualRecipientsText(manualChipInput);
                    notifyChange([...rawList, ...parsed]);
                    setManualChipInput('');
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Or Paste Bulk Text (one per line: email or email, name):
            </label>
            <textarea
              rows={4}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="alice@example.com, Alice Smith&#10;bob@example.com, Bob Jones"
              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                onClick={handleApplyManualText}
                className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors"
              >
                Parse & Apply Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATS BADGES & FILTER TABS ────────────────────────────────────── */}
      {rawList.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-700/60">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterTab === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({classified.counts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('valid')}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  filterTab === 'valid'
                    ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                    : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                <CheckCircle2 size={13} /> Valid ({classified.counts.valid})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('invalid')}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  filterTab === 'invalid'
                    ? 'bg-rose-950/80 border border-rose-700 text-rose-300'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                <XCircle size={13} /> Invalid ({classified.counts.invalid})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('duplicates')}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  filterTab === 'duplicates'
                    ? 'bg-amber-950/80 border border-amber-700 text-amber-300'
                    : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <Copy size={13} /> Duplicates ({classified.counts.duplicates})
              </button>
            </div>

            <div className="flex items-center gap-2">
              {classified.counts.invalid > 0 && (
                <button
                  type="button"
                  onClick={() => downloadInvalidReport(classified.invalid)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/40 border border-rose-700/60 text-rose-300 hover:bg-rose-900/70 text-xs font-medium transition-all"
                >
                  <Download size={13} /> Export Invalid CSV
                </button>
              )}
              <button
                type="button"
                onClick={() => notifyChange([])}
                className="text-xs text-slate-500 hover:text-rose-400 px-2 py-1 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Row count warning if exceeds maximum */}
          {classified.counts.valid > MAX_RECIPIENTS_LIMIT && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs mb-3">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>
                Campaign limit is {MAX_RECIPIENTS_LIMIT} recipients. Only the first {MAX_RECIPIENTS_LIMIT} will be
                dispatched.
              </span>
            </div>
          )}

          {/* ── PREVIEW TABLE ──────────────────────────────────────────────── */}
          <div className="border border-slate-700/60 rounded-xl overflow-hidden max-h-60 overflow-y-auto bg-slate-900/50">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-800/80 text-slate-400 sticky top-0 border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Email</th>
                  <th className="py-2.5 px-3 font-semibold">Name (Merge tag)</th>
                  <th className="py-2.5 px-3 font-semibold">Status / Reason</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 italic">
                      No recipients in this view.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r, i) => {
                    const isEditing = editingId === r.id;
                    const isInvalid = classified.invalid.some((inv) => inv.email === r.email);
                    const isDuplicate = classified.duplicates.some((dup) => dup.email === r.email);

                    return (
                      <tr key={r.id || i} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="email"
                              value={editValues.email}
                              onChange={(e) => setEditValues({ ...editValues, email: e.target.value })}
                              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            />
                          ) : (
                            <span className="font-mono text-slate-200">{r.email || '<empty>'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValues.name}
                              onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white w-full"
                            />
                          ) : (
                            <span className="text-slate-400">{r.name || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isInvalid ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded text-[11px]">
                              <XCircle size={11} /> {r.reason || 'Invalid syntax'}
                            </span>
                          ) : isDuplicate ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded text-[11px]">
                              <Copy size={11} /> Duplicate
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded text-[11px]">
                              <CheckCircle2 size={11} /> Valid
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(r)}
                              className="text-emerald-400 hover:text-emerald-300 p-1"
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(r)}
                                className="text-slate-500 hover:text-slate-300 p-1"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(r)}
                                className="text-slate-500 hover:text-rose-400 p-1"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
