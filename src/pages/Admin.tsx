
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import AdminOverview from "@/components/AdminOverview";
import AdminProducts from "@/components/AdminProducts";
import AdminReports from "@/components/AdminReports";
import AdminSettings from "@/components/AdminSettings";
import AdminOrders from "@/components/AdminOrders";
import AdminPaymentGatewayHub from "@/components/AdminPaymentGatewayHub";
import InventoryManager from "@/components/InventoryManager";
import { ESP32DispenserPanel } from "@/components/ESP32DispenserPanel";
import { useFirebaseProducts } from "@/hooks/useFirebaseProducts";
import { Product } from "@/types/product";
import { ProductWithInventory, InventoryLog } from "@/types/store";
import { useAuth } from "@/context/AuthContext";
import { Store, LogOut } from "lucide-react";

export default function Admin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const { products, addProduct, updateProduct, deleteProduct } = useFirebaseProducts();

  // Navegar para a loja
  const handleGoToShop = () => {
    navigate('/shop');
  };

  // Fazer logout e ir para a página de login
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  const handleAddProduct = async (newProduct: Omit<Product, "id">): Promise<string> => {
    try {
      const id = await addProduct(newProduct);
      setActiveTab("products");
      return id;
    } catch (error) {
      console.error("Error adding product:", error);
      throw error;
    }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    try {
      await updateProduct(updatedProduct.id, updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteProduct(productId);
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const handleUpdateInventory = async (productId: string, newStock: number, log: Omit<InventoryLog, 'id' | 'timestamp'>) => {
    try {
      const product = products.find(p => p.id === productId);
      if (product) {
        // Para bebidas, atualiza totalMlAvailable; para produtos regulares, atualiza stock
        const updates = product.isDrink
          ? { ...product, totalMlAvailable: newStock }
          : { ...product, stock: newStock, inStock: newStock > 0 };
        
        await updateProduct(productId, updates);
      }
    } catch (error) {
      console.error("Error updating inventory:", error);
    }
  };

  // Convert products to ProductWithInventory format
  const productsWithInventory: ProductWithInventory[] = products.map(product => ({
    ...product,
    stock: product.stock || 0,
    minStock: product.minStock || 5
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-3">
          <h1 className="text-2xl font-bold text-gray-800">{t('admin.dashboard')}</h1>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={handleGoToShop}
              className="flex items-center gap-2 px-4 py-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
            >
              <Store className="w-4 h-4" />
              <span>{t('admin.goToShop')}</span>
            </Button>
            <Button 
              variant="outline"
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout') || 'Sair'}</span>
            </Button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 mb-6 h-auto min-h-[48px] gap-1 p-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm min-h-[40px] px-2">{t('admin.overview')}</TabsTrigger>
            <TabsTrigger value="products" className="text-xs sm:text-sm min-h-[40px] px-2">{t('nav.products')}</TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs sm:text-sm min-h-[40px] px-2">{t('nav.inventory')}</TabsTrigger>
            <TabsTrigger value="orders" className="text-xs sm:text-sm min-h-[40px] px-2">{t('nav.orders')}</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs sm:text-sm min-h-[40px] px-2">{t('nav.reports')}</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs sm:text-sm min-h-[40px] px-2">{t('admin.payments') || 'Pagamentos'}</TabsTrigger>
            <TabsTrigger value="esp32" className="text-xs sm:text-sm min-h-[40px] px-2">ESP32</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm min-h-[40px] px-2">{t('nav.settings')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AdminOverview />
          </TabsContent>
          
          <TabsContent value="products">
            <AdminProducts onUpdate={handleUpdateProduct} onDelete={handleDeleteProduct} onAdd={handleAddProduct} />
          </TabsContent>
          
          <TabsContent value="inventory">
            <InventoryManager 
              products={productsWithInventory} 
              onUpdateInventory={handleUpdateInventory}
            />
          </TabsContent>
          
          <TabsContent value="orders">
            <AdminOrders />
          </TabsContent>
          
          <TabsContent value="reports">
            <AdminReports />
          </TabsContent>
          
          <TabsContent value="payments">
            <AdminPaymentGatewayHub />
          </TabsContent>
          
          <TabsContent value="esp32">
            <ESP32DispenserPanel />
          </TabsContent>
          
          <TabsContent value="settings">
            <AdminSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
