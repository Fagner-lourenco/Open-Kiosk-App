/**
 * Analytics e tracking de eventos
 * Centraliza todos os eventos de conversão da landing page
 */

// Declaração de tipos para window.gtag (Google Analytics)
declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string,
      config?: Record<string, any>
    ) => void;
  }
}

/**
 * Envia um evento para o sistema de analytics
 * Suporta Google Analytics (gtag) e console em dev
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  // Google Analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, properties);
  }
  
  // Console log em desenvolvimento
  if (import.meta.env.DEV) {
    console.log('[Analytics]', eventName, properties);
  }
  
  // Aqui você pode adicionar outros provedores (Mixpanel, Amplitude, etc)
}

/**
 * Eventos padronizados para facilitar o uso
 * Use estes nomes para manter consistência
 */
export const AnalyticsEvents = {
  // Hero CTAs
  HERO_CTA_EVENTO: 'hero_cta_evento_click',
  HERO_CTA_FRANQUIA: 'hero_cta_franquia_click',
  
  // Header CTAs
  HEADER_WHATSAPP: 'header_whatsapp_click',
  HEADER_PROPOSTA: 'header_proposta_click',
  
  // WhatsApp
  WHATSAPP_FLOATING: 'whatsapp_floating_click',
  WHATSAPP_FORM: 'whatsapp_form_click',
  
  // Formulário
  FORM_START: 'contact_form_start',
  FORM_SUBMIT: 'contact_form_submit',
  FORM_SUCCESS: 'contact_form_success',
  FORM_ERROR: 'contact_form_error',
  
  // Navegação por seções
  SECTION_VIEW: 'section_view',
  SECTION_CLICK: 'section_menu_click',
  
  // Planos
  PLANO_EVENTO_CLICK: 'plano_evento_click',
  PLANO_FRANQUIA_CLICK: 'plano_franquia_click',
  
  // FAQ
  FAQ_OPEN: 'faq_item_open',
  
  // Footer
  FOOTER_REPRESENTANTE: 'footer_representante_click',
} as const;

/**
 * Helper para trackear visualização de seções
 * Use com Intersection Observer
 */
export function trackSectionView(sectionId: string) {
  trackEvent(AnalyticsEvents.SECTION_VIEW, {
    section: sectionId,
  });
}

/**
 * Helper para trackear envio de formulário
 */
export function trackFormSubmit(interest: string, metadata?: Record<string, any>) {
  trackEvent(AnalyticsEvents.FORM_SUBMIT, {
    interest,
    ...metadata,
  });
}

/**
 * Helper para trackear cliques em CTAs
 */
export function trackCTA(ctaName: string, location: string) {
  trackEvent('cta_click', {
    cta_name: ctaName,
    location,
  });
}
