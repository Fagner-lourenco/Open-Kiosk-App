/**
 * ============================================================================
 * DateRangePicker Component
 * ============================================================================
 *
 * Seletor de intervalo de datas reutilizável.
 * Usa Calendar (react-day-picker) + Popover (Radix) + date-fns.
 * Presets: Hoje, 7d, 30d, Mês atual, Mês passado, Trimestre, Ano.
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import * as React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ============================================================================
// PRESETS
// ============================================================================

export interface DatePreset {
  label: string;
  range: () => DateRange;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Hoje',
    range: () => {
      const today = new Date();
      return { from: startOfDay(today), to: endOfDay(today) };
    },
  },
  {
    label: 'Últimos 7 dias',
    range: () => {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(today) };
    },
  },
  {
    label: 'Últimos 30 dias',
    range: () => {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(today) };
    },
  },
  {
    label: 'Mês atual',
    range: () => {
      const today = new Date();
      return {
        from: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: endOfDay(today),
      };
    },
  },
  {
    label: 'Mês passado',
    range: () => {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0); // last day prev month
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    label: 'Trimestre',
    range: () => {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 89);
      return { from: startOfDay(from), to: endOfDay(today) };
    },
  },
  {
    label: 'Ano',
    range: () => {
      const today = new Date();
      return {
        from: startOfDay(new Date(today.getFullYear(), 0, 1)),
        to: endOfDay(today),
      };
    },
  },
];

// ============================================================================
// PROPS
// ============================================================================

export interface DateRangePickerProps {
  /** Intervalo selecionado */
  value?: DateRange;
  /** Callback quando o intervalo muda */
  onChange: (range: DateRange | undefined) => void;
  /** Placeholder quando nenhum intervalo está selecionado */
  placeholder?: string;
  /** Classes extras no trigger button */
  className?: string;
  /** Desabilitar o componente */
  disabled?: boolean;
  /** Exibir presets ao lado do calendário */
  showPresets?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Selecione o período',
  className,
  disabled = false,
  showPresets = true,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const handlePreset = (preset: DatePreset) => {
    onChange(preset.range());
    setOpen(false);
  };

  const label = React.useMemo(() => {
    if (!value?.from) return placeholder;
    if (!value.to) return format(value.from, "dd 'de' MMM, yyyy", { locale: ptBR });
    return `${format(value.from, 'dd/MM/yyyy', { locale: ptBR })} — ${format(value.to, 'dd/MM/yyyy', { locale: ptBR })}`;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !value?.from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {showPresets && (
            <div className="border-r p-2 space-y-1 min-w-[140px]">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                Atalhos
              </p>
              {DATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            locale={ptBR}
            defaultMonth={value?.from}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
