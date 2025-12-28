
import ProductList from "@/components/ProductList";
import { useFirebaseProducts } from "@/hooks/useFirebaseProducts";
import { useTranslation } from "@/i18n";
import { Product } from "@/types/product";

interface AdminProductsProps {
  onUpdate: (id: string, updates: Partial<Product>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function AdminProducts({ onUpdate, onDelete }: AdminProductsProps) {
    const { t } = useTranslation();
  const { products, loading } = useFirebaseProducts();
  if (loading)
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-500">{t('common.loading')}</p>
      </div>
    );
  return <ProductList products={products} onUpdate={onUpdate} onDelete={onDelete} />;
}
