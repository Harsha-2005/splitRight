import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { ArrowLeft, Plus, Trash2, Edit3, X, IndianRupee, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';

const SPLIT_TYPES = ['equal', 'unequal', 'percentage', 'share'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

function SplitTypeLabel({ type }) {
  const map = { equal: 'badge-purple', unequal: 'badge-blue', percentage: 'badge-yellow', share: 'badge-green' };
  return <span className={`badge ${map[type] || 'badge-gray'}`}>{type}</span>;
}

function ExpenseModal({ group, expense, onClose, onSave }) {
  const activeMembers = group.members.filter(m => !m.leftAt);
  const [form, setForm] = useState(expense ? {
    description: expense.description,
    paidBy: expense.paidBy,
    amount: Number(expense.amount),
    currency: expense.currency,
    expenseDate: dayjs(expense.expenseDate).format('YYYY-MM-DD'),
    splitType: expense.splitType,
    isRefund: expense.isRefund,
    notes: expense.notes || '',
    splitMembers: expense.splits.map(s => ({ userId: s.userId, value: s.splitType === 'equal' ? 1 : Number(s.shareAmount) })),
  } : {
    description: '',
    paidBy: activeMembers[0]?.userId || '',
    amount: '',
    currency: 'INR',
    expenseDate: dayjs().format('YYYY-MM-DD'),
    splitType: 'equal',
    isRefund: false,
    notes: '',
    splitMembers: activeMembers.map(m => ({ userId: m.userId, value: 1 })),
  });
  const [saving, setSaving] = useState(false);

  const updateSplitMember = (userId, value) => {
    setForm(f => ({
      ...f,
      splitMembers: f.splitMembers.map(m => m.userId === userId ? { ...m, value: parseFloat(value) || 0 } : m),
    }));
  };

  const toggleMember = (memberId) => {
    setForm(f => {
      const exists = f.splitMembers.find(m => m.userId === memberId);
      return {
        ...f,
        splitMembers: exists
          ? f.splitMembers.filter(m => m.userId !== memberId)
          : [...f.splitMembers, { userId: memberId, value: 1 }],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.splitMembers.length === 0) return toast.error('Select at least one member for the split');

    // Validate percentages
    if (form.splitType === 'percentage') {
      const total = form.splitMembers.reduce((s, m) => s + (m.value || 0), 0);
      if (Math.abs(total - 100) > 0.1) return toast.error(`Percentages must sum to 100% (currently ${total}%)`);
    }

    setSaving(true);
    try {
      const payload = {
        groupId: group.id,
        description: form.description,
        paidBy: parseInt(form.paidBy),
        amount: parseFloat(form.amount),
        currency: form.currency,
        expenseDate: form.expenseDate,
        splitType: form.splitType,
        isRefund: form.isRefund,
        notes: form.notes || undefined,
        splitMembers: form.splitMembers.map(m => ({ userId: m.userId, value: m.value })),
      };
      const res = expense
        ? await api.put(`/expenses/${expense.id}`, payload)
        : await api.post('/expenses', payload);
      onSave(res.data);
      onClose();
      toast.success(expense ? 'Expense updated!' : 'Expense added!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const splitValueLabel = { equal: 'Included', unequal: 'Amount (₹)', percentage: 'Percentage (%)', share: 'Shares' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3 className="modal-title">{expense ? 'Edit Expense' : 'Add Expense'}</h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Description *</label>
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Dinner at Thalassa" required autoFocus />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Amount *</label>
              <div className="input-group">
                {form.currency === 'INR' ? <IndianRupee size={14} className="input-icon" /> : <DollarSign size={14} className="input-icon" />}
                <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="select" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Paid By *</label>
              <select className="select" value={form.paidBy} onChange={e => setForm(f => ({ ...f, paidBy: parseInt(e.target.value) }))} required>
                {group.members.map(m => <option key={m.userId} value={m.userId}>{m.user.name}{m.leftAt ? ' (left)' : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input className="input" type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Split Type *</label>
              <select className="select" value={form.splitType} onChange={e => setForm(f => ({ ...f, splitType: e.target.value }))}>
                {SPLIT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end', paddingBottom: 4 }}>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                <input type="checkbox" checked={form.isRefund} onChange={e => setForm(f => ({ ...f, isRefund: e.target.checked }))} />
                This is a refund
              </label>
            </div>
          </div>

          {/* Split Members */}
          <div className="form-group">
            <label className="form-label">Split With — {splitValueLabel[form.splitType]}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.members.map(m => {
                const isSelected = form.splitMembers.some(sm => sm.userId === m.userId);
                const memberSplit = form.splitMembers.find(sm => sm.userId === m.userId);
                return (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label className="flex items-center gap-2" style={{ cursor: 'pointer', flex: 1 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleMember(m.userId)} />
                      <span className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>{m.user.name.charAt(0)}</span>
                      <span style={{ fontSize: '0.9rem' }}>{m.user.name}</span>
                    </label>
                    {isSelected && form.splitType !== 'equal' && (
                      <input
                        className="input" type="number" step="0.01" min="0"
                        style={{ width: 90, textAlign: 'right' }}
                        value={memberSplit?.value || ''}
                        placeholder={form.splitType === 'percentage' ? '%' : '#'}
                        onChange={e => updateSplitMember(m.userId, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {form.splitType === 'percentage' && (
              <div className="form-hint" style={{ marginTop: 6 }}>
                Total: {form.splitMembers.reduce((s, m) => s + (m.value || 0), 0).toFixed(1)}% (must be 100%)
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." rows={2} />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <div className="spinner spinner-sm" /> : expense ? 'Update Expense' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    const [g, e] = await Promise.all([
      api.get(`/groups/${id}`),
      api.get(`/expenses?groupId=${id}`),
    ]);
    setGroup(g.data);
    setExpenses(e.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async (expId) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${expId}`);
      setExpenses(prev => prev.filter(e => e.id !== expId));
      toast.success('Expense deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleSave = (saved) => {
    setExpenses(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      return idx >= 0 ? prev.map(e => e.id === saved.id ? saved : e) : [saved, ...prev];
    });
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const totalInr = expenses.reduce((s, e) => s + (e.isRefund ? -1 : 1) * Number(e.amountInr), 0);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/groups/${id}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2>Expenses — {group?.name}</h2>
            <p className="text-sm text-muted">{expenses.length} expenses · ₹{totalInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} total</p>
          </div>
        </div>
        <button id="add-expense-btn" className="btn btn-primary" onClick={() => { setEditingExpense(null); setShowModal(true); }}>
          <Plus size={16} /> Add Expense
        </button>
      </div>

      <div className="page-body fade-in">
        {expenses.length === 0 ? (
          <div className="empty-state">
            <IndianRupee size={48} />
            <h3>No expenses yet</h3>
            <p>Add an expense or import from CSV to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Expense</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Paid By</th>
                  <th>Amount</th>
                  <th>Split</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <>
                    <tr key={exp.id} style={{ cursor: 'pointer' }}>
                      <td className="text-sm text-muted">{dayjs(exp.expenseDate).format('D MMM YY')}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{exp.description}</div>
                        {exp.notes && <div className="text-xs text-muted">{exp.notes}</div>}
                        {exp.isRefund && <span className="badge badge-yellow" style={{ marginTop: 4 }}>Refund</span>}
                        {exp.importRow && <span className="badge badge-gray" style={{ marginTop: 4, marginLeft: 4 }}>CSV row {exp.importRow}</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                            {exp.payer?.name?.charAt(0)}
                          </div>
                          {exp.payer?.name}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {exp.currency !== 'INR' && <span className="text-xs text-muted">{exp.currency} {Number(exp.amount).toFixed(2)} · </span>}
                          ₹{Number(exp.amountInr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        {exp.currency !== 'INR' && <div className="text-xs text-muted">Rate: {Number(exp.exchangeRate).toFixed(2)}</div>}
                      </td>
                      <td><SplitTypeLabel type={exp.splitType} /></td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setExpandedId(expandedId === exp.id ? null : exp.id)}
                            title="View splits">
                            {expandedId === exp.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => { setEditingExpense(exp); setShowModal(true); }}
                            title="Edit">
                            <Edit3 size={14} />
                          </button>
                          <button className="btn btn-danger btn-icon btn-sm"
                            onClick={() => handleDelete(exp.id)}
                            title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === exp.id && (
                      <tr key={`${exp.id}-split`}>
                        <td colSpan={6} style={{ padding: '0 16px 16px', background: 'var(--bg-surface0)' }}>
                          <div style={{ paddingTop: 12 }}>
                            <div className="text-xs text-muted font-bold" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Split Breakdown (Rohan's view 🔍)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {exp.splits?.map(split => (
                                <div key={split.id} className="flex items-center gap-2" style={{
                                  background: 'var(--bg-mantle)', padding: '6px 12px',
                                  borderRadius: 8, fontSize: '0.85rem',
                                }}>
                                  <div className="user-avatar" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                                    {split.user?.name?.charAt(0)}
                                  </div>
                                  <span>{split.user?.name}</span>
                                  <span style={{ fontWeight: 700, color: 'var(--accent2)' }}>
                                    ₹{Number(split.shareAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && group && (
        <ExpenseModal
          group={group}
          expense={editingExpense}
          onClose={() => { setShowModal(false); setEditingExpense(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
