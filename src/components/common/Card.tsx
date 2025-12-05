// ============================================================================
// HEKAX Phone - Card Component
// ============================================================================

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  id?: string;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({ children, className = '', padding = 'md', id }: CardProps) {
  return (
    <div
      id={id}
      className={`
        bg-slate-800/50 border border-slate-700/50 rounded-xl
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  description?: string; // Alias for subtitle
  icon?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, description, icon, action }: CardHeaderProps) {
  // Use description as fallback for subtitle
  const subtitleText = subtitle || description;
  
  return (
    <div className="flex items-center justify-between pb-4 border-b border-slate-700/50 mb-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="text-slate-400">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          {subtitleText && (
            <p className="text-sm text-slate-400">{subtitleText}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// Stat Card
interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconColor?: 'blue' | 'purple' | 'green' | 'orange' | 'red';
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const iconColorClasses = {
  blue: 'bg-blue-500/15 text-blue-400',
  purple: 'bg-purple-500/15 text-purple-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  orange: 'bg-orange-500/15 text-orange-400',
  red: 'bg-red-500/15 text-red-400',
};

export function StatCard({ label, value, icon, iconColor = 'blue', trend }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}>
        {icon}
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">{value}</span>
          {trend && (
            <span className={`text-sm ${trend.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
          )}
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
    </Card>
  );
}
