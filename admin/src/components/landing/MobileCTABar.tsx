import { useState, useEffect } from 'react';
import { MessageCircle, FileText } from 'lucide-react';
import {
  WHATSAPP_NUMBER,
  WHATSAPP_MESSAGE_DEFAULT,
} from './constants';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

/**
 * Barra de CTA fixa no rodapé, visível apenas em mobile (< md).
 * Aparece após scroll de 400px para não atrapalhar a leitura do hero.
 * Safe-area bottom incluído para iPhones com barra home.
 */
export default function MobileCTABar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const THRESHOLD = 400;
    const onScroll = () => {
      setVisible(window.scrollY > THRESHOLD);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // estado inicial
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(
    WHATSAPP_MESSAGE_DEFAULT,
  )}`;

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-50 md:hidden
        border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80
        transition-transform duration-300 ease-out
        ${visible ? 'translate-y-0' : 'translate-y-full'}
      `}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="complementary"
      aria-label="Ações rápidas"
    >
      <div className="flex gap-2 p-3 max-w-lg mx-auto">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent(AnalyticsEvents.WHATSAPP_FLOATING)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-500 h-11 text-sm font-bold text-white shadow-sm hover:bg-green-600 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
        <a
          href="#contato"
          onClick={() => trackEvent(AnalyticsEvents.HEADER_PROPOSTA)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary h-11 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <FileText className="h-4 w-4" />
          Receber proposta
        </a>
      </div>
    </div>
  );
}
