# Frontend Architecture

**React Application Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone's frontend is a modern React SPA built with TypeScript, Vite, and TailwindCSS. It provides a responsive dashboard for managing calls, leads, team members, and system settings.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool |
| TailwindCSS | 3.x | Styling |
| React Router | 6.x | Routing |
| React Query | 5.x | Data fetching |
| Zustand | 4.x | State management |
| Lucide React | - | Icons |
| Recharts | 2.x | Charts |

---

## Project Structure

```
src/
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   ├── Tooltip.tsx
│   │   └── LoadingSpinner.tsx
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── PageContainer.tsx
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   ├── RecentCalls.tsx
│   │   ├── LeadsPipeline.tsx
│   │   └── UsageChart.tsx
│   ├── calls/
│   │   ├── CallList.tsx
│   │   ├── CallDetails.tsx
│   │   ├── TranscriptViewer.tsx
│   │   └── AudioPlayer.tsx
│   ├── leads/
│   │   ├── LeadList.tsx
│   │   ├── LeadCard.tsx
│   │   ├── LeadDetails.tsx
│   │   └── LeadFilters.tsx
│   ├── softphone/
│   │   ├── Softphone.tsx
│   │   ├── DialPad.tsx
│   │   ├── CallControls.tsx
│   │   └── IncomingCall.tsx
│   └── settings/
│       ├── GeneralSettings.tsx
│       ├── AISettings.tsx
│       ├── TeamSettings.tsx
│       └── IntegrationsSettings.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── Calls.tsx
│   ├── Leads.tsx
│   ├── Analytics.tsx
│   ├── Settings.tsx
│   ├── Billing.tsx
│   ├── Login.tsx
│   ├── Signup.tsx
│   └── VerifyEmail.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useCalls.ts
│   ├── useLeads.ts
│   ├── useOrganization.ts
│   ├── useSoftphone.ts
│   └── useWebSocket.ts
├── stores/
│   ├── authStore.ts
│   ├── uiStore.ts
│   └── softphoneStore.ts
├── services/
│   ├── api.ts
│   ├── auth.ts
│   ├── calls.ts
│   ├── leads.ts
│   └── billing.ts
├── types/
│   ├── auth.ts
│   ├── calls.ts
│   ├── leads.ts
│   └── organization.ts
├── utils/
│   ├── format.ts
│   ├── validation.ts
│   └── constants.ts
├── styles/
│   └── globals.css
├── App.tsx
└── main.tsx
```

---

## Application Architecture

```
                    Frontend Architecture

    +------------------+
    |     App.tsx      |
    +--------+---------+
             |
             v
    +--------+---------+
    | React Router     |
    | (Route Config)   |
    +--------+---------+
             |
      +------+------+
      |             |
      v             v
 +----+----+   +----+----+
 |  Auth   |   |Protected|
 | Routes  |   | Routes  |
 +---------+   +----+----+
                    |
                    v
           +--------+--------+
           |   AppLayout     |
           | (Sidebar/Header)|
           +--------+--------+
                    |
                    v
           +--------+--------+
           |   Page Content  |
           | (Dashboard, etc)|
           +--------+--------+
                    |
          +---------+---------+
          |         |         |
          v         v         v
       +----+    +----+    +----+
       |Comp|    |Comp|    |Comp|
       |onts|    |onts|    |onts|
       +----+    +----+    +----+
```

---

## State Management

### Zustand Stores

#### Auth Store

```typescript
// stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  login: (token: string, user: User, org: Organization) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateOrganization: (org: Partial<Organization>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      organization: null,
      isAuthenticated: false,

      login: (token, user, organization) =>
        set({ token, user, organization, isAuthenticated: true }),

      logout: () =>
        set({ token: null, user: null, organization: null, isAuthenticated: false }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      updateOrganization: (updates) =>
        set((state) => ({
          organization: state.organization
            ? { ...state.organization, ...updates }
            : null,
        })),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        organization: state.organization,
      }),
    }
  )
);
```

#### Softphone Store

```typescript
// stores/softphoneStore.ts
interface SoftphoneState {
  isRegistered: boolean;
  activeCall: Call | null;
  callState: 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';
  isMuted: boolean;
  isOnHold: boolean;

  setRegistered: (registered: boolean) => void;
  setActiveCall: (call: Call | null) => void;
  setCallState: (state: CallState) => void;
  toggleMute: () => void;
  toggleHold: () => void;
}

export const useSoftphoneStore = create<SoftphoneState>((set) => ({
  isRegistered: false,
  activeCall: null,
  callState: 'idle',
  isMuted: false,
  isOnHold: false,

  setRegistered: (isRegistered) => set({ isRegistered }),
  setActiveCall: (activeCall) => set({ activeCall }),
  setCallState: (callState) => set({ callState }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleHold: () => set((state) => ({ isOnHold: !state.isOnHold })),
}));
```

---

## Data Fetching

### React Query Configuration

```typescript
// services/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Custom Hooks

```typescript
// hooks/useCalls.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callsApi } from '@/services/calls';

export function useCalls(filters?: CallFilters) {
  return useQuery({
    queryKey: ['calls', filters],
    queryFn: () => callsApi.list(filters),
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: ['call', id],
    queryFn: () => callsApi.get(id),
    enabled: !!id,
  });
}

