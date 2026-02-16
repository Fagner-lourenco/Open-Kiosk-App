import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';
import { useCalendarItems } from '@/hooks/useCalendarItems';

describe('Audit Admin - calendar type contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('item com startAt string nao deve ser tratado como "hoje" (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'legacy-item',
        data: {
          type: 'task',
          title: 'Legacy migration item',
          startAt: '2024-01-01T10:00:00.000Z',
          endAt: null,
          allDay: false,
          status: 'confirmed',
          ownerUserId: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));

    expect(result.current.todayItems).toHaveLength(0);
  });
});
