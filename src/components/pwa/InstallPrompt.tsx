// ============================================================================
// HEKAX Phone - PWA Install Prompt
// Shows a banner prompting users to install the app
// ============================================================================

import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export function InstallPrompt() {
  const {
    isInstallable,
    isInstalled,
    installApp,
    dismissInstallPrompt,
    shouldShowInstallPrompt
  } = usePWA();

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Delay showing the prompt for a few seconds after page load
    const timer = setTimeout(() => {
      if (shouldShowInstallPrompt()) {
        setIsVisible(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [shouldShowInstallPrompt]);

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    dismissInstallPrompt();
    setIsVisible(false);
  };

  // Don't render if already installed or not installable
  if (!isVisible || isInstalled || !isInstallable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-2xl shadow-blue-500/25 p-4 border border-blue-500/20">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="text-white" size={24} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm">
              Install HEKAX Phone
            </h3>
            <p className="text-blue-100 text-xs mt-1">
              Add to your home screen for quick access and a better experience
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 bg-white text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors"
              >
                <Download size={14} />
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="text-blue-200 hover:text-white text-xs transition-colors"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-blue-200 hover:text-white transition-colors p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
