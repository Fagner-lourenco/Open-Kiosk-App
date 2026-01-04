
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Package, Search, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductForm from "./ProductForm";
import { Product } from "@/types/product";
import { useCurrentCurrency } from "@/hooks/useSettings";
import { useTranslation } from "@/i18n";

const INITIAL_LOAD_LIMIT = 50;

interface ProductListProps {
  products: Product[];
  onUpdate: (product: Product) => void;
  onDelete: (productId: string) => void;
}

const ProductList = ({ products, onUpdate, onDelete }: ProductListProps) => {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in-stock" | "out-of-stock" | "low-stock">("all");
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LOAD_LIMIT);
  const currentCurrency = useCurrentCurrency();
  const { t } = useTranslation();

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStockFilter = (() => {
      switch (stockFilter) {
        case "in-stock":
          return (product.stock || 0) > 0;
        case "out-of-stock":
          return (product.stock || 0) === 0;
        case "low-stock":
          return (product.stock || 0) > 0 && (product.stock || 0) <= (product.minStock || 5);
        default:
          return true;
      }
    })();

    return matchesSearch && matchesStockFilter;
  });

  const displayedProducts = filteredProducts.slice(0, displayLimit);
  const hasMoreProducts = displayLimit < filteredProducts.length;

  const loadMore = () => {
    setDisplayLimit(prev => prev + 50);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setEditDialogOpen(true);
  };

  const handleUpdate = (updatedProductData: Omit<Product, "id">) => {
    if (editingProduct) {
      onUpdate({ ...updatedProductData, id: editingProduct.id });
      setEditDialogOpen(false);
      setEditingProduct(null);
    }
  };

  const getStockBadgeVariant = (product: Product) => {
    const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
    const minStock = product.minStock || 5;
    if (stock === 0) return "destructive";
    if (stock <= minStock) return "secondary";
    return "default";
  };

  const getStockStatus = (product: Product) => {
    const stock = product.isDrink ? (product.totalMlAvailable || 0) : (product.stock || 0);
    const minStock = product.minStock || 5;
    if (stock === 0) return t('products.outOfStock');
    if (stock <= minStock) return t('products.lowStock');
    return t('products.inStock');
  };

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('products.noProducts')}</h3>
          <p className="text-gray-500">{t('products.noProductsDescription')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('products.productInventory')}</h2>
          <Badge variant="outline">{t('products.productCount', { filtered: filteredProducts.length, total: products.length })}</Badge>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          {/* Search Bar */}
          <div className="relative w-full sm:w-auto sm:min-w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder={t('products.searchProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Stock Filter */}
          <Select value={stockFilter} onValueChange={(value: "all" | "in-stock" | "out-of-stock" | "low-stock") => setStockFilter(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t('products.filterByStock')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products.allProducts')}</SelectItem>
              <SelectItem value="in-stock">{t('products.inStock')}</SelectItem>
              <SelectItem value="out-of-stock">{t('products.outOfStock')}</SelectItem>
              <SelectItem value="low-stock">{t('products.lowStock')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Grid Layout for Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayedProducts.map((product) => (
          <Card key={product.id} className="h-full">
            <CardContent className="p-4">
              <div className="space-y-3">
                {product.image && (
                  <div className="w-full h-32 overflow-hidden rounded-lg bg-gray-100">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <div>
                  <h3 className="font-semibold text-base line-clamp-2">{product.title}</h3>
                  <p className="text-gray-600 text-sm line-clamp-2 mt-1">{product.description}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-green-600">
                      {currentCurrency.symbol}{product.price.toFixed(2)}
                    </span>
                    <Badge variant={getStockBadgeVariant(product)}>
                      {getStockStatus(product)}
                    </Badge>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    <div>{t('products.categoryLabel', { category: product.category })}</div>
                    <div>
                      {product.isDrink 
                        ? t('products.stockMl', { stock: product.totalMlAvailable || 0 })
                        : t('products.stockUnits', { stock: product.stock || 0 })}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {product.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {product.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{product.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(product)}
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        {t('products.edit')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t('products.editProduct')}</DialogTitle>
                      </DialogHeader>
                      {editingProduct && (
                        <ProductForm
                          initialProduct={editingProduct}
                          onSubmit={handleUpdate}
                        />
                      )}
                    </DialogContent>
                  </Dialog>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(product.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Show More Button */}
      {hasMoreProducts && (
        <div className="flex justify-center mt-8">
          <Button onClick={loadMore} variant="outline" size="lg">
            {t('products.showMore', { remaining: filteredProducts.length - displayLimit })}
          </Button>
        </div>
      )}

      {/* Results Info */}
      <div className="text-center mt-4 text-gray-500 text-sm">
        {t('products.showingProducts', { displayed: displayedProducts.length, total: filteredProducts.length })}
      </div>

      {filteredProducts.length === 0 && (searchTerm || stockFilter !== "all") && (
        <Card>
          <CardContent className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('products.noProductsFound')}</h3>
            <p className="text-gray-500">{t('products.adjustFilters')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProductList;
