import { SVGProps } from 'react';

interface BeerMugProps extends SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Ícone de caneca de cerveja/chopp para tela de espera
 * Design mais realista com efeito de profundidade e espuma realista
 */
const BeerMug = ({ className, ...props }: BeerMugProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 160"
    fill="none"
    className={className}
    {...props}
  >
    {/* Gradiente para efeito de vidro */}
    <defs>
      <linearGradient id="beerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
        <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id="foamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="white" stopOpacity="1" />
        <stop offset="100%" stopColor="white" stopOpacity="0.6" />
      </linearGradient>
    </defs>

    {/* Corpo principal da caneca com efeito de vidro */}
    <rect
      x="20"
      y="50"
      width="50"
      height="80"
      rx="4"
      fill="url(#beerGradient)"
      opacity="0.8"
    />

    {/* Fundo da caneca */}
    <ellipse cx="45" cy="130" rx="25" ry="5" fill="currentColor" opacity="0.6" />

    {/* Alça da caneca */}
    <path
      d="M 72 65 Q 90 80 90 100 Q 90 120 72 130"
      stroke="currentColor"
      strokeWidth="4"
      fill="none"
      strokeLinecap="round"
    />

    {/* Brilho no vidro */}
    <rect
      x="26"
      y="58"
      width="6"
      height="60"
      rx="3"
      fill="white"
      opacity="0.3"
    />

    {/* Espuma realista no topo */}
    <ellipse cx="45" cy="48" rx="28" ry="15" fill="url(#foamGradient)" />

    {/* Detalhes de espuma - bolhas grandes */}
    <circle cx="32" cy="42" r="8" fill="white" opacity="0.7" />
    <circle cx="50" cy="38" r="10" fill="white" opacity="0.8" />
    <circle cx="62" cy="44" r="7" fill="white" opacity="0.75" />

    {/* Detalhes de espuma - bolhas médias */}
    <circle cx="38" cy="32" r="5" fill="white" opacity="0.6" />
    <circle cx="56" cy="30" r="6" fill="white" opacity="0.65" />

    {/* Detalhes de espuma - bolhas pequenas */}
    <circle cx="28" cy="50" r="3" fill="white" opacity="0.5" />
    <circle cx="60" cy="52" r="2.5" fill="white" opacity="0.55" />
    <circle cx="45" cy="25" r="4" fill="white" opacity="0.6" />

    {/* Bolhas dentro da cerveja (sugestão de efervescência) */}
    <circle cx="35" cy="85" r="2" fill="white" opacity="0.3" />
    <circle cx="55" cy="100" r="1.5" fill="white" opacity="0.25" />
    <circle cx="45" cy="115" r="1" fill="white" opacity="0.2" />
  </svg>
);

export default BeerMug;
