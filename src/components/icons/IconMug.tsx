/**
 * IconMug — SVG de caneca de chopp para placeholder do DrinkCard
 */

interface IconMugProps {
  size?: number;
  className?: string;
}

export default function IconMug({ size = 64, className = '' }: IconMugProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M18 22h26v28a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V22Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M20 22h22v28a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V22Z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
      />
      <path
        d="M42 28h6a6 6 0 0 1 0 12h-6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
      />
      <path
        d="M24 18c.6-2.2 2.7-4.5 6-4.5 2.4 0 3.6 1.1 4.8 2 1.2.9 2.4 1.5 4.6 1.5 2.8 0 4.8-1.2 5.6-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path d="M22 36h18" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M22 42h18" stroke="currentColor" strokeWidth="2" opacity="0.25" />
    </svg>
  );
}
