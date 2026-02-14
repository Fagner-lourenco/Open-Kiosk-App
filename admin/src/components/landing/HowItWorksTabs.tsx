import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

/* ——— Dados dos passos ——— */
interface Step {
  key: string;
  label: string;
  title: string;
  description: string;
  bullets: string[];
}

const STEPS: Step[] = [
  {
    key: 'escolha',
    label: '1. Escolha o chope',
    title: 'Escolha o chope disponível',
    description:
      'O participante visualiza as opções no totem (ou tela acima das torneiras) e seleciona o chope desejado. São exibidos nome, estilo, teor alcoólico e valor por litro.',
    bullets: [
      'Opções visíveis na tela do totem',
      'Informações claras de estilo e preço',
      'Sem filas — atendimento simultâneo',
    ],
  },
  {
    key: 'libere',
    label: '2. Libere a torneira',
    title: 'Libere a torneira com pagamento',
    description:
      'O sistema processa o pagamento e libera a torneira instantaneamente. Cada mililitro é medido pelo sensor de fluxo e registrado automaticamente.',
    bullets: [
      'Liberação imediata após pagamento',
      'Controle por volume (medição precisa)',
      'Registro automático de cada extração',
    ],
  },
  {
    key: 'finalize',
    label: '3. Fim da extração',
    title: 'Finalize e acompanhe o consumo',
    description:
      'Ao soltar a torneira, o sistema fecha a medição e gera os registros. O organizador acompanha o consumo em tempo real pelo app de gestão.',
    bullets: [
      'Medição precisa por sensor de fluxo',
      'Auditoria e relatórios completos',
      'Mais controle, menos desperdício',
    ],
  },
];

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

/**
 * Bloco premium "Como funciona o autosserviço de chope" com tabs pill-shape,
 * painel dividido (texto + mídia placeholder) e barra de progresso.
 */
export default function HowItWorksTabs() {
  const uid = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* Navegação por setas no tablist */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement as HTMLElement | null;
      const idx = tabRefs.current.findIndex((r) => r === el);
      if (idx < 0) return;

      e.preventDefault();
      const next =
        e.key === 'ArrowRight'
          ? (idx + 1) % STEPS.length
          : (idx - 1 + STEPS.length) % STEPS.length;
      setActive(next);
      tabRefs.current[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const step = STEPS[active];

  return (
    <section
      id="como-funciona-autosservico"
      className="scroll-mt-24 py-16 md:py-24 bg-muted/40"
    >
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-10 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Como funciona o autosserviço{' '}
            <span className="text-primary">de chope</span>
          </h2>
          <p className="mt-3 text-[15px] text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Entenda em 3 passos como a experiência acontece na prática para o
            participante do seu evento ou cliente da sua unidade.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center">
          <div
            role="tablist"
            aria-label="Passos do autosserviço"
            className={cn(
              'flex w-full max-w-2xl gap-2 overflow-x-auto',
              'rounded-2xl border bg-background/80 p-1.5 backdrop-blur',
              'scrollbar-none snap-x snap-mandatory',
            )}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {STEPS.map((s, i) => {
              const selected = i === active;
              return (
                <button
                  key={s.key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  id={`tab-${uid}-${s.key}`}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${uid}-${s.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex-1 min-w-0 snap-start whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    selected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground/70 hover:bg-primary/10',
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel */}
        <div
          id={`panel-${uid}-${step.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${uid}-${step.key}`}
          className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Texto */}
            <div className="p-6 sm:p-8 md:p-10 flex flex-col justify-center">
              <div className="inline-flex self-start items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                Passo {active + 1} de {STEPS.length}
              </div>

              <h3 className="mt-5 text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/70">
                {step.description}
              </p>

              <ul className="mt-6 space-y-2.5">
                {step.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px]">
                    <CheckCircle className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                    <span className="text-foreground/80">{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#contato-evento"
                  onClick={() =>
                    trackEvent(AnalyticsEvents.HERO_CTA_EVENTO)
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
                >
                  Quero para meu evento
                </a>
                <a
                  href="#app"
                  className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
                >
                  Ver o app de gestão
                </a>
              </div>
            </div>

            {/* Mídia placeholder */}
            <div className="relative min-h-[280px] md:min-h-full bg-gradient-to-br from-primary/10 via-primary/5 to-muted/50">
              {/* Overlay pattern */}
              <div
                className="absolute inset-0 opacity-[0.04]"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
              <div className="absolute inset-0 grid place-items-center p-6 md:p-8">
                <div className="w-full max-w-sm rounded-2xl border bg-background/60 p-6 backdrop-blur shadow-md">
                  <p className="text-sm font-bold text-foreground">
                    Placeholder de mídia
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Substitua por foto do totem no evento ou screenshot do app.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="h-20 rounded-xl border bg-muted/50 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">
                        Imagem 1
                      </span>
                    </div>
                    <div className="h-20 rounded-xl border bg-muted/50 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">
                        Imagem 2
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="h-[3px] bg-primary/15">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((active + 1) / STEPS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
