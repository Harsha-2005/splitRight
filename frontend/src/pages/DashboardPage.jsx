import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Users, ArrowRight, TrendingUp, Receipt, Scale } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/groups', { name: newGroupName.trim() });
      setGroups(g => [res.data, ...g]);
      setShowCreate(false);
      setNewGroupName('');
      toast.success(`Group "${res.data.name}" created!`);
      navigate(`/groups/${res.data.id}`);
    } catch (err) {
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-sm text-muted" style={{ marginTop: 2 }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''} · manage your shared expenses
          </p>
        </div>
        <button id="create-group-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Group
        </button>
      </div>

      <div className="page-body fade-in">
        {/* Stats row */}
        <div className="grid-3 mb-4">
          <div className="stat-card">
            <div className="label">Total Groups</div>
            <div className="value">{groups.length}</div>
            <div className="sub">Active expense groups</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Expenses</div>
            <div className="value">{groups.reduce((s, g) => s + (g._count?.expenses || 0), 0)}</div>
            <div className="sub">Across all groups</div>
          </div>
          <div className="stat-card">
            <div className="label">Members Tracked</div>
            <div className="value">{new Set(groups.flatMap(g => g.members.map(m => m.userId))).size}</div>
            <div className="sub">Unique people</div>
          </div>
        </div>

        {/* Groups list */}
        <div className="flex items-center justify-between mb-4">
          <h3>Your Groups</h3>
        </div>

        {groups.length === 0 ? (
          <div className="empty-state">
            <Users size={48} />
            <h3>No groups yet</h3>
            <p>Create a group to start tracking shared expenses with flatmates, friends, or travel companions.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create Your First Group
            </button>
          </div>
        ) : (
          <div className="section-gap">
            {groups.map(group => (
              <div key={group.id} className="card interactive" onClick={() => navigate(`/groups/${group.id}`)}>
                <div className="card-header">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.2rem'
                    }}>
                      {group.name.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ margin: 0 }}>{group.name}</h3>
                      <p className="text-sm text-muted">
                        {group.members.filter(m => !m.leftAt).length} active member{group.members.filter(m => !m.leftAt).length !== 1 ? 's' : ''}
                        {' · '}{group._count?.expenses || 0} expense{(group._count?.expenses || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-muted" />
                </div>

                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {group.members.map(m => (
                    <span key={m.id} className={`badge ${m.leftAt ? 'badge-gray' : 'badge-purple'}`}>
                      {m.user.name} {m.leftAt ? '(left)' : ''}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/groups/${group.id}/expenses`); }}>
                    <Receipt size={13} /> Expenses
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/groups/${group.id}/balances`); }}>
                    <Scale size={13} /> Balances
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/groups/${group.id}/import`); }}>
                    <TrendingUp size={13} /> Import CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Group</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={createGroup}>
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input id="group-name-input" className="input" type="text" placeholder="e.g. Koramangala Flat"
                  value={newGroupName} onChange={e => setNewGroupName(e.target.value)} autoFocus required />
                <span className="form-hint">You can add members after creating the group.</span>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button id="group-create-submit" type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <><div className="spinner spinner-sm" /> Creating...</> : <><Plus size={14} /> Create Group</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
