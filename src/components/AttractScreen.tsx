import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Hand } from 'lucide-react';

type AttractScreenProps = {
  visible: boolean;
  onStart: () => void;
  title?: string;
  subtitle?: string;
};

const AttractScreen = ({
  visible,
  onStart,
  title = 'Faça seu pedido aqui',
  subtitle = 'Toque para iniciar',
}: AttractScreenProps) => {
  const startBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (visible) {
      // Focus CTA for keyboard users
      startBtnRef.current?.focus();
    }
  }, [visible]);

  if (!visible) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onStart();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tela de início do quiosque"
      className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={onKeyDown}
    >
      <div className="text-center px-6">
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center justify-center rounded-full bg-blue-50 p-6">
            <ShoppingCart className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600 mb-6">{subtitle}</p>
        <div className="flex items-center justify-center gap-3">
          <Button
            ref={startBtnRef}
            size="lg"
            className="px-6"
            onClick={onStart}
          >
            <Hand className="w-4 h-4 mr-2" />
            Iniciar
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-4">Também funciona com teclado (Enter/Espaço)</p>
      </div>
    </div>
  );
};

export default AttractScreen;
