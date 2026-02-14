import { Calendar, Store, Network } from 'lucide-react';

const EVOLUTION_STEPS = [
  {
    number: '01',
    icon: Calendar,
    title: 'Eventos',
    subtitle: 'Operação completa',
    features: [
      'Teste sem investimento inicial',
      'Equipamento + equipe + suporte',
      'Relatório pós-evento detalhado',
    ],
  },
  {
    number: '02',
    icon: Store,
    title: 'Unidade Própria',
    subtitle: 'App + padrão operacional',
    features: [
      'Totem completo próprio',
      'Plataforma de gestão integrada',
      'Treinamento e implantação',
    ],
  },
  {
    number: '03',
    icon: Network,
    title: 'Escala',
    subtitle: 'Rede de unidades',
    features: [
      'Multi-loja no app',
      'Suporte técnico contínuo',
      'Modelo replicável',
    ],
  },
];

/**
 * EvolutionPath - Mostra o caminho de evolução do cliente
 * Do primeiro evento até a operação escalável
 */
export default function EvolutionPath() {
  return (
    <div className="grid gap-6 sm:gap-8 md:grid-cols-3 relative">
      {/* Linha de conexão (desktop only) */}
      <div 
        className="hidden md:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/20 via-primary to-primary/20 -z-0" 
        style={{ width: 'calc(100% - 8rem)', left: '4rem' }}
      />
      
      {EVOLUTION_STEPS.map((step, index) => (
        <div
          key={step.number}
          className="relative bg-card border rounded-lg p-5 sm:p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
        >
          {/* Número grande de fundo */}
          <div className="absolute -top-4 left-5 sm:left-6 text-5xl sm:text-6xl font-bold text-primary/10 select-none">
            {step.number}
          </div>
          
          {/* Ícone com círculo de destaque */}
          <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors z-10">
            <step.icon className="h-6 w-6 text-primary" />
          </div>
          
          {/* Conteúdo */}
          <h3 className="text-lg sm:text-xl font-bold mb-1 text-foreground">{step.title}</h3>
          <p className="text-[15px] text-muted-foreground mb-3 sm:mb-4">{step.subtitle}</p>
          
          <ul className="space-y-2">
            {step.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[15px] text-muted-foreground">
                <span className="text-primary mt-0.5 font-bold">→</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          
          {/* Badge de número no mobile */}
          <div className="md:hidden absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {index + 1}
          </div>
        </div>
      ))}
    </div>
  );
}
