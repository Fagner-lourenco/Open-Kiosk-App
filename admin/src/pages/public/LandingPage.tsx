/**
 * ============================================================================
 * LandingPage - Página Inicial de Marketing
 * ============================================================================
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Store, 
  Users, 
  BarChart3, 
  Shield, 
  Zap, 
  Globe,
  ChevronRight,
  Check
} from 'lucide-react';

const features = [
  {
    icon: Store,
    title: 'Gestão Multi-Loja',
    description: 'Gerencie todas as suas lojas em um único painel centralizado.',
  },
  {
    icon: Users,
    title: 'Equipe Integrada',
    description: 'Convide colaboradores e defina permissões granulares por função.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios Detalhados',
    description: 'Acompanhe vendas, produtos e desempenho em tempo real.',
  },
  {
    icon: Shield,
    title: 'Auditoria Completa',
    description: 'Rastreie todas as ações com log de auditoria detalhado.',
  },
  {
    icon: Zap,
    title: 'Integração ESP32',
    description: 'Conecte dispensers e torneiras com hardware IoT.',
  },
  {
    icon: Globe,
    title: 'Acesso Global',
    description: 'Acesse de qualquer lugar, a qualquer momento.',
  },
];

const plans = [
  {
    name: 'Starter',
    price: 'Grátis',
    description: 'Para começar',
    features: ['1 loja', '2 usuários', 'Relatórios básicos', 'Suporte por email'],
    cta: 'Começar Grátis',
    popular: false,
  },
  {
    name: 'Growth',
    price: 'R$ 99',
    period: '/mês',
    description: 'Para crescer',
    features: ['5 lojas', '10 usuários', 'Relatórios avançados', 'Suporte prioritário', 'Auditoria completa'],
    cta: 'Iniciar Teste Grátis',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    description: 'Para grandes operações',
    features: ['Lojas ilimitadas', 'Usuários ilimitados', 'API dedicada', 'Suporte 24/7', 'SLA garantido'],
    cta: 'Falar com Vendas',
    popular: false,
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Store className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Open Kiosk</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button>Criar Conta</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Gerencie suas franquias<br />
            <span className="text-primary">de forma inteligente</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Plataforma completa para gestão de franquias, lojas e equipes.
            Controle total do seu negócio em um único lugar.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/register">
              <Button size="lg" className="gap-2">
                Começar Agora
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Tudo que você precisa
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Ferramentas poderosas para gerenciar cada aspecto do seu negócio.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Planos para cada necessidade
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Escolha o plano ideal para o tamanho do seu negócio.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <Card 
                key={plan.name} 
                className={`relative ${plan.popular ? 'border-primary border-2' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-sm px-3 py-1 rounded-full">
                    Mais Popular
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                  </div>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link to="/register">
                    <Button 
                      className="w-full" 
                      variant={plan.popular ? 'default' : 'outline'}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Pronto para começar?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Crie sua conta gratuitamente e comece a gerenciar suas franquias hoje mesmo.
          </p>
          <Link to="/register">
            <Button size="lg" className="gap-2">
              Criar Conta Grátis
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Store className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">Open Kiosk</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Open Kiosk. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
