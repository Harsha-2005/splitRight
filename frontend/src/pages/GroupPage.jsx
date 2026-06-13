import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, UserPlus, UserMinus, Receipt, Scale, Upload, Calendar } from 'lucide-react';
import dayjs from 'dayjs';

export default function GroupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email: '', joinedAt: dayjs().format('YYYY-MM-DD') });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.get(`/groups/${id}`)
      .then(res => setGroup(res.data))
      .catch(() => toast.error('Group not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      // First find user by email
      const userRes = await api.get(`/auth/find?email=${encodeURIComponent(addMemberForm.email)}`);
      await api.post(`/groups/${id}/members`, {
        userId: userRes.data.id,
        joinedAt: addMemberForm.joinedAt,
      });
      toast.success(`${userRes.data.name} added to group!`);
      setShowAddMember(false);
      const res = await api.get(`/groups/${id}`);
      setGroup(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleMarkLeft = async (member) => {
    const leftAt = prompt(`Enter date ${member.user.name} left (YYYY-MM-DD):`, dayjs().format('YYYY-MM-DD'));
    if (!leftAt) return;
    try {
      await api.patch(`/groups/${id}/members/${member.userId}/leave`, { leftAt });
      toast.success(`${member.user.name} marked as left`);
      const res = await api.get(`/groups/${id}`);
      setGroup(res.data);
    } catch (err) {
      toast.error('Failed to update membership');
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!group) return <div className="page-body"><p>Group not found.</p></div>;

  const activeMembers = group.members.filter(m => !m.leftAt);
  const pastMembers = group.members.filter(m => m.leftAt);

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2>{group.name}</h2>
            <p className="text-sm text-muted">{activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/groups/${id}/expenses`)}>
            <Receipt size={14} /> Expenses
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/groups/${id}/balances`)}>
            <Scale size={14} /> Balances
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/groups/${id}/import`)}>
            <Upload size={14} /> Import CSV
          </button>
        </div>
      </div>

      <div className="page-body fade-in section-gap">
        {/* Quick Nav Cards */}
        <div className="grid-3">
          {[
            { icon: Receipt, label: 'Expenses', sub: 'View & add expenses', path: 'expenses', color: 'var(--accent)' },
            { icon: Scale, label: 'Balances', sub: 'Who owes whom', path: 'balances', color: 'var(--green)' },
            { icon: Upload, label: 'Import CSV', sub: 'Ingest expense sheet', path: 'import', color: 'var(--accent2)' },
          ].map(item => (
            <div key={item.path} className="card interactive" onClick={() => navigate(`/groups/${id}/${item.path}`)}>
              <div style={{ color: item.color, marginBottom: 10 }}>
                <item.icon size={28} />
              </div>
              <h4>{item.label}</h4>
              <p className="text-sm text-muted">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Active Members */}
        <div className="card">
          <div className="card-header">
            <h3>Active Members</h3>
            <button id="add-member-btn" className="btn btn-primary btn-sm" onClick={() => setShowAddMember(true)}>
              <UserPlus size={14} /> Add Member
            </button>
          </div>
          <div className="section-gap" style={{ gap: 10 }}>
            {activeMembers.map(m => (
              <div key={m.id} className="balance-card">
                <div className="user-avatar">{m.user.name.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{m.user.name}</div>
                  <div className="text-xs text-muted">
                    <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
                    Joined {dayjs(m.joinedAt).format('D MMM YYYY')}
                  </div>
                </div>
                <span className="badge badge-green">Active</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleMarkLeft(m)} title="Mark as left">
                  <UserMinus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Past Members */}
        {pastMembers.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Past Members</h3>
            <div className="section-gap" style={{ gap: 10 }}>
              {pastMembers.map(m => (
                <div key={m.id} className="balance-card" style={{ opacity: 0.7 }}>
                  <div className="user-avatar" style={{ background: 'var(--bg-surface1)' }}>
                    {m.user.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{m.user.name}</div>
                    <div className="text-xs text-muted">
                      {dayjs(m.joinedAt).format('D MMM')} → {dayjs(m.leftAt).format('D MMM YYYY')}
                    </div>
                  </div>
                  <span className="badge badge-gray">Left</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div className="modal slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Member</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddMember(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleAddMember}>
              <div className="form-group">
                <label className="form-label">Member's Email</label>
                <input className="input" type="email" placeholder="member@example.com"
                  value={addMemberForm.email} onChange={e => setAddMemberForm(f => ({ ...f, email: e.target.value }))}
                  autoFocus required />
                <span className="form-hint">The person must have a SplitRight account.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Join Date</label>
                <input className="input" type="date"
                  value={addMemberForm.joinedAt} onChange={e => setAddMemberForm(f => ({ ...f, joinedAt: e.target.value }))}
                  required />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={adding}>
                  {adding ? <div className="spinner spinner-sm" /> : <><UserPlus size={14} /> Add</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
