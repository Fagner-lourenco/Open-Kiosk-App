import { SVGProps } from 'react';

interface BeerMugProps extends SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Ícone de caneca de chopp/cerveja para tela de espera
 * Estilo compatível com Lucide Icons
 */
const BeerMug = ({ className, ...props }: BeerMugProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Corpo da caneca */}
    <path d="M8 2h8v20H8z" />
    <path d="M8 2c-2 0-4 1-4 4v10c0 3 2 6 4 6" />
    <path d="M16 2c2 0 4 1 4 4v6c0 2-2 4-4 4" />
    
    {/* Alça da caneca */}
    <path d="M16 6h2c1.5 0 3 1 3 3v2c0 2-1.5 3-3 3h-2" />
    
    {/* Espuma no topo */}
    <ellipse cx="12" cy="4" rx="4" ry="2" fill="currentColor" opacity="0.3" />
    <path d="M8 4c0-1.1 1.8-2 4-2s4 .9 4 2" />
    
    {/* Bolhas da cerveja */}
    <circle cx="10" cy="10" r="1" fill="currentColor" opacity="0.4" />
    <circle cx="13" cy="14" r="0.8" fill="currentColor" opacity="0.3" />
    <circle cx="11" cy="17" r="0.6" fill="currentColor" opacity="0.3" />
  </svg>
);

export default BeerMug;
