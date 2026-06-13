import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, TrendingDown, TrendingUp, ChevronDown, ChevronUp, Plus } from 'lucide-react';

function BalanceBar({ amount, max }) {
  const pct = max ? Math.min(Math.abs(amount) / max * 100, 100) : 0;
  const color = amount > 0 ? 'var(--green)' : amount < 0 ? 'var(--red)' : 'var(--text-muted)';
  return (
    <div style={{ height: 4, background: 'var(--bg-surface0)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export default function BalancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState(null);
  const [drillUser, setDrillUser] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleForm, setSettleForm] = useState({ fromUserId: '', toUserId: '', amount: '', settledAt: dayjs().format('YYYY-MM-DD'), notes: '' });
  const [settling, setSettling] = useState(false);

  const load = async () => {
    const [g, b] = await Promise.all([
      api.get(`/groups/${id}`),
      api.get(`/balances/${id}`),
    ]);
    setGroup(g.data);
    setBalances(b.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleDrillDown = async (userId) => {
    if (drillUser === userId) { setDrillUser(null); setDrillData(null); return; }
    setDrillUser(userId);
    setDrillLoading(true);
    try {
      const res = await api.get(`/balances/${id}/user/${userId}`);
      setDrillData(res.data);
    } catch {
      toast.error('Failed to load breakdown');
    } finally {
      setDrillLoading(false);
    }
  };

  const handleSettle = async (e) => {
    e.preventDefault();
    setSettling(true);
    try {
      await api.post('/settlements', {
        groupId: parseInt(id),
        fromUserId: parseInt(settleForm.fromUserId),
        toUserId: parseInt(settleForm.toUserId),
        amount: parseFloat(settleForm.amount),
        settledAt: settleForm.settledAt,
        notes: settleForm.notes,
      });
      toast.success('Settlement recorded!');
      setShowSettleModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record settlement');
    } finally {
      setSettling(false);
    }
  };

  const preSettle = (t) => {
    setSettleForm(f => ({
      ...f,
      fromUserId: t.from.id,
      toUserId: t.to.id,
      amount: t.amount,
    }));
    setShowSettleModal(true);
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const maxBalance = balances ? Math.max(...balances.balances.map(b => Math.abs(b.balance)), 1) : 1;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/groups/${id}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2>Balances — {group?.name}</h2>
            <p className="text-sm text-muted">Who owes whom · click a name to drill down</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowSettleModal(true)}>
          <Plus size={14} /> Record Settlement
        </button>
      </div>

      <div className="page-body fade-in section-gap">
        {/* Aisha's view: One number per person */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Net Balances <span className="text-sm text-muted font-normal">(positive = owed money, negative = owes money)</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {balances?.balances.map(b => (
              <div key={b.user.id}>
                <div className="balance-card" style={{ cursor: 'pointer' }}
                  onClick={() => handleDrillDown(b.user.id)}>
                  <div className="user-avatar">{b.user.name.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{b.user.name}</div>
                    <BalanceBar amount={b.balance} max={maxBalance} />
                  </div>
                  <div className={b.balance > 0.5 ? 'balance-positive' : b.balance < -0.5 ? 'balance-negative' : 'balance-zero'} style={{ minWidth: 100, textAlign: 'right' }}>
                    {b.balance > 0.5 && <TrendingUp size={14} style={{ display: 'inline', marginRight: 4 }} />}
                    {b.balance < -0.5 && <TrendingDown size={14} style={{ display: 'inline', marginRight: 4 }} />}
                    ₹{Math.abs(b.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    <div className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {b.balance > 0.5 ? 'gets back' : b.balance < -0.5 ? 'owes' : 'settled'}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {drillUser === b.user.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {/* Rohan's drill-down view */}
                {drillUser === b.user.id && (
                  <div className="fade-in" style={{ padding: '12px 16px', background: 'var(--bg-surface0)', borderRadius: 8, marginTop: 6 }}>
                    {drillLoading ? (
                      <div className="loading-inline"><div className="spinner spinner-sm" /> Loading breakdown...</div>
                    ) : drillData ? (
                      <>
                        {drillData.owedTo?.filter(o => o.amount > 0.01).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className="text-xs text-muted font-bold" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owes to</div>
                            {drillData.owedTo.filter(o => o.amount > 0.01).map(o => (
                              <div key={o.user.id} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                <div style={{ fontWeight: 600, minWidth: 80, color: 'var(--red)' }}>₹{o.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                <div>
                                  {o.expenses?.map((exp, i) => (
                                    <div key={i} className="text-xs text-muted" style={{ marginBottom: 2 }}>
                                      • {exp.description} ({dayjs(exp.date).format('D MMM')}) — ₹{Math.abs(exp.amount).toFixed(2)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {drillData.owedBy?.filter(o => o.amount > 0.01).length > 0 && (
                          <div>
                            <div className="text-xs text-muted font-bold" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owed by</div>
                            {drillData.owedBy.filter(o => o.amount > 0.01).map(o => (
                              <div key={o.user.id} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                <div style={{ fontWeight: 600, minWidth: 80, color: 'var(--green)' }}>₹{o.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                <div>
                                  {o.expenses?.map((exp, i) => (
                                    <div key={i} className="text-xs text-muted" style={{ marginBottom: 2 }}>
                                      • {exp.description} ({dayjs(exp.date).format('D MMM')}) — ₹{Math.abs(exp.amount).toFixed(2)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Suggested settlements */}
        {balances?.suggestedSettlements?.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Suggested Settlements <span className="text-sm text-muted font-normal">(minimum transactions)</span></h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {balances.suggestedSettlements.map((t, i) => (
                <div key={i} className="settlement-arrow">
                  <div className="user-avatar">{t.from.name.charAt(0)}</div>
                  <span style={{ fontWeight: 600 }}>{t.from.name}</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '0.95rem' }}>
                      ₹{t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div className="user-avatar">{t.to.name.charAt(0)}</div>
                  <span style={{ fontWeight: 600 }}>{t.to.name}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => preSettle(t)}>
                    Settle
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {balances?.suggestedSettlements?.length === 0 && (
          <div className="alert alert-success">
            🎉 All balances are settled! Everyone is even.
          </div>
        )}
      </div>

      {/* Settlement Modal */}
      {showSettleModal && (
        <div className="modal-overlay" onClick={() => setShowSettleModal(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Record Settlement</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSettleModal(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleSettle}>
              <div className="form-group">
                <label className="form-label">Who paid</label>
                <select className="select" value={settleForm.fromUserId} onChange={e => setSettleForm(f => ({ ...f, fromUserId: e.target.value }))} required>
                  <option value="">Select...</option>
                  {group?.members.map(m => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Who received</label>
                <select className="select" value={settleForm.toUserId} onChange={e => setSettleForm(f => ({ ...f, toUserId: e.target.value }))} required>
                  <option value="">Select...</option>
                  {group?.members.filter(m => m.userId !== parseInt(settleForm.fromUserId)).map(m => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input className="input" type="number" step="0.01" min="0" value={settleForm.amount} onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="input" type="date" value={settleForm.settledAt} onChange={e => setSettleForm(f => ({ ...f, settledAt: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="input" value={settleForm.notes} onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSettleModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={settling}>
                  {settling ? <div className="spinner spinner-sm" /> : 'Record Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
