/**
 * ============================================================================
 * Store Inventory Tab Component
 * ============================================================================
 * 
 * Componente completo para gerenciar inventário de uma loja específica.
 * Inclui busca, filtros, grid de produtos e histórico de movimentações.
 * Baseado no InventoryManager do Kiosk App.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, getDocs, doc, writeBatch, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Package, 
  AlertTriangle, 
  Plus, 
  Minus, 
  History, 
  Loader2, 
  TrendingDown, 
  TrendingUp,
  Search,
  Filter,
  X,
  Check,
  ChevronsUpDown,
  GlassWater
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  title: string;
  category: string;
  description?: string;
  stock?: number;
  minStock?: number;
  isDrink?: boolean;
  totalMlAvailable?: number;
}

interface InventoryLog {
  id: string;
  productId: string;
  productTitle: string;
  type: 'ADD' | 'REMOVE' | 'ADJUST';
  quantity: number;
  previousStock: number;
  newStock: number;
  userId: string;
  userEmail: string;
  timestamp: Timestamp;
  comment?: string;
}

interface StoreInventoryTabProps {
  franchiseId: string;
  storeId: string;
}

export function StoreInventoryTab({ franchiseId, storeId }: StoreInventoryTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Form state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'ADJUST'>('ADD');
  const [quantity, setQuantity] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [productSelectOpen, setProductSelectOpen] = useState(false);
  
  // Filter state (grid)
  const [searchTerm, setSearchTerm] = useState('');
  // Separate search for product selector dropdown
  const [selectorSearch, setSelectorSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'out-of-stock' | 'low-stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['store-products', franchiseId, storeId],
    queryFn: async (): Promise<Product[]> => {
      const productsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'products');
      const snapshot = await getDocs(query(productsRef));
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];
    },
  });

  // Fetch inventory logs
  const { data: inventoryLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['inventory-logs', franchiseId, storeId],
    queryFn: async (): Promise<InventoryLog[]> => {
      const logsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'inventoryLogs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(20));
      const snapshot = await getDocs(logsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as InventoryLog[];
    },
  });

  // Update inventory mutation
  const updateInventoryMutation = useMutation({
    mutationFn: async ({ productId, newStock, log }: { 
      productId: string; 
      newStock: number; 
      log: Omit<InventoryLog, 'id' | 'timestamp'>;
    }) => {
      const product = products.find(p => p.id === productId);
      if (!product) throw new Error('Produto não encontrado');

      const productRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'products', productId);
      const logsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'inventoryLogs');

      // Update product stock
      // [FIX BUG-CAT-02] Incluir inStock e updatedAt no batch
      const updateData = product.isDrink 
        ? { totalMlAvailable: newStock, inStock: newStock > 0, updatedAt: Timestamp.now() }
        : { stock: newStock, inStock: newStock > 0, updatedAt: Timestamp.now() };
      
      // Usa batch para garantir atomicidade
      const batch = writeBatch(db);
      
      // Atualiza estoque do produto
      batch.update(productRef, updateData);
      
      // Cria log de movimentação
      const logRef = doc(logsRef);
      batch.set(logRef, {
        ...log,
        timestamp: Timestamp.now(),
      });
      
      // Executa ambas operações atomicamente
      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-products', franchiseId, storeId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-logs', franchiseId, storeId] });
      toast.success('Estoque atualizado com sucesso');
      // Reset form
      setQuantity(0);
      setComment('');
    },
    onError: () => {
      toast.error('Não foi possível atualizar o inventário');
    },
  });

  const handleUpdateInventory = () => {
    const product = products.find(p => p.id === selectedProductId);
    // ADJUST permite 0 (zerar estoque); ADD/REMOVE precisam de quantidade > 0
    const isInvalidQuantity = adjustmentType === 'ADJUST' ? quantity < 0 : quantity <= 0;
    if (!product || isInvalidQuantity) {
      toast.warning('Selecione um produto e informe a quantidade');
      return;
    }

    const currentStock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
    let newStock = currentStock;

    switch (adjustmentType) {
      case 'ADD':
        newStock = currentStock + quantity;
        break;
      case 'REMOVE':
        newStock = Math.max(0, currentStock - quantity);
        break;
      case 'ADJUST':
        newStock = quantity;
        break;
    }

    updateInventoryMutation.mutate({
      productId: selectedProductId,
      newStock,
      log: {
        productId: product.id,
        productTitle: product.title,
        type: adjustmentType,
        // [FIX BUG-CAT-07] Registrar quantidade efetivamente removida, não a tentada
        quantity: adjustmentType === 'REMOVE' ? Math.min(quantity, currentStock) : quantity,
        previousStock: currentStock,
        newStock,
        userId: user?.uid || '',
        userEmail: user?.email || '',
        comment,
      },
    });
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Get unique categories for filter
  const categories = [...new Set(products.map(p => p.category).filter(cat => cat && cat.trim() !== ''))];

  // Filter products for grid view
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
    const minStock = product.minStock || 5;
    
    const matchesStockFilter = (() => {
      switch (stockFilter) {
        case 'in-stock': return stock > 0;
        case 'out-of-stock': return stock === 0;
        case 'low-stock': return stock > 0 && stock <= minStock;
        default: return true;
      }
    })();

    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;

    return matchesSearch && matchesStockFilter && matchesCategory;
  });

  // Separate filtered list for the product selector dropdown (only uses selectorSearch)
  const selectorFilteredProducts = products.filter(product => {
    if (!selectorSearch) return true;
    const term = selectorSearch.toLowerCase();
    return (
      product.title.toLowerCase().includes(term) ||
      product.description?.toLowerCase().includes(term) ||
      product.category?.toLowerCase().includes(term)
    );
  });

  const clearFilters = () => {
    setSearchTerm('');
    setSelectorSearch('');
    setStockFilter('all');
    setCategoryFilter('all');
  };

  // Calcular alertas
  const lowStockProducts = products.filter(p => {
    const stock = p.isDrink ? (p.totalMlAvailable || 0) : (p.stock || 0);
    const minStock = p.minStock || 5;
    return stock > 0 && stock <= minStock;
  });

  const outOfStockProducts = products.filter(p => {
    const stock = p.isDrink ? (p.totalMlAvailable || 0) : (p.stock || 0);
    return stock === 0;
  });

  const isLoading = loadingProducts || loadingLogs;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outOfStockProducts.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-700 flex items-center text-base">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Sem Estoque ({outOfStockProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-red-600 space-y-1">
                  {outOfStockProducts.slice(0, 5).map(p => (
                    <li key={p.id}>• {p.title}</li>
                  ))}
                  {outOfStockProducts.length > 5 && (
                    <li className="text-red-500">... e mais {outOfStockProducts.length - 5}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {lowStockProducts.length > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-yellow-700 flex items-center text-base">
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Estoque Baixo ({lowStockProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-yellow-600 space-y-1">
                  {lowStockProducts.slice(0, 5).map(p => (
                    <li key={p.id}>
                      • {p.title} ({p.isDrink ? `${p.totalMlAvailable}ml` : `${p.stock} un.`})
                    </li>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <li className="text-yellow-500">... e mais {lowStockProducts.length - 5}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Inventory Adjustment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Ajuste de Inventário
          </CardTitle>
          <CardDescription>
            Selecione um produto e ajuste a quantidade em estoque
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Product Select with Search */}
            <div className="md:col-span-2">
              <Label>Produto</Label>
              <DropdownMenu open={productSelectOpen} onOpenChange={setProductSelectOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    {selectedProduct ? (
                      <span className="flex items-center gap-2 truncate">
                        {selectedProduct.isDrink && <GlassWater className="h-4 w-4 text-blue-500 shrink-0" />}
                        <span className="truncate">{selectedProduct.title}</span>
                        <Badge variant="outline" className="ml-auto shrink-0">
                          {selectedProduct.isDrink 
                            ? `${selectedProduct.totalMlAvailable || 0}ml`
                            : `${selectedProduct.stock || 0} un.`}
                        </Badge>
                      </span>
                    ) : (
                      'Selecione um produto...'
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[min(400px,calc(100vw-2rem))]" align="start">
                  <div className="p-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar produto..."
                        value={selectorSearch}
                        onChange={(e) => setSelectorSearch(e.target.value)}
                        className="pl-8 h-8"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto">
                    <DropdownMenuGroup>
                      {selectorFilteredProducts.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Nenhum produto encontrado
                        </div>
                      ) : (
                        selectorFilteredProducts.map((product) => {
                          const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
                          const minStock = product.minStock || 5;
                          const isOutOfStock = stock === 0;
                          const isLowStock = stock > 0 && stock <= minStock;
                          
                          return (
                            <DropdownMenuItem
                              key={product.id}
                              onClick={() => {
                                setSelectedProductId(product.id);
                                setProductSelectOpen(false);
                              }}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0",
                                    selectedProductId === product.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {product.isDrink && <GlassWater className="h-4 w-4 text-blue-500 shrink-0" />}
                                <span className="truncate">{product.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <Badge variant="secondary" className="text-xs">
                                  {product.category || 'Sem categoria'}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {product.isDrink ? `${stock}ml` : `${stock} un.`}
                                </span>
                                {isOutOfStock && (
                                  <Badge variant="destructive" className="text-xs">Sem estoque</Badge>
                                )}
                                {isLowStock && (
                                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">Baixo</Badge>
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })
                      )}
                    </DropdownMenuGroup>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Adjustment Type */}
            <div>
              <Label>Tipo</Label>
              <Select value={adjustmentType} onValueChange={(v: 'ADD' | 'REMOVE' | 'ADJUST') => setAdjustmentType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADD">
                    <div className="flex items-center">
                      <Plus className="h-4 w-4 mr-2 text-green-600" />
                      Adicionar
                    </div>
                  </SelectItem>
                  <SelectItem value="REMOVE">
                    <div className="flex items-center">
                      <Minus className="h-4 w-4 mr-2 text-red-600" />
                      Remover
                    </div>
                  </SelectItem>
                  <SelectItem value="ADJUST">
                    <div className="flex items-center">
                      <TrendingUp className="h-4 w-4 mr-2 text-blue-600" />
                      Definir
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>

          {/* Comment */}
          <div className="mt-4">
            <Label>Observação (opcional)</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ex: Reposição de estoque, devolução..."
            />
          </div>

          {/* Preview */}
          {selectedProduct && quantity > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>{selectedProduct.title}:</strong>{' '}
                {(() => {
                  const current = selectedProduct.isDrink 
                    ? (selectedProduct.totalMlAvailable || 0) 
                    : (selectedProduct.stock || 0);
                  const unit = selectedProduct.isDrink ? 'ml' : 'un.';
                  
                  switch (adjustmentType) {
                    case 'ADD':
                      return `${current}${unit} + ${quantity}${unit} = ${current + quantity}${unit}`;
                    case 'REMOVE':
                      return `${current}${unit} - ${quantity}${unit} = ${Math.max(0, current - quantity)}${unit}`;
                    case 'ADJUST':
                      return `${current}${unit} → ${quantity}${unit}`;
                  }
                })()}
              </p>
            </div>
          )}

          <Button
            className="mt-4"
            onClick={handleUpdateInventory}
            disabled={!selectedProductId || (adjustmentType === 'ADJUST' ? quantity < 0 : quantity <= 0) || updateInventoryMutation.isPending}
          >
            {updateInventoryMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Package className="h-4 w-4 mr-2" />
            )}
            Atualizar Estoque
          </Button>
        </CardContent>
      </Card>

      {/* Inventory History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="h-5 w-5 mr-2" />
            Histórico de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inventoryLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma movimentação registrada
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Anterior</TableHead>
                  <TableHead>Novo</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.productTitle}</TableCell>
                    <TableCell>
                      <Badge variant={
                        log.type === 'ADD' ? 'default' : 
                        log.type === 'REMOVE' ? 'destructive' : 'secondary'
                      }>
                        {log.type === 'ADD' ? 'Adição' : log.type === 'REMOVE' ? 'Remoção' : 'Ajuste'}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.quantity}</TableCell>
                    <TableCell>{log.previousStock}</TableCell>
                    <TableCell>{log.newStock}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.userEmail}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.timestamp?.toDate().toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Inventory Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Inventário Atual
          </CardTitle>
          <CardDescription>
            Visão geral do estoque de todos os produtos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Stock Filter */}
            <Select value={stockFilter} onValueChange={(v: typeof stockFilter) => setStockFilter(v)}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar estoque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                <SelectItem value="in-stock">Em estoque</SelectItem>
                <SelectItem value="out-of-stock">Sem estoque</SelectItem>
                <SelectItem value="low-stock">Estoque baixo</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button 
              variant="outline" 
              onClick={clearFilters}
              disabled={!searchTerm && stockFilter === 'all' && categoryFilter === 'all'}
            >
              <X className="h-4 w-4 mr-2" />
              Limpar Filtros
            </Button>
          </div>

          {/* Filter Summary */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Exibindo {filteredProducts.length} de {products.length} produtos</span>
            {(searchTerm || stockFilter !== 'all' || categoryFilter !== 'all') && (
              <Badge variant="secondary">Filtrado</Badge>
            )}
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>Nenhum produto corresponde aos filtros</p>
              <Button variant="outline" onClick={clearFilters} className="mt-2">
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map(product => {
                const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
                const minStock = product.minStock || 5;
                const isOutOfStock = stock === 0;
                const isLowStock = stock > 0 && stock <= minStock;
                
                return (
                  <div 
                    key={product.id} 
                    className={cn(
                      "flex justify-between items-center p-3 border rounded-lg hover:bg-muted transition-colors cursor-pointer",
                      selectedProductId === product.id && "ring-2 ring-primary bg-muted"
                    )}
                    onClick={() => setSelectedProductId(product.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {product.isDrink && <GlassWater className="h-4 w-4 text-blue-500 shrink-0" />}
                        <span className="font-medium truncate">{product.title}</span>
                        <Badge variant="secondary" className="text-xs shrink-0">{product.category || 'Sem categoria'}</Badge>
                      </div>
                      {product.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{product.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Badge 
                        variant={isOutOfStock ? 'destructive' : isLowStock ? 'secondary' : 'default'}
                        className={cn(
                          isLowStock && !isOutOfStock && 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        )}
                      >
                        {product.isDrink ? `${stock.toLocaleString()} ml` : `${stock} un.`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
