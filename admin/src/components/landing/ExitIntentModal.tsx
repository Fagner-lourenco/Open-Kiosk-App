import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { WHATSAPP_NUMBER } from './constants';
import { trackEvent } from '@/lib/analytics';

/**
 * Modal de exit-intent — aparece quando o cursor sai pelo topo da janela
 * (desktop) ou após um timeout longo (mobile fallback, desativado por padrão).
 *
 * Layout: 2 colunas — benefícios + formulário rápido.
 * CTA envia para WhatsApp com mensagem pré-preenchida.
 * Respeita cooldown no localStorage.
 */

type Props = {
  /** Dias de cooldown após fechar (0 = sempre) */
  cooldownDays?: number;
  /** Delay (ms) antes de armar o listener de exit-intent */
  armAfterMs?: number;
  /** Chave do localStorage */
  storageKey?: string;
};

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return [];
  const sel =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => !el.hasAttribute('disabled'),
  );
}

export default function ExitIntentModal({
  cooldownDays = 3,
  armAfterMs = 10000,
  storageKey = 'ok_exit_modal_dismissed_v1',
}: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  const canShow = (): boolean => {
    try {
      if (typeof window === 'undefined') return false;
      // Param ?exit=1 força abrir (teste)
      const params = new URLSearchParams(window.location.search);
      if (params.get('exit') === '1') return true;

      const raw = localStorage.getItem(storageKey);
      if (!raw) return true;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return true;
      if (cooldownDays <= 0) return true;
      return Date.now() - ts >= cooldownDays * 86_400_000;
    } catch {
      return true;
    }
  };

  // Arm after delay
  useEffect(() => {
    if (!canShow()) return;
    const t = setTimeout(() => setArmed(true), armAfterMs);
    return () => clearTimeout(t);
  }, [armAfterMs]);

  // Exit-intent listener (mouse sai pelo topo)
  useEffect(() => {
    if (!armed) return;

    const handler = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        trackEvent('exit_intent_trigger');
        setOpen(true);
        setArmed(false); // só dispara uma vez
      }
    };

    document.addEventListener('mouseleave', handler);
    return () => document.removeEventListener('mouseleave', handler);
  }, [armed]);

  // Focus trap + ESC
  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Tab') {
        const els = getFocusableElements(dialogRef.current);
        if (els.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = active ? els.indexOf(active) : -1;
        if (e.shiftKey) {
          if (idx <= 0) {
            e.preventDefault();
            els[els.length - 1]?.focus();
          }
        } else if (idx === -1 || idx === els.length - 1) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      lastFocusedRef.current?.focus?.();
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) {
      setFormError('Preencha nome e WhatsApp.');
      return;
    }
    setFormError('');

    const cleanPhone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
    const message = [
      `Olá! Sou *${name.trim()}* e vim do site.`,
      `Quero um orçamento para evento de chope! 🍺`,
      `📱 Meu WhatsApp: ${phone.trim()}`,
    ].join('\n');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    trackEvent('exit_intent_submit');
    window.open(url, '_blank');
    setSubmitted(true);

    setTimeout(() => handleClose(), 2500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-modal-title"
        aria-describedby="exit-modal-desc"
        className="
          relative w-full max-w-3xl overflow-hidden rounded-2xl
          bg-[#0B0F14] text-white shadow-2xl border border-white/10
          animate-in fade-in zoom-in-95 duration-300
        "
      >
        {/* Close */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={handleClose}
          className="
            absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center
            rounded-full bg-white/5 hover:bg-white/10
            focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-[#0B0F14]
            transition-colors
          "
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid md:grid-cols-2">
          {/* ---- Coluna esquerda: copy + benefícios ---- */}
          <div className="p-8 md:p-10 flex flex-col justify-center">
            <p className="text-amber-400 font-bold text-sm tracking-widest uppercase">
              Espera!
            </p>
            <h2
              id="exit-modal-title"
              className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight"
            >
              Não vai sem seu{' '}
              <span className="underline decoration-amber-400/80 underline-offset-4 decoration-2">
                orçamento
              </span>
            </h2>
            <p
              id="exit-modal-desc"
              className="mt-3 text-white/70 leading-relaxed"
            >
              Peça agora em 30 segundos e receba uma proposta exclusiva para o
              seu evento.
            </p>

            {/* Benefícios */}
            <div className="mt-6 space-y-3 rounded-xl bg-amber-400/10 border border-amber-400/20 p-5">
              {[
                'Resposta em até 1 hora',
                'Proposta sob medida',
                'Sem compromisso',
                'Atendimento exclusivo',
              ].map((b) => (
                <div key={b} className="flex items-center gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                  <span className="text-white/90">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Coluna direita: formulário ---- */}
          <div className="bg-white/[0.03] p-8 md:p-10 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/10">
            {submitted ? (
              <div className="text-center py-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
                <p className="mt-4 text-xl font-semibold">
                  Mensagem enviada!
                </p>
                <p className="mt-1 text-sm text-white/60">
                  Retornaremos em breve.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-1">
                  Orçamento rápido
                </h3>
                <p className="text-sm text-white/50 mb-5">
                  Preencha e envie direto pelo WhatsApp
                </p>
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="
                        w-full rounded-lg border border-white/10 bg-white/5
                        px-4 py-3 text-white placeholder-white/40
                        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent
                        transition-colors
                      "
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      placeholder="(99) 99999-9999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="
                        w-full rounded-lg border border-white/10 bg-white/5
                        px-4 py-3 text-white placeholder-white/40
                        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent
                        transition-colors
                      "
                    />
                  </div>

                  {formError && (
                    <p className="text-sm text-red-400">{formError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="
                      w-full rounded-lg bg-amber-400 px-6 py-4
                      text-base font-extrabold text-black
                      shadow-lg shadow-amber-400/20
                      hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-400/30
                      focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-[#0B0F14]
                      active:translate-y-[1px]
                      transition-all duration-200
                      flex items-center justify-center gap-2
                    "
                  >
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    QUERO MEU ORÇAMENTO
                  </button>
                </div>

                <p className="mt-4 text-[11px] text-white/30 text-center">
                  Dica: use <code className="bg-white/10 px-1 rounded">?exit=1</code> na URL para testar este modal.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
