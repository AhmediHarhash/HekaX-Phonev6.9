// ============================================================================
// HEKAX Phone - PWA Update Notification
// Shows when a new version is available
// ============================================================================

import { RefreshCw } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export function UpdateNotification() {
  const { isUpdateAvailable, applyUpdate } = usePWA();

  if (!isUpdateAvailable) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-slide-down">
      <div className="bg-emerald-600 rounded-xl shadow-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
            <RefreshCw className="text-white" size={20} />
          </div>

          <div className="flex-1">
            <h3 className="text-white font-semibold text-sm">
              Update Available
            </h3>
            <p className="text-emerald-100 text-xs mt-0.5">
              A new version of HEKAX Phone is ready
            </p>
          </div>

          <button
            onClick={applyUpdate}
            className="bg-white text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-50 transition-colors"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
