// ============================================================================
// HEKAX Phone - Badge Component Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, AIBadge, HumanBadge, StatusBadge } from './Badge';

describe('Badge Component', () => {
  describe('Basic Rendering', () => {
    it('renders children correctly', () => {
      render(<Badge>Test Label</Badge>);
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('applies default variant styling', () => {
      render(<Badge>Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-slate-700/50');
    });
  });

  describe('Variants', () => {
    it('applies success variant styling', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByText('Success');
      expect(badge).toHaveClass('bg-emerald-500/15');
      expect(badge).toHaveClass('text-emerald-400');
    });

    it('applies warning variant styling', () => {
      render(<Badge variant="warning">Warning</Badge>);
      const badge = screen.getByText('Warning');
      expect(badge).toHaveClass('bg-amber-500/15');
    });

    it('applies danger variant styling', () => {
      render(<Badge variant="danger">Error</Badge>);
      const badge = screen.getByText('Error');
      expect(badge).toHaveClass('bg-red-500/15');
    });

    it('applies info variant styling', () => {
      render(<Badge variant="info">Info</Badge>);
      const badge = screen.getByText('Info');
      expect(badge).toHaveClass('bg-blue-500/15');
    });
  });

  describe('Sizes', () => {
    it('applies small size by default', () => {
      render(<Badge>Small</Badge>);
      const badge = screen.getByText('Small');
      expect(badge).toHaveClass('text-xs');
    });

    it('applies medium size when specified', () => {
      render(<Badge size="md">Medium</Badge>);
      const badge = screen.getByText('Medium');
      expect(badge).toHaveClass('text-sm');
    });
  });

  describe('Custom className', () => {
    it('applies additional className', () => {
      render(<Badge className="custom-class">Custom</Badge>);
      const badge = screen.getByText('Custom');
      expect(badge).toHaveClass('custom-class');
    });
  });
});

describe('Pre-configured Badges', () => {
  describe('AIBadge', () => {
    it('renders with AI text', () => {
      render(<AIBadge />);
      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    it('uses ai variant styling', () => {
      render(<AIBadge />);
      const badge = screen.getByText('AI');
      expect(badge).toHaveClass('text-emerald-400');
    });
  });

  describe('HumanBadge', () => {
    it('renders with Human text', () => {
      render(<HumanBadge />);
      expect(screen.getByText('Human')).toBeInTheDocument();
    });

    it('uses human variant styling', () => {
      render(<HumanBadge />);
      const badge = screen.getByText('Human');
      expect(badge).toHaveClass('text-blue-400');
    });
  });

  describe('StatusBadge', () => {
    it('renders completed status with success variant', () => {
      render(<StatusBadge status="COMPLETED" />);
      const badge = screen.getByText('COMPLETED');
      expect(badge).toHaveClass('text-emerald-400');
    });

    it('renders new status with purple variant', () => {
      render(<StatusBadge status="NEW" />);
      const badge = screen.getByText('NEW');
      expect(badge).toHaveClass('text-purple-400');
    });

    it('renders failed status with danger variant', () => {
      render(<StatusBadge status="FAILED" />);
      const badge = screen.getByText('FAILED');
      expect(badge).toHaveClass('text-red-400');
    });

    it('renders in_progress status with info variant', () => {
      render(<StatusBadge status="IN_PROGRESS" />);
      const badge = screen.getByText('IN_PROGRESS');
      expect(badge).toHaveClass('text-blue-400');
    });

    it('handles unknown status with default variant', () => {
      render(<StatusBadge status="UNKNOWN" />);
      const badge = screen.getByText('UNKNOWN');
      expect(badge).toHaveClass('text-slate-300');
    });
  });
});
