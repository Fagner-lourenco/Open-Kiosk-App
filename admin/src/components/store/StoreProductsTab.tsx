/**
 * ============================================================================
 * Store Products Tab Component - Inventário de Produtos
 * ============================================================================
 * 
 * Componente completo para gerenciar produtos de uma loja.
 * Baseado no AdminProducts do Kiosk App com todas as funcionalidades.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, getDocs, doc, deleteDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Edit, 
  Trash2, 
  Package, 
  Search, 
  Filter, 
  Loader2, 
  Plus,
  GlassWater
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ProductForm, Product } from './ProductForm';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

const INITIAL_LOAD_LIMIT = 50;

interface StoreProductsTabProps {
  franchiseId: string;
  storeId: string;
}

export function StoreProductsTab({ franchiseId, storeId }: StoreProductsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'out-of-stock' | 'low-stock'>('all');
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LOAD_LIMIT);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['store-products', franchiseId, storeId],
    queryFn: async (): Promise<Product[]> => {
      const productsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'products');
      const snapshot = await getDocs(query(productsRef));
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          price: data.price || 0,
          category: data.category || '',
          image: data.image,
          stock: data.stock || 0,
          minStock: data.minStock || 5,
          isDrink: data.isDrink || false,
          sizes: data.sizes,
          defaultSizeKey: data.defaultSizeKey,
          totalMlAvailable: data.totalMlAvailable || 0,
          tags: data.tags || [],
          active: data.active !== false,
          inStock: data.isDrink 
            ? (data.totalMlAvailable || 0) > 0 
            : (data.stock || 0) > 0,
        } as Product;
      });
    },
  });

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (productData: Omit<Product, 'id'>) => {
      const productsRef = collection(db, 'franchises', franchiseId, 'stores', storeId, 'products');
      const sanitizedProduct = sanitizeFirestoreData(productData) as typeof productData;
      await addDoc(productsRef, {
        ...sanitizedProduct,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-products', franchiseId, storeId] });
      toast.success('Produto criado com sucesso!');
      setShowCreateDialog(false);
    },
    onError: () => {
      toast.error('Não foi possível criar o produto');
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...productData }: Product) => {
      const productRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'products', id);
      const sanitizedProduct = sanitizeFirestoreData(productData) as typeof productData;
      await updateDoc(productRef, {
        ...sanitizedProduct,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-products', franchiseId, storeId] });
      toast.success('Produto atualizado com sucesso!');
      setEditingProduct(null);
    },
    onError: () => {
      toast.error('Não foi possível atualizar o produto');
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      await deleteDoc(doc(db, 'franchises', franchiseId, 'stores', storeId, 'products', productId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-products', franchiseId, storeId] });
      toast.success('Produto excluído com sucesso');
      setProductToDelete(null);
    },
    onError: () => {
      toast.error('Não foi possível excluir o produto');
    },
  });

  // Handlers
  const handleCreate = (productData: Omit<Product, 'id'>) => {
    createProductMutation.mutate(productData);
  };

  const handleUpdate = (productData: Omit<Product, 'id'>) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, ...productData });
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
  };

  const loadMore = () => {
    setDisplayLimit(prev => prev + 50);
  };

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

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

    return matchesSearch && matchesStockFilter;
  });

  const displayedProducts = filteredProducts.slice(0, displayLimit);
  const hasMoreProducts = displayLimit < filteredProducts.length;

  const getStockBadge = (product: Product) => {
    const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
    const minStock = product.minStock || 5;
    
    if (stock === 0) return <Badge variant="destructive">Sem estoque</Badge>;
    if (stock <= minStock) return <Badge variant="secondary">Estoque baixo</Badge>;
    return <Badge variant="default">Em estoque</Badge>;
  };

  const getStockText = (product: Product) => {
    if (product.isDrink) {
      return `${product.totalMlAvailable?.toLocaleString() || 0} ml`;
    }
    return `${product.stock || 0} un.`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Inventário de Produtos</h3>
          <Badge variant="outline">
            {filteredProducts.length} de {products.length} produtos
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>

          {/* Filter */}
          <Select value={stockFilter} onValueChange={(v: typeof stockFilter) => setStockFilter(v)}>
            <SelectTrigger className="w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="in-stock">Em estoque</SelectItem>
              <SelectItem value="out-of-stock">Sem estoque</SelectItem>
              <SelectItem value="low-stock">Estoque baixo</SelectItem>
            </SelectContent>
          </Select>

          {/* Add Product Button */}
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || stockFilter !== 'all' 
                ? 'Nenhum produto encontrado'
                : 'Nenhum produto cadastrado'}
            </h4>
            <p className="text-gray-500 mb-4">
              {searchTerm || stockFilter !== 'all'
                ? 'Tente ajustar os filtros de busca.'
                : 'Adicione o primeiro produto da loja.'}
            </p>
            {!searchTerm && stockFilter === 'all' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Produto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedProducts.map((product) => (
              <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
                {product.image && (
                  <div className="h-32 bg-gray-100 relative">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                    {product.isDrink && (
                      <div className="absolute top-2 right-2 p-1.5 bg-blue-500 rounded-full">
                        <GlassWater className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                )}
                {!product.image && product.isDrink && (
                  <div className="h-32 bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                    <GlassWater className="h-12 w-12 text-blue-400" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold line-clamp-1 flex-1">{product.title}</h4>
                      {product.isDrink && product.sizes && product.sizes.length > 0 && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {product.sizes.length} tam.
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
                    
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-green-600">
                        R$ {product.price.toFixed(2)}
                      </span>
                      {getStockBadge(product)}
                    </div>

                    <div className="text-xs text-gray-500">
                      <span>Categoria: {product.category || 'Sem categoria'}</span>
                      <span className="mx-2">•</span>
                      <span>Estoque: {getStockText(product)}</span>
                    </div>

                    {product.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {product.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {product.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{product.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setProductToDelete(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load More */}
          {hasMoreProducts && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="lg" onClick={loadMore}>
                Mostrar mais ({filteredProducts.length - displayLimit} restantes)
              </Button>
            </div>
          )}

          {/* Results Info */}
          <div className="text-center text-gray-500 text-sm">
            Exibindo {displayedProducts.length} de {filteredProducts.length} produtos
          </div>
        </>
      )}

      {/* Create Product Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Produto</DialogTitle>
            <DialogDescription>Preencha os dados do novo produto</DialogDescription>
          </DialogHeader>
          <ProductForm 
            onSubmit={handleCreate} 
            isSubmitting={createProductMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>Atualize as informações do produto</DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <ProductForm 
              initialProduct={editingProduct}
              onSubmit={handleUpdate}
              isSubmitting={updateProductMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{productToDelete?.title}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProductMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => productToDelete && deleteProductMutation.mutate(productToDelete.id)}
              disabled={deleteProductMutation.isPending}
            >
              {deleteProductMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
