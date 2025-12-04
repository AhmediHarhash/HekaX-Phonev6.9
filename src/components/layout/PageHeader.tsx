// ============================================================================
// HEKAX Phone - Page Header Component
// ============================================================================

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string; // Alias for subtitle
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, description, actions }: PageHeaderProps) {
  // Use description as fallback for subtitle
  const subtitleText = subtitle || description;
  
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitleText && (
          <p className="text-slate-400 mt-1">{subtitleText}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
