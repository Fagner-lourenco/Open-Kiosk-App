/**
 * ============================================================================
 * Billing Page
 * ============================================================================
 * 
 * Página de gerenciamento de plano e faturamento.
 * Apenas owners podem acessar.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, AlertCircle, Loader2, ExternalLink, Crown } from 'lucide-react';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useFranchise } from '../../context/FranchiseContext';
import { useAudit } from '@/hooks/useAudit';
import { AuditActions } from '@/services/auditService';
import { 
  getFranchiseBilling, 
  getBillingHistory, 
  createCheckoutSession, 
  openBillingPortal,
  getAvailablePlans,
  getPlanDetails,
  getDaysRemaining,
  formatCurrency,
  needsUserAction 
} from '../../services/billingService';
import { 
  BillingPlan, 
  BillingInterval, 
  FranchiseBilling, 
  BillingEvent,
  getBillingStatusLabel,
  getBillingStatusColor
} from '../../types/billing';

export default function BillingPage() {
  const { currentFranchise } = useFranchise();
  const { log: audit } = useAudit();
  const [searchParams] = useSearchParams();
  
  const franchiseId = currentFranchise?.id;
  
  const [billing, setBilling] = useState<FranchiseBilling | null>(null);
  const [history, setHistory] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<BillingPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>('yearly');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Verifica se retornou do checkout
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('Pagamento realizado com sucesso! Seu plano foi atualizado.');
    }
  }, [searchParams]);
  
  // Carrega dados
  useEffect(() => {
    async function loadBilling() {
      if (!franchiseId) return;
      
      try {
        const [billingData, historyData] = await Promise.all([
          getFranchiseBilling(franchiseId),
          getBillingHistory(franchiseId),
        ]);
        
        setBilling(billingData);
        setHistory(historyData);
      } catch (error) {
        console.error('Erro ao carregar billing:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadBilling();
  }, [franchiseId]);
  
  const handleUpgrade = async (plan: 'starter' | 'pro' | 'enterprise') => {
    setCheckoutLoading(plan);
    
    try {
      const { url } = await createCheckoutSession(plan, selectedInterval);
      if (url) {
        audit(AuditActions.BILLING_CHECKOUT, { type: 'billing', id: plan, name: plan }, { interval: selectedInterval, currentPlan: billing?.plan });
        window.location.href = url;
      }
    } catch (error) {
      console.error('Erro ao criar checkout:', error);
      toast.error('Erro ao iniciar checkout. Tente novamente.');
    } finally {
      setCheckoutLoading(null);
    }
  };
  
  const handleManageBilling = async () => {
    setPortalLoading(true);
    
    try {
      const url = await openBillingPortal();
      audit(AuditActions.BILLING_PORTAL_OPEN, { type: 'billing', id: 'portal', name: 'Portal de Cobrança' });
      window.open(url, '_blank');
    } catch (error) {
      console.error('Erro ao abrir portal:', error);
      toast.error('Erro ao abrir portal de pagamento.');
    } finally {
      setPortalLoading(false);
    }
  };
  
  if (loading) {
    return <LoadingState className="min-h-[400px]" />;
  }
  
  const currentPlan = billing ? getPlanDetails(billing.plan) : getPlanDetails('free');
  const daysRemaining = billing?.planExpiresAt ? getDaysRemaining(billing.planExpiresAt) : null;
  const plans = getAvailablePlans();
  
  return (
    <div className="space-y-6">
      <PageHeader title="Faturamento" />
      
      {/* Mensagem de sucesso */}
      {successMessage && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {/* Alerta de ação necessária */}
      {billing && needsUserAction(billing.planStatus) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Ação necessária: </span>
            <span>{getBillingStatusLabel(billing.planStatus)}</span>
            <Button 
              variant="link"
              onClick={handleManageBilling}
              className="ml-2 h-auto p-0 text-destructive underline"
            >
              Atualizar pagamento
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Plano atual */}
      <Card>
        <CardContent className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Plano Atual</h2>
            </div>
            <p className="text-3xl font-bold mt-2">{currentPlan.name}</p>
            <p className="text-muted-foreground mt-1">{currentPlan.description}</p>
            
            {billing && (
              <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  getBillingStatusColor(billing.planStatus) === 'green' ? 'bg-green-100 text-green-800' :
                  getBillingStatusColor(billing.planStatus) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                  getBillingStatusColor(billing.planStatus) === 'red' ? 'bg-red-100 text-red-800' :
                  'bg-muted text-foreground'
                }`}>
                  {getBillingStatusLabel(billing.planStatus)}
                </span>
                
                {daysRemaining !== null && daysRemaining <= 7 && (
                  <span className="text-sm text-amber-600">
                    {daysRemaining === 0 
                      ? 'Expira hoje!' 
                      : `Expira em ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`}
                  </span>
                )}
              </div>
            )}
          </div>
          
          {billing?.stripeSubscriptionId && (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Gerenciar pagamento
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {/* Features do plano atual */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="font-medium mb-3">Recursos incluídos:</h3>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {currentPlan.features.map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-500" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        </CardContent>
      </Card>
      
      {/* Seletor de intervalo */}
      <div className="flex items-center justify-center mb-8">
        <div className="bg-muted rounded-lg p-1 flex">
          <button
            onClick={() => setSelectedInterval('monthly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'monthly' 
                ? 'bg-card shadow text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setSelectedInterval('yearly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'yearly' 
                ? 'bg-card shadow text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              -17%
            </span>
          </button>
        </div>
      </div>
      
      {/* Grid de planos */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {plans.map((plan) => {
          const isCurrent = billing?.plan === plan.id;
          const price = selectedInterval === 'monthly' ? plan.pricing.monthly : plan.pricing.yearly;
          const monthlyEquivalent = selectedInterval === 'yearly' 
            ? Math.round(plan.pricing.yearly / 12) 
            : plan.pricing.monthly;
          
          return (
            <Card 
              key={plan.id}
              className={`relative border-2 p-6 ${
                plan.popular ? 'border-primary' : 'border-border'
              } ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-xs font-medium rounded-full">
                  Mais popular
                </div>
              )}
              
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
              
              <div className="mt-4">
                <span className="text-4xl font-bold">{formatCurrency(monthlyEquivalent)}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              
              {selectedInterval === 'yearly' && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(price)} cobrado anualmente
                </p>
              )}
              
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Button
                onClick={() => handleUpgrade(plan.id as 'starter' | 'pro' | 'enterprise')}
                disabled={isCurrent || checkoutLoading !== null}
                variant={isCurrent ? 'secondary' : plan.popular ? 'default' : 'outline'}
                className={`w-full mt-6 py-3 ${
                  !isCurrent && !plan.popular ? 'bg-foreground text-background hover:bg-foreground/90' : ''
                } ${isCurrent ? 'cursor-not-allowed' : ''}`}
              >
                {checkoutLoading === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  'Plano atual'
                ) : (
                  'Selecionar plano'
                )}
              </Button>
            </Card>
          );
        })}
      </div>
      
      {/* Histórico de billing */}
      {history.length > 0 && (
        <Card>
          <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Histórico de pagamentos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Data</th>
                  <th className="text-left py-3 px-4">Evento</th>
                  <th className="text-left py-3 px-4">Plano</th>
                  <th className="text-right py-3 px-4">Valor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((event) => (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="py-3 px-4 text-muted-foreground">
                      {event.timestamp.toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      {getEventLabel(event.type)}
                    </td>
                    <td className="py-3 px-4">
                      {event.plan ? getPlanDetails(event.plan).name : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {event.amount 
                        ? formatCurrency(event.amount / 100, event.currency || 'BRL')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getEventLabel(type: BillingEvent['type']): string {
  const labels: Record<BillingEvent['type'], string> = {
    checkout_completed: 'Assinatura iniciada',
    subscription_updated: 'Plano atualizado',
    subscription_canceled: 'Assinatura cancelada',
    invoice_paid: 'Pagamento confirmado',
    invoice_payment_failed: 'Falha no pagamento',
  };
  
  return labels[type] || type;
}
