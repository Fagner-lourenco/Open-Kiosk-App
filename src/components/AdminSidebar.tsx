
import { Home, Package, Plus, BarChart3, Settings, ReceiptText, CreditCard } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { useTranslation } from "@/i18n";

interface AdminSidebarProps {
  active: string;
  onChange: (tab: string) => void;
}

export default function AdminSidebar({ active, onChange }: AdminSidebarProps) {
  const { t } = useTranslation();
  
  const menu = [
    { label: t('admin.overview'), icon: Home, tab: "overview" },
    { label: t('admin.orders'), icon: ReceiptText, tab: "orders" },
    { label: t('admin.products'), icon: Package, tab: "products" },
    { label: t('admin.addProduct'), icon: Plus, tab: "add-product" },
    { label: t('admin.reports'), icon: BarChart3, tab: "reports" },
    { label: t('admin.payments') || 'Pagamentos', icon: CreditCard, tab: "payments" },
    { label: t('admin.settings'), icon: Settings, tab: "settings" },
  ];

  return (
    <Sidebar>
      <SidebarContent>
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
    </Sidebar>
  );
}
