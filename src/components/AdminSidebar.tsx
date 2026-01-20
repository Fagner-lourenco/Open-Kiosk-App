
import { Home, Package, Plus, BarChart3, Settings, ReceiptText, CreditCard, LogOut, Store, User, ChevronDown } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { useFranchiseSafe } from "@/context/FranchiseContext";
import { isFranchiseMode } from "@/lib/pathResolver";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StoreSwitcher } from "./StoreSwitcher";

interface AdminSidebarProps {
  active: string;
  onChange: (tab: string) => void;
}

export default function AdminSidebar({ active, onChange }: AdminSidebarProps) {
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const franchiseContext = useFranchiseSafe();
  
  const isFranchise = isFranchiseMode();
  const currentStore = franchiseContext?.currentStore;
  
  const menu = [
    { label: t('admin.overview'), icon: Home, tab: "overview" },
    { label: t('admin.orders'), icon: ReceiptText, tab: "orders" },
    { label: t('admin.products'), icon: Package, tab: "products" },
    { label: t('admin.addProduct'), icon: Plus, tab: "add-product" },
    { label: t('admin.reports'), icon: BarChart3, tab: "reports" },
    { label: t('admin.payments') || 'Pagamentos', icon: CreditCard, tab: "payments" },
    { label: t('admin.settings'), icon: Settings, tab: "settings" },
  ];

  const handleLogout = async () => {
    await logout();
    // Em modo franquia, redireciona para login
    if (isFranchise) {
      window.location.hash = '#/login';
    }
  };

  return (
    <Sidebar>
      <SidebarContent>
        {/* Store Switcher - apenas em modo franquia */}
        {isFranchise && currentStore && (
          <div className="p-4 border-b">
            <StoreSwitcher variant="full" />
          </div>
        )}

        <SidebarGroup>
          <SidebarMenu>
            {menu.map((item) => (
              <SidebarMenuItem key={item.tab}>
                <SidebarMenuButton asChild>
                  <button
                    onClick={() => onChange(item.tab)}
                    className={`flex items-center w-full gap-2 px-3 py-2 text-left rounded ${
                      active === item.tab ? "bg-accent text-foreground font-bold" : ""
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer com User Info - apenas em modo franquia */}
      {isFranchise && isAuthenticated && (
        <SidebarFooter className="border-t p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user?.displayName || user?.email?.split('@')[0] || 'Usuário'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {currentStore?.storeName || user?.email}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                {user?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onChange('settings')}>
                <Settings className="w-4 h-4 mr-2" />
                {t('admin.settings', 'Configurações')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                {t('auth.logout', 'Sair')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
