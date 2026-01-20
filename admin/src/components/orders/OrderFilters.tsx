/**
 * ============================================================================
 * Order Filters Component
 * ============================================================================
 * 
 * Barra de filtros para pedidos.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Search, 
  Calendar as CalendarIcon, 
  RefreshCw,
  Filter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OrderFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  selectedDate?: Date;
  onDateChange?: (date: Date | undefined) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function OrderFilters({
  statusFilter,
  onStatusChange,
  searchQuery = "",
  onSearchChange,
  selectedDate,
  onDateChange,
  onRefresh,
  isRefreshing = false,
}: OrderFiltersProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const hasActiveFilters = statusFilter !== 'all' || searchQuery || selectedDate;

  const clearFilters = () => {
    onStatusChange('all');
    onSearchChange?.('');
    onDateChange?.(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      {onSearchChange && (
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Date Picker */}
      {onDateChange && (
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? (
                format(selectedDate, "dd 'de' MMM, yyyy", { locale: ptBR })
              ) : (
                "Filtrar por data"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                onDateChange(date);
                setIsCalendarOpen(false);
              }}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Status Filter */}
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="pending">Pendentes</SelectItem>
          <SelectItem value="processing">Processando</SelectItem>
          <SelectItem value="completed">Concluídos</SelectItem>
          <SelectItem value="cancelled">Cancelados</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}

      {/* Refresh */}
      {onRefresh && (
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      )}
    </div>
  );
}
