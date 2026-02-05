import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Info } from "lucide-react";
import { usePaymentGateway } from "@/context/PaymentGatewayContext";
import { useTranslation } from "@/i18n";

const PROVIDER_LABELS: Record<string, string> = {
  none: "Nenhum",
  pagbank: "PagBank",
  mercado_pago: "Mercado Pago",
  mercadopago: "Mercado Pago (legado)",
};

const formatEnabledMethods = (methods: { cash: boolean; pix: boolean; credit: boolean; debit: boolean }) => {
  const labels: string[] = [];
  if (methods.cash) labels.push("Dinheiro");
  if (methods.pix) labels.push("PIX");
  if (methods.credit) labels.push("Crédito");
  if (methods.debit) labels.push("Débito");
  return labels.length > 0 ? labels.join(", ") : "Nenhum";
};

export default function AdminPaymentGatewayHub() {
  const { t } = useTranslation();
  const { gatewayConfig, resolvedConfig, isConfigured, source, enabledMethods } = usePaymentGateway();

  const provider = gatewayConfig?.provider || resolvedConfig.provider || "none";
  const environment = gatewayConfig?.environment || resolvedConfig.environment || "sandbox";
  const providerLabel = PROVIDER_LABELS[provider] || provider;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t("admin.paymentMethods") || "Pagamentos"}
              </CardTitle>
              <CardDescription>
                Configurações são gerenciadas no Admin Web. Esta tela é somente leitura.
              </CardDescription>
            </div>
            <Badge variant={isConfigured ? "default" : "secondary"}>
              {isConfigured ? "Configurado" : "Pendente"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle>Somente leitura</AlertTitle>
            <AlertDescription>
              Para editar provedor, métodos e credenciais, use o painel Admin Web da franquia.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Provedor</p>
              <p className="font-medium">{providerLabel}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ambiente</p>
              <p className="font-medium">{environment === "production" ? "Produção" : "Sandbox"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fonte</p>
              <p className="font-medium">{source === "firestore" ? "Admin Web" : source === "env" ? "Variáveis de ambiente" : "Não configurado"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Métodos habilitados</p>
              <p className="font-medium">{formatEnabledMethods(enabledMethods)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Chave PIX</p>
              <p className="font-medium">{gatewayConfig?.pixKey ? "Configurada" : "Não configurada"}</p>
            </div>
          </div>

          <Separator />

          {provider === "pagbank" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">PagBank (dados públicos)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Client ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.pagbank?.clientId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Merchant ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.pagbank?.merchantId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Public Key</p>
                  <p className="font-medium">{gatewayConfig?.providers?.pagbank?.publicKey || "-"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Segredos (client secret, tokens) são configurados apenas nas Cloud Functions.
              </p>
            </div>
          )}

          {provider === "mercado_pago" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Mercado Pago (dados públicos)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">User ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.mercadopago?.userId || resolvedConfig.userId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">External POS ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.mercadopago?.externalPosId || resolvedConfig.externalPosId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Store ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.mercadopago?.storeId || resolvedConfig.storeId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Terminal ID</p>
                  <p className="font-medium">{gatewayConfig?.providers?.mercadopago?.terminalId || resolvedConfig.terminalId || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
