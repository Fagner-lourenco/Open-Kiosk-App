/**
 * ============================================================================
 * Top Products Table Component
 * ============================================================================
 * 
 * Tabela com os produtos mais vendidos.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Package } from "lucide-react";

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

interface TopProductsTableProps {
  products: TopProduct[];
  loading?: boolean;
  limit?: number;
}

export function TopProductsTable({ 
  products, 
  loading = false, 
  limit = 5 
}: TopProductsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top Produtos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(limit)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topProducts = products.slice(0, limit);
  const maxQuantity = Math.max(...topProducts.map(p => p.quantity), 1);

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0: return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 1: return 'bg-gray-100 text-gray-600 border-gray-300';
      case 2: return 'bg-orange-100 text-orange-700 border-orange-300';
      default: return 'bg-blue-50 text-blue-600 border-blue-200';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Top {limit} Produtos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
            <Package className="h-12 w-12 mb-2 opacity-50" />
            <span>Sem dados de produtos</span>
          </div>
        ) : (
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div 
                key={index} 
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Rank Badge */}
                <Badge 
                  variant="outline" 
                  className={`w-8 h-8 flex items-center justify-center ${getMedalColor(index)}`}
                >
                  {index + 1}
                </Badge>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Progress bar */}
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${(product.quantity / maxQuantity) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {product.quantity} un.
                    </span>
                  </div>
                </div>

                {/* Revenue */}
                <div className="text-right shrink-0">
                  <p className="font-semibold text-green-600">
                    R$ {product.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to generate top products from orders
export function generateTopProducts(orders: Array<{
  items?: Array<{
    title?: string;
    productName?: string;
    quantity?: number;
    price?: number;
  }>;
}>): TopProduct[] {
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  
  orders.forEach(order => {
    order.items?.forEach(item => {
      const name = item.title || item.productName || 'Produto';
      const current = productMap.get(name) || { quantity: 0, revenue: 0 };
      current.quantity += item.quantity || 1;
      current.revenue += (item.price || 0) * (item.quantity || 1);
      productMap.set(name, current);
    });
  });
  
  return Array.from(productMap.entries())
    .map(([name, data]) => ({
      name,
      quantity: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}
