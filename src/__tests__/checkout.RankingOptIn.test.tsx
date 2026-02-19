/**
 * Tests for RankingOptIn component — ranking opt-in form after drink dispense.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RankingOptIn } from '@/components/checkout/RankingOptIn';

// Mock salesService
vi.mock('@/services/salesService', () => ({
  salesService: {
    enrichOrderWithCustomerData: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock knownCustomers (register only — we test the real logic in knownCustomers.test.ts)
const mockRegisterCustomer = vi.fn();
vi.mock('@/utils/knownCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/knownCustomers')>();
  return {
    ...actual,
    registerCustomer: (...args: unknown[]) => mockRegisterCustomer(...args),
  };
});

// Mock i18n
vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'checkout.rankingTitle': 'Participar do Ranking!',
        'checkout.rankingSubtitle': 'Insira seu nome para aparecer no ranking.',
        'checkout.rankingName': 'Nome completo',
        'checkout.rankingCpf': 'CPF (opcional)',
        'checkout.rankingCpfHint': 'Usado para identificar compras futuras.',
        'checkout.rankingSubmit': 'Participar',
        'checkout.rankingSubmitting': 'Enviando...',
        'checkout.rankingSkip': 'Não, obrigado',
        'checkout.rankingAdded': 'Adicionado ao ranking! 🏆',
      };
      if (key === 'checkout.rankingClosingIn') return `Fechando em ${params?.seconds}s`;
      if (key === 'checkout.rankingWelcomeBack') return `Bom te ver de novo, ${params?.name}!`;
      return map[key] || key;
    },
  }),
}));

describe('RankingOptIn', () => {
  const defaultProps = {
    orderNumber: 'ORD-001',
    storeId: 'store1',
    fingerprints: ['card:516703_4789'],
    recognizedCustomer: null,
    onDone: vi.fn(),
    onSkip: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the ranking form with title and fields', () => {
    render(<RankingOptIn {...defaultProps} />);
    expect(screen.getByText('Participar do Ranking!')).toBeTruthy();
    expect(screen.getByLabelText('Nome completo')).toBeTruthy();
    expect(screen.getByLabelText('CPF (opcional)')).toBeTruthy();
    expect(screen.getByText('Participar')).toBeTruthy();
    expect(screen.getByText('Não, obrigado')).toBeTruthy();
  });

  it('shows welcome back message for recognized customer', () => {
    render(
      <RankingOptIn
        {...defaultProps}
        recognizedCustomer={{
          name: 'João Silva',
          cpf: '12345678901',
          fingerprints: ['cpf:12345678901'],
          lastSeen: Date.now(),
        }}
      />,
    );
    expect(screen.getByText('Bom te ver de novo, João!')).toBeTruthy();
  });

  it('pre-populates form from recognized customer', () => {
    render(
      <RankingOptIn
        {...defaultProps}
        recognizedCustomer={{
          name: 'João Silva',
          cpf: '12345678901',
          fingerprints: ['cpf:12345678901'],
          lastSeen: Date.now(),
        }}
      />,
    );
    expect(screen.getByDisplayValue('João Silva')).toBeTruthy();
    expect(screen.getByDisplayValue('123.456.789-01')).toBeTruthy();
  });

  it('submit button is disabled when name is empty', () => {
    render(<RankingOptIn {...defaultProps} />);
    const btn = screen.getByText('Participar').closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('calls onSkip when skip button is clicked', () => {
    render(<RankingOptIn {...defaultProps} />);
    fireEvent.click(screen.getByText('Não, obrigado'));
    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  it('submits enrichment and registers customer', async () => {
    const { salesService } = await import('@/services/salesService');
    const onDone = vi.fn();

    render(<RankingOptIn {...defaultProps} onDone={onDone} />);

    // Type name
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Maria Santos' },
    });

    // Type CPF
    fireEvent.change(screen.getByLabelText('CPF (opcional)'), {
      target: { value: '98765432109' },
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Participar'));
    });

    expect(salesService.enrichOrderWithCustomerData).toHaveBeenCalledWith(
      'ORD-001',
      {
        customerName: 'Maria Santos',
        customerIdentification: '98765432109',
      },
      'store1',
    );

    expect(mockRegisterCustomer).toHaveBeenCalledWith(
      'Maria Santos',
      '98765432109',
      ['card:516703_4789'],
    );

    // After brief delay, onDone is called
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDone).toHaveBeenCalled();
  });

  it('shows success state after submit', async () => {
    render(<RankingOptIn {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'João' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Participar'));
    });

    expect(screen.getByText('Adicionado ao ranking! 🏆')).toBeTruthy();
  });

  it('auto-skips after countdown expires', () => {
    render(<RankingOptIn {...defaultProps} />);

    // Advance 30 seconds
    act(() => { vi.advanceTimersByTime(30_000); });

    // onSkip should fire (via setTimeout deferred)
    act(() => { vi.advanceTimersByTime(100); });

    expect(defaultProps.onSkip).toHaveBeenCalled();
  });

  it('displays countdown', () => {
    render(<RankingOptIn {...defaultProps} />);
    expect(screen.getByText('Fechando em 30s')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Fechando em 25s')).toBeTruthy();
  });

  it('applies CPF mask on input', () => {
    render(<RankingOptIn {...defaultProps} />);
    const cpfInput = screen.getByLabelText('CPF (opcional)');

    fireEvent.change(cpfInput, { target: { value: '12345678901' } });
    expect((cpfInput as HTMLInputElement).value).toBe('123.456.789-01');
  });
});
