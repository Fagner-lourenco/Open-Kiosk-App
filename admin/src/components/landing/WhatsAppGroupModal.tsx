import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Modal popup estilo "VIP WhatsApp" (sem dependências extras).
 * - Acessível: role="dialog", aria-modal, ESC fecha, foco inicial, trap de TAB.
 * - Comportamento: abre após delay e respeita cooldown no localStorage.
 * - Visual: fundo escuro + pattern sutil + CTA amarelo.
 */

type Props = {
  /** Link do grupo do WhatsApp (invite). */
  groupInviteUrl?: string;
  /** Nome/Marca exibida no rodapé do modal. */
  brandName?: string;
  /** Delay para abrir automaticamente (ms). */
  autoOpenDelayMs?: number;
  /** Quantos dias esperar para mostrar novamente após o usuário fechar. */
  cooldownDays?: number;
  /** Se true, força abrir sempre (útil para testar). */
  debugAlwaysOpen?: boolean;
  /** Chave do localStorage para registrar o "dismiss". */
  storageKey?: string;
};

const DEFAULT_GROUP_URL =
  'https://chat.whatsapp.com/DIciZrJ0gNC0zVEBk4Tg2Z?mode=gi_t';

const DEFAULT_BRAND = 'Open Kiosk';

const COPY = {
  title: 'ATENÇÃO, AMANTE DE CHOPE!',
  highlight: 'Entre no nosso grupo VIP no WhatsApp',
  description:
    'Receba novidades, condições especiais e avisos de disponibilidade para eventos e unidades. É rápido, sem spam, e você sai quando quiser.',
  cta: 'Entrar no grupo',
  footerNote: 'Acesso gratuito • Conteúdo direto ao ponto',
};

function safeNow() {
  return typeof Date !== 'undefined' ? Date.now() : 0;
}

function getFromStorage(key: string) {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setToStorage(key: string, value: string) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return [];
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'),
  );
}

export default function WhatsAppGroupModal({
  groupInviteUrl = DEFAULT_GROUP_URL,
  brandName = DEFAULT_BRAND,
  autoOpenDelayMs = 1200,
  cooldownDays = 7,
  debugAlwaysOpen = false,
  storageKey = 'ok_whatsapp_group_modal_dismissed_v1',
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const shouldAutoOpen = useMemo(() => {
    if (debugAlwaysOpen) return true;

    const raw = getFromStorage(storageKey);
    if (!raw) return true;

    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return true;

    if (cooldownDays <= 0) return true;

    const elapsed = safeNow() - dismissedAt;
    return elapsed >= daysToMs(cooldownDays);
  }, [cooldownDays, debugAlwaysOpen, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Atalho para testes: ?vip=1 abre sempre
    const params = new URLSearchParams(window.location.search);
    const forceVip = params.get('vip') === '1';

    if (forceVip) {
      setOpen(true);
      return;
    }

    if (!shouldAutoOpen) return;

    const t = window.setTimeout(() => {
      setOpen(true);
    }, autoOpenDelayMs);

    return () => window.clearTimeout(t);
  }, [autoOpenDelayMs, shouldAutoOpen]);

  // Focus management + trap TAB + ESC
  useEffect(() => {
    if (!open) return;

    if (typeof document !== 'undefined') {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
    }

    // Foco inicial no botão fechar
    setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length === 0) return;

        const active = document.activeElement as HTMLElement | null;
        const currentIndex = active ? focusables.indexOf(active) : -1;

        if (e.shiftKey) {
          if (currentIndex <= 0) {
            e.preventDefault();
            focusables[focusables.length - 1]?.focus();
          }
          return;
        }

        if (currentIndex === -1 || currentIndex === focusables.length - 1) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      lastFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    setToStorage(storageKey, String(safeNow()));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vip-modal-title"
        aria-describedby="vip-modal-desc"
        className="
          relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10
          bg-neutral-950 text-white shadow-2xl
          animate-in fade-in zoom-in-95 duration-300
        "
      >
        {/* Pattern sutil (sem assets) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.9) 0 2px, transparent 3px),' +
              'radial-gradient(circle at 80% 30%, rgba(255,255,255,0.9) 0 2px, transparent 3px),' +
              'radial-gradient(circle at 40% 80%, rgba(255,255,255,0.9) 0 2px, transparent 3px),' +
              'linear-gradient(135deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 48px)',
            backgroundSize: '64px 64px, 72px 72px, 80px 80px, 48px 48px',
            backgroundPosition: '0 0, 0 0, 0 0, 0 0',
          }}
        />

        {/* Close */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={handleClose}
          className="
            absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center
            rounded-full bg-white/5 hover:bg-white/10
            focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-neutral-950
            transition-colors
          "
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative px-6 py-10 sm:px-10 sm:py-12 text-center">
          {/* WhatsApp icon */}
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-9 w-9 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          </div>

          <h2
            id="vip-modal-title"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight"
          >
            {COPY.title}
          </h2>

          <p className="mt-4 text-xl sm:text-2xl font-semibold">
            <span className="underline decoration-yellow-400/90 underline-offset-[6px] decoration-2">
              {COPY.highlight}
            </span>
          </p>

          <p
            id="vip-modal-desc"
            className="mt-4 text-base sm:text-lg text-white/85 max-w-2xl mx-auto leading-relaxed"
          >
            {COPY.description}
          </p>

          <div className="mt-8 flex justify-center">
            <a
              href={groupInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex w-full max-w-md items-center justify-center gap-3 rounded-lg
                bg-yellow-400 px-6 py-4 text-lg font-extrabold text-black
                shadow-lg shadow-yellow-400/20
                hover:bg-yellow-300 hover:shadow-xl hover:shadow-yellow-400/30
                focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-neutral-950
                active:translate-y-[1px]
                transition-all duration-200
              "
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {COPY.cta}
            </a>
          </div>

          <div className="mt-8 text-sm text-white/70">
            <div className="font-semibold">{brandName}</div>
            <div className="mt-1">{COPY.footerNote}</div>
          </div>

          <div className="mt-3 text-[11px] text-white/40">
            Dica: use <code className="bg-white/10 px-1 rounded">?vip=1</code> na URL para testar o modal.
          </div>
        </div>
      </div>
    </div>
  );
}
