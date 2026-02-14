import {
  Store,
  Users,
  BarChart3,
  Shield,
  Zap,
  Globe,
  Beer,
  Users as UsersIcon,
  CalendarCheck,
  DollarSign,
} from 'lucide-react';

/**
 * Constantes e conteúdos reutilizáveis para a landing. Modifique estes
 * valores conforme necessário sem alterar os componentes. Isso facilita
 * ajustes de copy, métricas, contatos e ícones.
 */

export const BRAND_NAME = 'Open Kiosk';

// Contato
export const CONTACT_EMAIL = 'contato@seudominio.com';
export const WHATSAPP_NUMBER = '+5541996449298';

// Mensagens pré‑preenchidas para diferentes públicos
export const WHATSAPP_MESSAGE_EVENTO =
  'Olá! Quero um orçamento para meu evento de chope.';
export const WHATSAPP_MESSAGE_EVENTO_PEQUENO =
  'Olá! Quero orçamento para evento de até 1000 pessoas.';
export const WHATSAPP_MESSAGE_EVENTO_GRANDE =
  'Olá! Quero orçamento para evento com mais de 1000 pessoas.';
export const WHATSAPP_MESSAGE_FRANQUIA =
  'Olá! Quero saber mais sobre a franquia de chope.';
export const WHATSAPP_MESSAGE_REPRESENTANTE =
  'Olá! Quero participar do programa de representantes.';
export const WHATSAPP_MESSAGE_DEFAULT =
  'Olá! Tenho interesse em chope self‑service e gostaria de saber mais.';

// Métricas de credibilidade (placeholders)
export const STATS = {
  events: '+X eventos',
  liters: '+Y litros servidos',
  people: '+Z pessoas atendidas',
  satisfaction: '99% de satisfação',
};

// Headline e subheadline do hero
export const HERO_HEADLINE =
  'Chope self‑service para eventos e franquias';
export const HERO_SUBHEADLINE =
  'Ofereça uma experiência de consumo moderna, reduza custos e aumente seu lucro. Nós cuidamos de tudo — do totem à gestão.';

// Recursos do aplicativo de gestão
export const APP_FEATURES = [
  {
    icon: Store,
    title: 'Gestão multi‑loja',
    description:
      'Controle diversas unidades e torneiras em um único painel intuitivo.',
  },
  {
    icon: Users,
    title: 'Equipe integrada',
    description:
      'Convide colaboradores, defina permissões e acompanhe em tempo real.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios detalhados',
    description:
      'Acompanhe vendas, estoque e desempenho com gráficos e KPIs.',
  },
  {
    icon: Shield,
    title: 'Auditoria completa',
    description:
      'Registre cada extração para garantir segurança e transparência.',
  },
  {
    icon: Zap,
    title: 'Integração IoT',
    description:
      'Conecte dispensers e torneiras via ESP32 para automação e telemetria.',
  },
  {
    icon: Globe,
    title: 'Acesso global',
    description:
      'Gerencie de qualquer lugar, a qualquer hora, em dispositivos móveis ou web.',
  },
];

// Benefícios gerais do autosserviço
export const BENEFITS = [
  {
    icon: Beer,
    title: 'Experiência moderna',
    description:
      'Surpreenda seus clientes com autosserviço de chope ágil e divertido.',
  },
  {
    icon: UsersIcon,
    title: 'Redução de custos',
    description:
      'Diminua a necessidade de equipe no balcão e optimize seu investimento.',
  },
  {
    icon: CalendarCheck,
    title: 'Controle de desperdício',
    description:
      'Acompanhe cada mililitro servido, evitando extravasos e perdas.',
  },
  {
    icon: DollarSign,
    title: 'Mais lucro',
    description:
      'Aumente a rotatividade de vendas e maximize a margem com autosserviço.',
  },
];

// Passos para eventos
export const STEPS_EVENTO = [
  {
    title: 'Planejamento',
    description:
      'Você nos conta sobre seu evento (data, local e número de pessoas). Montamos a solução ideal.',
  },
  {
    title: 'Instalação e operação',
    description:
      'Levamos os totens e chopeiras, realizamos a montagem e acompanhamos a operação durante o evento.',
  },
  {
    title: 'Encerramento',
    description:
      'Desmontamos e recolhemos os equipamentos. Você recebe um relatório com consumo e feedback.',
  },
];

// Passos para franqueados
export const STEPS_FRANQUIA = [
  {
    title: 'Aquisição do totem',
    description:
      'Escolha o modelo e adquira o equipamento completo com torneiras e sensores.',
  },
  {
    title: 'Implantação',
    description:
      'Instalamos no seu espaço, treinamos sua equipe e conectamos ao app de gestão.',
  },
  {
    title: 'Gestão e suporte',
    description:
      'Utilize a plataforma para administrar vendas e estoque. Conte com nosso suporte contínuo.',
  },
];

// Perguntas frequentes
export const FAQ_ITEMS = [
  {
    question:
      'Quais são os requisitos para instalar o totem no meu evento ou bar?',
    answer:
      'É necessário ter acesso à rede elétrica e espaço para acomodar o totem e barris de chope. Nossa equipe verifica todos os detalhes no planejamento.',
  },
  {
    question: 'Como é feito o pagamento pelo consumo de chope?',
    answer:
      'No autosserviço, o cliente utiliza cartão de crédito/débito ou ficha pré‑paga. Para eventos, podemos adaptar de acordo com a necessidade.',
  },
  {
    question: 'Qual é o retorno esperado ao investir em uma franquia?',
    answer:
      'O retorno depende do volume de vendas e localização. Em geral, nossos parceiros observam payback entre 6 e 12 meses (assunção).',
  },
  {
    question: 'Vocês fornecem copos e equipe?',
    answer:
      'Sim. Para eventos incluímos copos (reutilizáveis ou descartáveis) e uma equipe para instalação, reposição e suporte.',
  },
  {
    question: 'Quais regiões vocês atendem?',
    answer:
      'Atendemos eventos de pequeno porte em Curitiba e região metropolitana. Para eventos com mais de 20 mil pessoas, atuamos em todo o Sul do Brasil.',
  },
  {
    question:
      'Qual é a diferença entre eventos pequenos e grandes?',
    answer:
      'Eventos pequenos (até 20 mil pessoas) são atendidos em Curitiba e região; eventos grandes (>20 mil pessoas) em todo o Sul do Brasil. O dimensionamento de equipamentos e logística varia conforme o público.',
  },
  {
    question: 'Como funciona o programa de representantes?',
    answer:
      'Representantes recebem comissão por leads qualificados que fecham contrato. Você pode indicar eventos, estabelecimentos (bares/restaurantes) ou ambos. Entre em contato para conhecer as condições comerciais.',
  },
  {
    question: 'Posso ser representante na minha região?',
    answer:
      'Sim! Trabalhamos com representantes em diversas regiões do Brasil. Para se cadastrar, preencha o formulário de contato selecionando "Representante" como interesse ou entre em contato direto pelo WhatsApp.',
  },
];
