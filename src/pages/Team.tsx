// ============================================================================
// HEKAX Phone - Team Page
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  User,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, EmptyState, Modal, Button, Badge } from '../components/common';
import { teamApi } from '../utils/api';
import { formatRelativeTime } from '../utils/formatters';
import { USER_ROLES } from '../utils/constants';
import type { TeamMember, UserRole } from '../types';

export function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('AGENT');
  const [inviting, setInviting] = useState(false);

  const canManageTeam = user?.role === 'OWNER' || user?.role === 'ADMIN';

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const data = await teamApi.list();
      setMembers(data);
    } catch (err) {
      console.error('Team fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return;

    setInviting(true);
    setMessage(null);

    try {
      await teamApi.invite(inviteEmail, inviteName, inviteRole);
      setMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}` });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('AGENT');
      setShowInviteModal(false);
      fetchTeam();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send invite' });
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading team..." />;
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={`${members.length} team members`}
        actions={
          canManageTeam && (
            <Button onClick={() => setShowInviteModal(true)}>
              <Plus size={18} /> Invite Member
            </Button>
          )
        }
      />

      {/* Message */}
      {message && (
        <div 
          className={`
            mb-6 p-4 rounded-lg flex items-center gap-3
            ${message.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }
          `}
        >
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Team List */}
      {members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={24} />}
            title="No team members"
            description="Invite your first team member to get started"
            action={
              canManageTeam && (
                <Button onClick={() => setShowInviteModal(true)}>
                  <Plus size={18} /> Invite Member
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {members.map(member => (
            <Card key={member.id} className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center">
                <User size={20} className="text-slate-400" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{member.name}</p>
                <p className="text-sm text-slate-500">{member.email}</p>
              </div>

              {/* Role */}
              <span 
                className="px-3 py-1 rounded-full text-xs font-semibold uppercase"
                style={{ 
                  backgroundColor: `${USER_ROLES[member.role as UserRole]?.color}20`,
                  color: USER_ROLES[member.role as UserRole]?.color || '#6b7280'
                }}
              >
                {member.role}
              </span>

              {/* Status */}
              <span 
                className={`
                  px-3 py-1 rounded-full text-xs font-semibold uppercase
                  ${member.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' :
                    member.status === 'INVITED' ? 'bg-blue-500/15 text-blue-400' :
                    'bg-slate-500/15 text-slate-400'
                  }
                `}
              >
                {member.status}
              </span>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Team Member"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail || !inviteName}>
              {inviting ? 'Sending...' : 'Send Invite'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Name
            </label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="John Smith"
              className="
                w-full px-4 py-2.5 rounded-lg
                bg-slate-900 border border-slate-700
                text-white placeholder-slate-500
                focus:outline-none focus:border-blue-500
              "
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="john@company.com"
              className="
                w-full px-4 py-2.5 rounded-lg
                bg-slate-900 border border-slate-700
                text-white placeholder-slate-500
                focus:outline-none focus:border-blue-500
              "
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="
                w-full px-4 py-2.5 rounded-lg
                bg-slate-900 border border-slate-700
                text-white
                focus:outline-none focus:border-blue-500
              "
            >
              <option value="AGENT">Agent</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
