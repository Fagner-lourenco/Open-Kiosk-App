/**
 * ============================================================================
 * DrinkCard — Card de bebida estilo "Quadro de Chopes"
 * ============================================================================
 *
 * Card colorido com glow, nº torneira, ABV/IBU, preço dinâmico e CTA.
 * Usado apenas para produtos com isDrink=true.
 * O card inteiro é clicável (kiosk touch-first).
 */

import { useDynamicPrice } from '@/hooks/useDynamicPrice';
import { useTranslation } from '@/i18n';
import type { Product } from '@/types/product';
import { pickAccent } from '@/utils/pickAccent';
import IconMug from '@/components/icons/IconMug';
import IconCartDrink from '@/components/icons/IconCartDrink';

interface DrinkCardProps {
  product: Product;
  currencySymbol: string;
  isEsp32Healthy: boolean;
  onAdd: (product: Product) => void;
  /** When true, the card expands to fill the viewport (single-drink layout) */
  fullScreen?: boolean;
}

function formatPrice(value: number, symbol: string): string {
  return `${symbol}${value.toFixed(2).replace('.', ',')}`;
}

export default function DrinkCard({
  product,
  currencySymbol,
  isEsp32Healthy,
  onAdd,
  fullScreen = false,
}: DrinkCardProps) {
  const { t } = useTranslation();

  // Resolve accent theme
  const accent = pickAccent({
    style: product.style,
    title: product.title,
    accentColor: product.accentColor,
  });

  // Resolve default size & base price
  const defaultSize =
    product.defaultSizeKey
      ? product.sizes?.find((s) => s.key === product.defaultSizeKey)
      : product.sizes?.[0];

  const basePrice = defaultSize?.price ?? product.price;
  const sizeMl = defaultSize?.ml;

  // Dynamic Pricing hook — [FIX BUG-CAT-01] passa kegLevelPercent para regras de barril progressivo
  const dp = useDynamicPrice(basePrice, sizeMl, product.kegLevelPercent);
  const displayPrice = dp.effectivePrice ?? basePrice;

  // Product state
  const isAvailable = (product.totalMlAvailable || 0) > 0;
  const canBuy = !!(isAvailable && isEsp32Healthy);
  const stockMl = product.totalMlAvailable ?? 0;
  const lowStock = stockMl > 0 && stockMl <= 5000;
  const veryLowStock = stockMl > 0 && stockMl <= 2000;
  const stockLabel = veryLowStock
    ? t('shop.lastMl')
    : lowStock
      ? t('shop.lowStockDrink')
      : null;

  // Display data
  const tapNumber =
    product.tapNumber != null
      ? String(product.tapNumber).padStart(2, '0')
      : '—';
  const name = product.title || '';
  const beerStyle = product.style || product.description || t('shop.craftBeer');
  const abv = product.abv;
  const ibu = product.ibu;
  const priceUnitLabel = product.priceUnitLabel || '';
  const imageUrl = product.image || '';
  const description = product.description || '';
  const ctaText = t('shop.getItNow');

  // Chip class — use lighter bg on dark-fg palettes for better contrast
  const infoChipClass = (accent.fg === 'text-black' || accent.fg === 'text-stone-800')
    ? 'bg-black/20 text-black ring-1 ring-black/10'
    : 'bg-white/15 text-white ring-1 ring-white/10';

  const handleClick = () => {
    if (canBuy) onAdd(product);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canBuy) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAdd(product);
    }
  };

  return (
    <div
      className={
        'relative overflow-hidden rounded-3xl ' +
        accent.glow +
        ' ring-1 ring-white/10 ' +
        (canBuy ? 'cursor-pointer hover:ring-white/20 active:scale-[0.98] transition-transform' : '') +
        (fullScreen ? ' flex flex-col' : '')
      }
      role={canBuy ? 'button' : undefined}
      tabIndex={canBuy ? 0 : undefined}
      aria-label={
        canBuy
          ? `${ctaText} - ${name}`
          : !isEsp32Healthy
            ? t('shop.tempUnavailable')
            : isAvailable
              ? name
              : t('shop.unavailable')
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Coloured background with subtle gradient */}
      <div
        className={
          'relative rounded-3xl ' +
          accent.bg +
          ' ' +
          accent.fg +
          (fullScreen ? ' flex flex-col flex-1 min-h-[calc(100dvh-140px)]' : '')
        }
      >
        {/* Subtle darkening overlay (separate div to avoid gradient class conflicts) */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-transparent to-black/10 pointer-events-none" />

        {/* Side accent bar */}
        <div className={'absolute inset-y-0 left-0 w-2 ' + accent.bar} />

        {/* Top-right badges */}
        <div className="absolute right-4 top-4 flex flex-col items-end gap-2 z-10">
          {!isAvailable && (
            <div className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white ring-1 ring-white/10">
              {t('shop.unavailable')}
            </div>
          )}
          {stockLabel && (
            <div className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white ring-1 ring-white/10">
              {stockLabel}
            </div>
          )}
        </div>

        {/* Header: tap number, name, style, ABV, IBU */}
        <div className="relative flex items-start justify-between gap-3 px-4 pt-5">
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-[0.18em] opacity-80">
              {t('shop.tap')}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/20 font-black text-2xl ring-1 ring-black/10">
                {tapNumber}
              </div>
              <div className="min-w-0">
                <div className={'truncate font-black leading-tight ' + (fullScreen ? 'text-2xl' : 'text-lg')}>
                  {name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-black/10 ' +
                      accent.chip
                    }
                  >
                    {beerStyle}
                  </span>
                  {abv != null && (
                    <span className={'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' + infoChipClass}>
                      {String(abv).replace('.', ',')}% ABV
                    </span>
                  )}
                  {ibu != null && (
                    <span className={'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' + infoChipClass}>
                      {ibu} IBU
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stock ml badge */}
          {stockMl > 0 && (
            <div className="shrink-0 rounded-full bg-black/20 px-3 py-2 text-xs font-extrabold ring-1 ring-black/10">
              {Number(stockMl).toLocaleString()}ml
            </div>
          )}
        </div>

        {/* Description (shown in fullscreen for richer info) */}
        {fullScreen && description && description !== beerStyle && (
          <div className="relative px-4 pt-3">
            <p className={'text-sm font-medium opacity-90 line-clamp-2 ' + (fullScreen ? 'max-w-lg' : '')}>
              {description}
            </p>
          </div>
        )}

        {/* Size options summary (fullscreen only) */}
        {fullScreen && product.sizes && product.sizes.length > 0 && (
          <div className="relative px-4 pt-3 flex flex-wrap gap-2">
            {product.sizes.map((size) => (
              <div
                key={size.key}
                className={'rounded-xl px-3 py-1.5 text-xs font-bold ' + infoChipClass}
              >
                {size.label} · {size.ml}ml · {formatPrice(size.price, currencySymbol)}
              </div>
            ))}
          </div>
        )}

        {/* Image / Placeholder */}
        <div className={'relative px-4 pt-3' + (fullScreen ? ' flex-1 flex flex-col' : '')}>
          <div
            className={
              'relative overflow-hidden rounded-2xl bg-black/12 ring-1 ring-black/10 ' +
              (fullScreen ? 'flex-1 min-h-[240px]' : 'h-44')
            }
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full">
                {/* Background texture */}
                <div
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 20% 10%, rgba(0,0,0,.40), transparent 45%), radial-gradient(circle at 80% 30%, rgba(255,255,255,.45), transparent 55%)',
                  }}
                />
                {/* Watermark name */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className={'font-black tracking-tight opacity-10 ' + (fullScreen ? 'text-5xl' : 'text-3xl')}>
                      {name}
                    </div>
                    <div className="mt-1 text-xs font-extrabold uppercase tracking-[0.18em] opacity-10">
                      {beerStyle}
                    </div>
                  </div>
                </div>
                {/* Mug icon */}
                <div className="relative grid h-full w-full place-items-center">
                  <IconMug size={fullScreen ? 96 : 68} className={'opacity-70 ' + accent.fg} />
                </div>
              </div>
            )}
            {/* Bottom gradient overlay on image */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        </div>

        {/* Footer: price bar + CTA */}
        <div className="relative mt-1 px-4 pb-4">
          <div className="flex items-end justify-between gap-3 rounded-2xl bg-black/70 px-4 py-3 ring-1 ring-white/10">
            <div className="text-white">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/70">
                {t('shop.value')}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                {dp.isModified && (
                  <span className="text-sm font-bold text-white/50 line-through">
                    {formatPrice(basePrice, currencySymbol)}
                  </span>
                )}
                <div className={'font-black text-white ' + (fullScreen ? 'text-3xl' : 'text-2xl')}>
                  {formatPrice(displayPrice, currencySymbol)}
                </div>
                {dp.isModified && dp.deltaPercent < 0 && (
                  <span className="text-xs font-bold text-green-400">
                    {dp.deltaPercent.toFixed(0)}%
                  </span>
                )}
                {priceUnitLabel && (
                  <div className="text-sm font-bold text-white/70">
                    {priceUnitLabel}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={!canBuy}
              onClick={(e) => {
                e.stopPropagation();
                if (canBuy) onAdd(product);
              }}
              className={
                'inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ' +
                (fullScreen ? 'h-14 text-base ' : 'h-12 ') +
                (canBuy
                  ? 'bg-white text-black hover:bg-white/90 active:bg-white/80'
                  : 'bg-white/10 text-white/55 cursor-not-allowed')
              }
              aria-label={
                canBuy
                  ? `${ctaText} ${name}`
                  : !isEsp32Healthy
                    ? t('shop.tempUnavailable')
                    : t('shop.unavailable')
              }
            >
              <IconCartDrink size={fullScreen ? 20 : 16} />
              {canBuy ? ctaText : t('shop.unavailable')}
            </button>
          </div>
        </div>

        {/* Overlay: ESP32 offline (blocks entire card) */}
        {!isEsp32Healthy && isAvailable && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/45">
            <div className="max-w-[85%] rounded-2xl bg-black/85 px-5 py-4 text-center text-white ring-1 ring-white/15">
              <div className="text-sm font-black uppercase tracking-[0.12em]">
                {t('shop.tempUnavailable')}
              </div>
              <div className="mt-1 text-xs font-semibold text-white/80">
                {t('shop.checkConnection')}
              </div>
              <div className="mt-3 text-[11px] font-bold text-white/70">
                {t('shop.salesBlocked')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
