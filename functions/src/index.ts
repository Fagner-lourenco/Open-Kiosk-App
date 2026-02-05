/**
 * ============================================================================
 * Cloud Functions - Entry Point
 * ============================================================================
 * 
 * Funções serverless para Open Kiosk Multi-Franchise
 */

// Auth triggers
export { onUserCreated } from './auth/onCreate';
export { setCustomClaims } from './auth/setCustomClaims';

// Claims management functions
export { 
  setAdminClaims, 
  syncMembershipClaims, 
  getClaimsForUser,
  refreshUserToken 
} from './auth/claims';

// Invitation functions
export { sendInvitationEmail } from './invitations/sendEmail';
export { acceptInvitation, validateInvitationToken } from './invitations/accept';

// Billing functions
export { stripeWebhook } from './billing/stripeWebhook';
export { createCheckoutSession, createBillingPortalSession } from './billing/createCheckout';

// SuperAdmin functions
export { setSuperAdmin, removeSuperAdmin, listSuperAdmins } from './superadmin/setSuperAdmin';
export { promoteSuperAdminHTTP } from './superadmin/promoteSuperAdminHTTP';

// Analytics functions
export { aggregateDailySales, aggregateDailySalesHTTP } from './analytics/aggregateDailySales';
export { getMetricsAdmin } from './analytics/getMetricsAdmin';

// Order aggregation triggers (real-time metrics)
export { 
  onOrderCreated, 
  onOrderUpdated 
} from './analytics/aggOrders';

// Payments (PagBank + generic)
export { createPayment, pagbankWebhook, syncPendingPayments } from './payments';

// Migrations
export { consolidatePaymentGatewayConfig, rollbackPaymentGatewayConfig } from './migrations/consolidatePaymentGatewayConfig';
