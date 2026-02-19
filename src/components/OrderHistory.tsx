/**
 * OrderHistory - Histórico de pedidos com opção de reimprimir recibos
 * 
 * NOTA: Este componente usa esp32Printer APENAS para IMPRESSÃO TÉRMICA,
 * não para dispensação de bebidas. O uso do esp32Printer aqui é apropriado
 * pois impressora térmica pode ser um dispositivo separado do dispensador.
 */

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { esp32Printer } from "@/services/esp32PrinterService";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { getStoreCollection, getCurrentStoreId } from "@/services/firebase";
import { getDocs, orderBy, query } from "firebase/firestore";
import { Product } from "@/types/product";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Eye } from "lucide-react";
import { pdfReceiptService } from "@/services/pdfReceiptService";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useTranslation } from "@/i18n";
import { STORE_CHANGED_EVENT } from "@/context/StoreContext";

interface SaleRecord {
  id: string;
  orderNumber: string;
  items: Array<{
    productId: string;
    title: string;
    price: number;
    quantity: number;
    total: number;
    image?: string;
    sizeKey?: string;
    sizeLabel?: string;
    mlPerUnit?: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  timestamp: Date | { seconds: number; nanoseconds: number; };
  date: string;
}

const parseTimestamp = (ts: any): string => {
  if (!ts) return "";
  if (typeof ts === "string") return ts;
  if ("seconds" in ts) {
    return new Date(ts.seconds * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }
  return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const parseDate = (ts: any): string => {
  if (!ts) return "";
  if (typeof ts === "string") return ts.split("T")[0];
  if ("seconds" in ts) {
    const d = new Date(ts.seconds * 1000);
    return format(d, "yyyy-MM-dd");
  }
  const d = new Date(ts);
  return format(d, "yyyy-MM-dd");
};

const OrderHistory = () => {
  const [orders, setOrders] = useState<SaleRecord[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<SaleRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const { settings } = useStoreSettings();
  const { currentCurrency } = useSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Símbolo da moeda baseado nas configurações
  const currencySymbol = currentCurrency?.symbol || 'R$';

  // Ref para evitar updates em componente desmontado
  const isMountedRef = useRef(true);

  const fetchOrders = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const storeId = getCurrentStoreId();
      // Usar 'orders' para compatibilidade com Admin
      const salesCollection = getStoreCollection(storeId, 'orders');
      const q = query(salesCollection, orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const records: SaleRecord[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        records.push({
          ...data,
          id: doc.id
        } as SaleRecord);
      });
      if (isMountedRef.current) {
        setOrders(records);
      }
    } catch (e) {
      if (isMountedRef.current) {
        toast({ title: t('common.error'), description: t('orders.fetchError'), variant: "destructive" });
      }
    }
    if (isMountedRef.current) {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchOrders();

    // Listen for store changes to refetch orders
    const handleStoreChange = () => {
      fetchOrders();
    };
    window.addEventListener(STORE_CHANGED_EVENT, handleStoreChange);
    
    return () => {
      isMountedRef.current = false;
      window.removeEventListener(STORE_CHANGED_EVENT, handleStoreChange);
    };
    // fetchOrders é definido acima e é estável
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setFilteredOrders(orders);
    } else {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      setFilteredOrders(
        orders.filter(o => parseDate(o.timestamp) === dateStr)
      );
    }
  }, [orders, selectedDate]);

  const handleReprint = async (order: SaleRecord) => {
    if (!settings) {
      toast({
        title: t('common.error'),
        description: t('orders.storeSettingsNotFound'),
        variant: "destructive"
      });
      return;
    }

    setPrintingOrderId(order.id);
    
    try {
      // Convert order items to CartItem format
      const fullCartItems = order.items.map(item => ({
        product: {
          id: item.productId,
          title: item.title,
          price: item.price,
          description: "",
          image: item.image,
          tags: [],
          inStock: true,
          category: "",
          isDrink: !!item.sizeKey,
        } as Product,
        quantity: item.quantity,
        unitPrice: item.price,
        sizeKey: item.sizeKey,
        sizeLabel: item.sizeLabel,
        mlPerUnit: item.mlPerUnit,
      }));

      // Check thermal printer setting
      if (settings.useThermalPrinter && settings.comPort) {
        // Use thermal printer
        const printData = esp32Printer.generatePrintData(fullCartItems, settings, order.orderNumber);
        
        if (!esp32Printer.isConnected()) {
          const connected = await esp32Printer.connectToComPort(settings.comPort);
          if (!connected) {
            throw new Error(`Failed to connect to COM port ${settings.comPort}`);
          }
        }
        
        const result = await esp32Printer.sendPrintData(printData);
        
        if (result.success) {
          toast({ 
            title: t('common.success'), 
            description: t('orders.reprintSuccess')
          });
        } else {
          toast({ 
            title: t('orders.printError'), 
            description: result.message, 
            variant: "destructive" 
          });
        }
      } else {
        // Use PDF printer
        pdfReceiptService.generateReceiptPDF(fullCartItems, settings, order.orderNumber);
        toast({ 
          title: t('common.success'), 
          description: t('orders.pdfSuccess')
        });
      }
    } catch (error) {
      console.error('Reprint error:', error);
      const errorMessage = settings?.useThermalPrinter 
        ? t('orders.reprintError')
        : t('orders.pdfError');
      toast({ 
        title: t('orders.printError'), 
        description: errorMessage, 
        variant: "destructive" 
      });
    } finally {
      setPrintingOrderId(null);
    }
  };

  const toggleOrderDetails = (orderId: string) => {
    setSelectedOrder(selectedOrder === orderId ? null : orderId);
  };

  return (
    <div className="flex gap-6">
      {/* Left side - Order list */}
      <div className="w-80 flex-shrink-0">
        <h2 className="text-lg font-semibold mb-4">{t('orders.title')}</h2>
        
        {/* Date filter */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{t('orders.filterByDate')}</span>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className="w-[160px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : <span>{t('orders.pickDate')}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setCalendarOpen(false);
                }}
                className="p-3 pointer-events-auto"
                fromYear={2023}
                toYear={new Date().getFullYear()}
              />
            </PopoverContent>
          </Popover>
        </div>

        {loading && <div>{t('orders.loading')}</div>}

        <div className="flex flex-col gap-2">
          {filteredOrders.length === 0 && (
            <div className="text-muted-foreground text-sm p-6">{t('orders.noOrders')}</div>
          )}
          {filteredOrders.map((o) => (
            <Card 
              key={o.id} 
              className={`cursor-pointer transition-colors ${
                selectedOrder === o.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => toggleOrderDetails(o.id)}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="font-medium">#{o.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">{parseTimestamp(o.timestamp)}</div>
                    <div className="text-xs">{currencySymbol}{o.total.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReprint(o);
                      }}
                      disabled={printingOrderId === o.id}
                    >
                      {printingOrderId === o.id ? (
                        <span className="flex items-center">
                          <svg className="animate-spin mr-2 h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 110 16 8 8 0 01-8-8z"/>
                          </svg>
                          {t('orders.printing')}
                        </span>
                      ) : t('orders.reprint')}
                    </Button>
                    <Eye className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Right side - Order details */}
      <div className="flex-1">
        {selectedOrder ? (
          (() => {
            const order = filteredOrders.find(o => o.id === selectedOrder);
            if (!order) return null;
            
            return (
              <Card>
                <CardContent className="p-6">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold">{t('orders.orderNumber', { number: order.orderNumber })}</h3>
                    <p className="text-sm text-muted-foreground">{parseTimestamp(order.timestamp)}</p>
                    <p className="text-xs text-muted-foreground">{t('orders.databaseId', { id: order.id })}</p>
                  </div>
                  
                  <Separator className="mb-4" />
                  
                  <div className="space-y-3">
                    <h4 className="font-medium">{t('orders.orderItems')}</h4>
                    {order.items.map((item, index) => (
                      <div key={index} className="flex gap-4 py-3 border-b">
                        <div className="flex-shrink-0 w-16 h-16">
                          {item.image ? (
                            <AspectRatio ratio={1} className="w-full">
                              <img
                                src={item.image}
                                alt={item.title}
                                className="w-full h-full object-cover rounded-lg bg-gray-100"
                              />
                            </AspectRatio>
                          ) : (
                            <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
                              <span className="text-gray-400 text-xs">{t('orders.noImage')}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex justify-between items-center">
                          <div>
                            <div className="font-medium">{item.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {currencySymbol}{item.price.toFixed(2)} × {item.quantity}
                            </div>
                          </div>
                          <div className="font-medium">{currencySymbol}{item.total.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>{t('orders.subtotal')}</span>
                      <span>{currencySymbol}{order.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('orders.tax')}</span>
                      <span>{currencySymbol}{order.tax.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                      <span>{t('orders.total')}</span>
                      <span>{currencySymbol}{order.total.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 text-xs text-muted-foreground">
                    {t('orders.date', { date: order.date || parseDate(order.timestamp) })}
                  </div>
                </CardContent>
              </Card>
            );
          })()
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>{t('orders.clickToViewDetails')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
