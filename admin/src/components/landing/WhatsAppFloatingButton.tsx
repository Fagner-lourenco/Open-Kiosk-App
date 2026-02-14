import { PhoneCall } from 'lucide-react';
import {
  WHATSAPP_NUMBER,
  WHATSAPP_MESSAGE_DEFAULT,
} from './constants';
import { trackEvent, AnalyticsEvents } from '../../lib/analytics';

/**
 * Botão flutuante do WhatsApp. Fica fixo no canto inferior direito da
 * janela e abre um chat com mensagem pré‑preenchida. A cor é fixa (verde) e
 * segue padrões de acessibilidade com focus ring e aria‑label.
 */
export default function WhatsAppFloatingButton() {
  // Remove caracteres não numéricos para montar a URL do wa.me
  const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
  const message = encodeURIComponent(WHATSAPP_MESSAGE_DEFAULT);
  const url = `https://wa.me/${phone}?text=${message}`;
  
  const handleClick = () => {
    trackEvent(AnalyticsEvents.WHATSAPP_FLOATING);
  };
  
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="fixed right-4 bottom-20 md:bottom-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all hover:bg-green-600 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 animate-bounce"
      aria-label="Fale conosco no WhatsApp"
      style={{ animationDuration: '3s', animationIterationCount: '3' }}
    >
      <PhoneCall className="h-6 w-6" />
    </a>
  );
}