export function useCallRecording(id: string) {
  return useQuery({
    queryKey: ['call-recording', id],
    queryFn: () => callsApi.getRecordingUrl(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes (signed URL validity)
  });
}
```

```typescript
// hooks/useLeads.ts
export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => leadsApi.list(filters),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) =>
      leadsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
```

---

## Routing

### Route Configuration

```typescript
// App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/calls/:id" element={<CallDetails />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetails />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/billing" element={<Billing />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Protected Route Component

```typescript
// components/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute() {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user?.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}
```

---

## Component Patterns

### Common Components

#### Button Component

```typescript
// components/common/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <LoadingSpinner className="w-4 h-4 mr-2" />
      ) : icon ? (
        <span className="mr-2">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
```

#### Card Component

```typescript
// components/common/Card.tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  id?: string;
}

export function Card({
  children,
  className,
  padding = 'md',
  id,
}: CardProps) {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      id={id}
      className={cn(
        'bg-white rounded-xl border border-gray-200 shadow-sm',
        paddings[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
```

### Page Layout Pattern

```typescript
// components/layout/PageContainer.tsx
interface PageContainerProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageContainer({
  title,
  description,
  actions,
  children,
}: PageContainerProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-4">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
```

---

## API Integration

### API Client

```typescript
// services/api.ts
import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Service Modules

```typescript
// services/calls.ts
import api from './api';

export const callsApi = {
  list: async (filters?: CallFilters) => {
    const { data } = await api.get('/calls', { params: filters });
    return data;
  },

  get: async (id: string) => {
    const { data } = await api.get(`/calls/${id}`);
    return data;
  },

  getRecordingUrl: async (id: string) => {
    const { data } = await api.get(`/calls/${id}/recording`);
    return data.url;
  },
};
```

---

## Styling

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
```

### CSS Utilities

```css
/* styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply bg-blue-600 text-white px-4 py-2 rounded-lg
           hover:bg-blue-700 transition-colors
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
  }

  .input {
    @apply w-full px-4 py-2 border border-gray-300 rounded-lg
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent;
  }

  .card {
    @apply bg-white rounded-xl border border-gray-200 shadow-sm p-6;
  }
}
```

---

## WebSocket Integration

### Softphone WebSocket

```typescript
// hooks/useSoftphone.ts
import { Device, Call } from '@twilio/voice-sdk';
import { useEffect, useRef, useCallback } from 'react';
import { useSoftphoneStore } from '@/stores/softphoneStore';
import api from '@/services/api';

export function useSoftphone() {
  const deviceRef = useRef<Device | null>(null);
  const {
    isRegistered,
    activeCall,
    callState,
    setRegistered,
    setActiveCall,
    setCallState,
  } = useSoftphoneStore();

  const initialize = useCallback(async () => {
    try {
      const { data } = await api.get('/voice/token');

      const device = new Device(data.token, {
        codecPreferences: ['opus', 'pcmu'],
        enableRingingState: true,
      });

      device.on('registered', () => setRegistered(true));
      device.on('unregistered', () => setRegistered(false));

      device.on('incoming', (call: Call) => {
        setActiveCall(call);
        setCallState('ringing');

        call.on('accept', () => setCallState('connected'));
        call.on('disconnect', () => {
          setActiveCall(null);
          setCallState('idle');
        });
      });

      await device.register();
      deviceRef.current = device;
    } catch (error) {
      console.error('Failed to initialize softphone:', error);
    }
  }, []);

  const makeCall = useCallback(async (number: string) => {
    if (!deviceRef.current) return;

    setCallState('connecting');
    const call = await deviceRef.current.connect({ params: { To: number } });
    setActiveCall(call);

    call.on('accept', () => setCallState('connected'));
    call.on('disconnect', () => {
      setActiveCall(null);
      setCallState('idle');
    });
  }, []);

  const acceptCall = useCallback(() => {
    if (activeCall) {
      activeCall.accept();
    }
  }, [activeCall]);

  const hangup = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
    }
  }, [activeCall]);

  useEffect(() => {
    initialize();

    return () => {
      deviceRef.current?.destroy();
    };
  }, [initialize]);

  return {
    isRegistered,
    activeCall,
    callState,
    makeCall,
    acceptCall,
    hangup,
  };
}
```

---

## Performance Optimization

### Code Splitting

```typescript
// Lazy load pages
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Calls = lazy(() => import('@/pages/Calls'));
const Leads = lazy(() => import('@/pages/Leads'));
const Settings = lazy(() => import('@/pages/Settings'));

// Usage with Suspense
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/dashboard" element={<Dashboard />} />
    {/* ... */}
  </Routes>
</Suspense>
```

### Memoization

```typescript
// Memoize expensive components
const LeadList = memo(function LeadList({ leads }: { leads: Lead[] }) {
  return (
    <div>
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </div>
  );
});

// Memoize callbacks
const handleFilter = useCallback((filters: LeadFilters) => {
  setFilters(filters);
}, []);

// Memoize computed values
const sortedLeads = useMemo(() => {
  return [...leads].sort((a, b) => b.score - a.score);
}, [leads]);
```

---

## Testing

### Component Testing

```typescript
// __tests__/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/common/Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

---

## Build Configuration

### Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          twilio: ['@twilio/voice-sdk'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

---

*This document is updated when frontend architecture changes.*
