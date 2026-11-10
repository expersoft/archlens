import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDelayed } from './useDelayed';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useDelayed', () => {
  it('só liga depois de 300 ms', () => {
    const { result } = renderHook(({ on }) => useDelayed(on), { initialProps: { on: true } });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });
  it('desliga na hora', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayed(on), { initialProps: { on: true } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(true);
    rerender({ on: false });
    expect(result.current).toBe(false);
    rerender({ on: true });
    expect(result.current).toBe(false);
  });
});
