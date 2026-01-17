/**
 * CupFillAnimation - Animação visual de copo enchendo
 * 
 * Componente SVG animado que mostra o nível do líquido
 * baseado na porcentagem de progresso da dispensação.
 * 
 * Usa Framer Motion para animações suaves compatíveis com web e mobile.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CupFillAnimationProps {
  /** Porcentagem de preenchimento (0-100) */
  percent: number;
  /** ML atual dispensado */
  ml?: number;
  /** ML alvo */
  targetMl?: number;
  /** Se o fluxo já começou (usuário abriu a torneira) */
  flowStarted?: boolean;
  /** Tamanho do componente */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Cor do líquido */
  liquidColor?: string;
  /** Cor do copo */
  cupColor?: string;
  /** Classes CSS adicionais */
  className?: string;
}

const sizeMap = {
  sm: { width: 80, height: 100 },
  md: { width: 120, height: 150 },
  lg: { width: 160, height: 200 },
  xl: { width: 200, height: 250 },
};

// Valores pré-calculados para bolhas (evita recalcular a cada render)
const BUBBLE_SIZES = [4, 3.5, 4.5, 3, 5];
const BUBBLE_DELAYS = [0.1, 0.3, 0.2, 0.4, 0.25];
const BUBBLE_DURATIONS = [1.2, 1.5, 1.3, 1.8, 1.4];
const RISING_BUBBLE_SIZES = [2, 3, 4, 2, 3, 4];

