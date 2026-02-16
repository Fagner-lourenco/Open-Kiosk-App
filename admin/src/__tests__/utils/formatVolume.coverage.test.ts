import { describe, expect, it } from 'vitest';
import { formatVolume, formatVolumeCompact, formatVolumeShort } from '@/utils/formatVolume';

describe('formatVolume coverage', () => {
  it('formats default output for ml, liters and large liters', () => {
    expect(formatVolume(-10)).toBe('0 mL');
    expect(formatVolume(800)).toBe('800 mL');
    expect(formatVolume(2000)).toBe('2 L');
    expect(formatVolume(9600)).toBe('9,6 L');
    expect(formatVolume(1_200_000)).toBe('1.200 L');
  });

  it('formats compact output without spaces', () => {
    expect(formatVolumeCompact(-1)).toBe('0mL');
    expect(formatVolumeCompact(950)).toBe('950mL');
    expect(formatVolumeCompact(2000)).toBe('2L');
    expect(formatVolumeCompact(9100)).toBe('9.1L');
    expect(formatVolumeCompact(1_200_000)).toBe('1.200L');
  });

  it('formats short output for goals and big totals', () => {
    expect(formatVolumeShort(-1)).toBe('0mL');
    expect(formatVolumeShort(999)).toBe('999mL');
    expect(formatVolumeShort(91_200)).toBe('91L');
    expect(formatVolumeShort(1_200_000)).toBe('1K L');
  });
});

