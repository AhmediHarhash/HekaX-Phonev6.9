// ============================================================================
// HEKAX Phone - Leads Page
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  Target, 
  Phone, 
  Mail, 
  MessageSquare,
  Building,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, EmptyState, Badge } from '../components/common';
import { leadsApi } from '../utils/api';
import { formatRelativeTime, formatDateTime, getUrgencyColor, getStatusColor } from '../utils/formatters';
import type { LeadRecord, LeadStatus } from '../types';

const STATUS_OPTIONS: LeadStatus[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'
];

export function LeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const data = await leadsApi.list({ limit: 50 });
      setLeads(data);
    } catch (err) {
      console.error('Leads fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    if (statusFilter === 'all') return true;
    return lead.status?.toUpperCase() === statusFilter.toUpperCase();
  });

  if (loading) {
    return <LoadingSpinner text="Loading leads..." />;
  }

  return (
    <div>
      <PageHeader 
        title="Leads" 
        subtitle={`${leads.length} total leads`}
        actions={
          <button 
            onClick={fetchLeads}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setStatusFilter('all')}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm
            transition-colors border
            ${statusFilter === 'all'
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500'
            }
          `}
        >
          All
        </button>
        {STATUS_OPTIONS.map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm
              transition-colors border
              ${statusFilter === status
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500'
              }
            `}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads Grid */}
        <div className="lg:col-span-2">
          {filteredLeads.length === 0 ? (
            <Card>
              <EmptyState 
                icon={<Target size={24} />}
                title="No leads found"
                description="Leads will appear here when captured by AI"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLeads.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`
                    p-4 rounded-xl cursor-pointer border transition-all
                    ${selectedLead?.id === lead.id
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-slate-800/50 border-slate-700/50 hover:border-blue-500/30'
                    }
                  `}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-2 h-8 rounded-full"
                      style={{ backgroundColor: getUrgencyColor(lead.urgency) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{lead.name}</p>
                      <p className="text-xs text-slate-500">{formatRelativeTime(lead.createdAt)}</p>
                    </div>
                    <span 
                      className="text-xs font-semibold uppercase"
                      style={{ color: getStatusColor(lead.status) }}
                    >
                      {lead.status}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone size={14} />
                      <span>{lead.phone}</span>
                    </div>
                    {lead.email && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Mail size={14} />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-400">
                      <MessageSquare size={14} />
                      <span className="truncate">{lead.reason}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500 uppercase">
                      {lead.urgency} priority
                    </span>
                    {lead.company && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Building size={12} />
                        {lead.company}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lead Details Panel */}
        <div className="lg:col-span-1">
          {selectedLead ? (
            <Card className="sticky top-6">
              <h3 className="text-lg font-semibold text-white mb-4">Lead Details</h3>
              
              <div className="space-y-4">
                <DetailRow label="Name" value={selectedLead.name} />
                <DetailRow label="Phone">
                  <a 
                    href={`tel:${selectedLead.phone}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {selectedLead.phone}
                  </a>
                </DetailRow>
                {selectedLead.email && (
                  <DetailRow label="Email">
                    <a 
                      href={`mailto:${selectedLead.email}`}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {selectedLead.email}
                    </a>
                  </DetailRow>
                )}
                {selectedLead.company && (
                  <DetailRow label="Company" value={selectedLead.company} />
                )}
                <DetailRow label="Reason" value={selectedLead.reason} />
                <DetailRow label="Urgency">
                  <span style={{ color: getUrgencyColor(selectedLead.urgency) }}>
                    {selectedLead.urgency}
                  </span>
                </DetailRow>
                <DetailRow label="Status">
                  <span style={{ color: getStatusColor(selectedLead.status) }}>
                    {selectedLead.status}
                  </span>
                </DetailRow>
                {selectedLead.appointmentDate && (
                  <DetailRow 
                    label="Appointment" 
                    value={`${selectedLead.appointmentDate} ${selectedLead.appointmentTime || ''}`} 
                  />
                )}
                {selectedLead.preferredCallbackTime && (
                  <DetailRow label="Callback Time" value={selectedLead.preferredCallbackTime} />
                )}
                {selectedLead.notes && (
                  <DetailRow label="Notes" value={selectedLead.notes} />
                )}
                <DetailRow label="Created" value={formatDateTime(selectedLead.createdAt)} />

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-700">
                  <a
                    href={`tel:${selectedLead.phone}`}
                    className="
                      flex-1 py-2.5 rounded-lg font-medium text-center
                      bg-blue-600 hover:bg-blue-700 text-white
                      flex items-center justify-center gap-2
                    "
                  >
                    <Phone size={16} /> Call
                  </a>
                  {selectedLead.email && (
                    <a
                      href={`mailto:${selectedLead.email}`}
                      className="
                        flex-1 py-2.5 rounded-lg font-medium text-center
                        bg-slate-700 hover:bg-slate-600 text-white
                        flex items-center justify-center gap-2
                      "
                    >
                      <Mail size={16} /> Email
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="text-center text-slate-500 py-12">
              <Target size={32} className="mx-auto mb-3 opacity-50" />
              <p>Select a lead to view details</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component
function DetailRow({ label, value, children }: { 
  label: string; 
  value?: string | number | null; 
  children?: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs text-slate-500 uppercase block mb-0.5">{label}</span>
      {children || <span className="text-sm text-white">{value || '-'}</span>}
    </div>
  );
}