export const CupFillAnimation = ({
  percent,
  ml,
  targetMl,
  flowStarted = false,
  size = 'lg',
  liquidColor = '#F59E0B', // Amber/beer color
  cupColor = '#94A3B8', // Slate gray for cup outline
  className,
}: CupFillAnimationProps) => {
  const { width, height } = sizeMap[size];
  const clampedPercent = Math.min(100, Math.max(0, percent || 0));
  
  // Dimensões do copo (proporcionais ao tamanho)
  const cupWidth = width * 0.7;
  const cupHeight = height * 0.75;
  const cupX = (width - cupWidth) / 2;
  const cupY = height * 0.15;
  const cupBottom = cupY + cupHeight;
  
  // Handle do copo (alça)
  const handleWidth = width * 0.15;
  const handleHeight = cupHeight * 0.5;
  const handleX = cupX + cupWidth;
  const handleY = cupY + cupHeight * 0.2;
  
  // Líquido (cresce de baixo para cima)
  const marginBottom = cupHeight * 0.05; // Margem interna do fundo do copo
  const maxLiquidHeight = cupHeight * 0.85;
  const liquidHeight = (clampedPercent / 100) * maxLiquidHeight;
  // Posição Y: líquido inicia no fundo (cupBottom - marginBottom) e sobe conforme enchendo
  const liquidY = cupBottom - marginBottom - liquidHeight;
  const liquidWidth = cupWidth * 0.85;
  const liquidX = cupX + (cupWidth - liquidWidth) / 2;
  
  // Espuma (quando > 80%)
  const showFoam = clampedPercent > 80;
  const foamHeight = cupHeight * 0.08;
  
  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="drop-shadow-lg"
      >
        {/* Definições de gradientes */}
        <defs>
          {/* Gradiente do líquido (cerveja/chope) */}
          <linearGradient id="liquidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={liquidColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={liquidColor} stopOpacity="1" />
          </linearGradient>
          
          {/* Gradiente da espuma */}
          <linearGradient id="foamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
            <stop offset="100%" stopColor="#FEF3C7" stopOpacity="0.9" />
          </linearGradient>
          
          {/* Efeito de brilho do vidro */}
          <linearGradient id="glassShine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="50%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0.1" />
          </linearGradient>
          
          {/* Clip path para o líquido ficar dentro do copo */}
          <clipPath id="cupClip">
            <rect
              x={cupX + 3}
              y={cupY + 3}
              width={cupWidth - 6}
              height={cupHeight - 6}
              rx="4"
            />
          </clipPath>
        </defs>
        
        {/* Sombra do copo */}
        <ellipse
          cx={width / 2}
          cy={height - 5}
          rx={cupWidth / 2 + 5}
          ry={8}
          fill="rgba(0,0,0,0.1)"
        />
        
        {/* Alça do copo */}
        <path
          d={`
            M ${handleX - 2} ${handleY}
            Q ${handleX + handleWidth} ${handleY}
              ${handleX + handleWidth} ${handleY + handleHeight / 2}
            Q ${handleX + handleWidth} ${handleY + handleHeight}
              ${handleX - 2} ${handleY + handleHeight}
          `}
          fill="none"
          stroke={cupColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
        
        {/* Corpo do copo (fundo) */}
        <rect
          x={cupX}
          y={cupY}
          width={cupWidth}
          height={cupHeight}
          rx="6"
          fill="rgba(255,255,255,0.1)"
          stroke={cupColor}
          strokeWidth="3"
        />
        
        {/* Líquido animado */}
        <g clipPath="url(#cupClip)">
          <motion.rect
            x={liquidX}
            width={liquidWidth}
            rx="3"
            fill="url(#liquidGradient)"
            initial={{ height: 0, y: cupBottom - marginBottom }}
            animate={{
              height: liquidHeight,
              y: cupBottom - marginBottom - liquidHeight,
            }}
            transition={{
              duration: 0.5,
              ease: 'easeOut',
            }}
          />
          
          {/* Ondas no líquido quando enchendo */}
          {flowStarted && clampedPercent > 0 && clampedPercent < 100 && liquidWidth > 20 && (
            <motion.ellipse
              cx={width / 2}
              cy={liquidY + 5}
              rx={Math.max(10, liquidWidth / 2 - 5)}
              ry={3}
              fill={liquidColor}
              opacity={0.6}
              animate={{
                rx: [Math.max(10, liquidWidth / 2 - 5), Math.max(5, liquidWidth / 2 - 10), Math.max(10, liquidWidth / 2 - 5)],
                ry: [3, 5, 3],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
          
          {/* Espuma quando quase cheio */}
          {showFoam && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Camada principal da espuma */}
              <rect
                x={liquidX}
                y={liquidY - foamHeight + 5}
                width={liquidWidth}
                height={foamHeight}
                rx="4"
                fill="url(#foamGradient)"
              />
              
              {/* Bolhas na espuma */}
              {BUBBLE_SIZES.map((bubbleSize, i) => (
                <motion.circle
                  key={i}
                  cx={liquidX + (liquidWidth / 6) * (i + 1)}
                  cy={liquidY - foamHeight / 2 + 5}
                  r={bubbleSize}
                  fill="white"
                  opacity={0.7}
                  animate={{
                    r: [bubbleSize - 0.5, bubbleSize + 0.5, bubbleSize - 0.5],
                    opacity: [0.7, 0.9, 0.7],
                  }}
                  transition={{
                    duration: BUBBLE_DURATIONS[i],
                    repeat: Infinity,
                    delay: BUBBLE_DELAYS[i],
                  }}
                />
              ))}
            </motion.g>
          )}
          
          {/* Bolhas subindo (quando enchendo) */}
          {flowStarted && clampedPercent > 10 && clampedPercent < 100 && (
            <>
              {RISING_BUBBLE_SIZES.map((bubbleR, i) => (
                <motion.circle
                  key={`bubble-${i}`}
                  cx={liquidX + 10 + (i * (liquidWidth - 20) / 5)}
                  r={bubbleR}
                  fill="white"
                  opacity={0.4}
                  initial={{
                    cy: cupBottom - 10,
                  }}
                  animate={{
                    cy: [cupBottom - 10, liquidY + 10],
                    opacity: [0.4, 0],
                  }}
                  transition={{
                    duration: 1.5 + i * 0.3,
                    repeat: Infinity,
                    delay: i * 0.4,
                    ease: 'linear',
                  }}
                />
              ))}
            </>
          )}
        </g>
        
        {/* Brilho do vidro (overlay) */}
        <rect
          x={cupX + 5}
          y={cupY + 5}
          width={cupWidth * 0.25}
          height={cupHeight - 10}
          rx="3"
          fill="url(#glassShine)"
        />
        
        {/* Borda superior do copo (lip) */}
        <rect
          x={cupX - 2}
          y={cupY - 3}
          width={cupWidth + 4}
          height={8}
          rx="4"
          fill={cupColor}
        />
      </svg>
      
      {/* Indicador de volume */}
      {(ml !== undefined || targetMl !== undefined) && (
        <motion.div
          className="mt-2 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="text-2xl font-bold text-amber-600">
            {clampedPercent}%
          </div>
          {ml !== undefined && targetMl !== undefined && (
            <div className="text-sm text-gray-500">
              {ml}ml / {targetMl}ml
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default CupFillAnimation;
