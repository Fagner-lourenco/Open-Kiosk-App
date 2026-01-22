
import { useState } from "react";
import ProductList from "@/components/ProductList";
import ProductForm from "@/components/ProductForm";
import { useFirebaseProducts } from "@/hooks/useFirebaseProducts";
import { useTranslation } from "@/i18n";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminProductsProps {
  onUpdate: (id: string, updates: Partial<Product>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: (product: Omit<Product, 'id'>) => Promise<string>;
}

export default function AdminProducts({ onUpdate, onDelete, onAdd }: AdminProductsProps) {
  const { t } = useTranslation();
  const { products, loading } = useFirebaseProducts();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleAddProduct = async (product: Omit<Product, 'id'>) => {
    const result = await onAdd(product);
    setIsAddModalOpen(false);
    return result;
  };

  if (loading)
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-500">{t('common.loading')}</p>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Header com botão Adicionar */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{t('nav.products')}</h2>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('common.add')} Produto
        </Button>
      </div>

      {/* Lista de produtos */}
      <ProductList products={products} onUpdate={onUpdate} onDelete={onDelete} />

      {/* Modal de adicionar produto */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('common.add')} Produto
            </DialogTitle>
          </DialogHeader>
          <ProductForm onSubmit={handleAddProduct} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
