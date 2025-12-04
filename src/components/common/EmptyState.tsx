// ============================================================================
// HEKAX Phone - Empty State Component
// ============================================================================

import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ 
  icon, 
  title = 'No data found', 
  description,
  action 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-4">
        {icon || <Inbox size={24} />}
      </div>
      <h3 className="text-lg font-medium text-slate-300 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
