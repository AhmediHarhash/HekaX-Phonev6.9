// ============================================================================
// HEKAX Phone - LoadingSpinner Component Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner Component', () => {
  describe('Basic Rendering', () => {
    it('renders without text', () => {
      const { container } = render(<LoadingSpinner />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders with text when provided', () => {
      render(<LoadingSpinner text="Loading..." />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('applies medium size by default', () => {
      const { container } = render(<LoadingSpinner />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-6', 'h-6');
    });

    it('applies small size when specified', () => {
      const { container } = render(<LoadingSpinner size="sm" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-4', 'h-4');
    });

    it('applies large size when specified', () => {
      const { container } = render(<LoadingSpinner size="lg" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-10', 'h-10');
    });
  });

  describe('Fullscreen Mode', () => {
    it('renders inline by default', () => {
      const { container } = render(<LoadingSpinner />);
      expect(container.firstChild).toHaveClass('p-8');
      expect(container.firstChild).not.toHaveClass('min-h-screen');
    });

    it('renders fullscreen when prop is true', () => {
      const { container } = render(<LoadingSpinner fullScreen />);
      expect(container.firstChild).toHaveClass('min-h-screen');
      expect(container.firstChild).toHaveClass('bg-slate-900');
    });
  });

  describe('Animation', () => {
    it('has spin animation class', () => {
      const { container } = render(<LoadingSpinner />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('animate-spin');
    });
  });
});
