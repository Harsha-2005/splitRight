import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, AlertTriangle, AlertCircle, Info, Check, X, Download, ChevronDown, ChevronUp } from 'lucide-react';

const SEVERITY_ICONS = {
  error:   <AlertCircle size={16} color="var(--red)" />,
  warning: <AlertTriangle size={16} color="var(--yellow)" />,
  info:    <Info size={16} color="var(--accent2)" />,
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function AnomalyCard({ anomaly, onDecide }) {
  return (
    <div className={`anomaly-row ${anomaly.severity}`}>
      <div className="anomaly-icon">{SEVERITY_ICONS[anomaly.severity]}</div>
      <div className="anomaly-content">
        <div className="anomaly-type" style={{ color: anomaly.severity === 'error' ? 'var(--red)' : anomaly.severity === 'warning' ? 'var(--yellow)' : 'var(--accent2)' }}>
          {anomaly.anomalyType?.replace(/_/g, ' ')} · Row {anomaly.rowNumber}
        </div>
        <div className="anomaly-desc">{anomaly.description}</div>
        {anomaly.rawData && (
          <details style={{ marginTop: 6 }}>
            <summary className="text-xs text-muted" style={{ cursor: 'pointer' }}>Raw row data</summary>
            <pre className="font-mono text-xs" style={{ marginTop: 4, padding: 8, background: 'var(--bg-mantle)', borderRadius: 4, overflow: 'auto' }}>
              {JSON.stringify(anomaly.rawData, null, 2)}
            </pre>
          </details>
        )}
        <div className="anomaly-actions">
          {anomaly.severity !== 'info' && (
            <>
              <button
                className={`btn btn-sm ${anomaly.userDecision === 'approve' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onDecide(anomaly.id, 'approve')}
              >
                <Check size={12} /> {anomaly.severity === 'error' ? 'Override & Import' : 'Accept'}
              </button>
              <button
                className={`btn btn-sm ${anomaly.userDecision === 'reject' ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => onDecide(anomaly.id, 'reject')}
              >
                <X size={12} /> Skip Row
              </button>
            </>
          )}
          {anomaly.severity === 'info' && (
            <span className="badge badge-blue">Auto-handled</span>
          )}
          {anomaly.userDecision && anomaly.userDecision !== 'pending' && (
            <span className={`badge ${anomaly.userDecision === 'approve' ? 'badge-green' : 'badge-red'}`}>
              {anomaly.userDecision}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('upload'); // upload | review | committed
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [rows, setRows] = useState([]);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [activeTab, setActiveTab] = useState('anomalies'); // anomalies | rows

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupId', id);
      const res = await api.post('/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSession(res.data);
      setAnomalies(res.data.anomalies.map(a => ({ ...a, userDecision: 'pending' })));
      setRows(res.data.rows);
      setPhase('review');
      toast.success(`CSV parsed! Found ${res.data.anomalyCount} anomalies across ${res.data.totalRows} rows.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDecide = async (anomalyId, decision) => {
    setAnomalies(prev => prev.map(a => a.id === anomalyId ? { ...a, userDecision: decision } : a));
    try {
      await api.patch(`/import/sessions/${session.sessionId}/anomalies`, {
        decisions: [{ anomalyId, decision }],
      });
    } catch {
      toast.error('Failed to save decision');
    }
  };

  const handleApproveAll = async () => {
    const pending = anomalies.filter(a => a.userDecision === 'pending' && a.severity !== 'info');
    const decisions = pending.map(a => ({ anomalyId: a.id, decision: 'approve' }));
    setAnomalies(prev => prev.map(a => pending.find(p => p.id === a.id) ? { ...a, userDecision: 'approve' } : a));
    if (decisions.length > 0) {
      await api.patch(`/import/sessions/${session.sessionId}/anomalies`, { decisions });
    }
    toast.success('All anomalies approved');
  };

  const handleCommit = async () => {
    const unresolvedErrors = anomalies.filter(a => a.severity === 'error' && a.userDecision === 'pending');
    if (unresolvedErrors.length > 0) {
      toast.error(`${unresolvedErrors.length} error-level anomalies still need your decision`);
      return;
    }
    setCommitting(true);
    try {
      const res = await api.post(`/import/sessions/${session.sessionId}/commit`);
      setCommitResult(res.data);
      setPhase('committed');
      toast.success(`Import complete! ${res.data.summary.imported} expenses imported.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadReport = () => {
    window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/import/sessions/${session.sessionId}/report`, '_blank');
  };

  const errorCount = anomalies.filter(a => a.severity === 'error').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;
  const infoCount = anomalies.filter(a => a.severity === 'info').length;
  const pendingErrors = anomalies.filter(a => a.severity === 'error' && a.userDecision === 'pending').length;

  const sortedAnomalies = [...anomalies].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/groups/${id}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2>Import CSV</h2>
            <p className="text-sm text-muted">
              {phase === 'upload' && 'Upload your expenses_export.csv to begin'}
              {phase === 'review' && `Review ${anomalies.length} anomalies before committing`}
              {phase === 'committed' && 'Import complete!'}
            </p>
          </div>
        </div>
        {phase === 'review' && (
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={handleApproveAll}>
              <Check size={14} /> Approve All Warnings
            </button>
            <button className="btn btn-primary" onClick={handleCommit} disabled={committing || pendingErrors > 0}>
              {committing ? <><div className="spinner spinner-sm" /> Importing...</> : `Commit Import (${session?.totalRows - anomalies.filter(a => a.userDecision === 'reject').length} rows)`}
            </button>
          </div>
        )}
      </div>

      <div className="page-body fade-in">
        {/* Upload Phase */}
        {phase === 'upload' && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={40} style={{ marginBottom: 12, color: 'var(--accent)' }} />
              <h3>Drop your CSV here or click to browse</h3>
              <p className="text-sm text-muted" style={{ marginTop: 6 }}>Supports: expenses_export.csv · Max 5MB</p>
              {uploading && <div className="loading-inline" style={{ justifyContent: 'center', marginTop: 16 }}><div className="spinner spinner-sm" /> Analysing...</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />

            <div className="card mt-4">
              <h4 style={{ marginBottom: 12 }}>What the importer checks</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  'Duplicate expenses (exact & near-match)',
                  'Comma-formatted numbers (e.g. "1,200")',
                  'Name casing / typos (fuzzy match)',
                  'Missing payer or currency',
                  'Settlements logged as expenses',
                  'Percentages that don\'t sum to 100%',
                  'USD/foreign currency — fetches historical rates',
                  'Members active on expense date (join/leave dates)',
                  'Zero-amount and negative amounts',
                  'Ambiguous & non-standard date formats',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-sub">
                    <Check size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Review Phase */}
        {phase === 'review' && (
          <div className="section-gap">
            {/* Summary badges */}
            <div className="flex gap-3 flex-wrap">
              <div className="stat-card" style={{ flex: '1 0 140px' }}>
                <div className="label">Total Rows</div>
                <div className="value">{session?.totalRows}</div>
              </div>
              <div className="stat-card" style={{ flex: '1 0 140px' }}>
                <div className="label">🔴 Errors</div>
                <div className="value" style={{ color: 'var(--red)' }}>{errorCount}</div>
                <div className="sub">{pendingErrors} need decision</div>
              </div>
              <div className="stat-card" style={{ flex: '1 0 140px' }}>
                <div className="label">🟡 Warnings</div>
                <div className="value" style={{ color: 'var(--yellow)' }}>{warningCount}</div>
              </div>
              <div className="stat-card" style={{ flex: '1 0 140px' }}>
                <div className="label">🔵 Info</div>
                <div className="value" style={{ color: 'var(--accent2)' }}>{infoCount}</div>
                <div className="sub">auto-handled</div>
              </div>
            </div>

            {pendingErrors > 0 && (
              <div className="alert alert-error">
                <AlertCircle size={16} /> {pendingErrors} error-level anomaly{pendingErrors !== 1 ? 'ies' : ''} require your decision before you can commit.
              </div>
            )}

            {/* Tabs */}
            <div className="tabs">
              <button className={`tab-btn ${activeTab === 'anomalies' ? 'active' : ''}`} onClick={() => setActiveTab('anomalies')}>
                Anomalies ({anomalies.length})
              </button>
              <button className={`tab-btn ${activeTab === 'rows' ? 'active' : ''}`} onClick={() => setActiveTab('rows')}>
                All Rows ({session?.totalRows})
              </button>
            </div>

            {/* Anomalies Tab */}
            {activeTab === 'anomalies' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sortedAnomalies.length === 0 ? (
                  <div className="alert alert-success"><Check size={16} /> No anomalies found! CSV is clean.</div>
                ) : sortedAnomalies.map(a => (
                  <AnomalyCard key={a.id} anomaly={a} onDecide={handleDecide} />
                ))}
              </div>
            )}

            {/* Rows Tab */}
            {activeTab === 'rows' && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Paid By</th>
                      <th>Amount</th>
                      <th>Currency</th>
                      <th>Split Type</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.rowIndex} style={{
                        background: row.anomalies.some(a => a.severity === 'error') ? 'rgba(243,139,168,0.04)' :
                          row.anomalies.some(a => a.severity === 'warning') ? 'rgba(249,226,175,0.04)' : undefined
                      }}>
                        <td className="text-muted font-mono text-xs">{row.rowIndex}</td>
                        <td className="text-sm">{row.data.date}</td>
                        <td style={{ maxWidth: 200 }}>
                          <div className="truncate">{row.data.description}</div>
                          {row.data.notes && <div className="text-xs text-muted truncate">{row.data.notes}</div>}
                        </td>
                        <td>{row.data.paid_by || <span className="text-muted">—</span>}</td>
                        <td className="font-mono">{row.data.amount}</td>
                        <td>{row.data.currency || <span className="badge badge-red">missing</span>}</td>
                        <td>{row.data.split_type || <span className="badge badge-gray">—</span>}</td>
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {row.anomalies.map(a => (
                              <span key={a.type + a.rowIndex} className={`badge ${a.severity === 'error' ? 'badge-red' : a.severity === 'warning' ? 'badge-yellow' : 'badge-blue'}`}>
                                {a.type?.replace(/_/g, ' ')}
                              </span>
                            ))}
                            {row.anomalies.length === 0 && <span className="badge badge-green"><Check size={10} /> clean</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Committed Phase */}
        {phase === 'committed' && commitResult && (
          <div className="section-gap" style={{ maxWidth: 600, margin: '0 auto' }}>
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
              <h2>Import Complete!</h2>
              <p className="text-sub">Your expenses have been imported successfully.</p>
            </div>

            <div className="grid-4">
              {[
                { label: 'Imported', value: commitResult.summary.imported, color: 'var(--green)' },
                { label: 'Settlements', value: commitResult.summary.settlements, color: 'var(--accent)' },
                { label: 'Skipped', value: commitResult.summary.skipped, color: 'var(--yellow)' },
                { label: 'Errors', value: commitResult.summary.errors, color: 'var(--red)' },
              ].map(item => (
                <div key={item.label} className="stat-card" style={{ textAlign: 'center' }}>
                  <div className="label">{item.label}</div>
                  <div className="value" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {commitResult.report.skipped.length > 0 && (
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Skipped Rows</h4>
                {commitResult.report.skipped.map((s, i) => (
                  <div key={i} className="text-sm text-sub" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    Row {s.rowIndex}: {s.reason}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button className="btn btn-secondary" onClick={handleDownloadReport}>
                <Download size={14} /> Download Full Report
              </button>
              <button className="btn btn-primary" onClick={() => navigate(`/groups/${id}/expenses`)}>
                View Expenses →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
