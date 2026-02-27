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
export { createPayment, pagbankWebhook, cancelPagBankPayment, syncPendingPayments } from './payments';
export { onPaymentUpdated } from './payments/onPaymentUpdated';

// Finance automation triggers (ledger entries from operational events)
export { onOrderPaidLedger } from './finance/onOrderPaidLedger';
export { onWastageEventLedger } from './finance/onWastageEventLedger';
export { onKegStatusChangeLedger } from './finance/onKegStatusChangeLedger';

// ERP Vertical — Triggers
export { onServingSessionCreated } from './erp/onServingSessionCreated';
export { onWastageEventCreated } from './erp/onWastageEventCreated';

// ERP Vertical — Scheduled Functions
export { aggregateOperationalDaily } from './erp/aggregateOperationalDaily';
export { checkKegLevels } from './erp/checkKegLevels';
export { checkMaintenanceOverdue } from './erp/checkMaintenanceOverdue';
export { resetTapDailyCounters } from './erp/resetTapDailyCounters';
export { cleanupOldNotifications } from './erp/cleanupOldNotifications';
export { cleanupKegProcessedEvents } from './erp/cleanupKegProcessedEvents';
export { checkFinanceOverdue } from './erp/checkFinanceOverdue';

// Migrations
export { consolidatePaymentGatewayConfig, rollbackPaymentGatewayConfig } from './migrations/consolidatePaymentGatewayConfig';
export { unifyStoreSettings } from './migrations/unifyStoreSettings';
export { migrateDispensersToTaps } from './migrations/migrateDispensersToTaps';

// Cleanup triggers (ADM-03/ADM-05)
export { onDeleteStore } from './cleanup/onDeleteStore';

// Ranking & TV Dashboard functions
export {
  onOrderUpdatedRanking,
  recalculateRanking30min,
  onOrderUpdatedChallenge,
  onOrderUpdatedGoldenServe,
  expirePrizes,
  expireEventMode,
  expireChallenges
} from './ranking/rankingFunctions';

// Callable for toggling event mode from Admin UI
export { toggleEventMode } from './ranking/toggleEventMode';
export { recalculateRanking30minNow } from './ranking/recalculate30minNow';

// Push Notifications (FCM)
export { sendPushNotification } from './notifications/sendPushNotification';
