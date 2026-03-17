/**
 * CameraActiveIndicator — Banner visual no kiosk quando câmera está ativa.
 *
 * Regulamentação: sempre que a câmera está ligada remotamente, o kiosk
 * deve exibir um indicador visível e permanente. Este componente cumpre
 * esse requisito.
 */

import { useEffect, useState } from 'react';
import { Video, Mic } from 'lucide-react';
import { cameraStreamService, type CameraSessionState } from '@/services/cameraStreamService';

export function CameraActiveIndicator() {
  const [state, setState] = useState<CameraSessionState>({
    status: 'inactive',
    sessionId: null,
    facing: 'environment',
    audioEnabled: false,
  });

  useEffect(() => {
    return cameraStreamService.subscribe((s) => {
      setState(s);
    });
  }, []);

  if (state.status === 'inactive') return null;

  const isActive = state.status === 'active';
  const isStarting = state.status === 'starting';

  return (
    <div
      className={
        'fixed top-4 right-4 z-[9998] flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg ' +
        (isActive
          ? 'bg-red-600 text-white animate-pulse'
          : isStarting
            ? 'bg-amber-500 text-white'
            : 'bg-red-800 text-white')
      }
      role="status"
      aria-live="polite"
    >
      <Video className="h-4 w-4" />
      {state.audioEnabled && <Mic className="h-3.5 w-3.5" />}
      <span className="text-xs font-medium">
        {isActive ? 'Câmera ativa' : isStarting ? 'Conectando câmera...' : 'Erro câmera'}
      </span>
      {isActive && <span className="h-2 w-2 rounded-full bg-white animate-ping" />}
    </div>
  );
}
