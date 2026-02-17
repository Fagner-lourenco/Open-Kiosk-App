/**
 * ============================================================================
 * Tests — DynamicPricingTab (Admin)
 * ============================================================================
 *
 * Testes de integração (render) para a aba de Dynamic Pricing.
 * Usa mocks de Firebase e testa interações do usuário.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DynamicPricingTab } from '@/pages/ranking/DynamicPricingTab';
import { DEFAULT_DYNAMIC_PRICING_CONFIG } from '@shared/types/dynamicPricing';

// ============================================================================
// MOCKS
// ============================================================================

// Mock dynamicPricingService
const mockGetConfig = vi.fn();
const mockUpdateConfig = vi.fn();

vi.mock('@/services/dynamicPricingService', () => ({
  getDynamicPricingConfig: (...args: any[]) => mockGetConfig(...args),
  updateDynamicPricingConfig: (...args: any[]) => mockUpdateConfig(...args),
}));

// Mock useAudit
vi.mock('@/hooks/useAudit', () => ({
  useAudit: () => ({ log: vi.fn() }),
}));

// Mock auditService
vi.mock('@/services/auditService', () => ({
  AuditActions: {
    DYNAMIC_PRICING_UPDATE: 'dynamic_pricing.update',
    DYNAMIC_PRICING_TOGGLE: 'dynamic_pricing.toggle',
  },
}));

// Mock dynamicPricingEngine (used via import from shared)
vi.mock('@shared/utils/dynamicPricingEngine', () => ({
  evaluateDynamicPrice: vi.fn(() => ({
    effectivePricePerMl: 0.045,
    originalPricePerMl: 0.05,
    ruleId: 'hh-test',
    reason: 'Happy Hour -10%',
    deltaPercent: -10,
    computedAt: new Date().toISOString(),
    validUntil: null,
  })),
  toPricingSnapshot: vi.fn(),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('DynamicPricingTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue({ ...DEFAULT_DYNAMIC_PRICING_CONFIG });
    mockUpdateConfig.mockResolvedValue(undefined);
  });

  it('renderiza sem erros', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Preço Dinâmico')).toBeInTheDocument();
    });
  });

  it('mostra estado de carregamento', () => {
    mockGetConfig.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('exibe toggle de ativação', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Ativar Preço Dinâmico')).toBeInTheDocument();
    });
  });

  it('exibe seção de guardrails', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Variação Máxima (%)')).toBeInTheDocument();
      expect(screen.getByText('Intervalo Mín. (seg)')).toBeInTheDocument();
      expect(screen.getByText('Casas Decimais')).toBeInTheDocument();
    });
  });

  it('exibe mensagem quando não há regras', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma regra configurada. Adicione abaixo.')).toBeInTheDocument();
    });
  });

  it('habilita botão salvar apenas com alterações', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Preço Dinâmico')).toBeInTheDocument();
    });

    // Botão salvar deve estar desabilitado (sem alterações)
    const saveBtn = screen.getByText('Salvar');
    expect(saveBtn.closest('button')).toBeDisabled();
  });

  it('carrega config da loja corretamente', async () => {
    const customConfig = {
      ...DEFAULT_DYNAMIC_PRICING_CONFIG,
      enabled: true,
      maxVariationPercent: 15,
      rules: [
        {
          id: 'hh-1',
          type: 'happy_hour' as const,
          enabled: true,
          priority: 10,
          label: 'Happy Hour Almoço',
          params: {
            windows: [
              { startTime: '11:30', endTime: '13:30', deltaPercent: -10 },
            ],
          },
        },
      ],
    };
    mockGetConfig.mockResolvedValue(customConfig);

    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Happy Hour Almoço')).toBeInTheDocument();
    });
  });

  it('exibe botões de adicionar regras', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Happy Hour')).toBeInTheDocument();
      expect(screen.getByText('Barril Progressivo')).toBeInTheDocument();
    });
  });

  it('exibe seção de simulador', async () => {
    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Simulador de Preço')).toBeInTheDocument();
    });
  });

  it('mostra erro quando carregamento falha', async () => {
    mockGetConfig.mockRejectedValue(new Error('Network error'));

    render(<DynamicPricingTab franchiseId="f1" storeId="s1" />);

    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar configuração.')).toBeInTheDocument();
    });
  });
});
