// ============================================================================
// HEKAX Phone - Badge Component
// ============================================================================

import { ReactNode } from 'react';

type BadgeVariant = 
  | 'default' 
  | 'success' 
  | 'warning' 
  | 'danger' 
  | 'info' 
  | 'purple'
  | 'ai'
  | 'human';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-700/50 text-slate-300',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-red-500/15 text-red-400',
  info: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-purple-500/15 text-purple-400',
  ai: 'bg-emerald-500/15 text-emerald-400',
  human: 'bg-blue-500/15 text-blue-400',
};

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'sm',
  className = '' 
}: BadgeProps) {
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : 'px-3 py-1 text-sm';

  return (
    <span 
      className={`
        inline-flex items-center justify-center
        rounded-full font-semibold uppercase
        ${sizeClasses}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

// Pre-configured badge variants
export function AIBadge() {
  return <Badge variant="ai">AI</Badge>;
}

export function HumanBadge() {
  return <Badge variant="human">Human</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = getStatusVariant(status);
  return <Badge variant={variant}>{status}</Badge>;
}

function getStatusVariant(status: string): BadgeVariant {
  const statusUpper = status?.toUpperCase();
  switch (statusUpper) {
    case 'COMPLETED':
    case 'WON':
    case 'QUALIFIED':
    case 'ACTIVE':
      return 'success';
    case 'IN_PROGRESS':
    case 'RINGING':
    case 'CONTACTED':
    case 'PROPOSAL':
      return 'info';
    case 'FAILED':
    case 'NO_ANSWER':
    case 'LOST':
    case 'CRITICAL':
      return 'danger';
    case 'QUEUED':
    case 'NEW':
    case 'INVITED':
      return 'purple';
    case 'HIGH':
    case 'BUSY':
      return 'warning';
    default:
      return 'default';
  }
}
