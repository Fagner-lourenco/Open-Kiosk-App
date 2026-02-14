import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  WHATSAPP_NUMBER,
  WHATSAPP_MESSAGE_EVENTO_PEQUENO,
  WHATSAPP_MESSAGE_EVENTO_GRANDE,
  WHATSAPP_MESSAGE_FRANQUIA,
  WHATSAPP_MESSAGE_REPRESENTANTE,
} from './constants';
import { trackEvent, AnalyticsEvents, trackFormSubmit } from '@/lib/analytics';

interface FormData {
  name: string;
  email: string;
  whatsapp: string;
  city: string;
  interest: 'evento' | 'franquia' | 'representante';
  // Campos condicionais
  eventSize?: 'small' | 'medium' | 'large' | 'xlarge';
  date?: string;
  operationCity?: string;
  representativeRegion?: string;
  representativeProfile?: 'eventos' | 'bares' | 'ambos';
  message: string;
}

/**
 * Formulário de contato com validação básica e campos condicionais.
 * Define o interesse padrão conforme a âncora na URL.
 */
export default function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    whatsapp: '',
    city: '',
    interest: 'evento',
    date: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isFormStarted, setIsFormStarted] = useState(false);

  // Detecta hash para setar interesse padrão
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.includes('contato-franquia')) {
        setFormData((prev) => ({ ...prev, interest: 'franquia' }));
      } else if (hash.includes('contato-evento')) {
        setFormData((prev) => ({ ...prev, interest: 'evento' }));
      } else if (hash.includes('contato-representante')) {
        setFormData((prev) => ({ ...prev, interest: 'representante' }));
      }
    }
  }, []);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    // Track form start on first input
    if (!isFormStarted) {
      trackEvent(AnalyticsEvents.FORM_START);
      setIsFormStarted(true);
    }

    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório.';
    if (!formData.email.trim()) newErrors.email = 'E‑mail é obrigatório.';
    if (!formData.whatsapp.trim())
      newErrors.whatsapp = 'WhatsApp é obrigatório.';
    if (!formData.city.trim()) newErrors.city = 'Cidade é obrigatória.';
    
    // Validação condicional para representantes
    if (formData.interest === 'representante' && !formData.representativeRegion?.trim()) {
      newErrors.representativeRegion = 'Região é obrigatória.';
    }
    
    return newErrors;
  }

  function buildWhatsAppMessage(): string {
    const { name, email, whatsapp, city, interest, eventSize, date, operationCity, representativeRegion, representativeProfile, message } = formData;

    if (interest === 'evento') {
      const base = eventSize === 'small' || eventSize === 'medium'
        ? WHATSAPP_MESSAGE_EVENTO_PEQUENO
        : WHATSAPP_MESSAGE_EVENTO_GRANDE;
      
      let msg = base
        .replace('{nome}', name)
        .replace('{email}', email)
        .replace('{whatsapp}', whatsapp)
        .replace('{cidade}', city);
      
      if (eventSize) {
        const tamanhoMap = {
          small: 'Pequeno (até 100 pessoas)',
          medium: 'Médio (100-500 pessoas)',
          large: 'Grande (500-2000 pessoas)',
          xlarge: 'Extra Grande (mais de 2000 pessoas)'
        };
        msg += `\n📊 Tamanho: ${tamanhoMap[eventSize]}`;
      }
      if (date) msg += `\n📅 Data: ${date}`;
      if (message) msg += `\n💬 Mensagem: ${message}`;
      
      return msg;
    }

    if (interest === 'franquia') {
      let msg = WHATSAPP_MESSAGE_FRANQUIA
        .replace('{nome}', name)
        .replace('{email}', email)
        .replace('{whatsapp}', whatsapp)
        .replace('{cidade}', city);
      
      if (operationCity) msg += `\n🏙️ Cidade de operação: ${operationCity}`;
      if (message) msg += `\n💬 Mensagem: ${message}`;
      
      return msg;
    }

    if (interest === 'representante') {
      let msg = WHATSAPP_MESSAGE_REPRESENTANTE
        .replace('{nome}', name)
        .replace('{email}', email)
        .replace('{whatsapp}', whatsapp)
        .replace('{cidade}', city);
      
      if (representativeRegion) msg += `\n📍 Região de atuação: ${representativeRegion}`;
      if (representativeProfile) {
        const perfilMap = {
          eventos: 'Captação em eventos',
          bares: 'Captação em bares',
          ambos: 'Ambos (eventos e bares)'
        };
        msg += `\n👤 Perfil: ${perfilMap[representativeProfile]}`;
      }
      if (message) msg += `\n💬 Mensagem: ${message}`;
      
      return msg;
    }

    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    trackEvent(AnalyticsEvents.FORM_SUBMIT);
    
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      trackEvent(AnalyticsEvents.FORM_ERROR);
      return;
    }

    console.log('✅ Formulário enviado:', formData);
    trackFormSubmit(formData.interest, { city: formData.city });
    trackEvent(AnalyticsEvents.FORM_SUCCESS);
    
    setSubmitted(true);
    setFormData({ 
      name: '', 
      email: '', 
      whatsapp: '', 
      city: '', 
      interest: 'evento', 
      date: '', 
      message: '' 
    });
  }

  if (submitted) {
    const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
    const whatsappMessage = buildWhatsAppMessage();
    const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`;

    return (
      <div className="rounded-md border border-green-600 bg-green-50 p-6 text-center text-green-800 max-w-lg mx-auto">
        <div className="flex justify-center mb-4">
          <svg className="h-16 w-16 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="mb-2 text-xl font-semibold">Obrigado pelo contato!</h3>
        <p className="text-sm mb-4">
          Recebemos suas informações com sucesso.
        </p>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent(AnalyticsEvents.WHATSAPP_FORM)}
          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Enviar pelo WhatsApp
        </a>
      </div>
    );
  }

  // Monta link dinâmico para WhatsApp básico
  const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, '');
  let prefilled = formData.interest === 'franquia' 
    ? WHATSAPP_MESSAGE_FRANQUIA 
    : formData.interest === 'representante'
    ? WHATSAPP_MESSAGE_REPRESENTANTE
    : WHATSAPP_MESSAGE_EVENTO_PEQUENO;
  const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(prefilled)}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Nome*
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Seu nome completo"
          required
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600" aria-live="polite">
            {errors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          E‑mail*
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="seu@email.com"
          required
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600" aria-live="polite">
            {errors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="whatsapp" className="block text-sm font-medium text-foreground">
          WhatsApp*
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          value={formData.whatsapp}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="(99) 99999-9999"
          required
        />
        {errors.whatsapp && (
          <p className="mt-1 text-sm text-red-600" aria-live="polite">
            {errors.whatsapp}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="city" className="block text-sm font-medium text-foreground">
          Cidade*
        </label>
        <input
          id="city"
          name="city"
          type="text"
          value={formData.city}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Sua Cidade"
          required
        />
        {errors.city && (
          <p className="mt-1 text-sm text-red-600" aria-live="polite">
            {errors.city}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="interest" className="block text-sm font-medium text-foreground">
          Estou interessado em
        </label>
        <select
          id="interest"
          name="interest"
          value={formData.interest}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="evento">Contratar para evento</option>
          <option value="franquia">Abrir unidade / franquia</option>
          <option value="representante">Ser representante</option>
        </select>
      </div>

      {/* Campos condicionais para EVENTO */}
      {formData.interest === 'evento' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div>
            <label htmlFor="eventSize" className="block text-sm font-medium text-foreground">
              Tamanho do evento
            </label>
            <select
              id="eventSize"
              name="eventSize"
              value={formData.eventSize || ''}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              <option value="small">Pequeno (até 100 pessoas)</option>
              <option value="medium">Médio (100-500 pessoas)</option>
              <option value="large">Grande (500-2000 pessoas)</option>
              <option value="xlarge">Extra Grande (mais de 2000 pessoas)</option>
            </select>
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-foreground">
              Data prevista do evento (opcional)
            </label>
            <input
              id="date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Campos condicionais para REPRESENTANTE */}
      {formData.interest === 'representante' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div>
            <label htmlFor="representativeRegion" className="block text-sm font-medium text-foreground">
              Região onde deseja atuar*
            </label>
            <input
              id="representativeRegion"
              name="representativeRegion"
              type="text"
              value={formData.representativeRegion || ''}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Curitiba e região metropolitana"
              required
            />
            {errors.representativeRegion && (
              <p className="mt-1 text-sm text-red-600" aria-live="polite">
                {errors.representativeRegion}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="representativeProfile" className="block text-sm font-medium text-foreground">
              Perfil de atuação
            </label>
            <select
              id="representativeProfile"
              name="representativeProfile"
              value={formData.representativeProfile || ''}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione...</option>
              <option value="eventos">Captação em eventos</option>
              <option value="bares">Captação em bares</option>
              <option value="ambos">Ambos (eventos e bares)</option>
            </select>
          </div>
        </div>
      )}

      {/* Campos condicionais para FRANQUIA */}
      {formData.interest === 'franquia' && (
        <div className="animate-in fade-in duration-300">
          <label htmlFor="operationCity" className="block text-sm font-medium text-foreground">
            Cidade onde pretende operar (opcional)
          </label>
          <input
            id="operationCity"
            name="operationCity"
            type="text"
            value={formData.operationCity || ''}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ex: São Paulo"
          />
        </div>
      )}

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-foreground">
          Mensagem (opcional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          value={formData.message}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Conte-nos mais sobre seu interesse..."
        />
      </div>
      <Button type="submit" className="w-full h-12 text-base font-bold">
        Receber proposta
      </Button>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Prefere falar diretamente?&nbsp;
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent(AnalyticsEvents.WHATSAPP_FORM)}
            className="font-medium underline hover:text-primary"
          >
            Converse pelo WhatsApp
          </a>
        </p>
      </div>
    </form>
  );
}
