import { Link } from 'react-router-dom';
import {
  Store,
  CheckCircle,
  ArrowRight,
  Beer,
  Clock,
  FileText,
  ShieldCheck,
  Headphones,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import {
  BRAND_NAME,
  HERO_SUBHEADLINE,
  STATS,
  APP_FEATURES,
  BENEFITS,
  STEPS_EVENTO,
  STEPS_FRANQUIA,
  FAQ_ITEMS,
  WHATSAPP_NUMBER,
  WHATSAPP_MESSAGE_DEFAULT,
} from '@/components/landing/constants';
import Section from '@/components/landing/Section';
import FAQAccordion from '@/components/landing/FAQAccordion';
import ContactForm from '@/components/landing/ContactForm';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import EvolutionPath from '@/components/landing/EvolutionPath';
import RegionsSection from '@/components/landing/RegionsSection';
import WhatsAppGroupModal from '@/components/landing/WhatsAppGroupModal';
import ExitIntentModal from '@/components/landing/ExitIntentModal';
import HowItWorksTabs from '@/components/landing/HowItWorksTabs';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

/* ——— Cores constantes do tema dark (hero + footer) ——— */
const DARK_BG = '#0B0F14';

/* ——— Navegação ——— */
const NAV_ITEMS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#eventos', label: 'Eventos' },
  { href: '#franquia', label: 'Franquia' },
  { href: '#app', label: 'App' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contato', label: 'Contato' },
];

/**
 * LandingPage — Beer Tech Premium
 * Visual: hero dark + resto claro com zebra sections, CTAs amarelos.
 */
export function LandingPage() {
  const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
  const linkDefault = `https://wa.me/${phone}?text=${encodeURIComponent(
    WHATSAPP_MESSAGE_DEFAULT,
  )}`;

  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: DARK_BG }}
            >
              <Beer className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-lg font-bold">{BRAND_NAME}</span>
          </Link>

          <nav className="hidden lg:flex gap-6">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex gap-2">
            <a
              href={linkDefault}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent(AnalyticsEvents.HEADER_WHATSAPP)}
              className={
                buttonVariants({ size: 'sm', variant: 'default' }) +
                ' hidden md:inline-flex'
              }
            >
              Falar no WhatsApp
            </a>
            <a
              href="#contato"
              onClick={() => trackEvent(AnalyticsEvents.HEADER_PROPOSTA)}
              className={
                buttonVariants({ size: 'sm', variant: 'outline' }) +
                ' hidden md:inline-flex'
              }
            >
              Solicitar proposta
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════════════════ HERO (dark) ═══════════════════════ */}
      <section
        className="relative overflow-hidden text-white py-24 md:py-36"
        style={{ background: DARK_BG }}
      >
        {/* Decorações */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-amber-400/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-amber-400/3 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur px-4 py-1.5 text-sm text-white/70 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Atendendo eventos em todo o Sul do Brasil
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Chope self&#8209;service para{' '}
            <span className="text-amber-400">eventos</span> e{' '}
            <span className="text-amber-400">franquias</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            {HERO_SUBHEADLINE}
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#contato-evento"
              onClick={() => trackEvent(AnalyticsEvents.HERO_CTA_EVENTO)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-8 py-4 text-lg font-bold text-black shadow-lg shadow-amber-400/20 hover:bg-amber-300 hover:shadow-xl hover:shadow-amber-400/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]"
            >
              Quero para meu evento
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#contato-franquia"
              onClick={() => trackEvent(AnalyticsEvents.HERO_CTA_FRANQUIA)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-8 py-4 text-lg font-medium text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F14]"
            >
              Quero ser franqueado
            </a>
          </div>

          {/* Microcopy — reduz hesitação */}
          <p className="mt-4 text-sm text-white/50">
            Sem compromisso · Resposta rápida via WhatsApp
          </p>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[STATS.events, STATS.liters, STATS.people, STATS.satisfaction].map(
              (value) => (
                <div
                  key={value}
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-5 hover:bg-white/10 transition-colors"
                >
                  <span className="text-lg md:text-xl font-bold text-amber-400">
                    {value}
                  </span>
                </div>
              ),
            )}
          </div>
          <p className="mt-3 text-xs text-white/30">
            *Dados estimados — substitua por dados reais.
          </p>
        </div>
      </section>

      {/* ═══════════════════════ AUTOSSERVIÇO TABS (premium) ═══════════════════════ */}
      <HowItWorksTabs />

      {/* ═══════════════════════ COMO FUNCIONA ═══════════════════════ */}
      <Section
        id="como-funciona"
        title="Como funciona"
        subtitle="Descubra como nossos totens transformam a experiência de consumo."
      >
        <div className="grid gap-8 md:grid-cols-2">
          {/* Eventos */}
          <div className="bg-card rounded-xl border p-6 md:p-8 hover:shadow-lg transition-shadow">
            <h3 className="text-2xl font-semibold mb-8">Para eventos</h3>
            <ol className="space-y-8 relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />
              {STEPS_EVENTO.map((step, idx) => (
                <li key={idx} className="flex items-start gap-5 relative">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm z-10 shadow-md">
                    {idx + 1}
                  </span>
                  <div className="pt-1">
                    <h4 className="font-semibold text-lg mb-1">
                      {step.title}
                    </h4>
                    <p className="text-muted-foreground text-[15px] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Franqueados */}
          <div className="bg-card rounded-xl border p-6 md:p-8 hover:shadow-lg transition-shadow">
            <h3 className="text-2xl font-semibold mb-8">Para franqueados</h3>
            <ol className="space-y-8 relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />
              {STEPS_FRANQUIA.map((step, idx) => (
                <li key={idx} className="flex items-start gap-5 relative">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm z-10 shadow-md">
                    {idx + 1}
                  </span>
                  <div className="pt-1">
                    <h4 className="font-semibold text-lg mb-1">
                      {step.title}
                    </h4>
                    <p className="text-muted-foreground text-[15px] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Regiões atendidas */}
        <div className="mt-12">
          <RegionsSection />
        </div>
      </Section>

      {/* ═══════════════════════ PARA EVENTOS (zebra) ═══════════════════════ */}
      <Section
        id="eventos"
        title="Para eventos"
        subtitle="Solucione tudo: equipamento, equipe, copos, instalação e suporte."
        className="bg-muted/40"
      >
        {/* Callout */}
        <div className="mb-10 rounded-xl bg-accent border border-primary/20 px-6 py-4 text-center">
          <p className="font-semibold text-foreground">
            🍺 A gente opera tudo.{' '}
            <span className="text-primary">Você só aprova.</span>
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 items-center">
          <div className="space-y-6">
            <div>
              <h4 className="text-xl font-semibold mb-3">O que entregamos</h4>
              <ul className="space-y-2.5 text-muted-foreground text-[15px]">
                {[
                  'Totens com torneiras calibradas e medidores',
                  'Barris de chope conforme número de convidados',
                  'Equipe para instalação, operação e reposição',
                  'Copos reutilizáveis ou descartáveis',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xl font-semibold mb-3">
                Suporte e logística
              </h4>
              <ul className="space-y-2.5 text-muted-foreground text-[15px]">
                {[
                  'Planejamento conforme local, energia e público',
                  'Montagem e desmontagem rápidas',
                  'Monitoramento do consumo em tempo real',
                  'Relatório pós‑evento com métricas de consumo',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="w-full h-72 bg-gradient-to-br from-primary/5 to-primary/10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/20 gap-3">
              <Store className="h-14 w-14 text-primary/30" />
              <span className="text-sm text-muted-foreground">
                Imagem do totem*
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════ FRANQUIA ═══════════════════════ */}
      <Section
        id="franquia"
        title="Franquia"
        subtitle="Ofereça autosserviço no seu negócio e tenha receita recorrente."
      >
        <div className="grid gap-8 md:grid-cols-2 items-center">
          <div className="flex items-center justify-center order-2 md:order-1">
            <div className="w-full h-72 bg-gradient-to-br from-primary/5 to-primary/10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/20 gap-3">
              <Store className="h-14 w-14 text-primary/30" />
              <span className="text-sm text-muted-foreground">
                Imagem da franquia*
              </span>
            </div>
          </div>
          <div className="space-y-6 order-1 md:order-2">
            <div>
              <h4 className="text-xl font-semibold mb-3">
                O que está incluído
              </h4>
              <ul className="space-y-2.5 text-muted-foreground text-[15px]">
                {[
                  'Totem completo com torneiras e sensores de fluxo',
                  'Controladora e sistema de pagamento integrado',
                  'Acesso ao aplicativo de gestão (multi‑loja)',
                  'Treinamento inicial e manual de operação',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xl font-semibold mb-3">Modelo de receita</h4>
              <ul className="space-y-2.5 text-muted-foreground text-[15px]">
                {[
                  'Venda de chope por litro com margem atrativa',
                  'Assinatura mensal do app de gestão (sob consulta)',
                  'Possibilidade de venda de publicidade nas telas',
                  'Suporte técnico e atualizações inclusos',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mini callout */}
            <div className="rounded-lg bg-accent border border-primary/20 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                💡 O app já está pronto para operação multi-unidade
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════ APP DE GESTÃO (zebra + bento) ═══════════════════════ */}
      <Section
        id="app"
        title="Aplicativo de gestão"
        subtitle="Administre seu negócio com tecnologia avançada."
        className="bg-muted/40"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card grande (dashboard mock) */}
          {(() => {
            const feat = APP_FEATURES[0];
            const Icon = feat.icon;
            return (
              <Card className="md:col-span-2 md:row-span-2 group shadow-md hover:shadow-xl hover:border-primary/20 transition-all duration-300">
                <CardContent className="p-6 h-full flex flex-col">
                  <div className="flex-1 mb-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-dashed border-primary/20 flex flex-col items-center justify-center min-h-[200px] gap-3">
                    <Store className="h-16 w-16 text-primary/20" />
                    <span className="text-sm text-muted-foreground">
                      Dashboard preview*
                    </span>
                  </div>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1 text-foreground">
                    {feat.title}
                  </h3>
                  <p className="text-[15px] text-muted-foreground leading-relaxed">
                    {feat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Cards restantes */}
          {APP_FEATURES.slice(1).map((feature) => (
            <Card
              key={feature.title}
              className="group hover:shadow-lg hover:border-primary/20 transition-all duration-300"
            >
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold mb-1 text-foreground">
                  {feature.title}
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════ BENEFÍCIOS ═══════════════════════ */}
      <Section
        id="beneficios"
        title="Benefícios"
        subtitle="Por que adotar o autosserviço de chope?"
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="flex flex-col items-center text-center p-6 rounded-xl border bg-card hover:shadow-lg hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                <benefit.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════ CAMINHO DE EVOLUÇÃO (zebra) ═══════════════════════ */}
      <Section
        id="caminho"
        title="Seu caminho com a gente"
        subtitle="Do seu primeiro evento à operação escalável"
        className="bg-muted/40"
      >
        <EvolutionPath />
      </Section>

      {/* ═══════════════════════ PLANOS ═══════════════════════ */}
      <Section
        id="planos"
        title="Planos e modelo comercial"
        subtitle="Escolha o formato ideal para o seu evento ou negócio."
      >
        <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          {/* Evento */}
          <Card className="relative group hover:shadow-xl transition-all duration-300 border-primary/30 shadow-md">
            <div className="absolute -top-3 left-6 z-10">
              <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-md">
                ⚡ Mais rápido
              </span>
            </div>
            <CardContent className="p-6 pt-8">
              <h3 className="text-xl font-bold mb-2">Evento</h3>
              <p className="text-muted-foreground mb-4 text-[15px] leading-relaxed">
                Ideal para ocasiões pontuais: casamentos, festas corporativas e
                festivais.
              </p>
              <ul className="space-y-2.5 text-[15px] text-muted-foreground mb-6">
                {[
                  'Aluguel do totem e equipamentos',
                  'Equipe para operação e reposição',
                  'Escolha de barris conforme público',
                  'Relatório de consumo pós‑evento',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="font-bold text-2xl mb-1">Proposta sob medida</p>
              <p className="text-xs text-muted-foreground mb-4">
                Resposta em até 24h
              </p>
              <a
                href="#contato-evento"
                className={
                  buttonVariants({ size: 'default', variant: 'default' }) +
                  ' w-full text-center font-bold h-12'
                }
              >
                Solicitar orçamento
              </a>
            </CardContent>
          </Card>

          {/* Franquia */}
          <Card className="relative group hover:shadow-xl transition-all duration-300">
            <div className="absolute -top-3 left-6 z-10">
              <span className="inline-flex items-center rounded-full bg-muted border px-3 py-1 text-xs font-semibold text-foreground">
                🔄 Recorrência
              </span>
            </div>
            <CardContent className="p-6 pt-8">
              <h3 className="text-xl font-bold mb-2">Franquia</h3>
              <p className="text-muted-foreground mb-4 text-[15px] leading-relaxed">
                Operação contínua com equipamento próprio e app de gestão
                completo.
              </p>
              <ul className="space-y-2.5 text-[15px] text-muted-foreground mb-6">
                {[
                  'Compra do totem completo',
                  'Assinatura do app e suporte',
                  'Treinamento e implantação',
                  'Margem por litro atrativa',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="font-bold text-2xl mb-1">Proposta sob medida</p>
              <p className="text-xs text-muted-foreground mb-4">
                Agende uma conversa consultiva
              </p>
              <a
                href="#contato-franquia"
                className={
                  buttonVariants({ size: 'default', variant: 'outline' }) +
                  ' w-full text-center font-bold h-12'
                }
              >
                Falar com vendas
              </a>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ═══════════════════════ FAQ (zebra) ═══════════════════════ */}
      <Section
        id="faq"
        title="Perguntas frequentes"
        subtitle="Tire suas dúvidas sobre nosso serviço e franquia."
        className="bg-muted/40"
      >
        <FAQAccordion items={FAQ_ITEMS} />
      </Section>

      {/* ═══════════════════════ CONTATO ═══════════════════════ */}
      <Section
        id="contato"
        title="Entre em contato"
        subtitle="Solicite uma proposta ou tire suas dúvidas. Retornaremos em breve."
      >
        <span id="contato-evento" className="sr-only" />
        <span id="contato-franquia" className="sr-only" />
        <span id="contato-representante" className="sr-only" />

        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] items-start max-w-5xl mx-auto">
          {/* Sidebar com benefícios */}
          <div className="bg-card rounded-xl border p-6 md:p-8 space-y-6">
            <h3 className="text-xl font-bold">O que você recebe</h3>
            <div className="space-y-4">
              {[
                {
                  icon: Clock,
                  title: 'Resposta rápida',
                  desc: 'Retornamos em até 1 hora útil.',
                },
                {
                  icon: FileText,
                  title: 'Proposta detalhada',
                  desc: 'Personalizada para seu evento ou negócio.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Sem compromisso',
                  desc: 'Orçamento gratuito e sem burocracia.',
                },
                {
                  icon: Headphones,
                  title: 'Suporte dedicado',
                  desc: 'Atendimento exclusivo do primeiro contato ao evento.',
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Callout WhatsApp */}
            <div className="rounded-lg bg-accent border border-primary/20 px-4 py-3 text-center">
              <p className="text-sm font-medium">
                Prefere falar direto?{' '}
                <a
                  href={linkDefault}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  Converse no WhatsApp
                </a>
              </p>
            </div>
          </div>

          {/* Formulário */}
          <div>
            <ContactForm />
          </div>
        </div>
      </Section>

      {/* ═══════════════════════ FOOTER (dark) ═══════════════════════ */}
      <footer
        className="py-12 text-white"
        style={{ background: DARK_BG }}
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-400/20 flex items-center justify-center">
                <Beer className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <span className="font-semibold">{BRAND_NAME}</span>
            </div>

            <nav className="flex gap-4 text-sm text-white/50 flex-wrap justify-center">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="hover:text-amber-400 transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <span className="text-white/20 mx-1">•</span>
              <a
                href="#contato-representante"
                onClick={() =>
                  trackEvent(AnalyticsEvents.FOOTER_REPRESENTANTE)
                }
                className="hover:text-amber-400 transition-colors font-medium text-white/70"
              >
                Seja representante
              </a>
            </nav>

            <p className="text-xs text-white/30 text-center md:text-right">
              © {new Date().getFullYear()} {BRAND_NAME}. Todos os direitos
              reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ═══════════════════════ OVERLAYS ═══════════════════════ */}
      <WhatsAppFloatingButton />

      <WhatsAppGroupModal
        groupInviteUrl="https://chat.whatsapp.com/DIciZrJ0gNC0zVEBk4Tg2Z?mode=gi_t"
        brandName="Open Kiosk"
        autoOpenDelayMs={1200}
        cooldownDays={7}
      />

      <ExitIntentModal cooldownDays={3} armAfterMs={10000} />
    </div>
  );
}

export default LandingPage;

