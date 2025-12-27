
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Minus, Package, AlertTriangle, Search, Filter, X, Check, ChevronsUpDown } from "lucide-react";
import { ProductWithInventory, InventoryLog } from "@/types/store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

interface InventoryManagerProps {
  products: ProductWithInventory[];
  onUpdateInventory: (productId: string, newStock: number, log: Omit<InventoryLog, 'id' | 'timestamp'>) => void;
}

const InventoryManager = ({ products, onUpdateInventory }: InventoryManagerProps) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductWithInventory | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'ADJUST'>('ADD');
  const [quantity, setQuantity] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in-stock" | "out-of-stock" | "low-stock">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [productSelectOpen, setProductSelectOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  // Filter and search logic
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStockFilter = (() => {
      const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
      const minStock = product.minStock || 5;
      switch (stockFilter) {
        case "in-stock":
          return stock > 0;
        case "out-of-stock":
          return stock === 0;
        case "low-stock":
          return stock > 0 && stock <= minStock;
        default:
          return true;
      }
    })();

    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;

    return matchesSearch && matchesStockFilter && matchesCategory;
  });

  // Get unique categories for filter
  const categories = [...new Set(products.map(p => p.category).filter(cat => cat && cat.trim() !== ""))];

  const handleInventoryUpdate = () => {
    if (!selectedProduct || quantity <= 0) {
      toast({
        title: t('common.error'),
        description: t('inventory.selectProductQuantityError'),
        variant: "destructive"
      });
      return;
    }

    let newStock = selectedProduct.isDrink 
      ? (selectedProduct.totalMlAvailable || 0) 
      : (selectedProduct.stock || 0);
    
    switch (adjustmentType) {
      case 'ADD':
        newStock += quantity;
        break;
      case 'REMOVE':
        newStock = Math.max(0, newStock - quantity);
        break;
      case 'ADJUST':
        newStock = quantity;
        break;
    }

    const log: Omit<InventoryLog, 'id' | 'timestamp'> = {
      productId: selectedProduct.id,
      type: adjustmentType,
      quantity,
      comment: ""
    };

    onUpdateInventory(selectedProduct.id, newStock, log);
    
    toast({
      title: t('common.success'),
      description: t('inventory.inventoryUpdated', { title: selectedProduct.title })
    });

    // Reset form
    setQuantity(0);
    setSelectedProduct(null);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStockFilter("all");
    setCategoryFilter("all");
  };

  const lowStockProducts = products.filter(p => {
    if (!p.minStock) return false; // Só alerta se minStock foi configurado
    const stock = p.isDrink ? (p.totalMlAvailable || 0) : (p.stock || 0);
    return stock > 0 && stock <= p.minStock;
  });
  
  const outOfStockProducts = products.filter(p => {
    const stock = p.isDrink ? (p.totalMlAvailable || 0) : (p.stock || 0);
    return stock === 0;
  });

  return (
    <div className="space-y-6">
      {/* Inventory Adjustment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            {t('inventory.managementTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('inventory.selectProductLabel')}</Label>
            <Popover open={productSelectOpen} onOpenChange={setProductSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={productSelectOpen}
                  className="w-full justify-between"
                >
                  {selectedProduct
                    ? `${selectedProduct.title} (${t('inventory.currentSelection', { stock: selectedProduct.isDrink ? (selectedProduct.totalMlAvailable || 0) : (selectedProduct.stock || 0) })})`
                    : t('inventory.chooseProduct')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder={t('inventory.searchProducts')} />
                  <CommandEmpty>{t('inventory.noProductFound')}</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {filteredProducts.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.title}
                          onSelect={() => {
                            setSelectedProduct(product);
                            setProductSelectOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedProduct?.id === product.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span>{product.title}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                                <span className="text-sm text-gray-500">
                                  {product.isDrink 
                                    ? t('inventory.stockLabelMl', { stock: product.totalMlAvailable || 0 })
                                    : t('inventory.stockLabelUnits', { stock: product.stock || 0 })}
                                </span>
                                {((product.isDrink ? product.totalMlAvailable : product.stock) || 0) === 0 && 
                                  <Badge variant="destructive" className="text-xs">{t('inventory.outOfStockBadge')}</Badge>
                                }
                                {((product.isDrink ? product.totalMlAvailable : product.stock) || 0) <= (product.minStock || 5) && 
                                 ((product.isDrink ? product.totalMlAvailable : product.stock) || 0) > 0 && 
                                  <Badge variant="secondary" className="text-xs">{t('inventory.lowStockBadge')}</Badge>
                                }
                              </div>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedProduct && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={adjustmentType === 'ADD' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('ADD')}
                  className="flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('inventory.add')}
                </Button>
                <Button
                  variant={adjustmentType === 'REMOVE' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('REMOVE')}
                  className="flex items-center"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  {t('inventory.remove')}
                </Button>
                <Button
                  variant={adjustmentType === 'ADJUST' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('ADJUST')}
                >
                  {t('inventory.setTo')}
                </Button>
              </div>

              <div>
                <Label>{t('inventory.quantity')}</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  placeholder={t('inventory.quantityPlaceholder')}
                />
              </div>

              <Button onClick={handleInventoryUpdate} className="w-full">
                {t('inventory.updateInventory')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Alerts Section - Moved Down */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-800">
                <AlertTriangle className="w-5 h-5 mr-2" />
                {t('inventory.lowStockAlertTitle', { count: lowStockProducts.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {lowStockProducts.slice(0, 3).map(product => {
                  const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
                  const unit = product.isDrink ? t('inventory.unitMl') : t('inventory.unitUnits');
                  return (
                    <div key={product.id} className="flex justify-between items-center">
                      <span className="text-orange-700 text-sm">{product.title}</span>
                      <Badge variant="destructive" className="text-xs">{t('inventory.leftLabel', { stock, unit })}</Badge>
                    </div>
                  );
                })}
                {lowStockProducts.length > 3 && (
                  <div className="text-xs text-orange-600">{t('inventory.moreCount', { count: lowStockProducts.length - 3 })}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Out of Stock Alert */}
        {outOfStockProducts.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center text-red-800">
                <AlertTriangle className="w-5 h-5 mr-2" />
                {t('inventory.outOfStockTitle', { count: outOfStockProducts.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {outOfStockProducts.slice(0, 3).map(product => (
                  <div key={product.id} className="flex justify-between items-center">
                    <span className="text-red-700 text-sm">{product.title}</span>
                    <Badge variant="destructive" className="text-xs">{t('inventory.zeroStockLabel', { unit: product.isDrink ? t('inventory.unitMl') : t('inventory.unitUnits') })}</Badge>
                  </div>
                ))}
                {outOfStockProducts.length > 3 && (
                  <div className="text-xs text-red-600">{t('inventory.moreCount', { count: outOfStockProducts.length - 3 })}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Current Inventory */}
      <Card>
        <CardHeader>
          <CardTitle>{t('inventory.currentInventory')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder={t('inventory.searchProducts')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Stock Filter */}
            <Select value={stockFilter} onValueChange={(value: "all" | "in-stock" | "out-of-stock" | "low-stock") => setStockFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.filterByStock')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inventory.allStockLevels')}</SelectItem>
                <SelectItem value="in-stock">{t('inventory.inStock')}</SelectItem>
                <SelectItem value="out-of-stock">{t('inventory.outOfStock')}</SelectItem>
                <SelectItem value="low-stock">{t('inventory.lowStock')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.filterByCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inventory.allCategories')}</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button variant="outline" onClick={clearFilters} className="flex items-center">
              <X className="w-4 h-4 mr-2" />
              {t('inventory.clearFilters')}
            </Button>
          </div>

          {/* Filter Summary */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{t('inventory.showingCount', { shown: filteredProducts.length, total: products.length })}</span>
            {(searchTerm || stockFilter !== "all" || categoryFilter !== "all") && (
              <Badge variant="secondary">{t('inventory.filtered')}</Badge>
            )}
          </div>
        </CardContent>
        <CardContent>
          <div className="space-y-2">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>{t('inventory.noProductsMatch')}</p>
                <Button variant="outline" onClick={clearFilters} className="mt-2">
                  {t('inventory.clearFilters')}
                </Button>
              </div>
            ) : (
              filteredProducts.map(product => (
                <div key={product.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{product.title}</span>
                      <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                    </div>
                    {product.description && (
                      <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={
                        (product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0)) === 0 ? 'destructive' : 
                        (product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0)) <= (product.minStock || 5) ? 'secondary' : 
                        'default'
                      }
                    >
                      {product.isDrink 
                        ? t('inventory.stockInListMl', { stock: product.totalMlAvailable || 0 })
                        : t('inventory.stockInListUnits', { stock: product.stock || 0 })}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryManager;
