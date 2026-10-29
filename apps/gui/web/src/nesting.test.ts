import { describe, expect, it } from 'vitest';
import { toggleAll, toggleOne } from './nesting';
import type { NestState } from './api';

const st = (p: Partial<NestState>): NestState => ({ mode: 'edges', except: [], holders: ['a', 'b'], open: [], ...p });

describe('nesting', () => {
  it('toggleAll liga e desliga mantendo o depth', () => {
    expect(toggleAll({ k: 1 }, st({}))).toEqual({ k: 1, nesting: 'nested' });
    expect(toggleAll({ k: 1, nesting: { mode: 'edges', depth: 2 } }, st({}))).toEqual({ k: 1, nesting: { mode: 'nested', depth: 2 } });
    expect(toggleAll({ k: 1, nesting: 'nested' }, st({ mode: 'nested', open: ['a'] }))).toEqual({ k: 1 });
    expect(toggleAll({ k: 1, nesting: { mode: 'nested', depth: 1, except: ['a'] } }, st({ mode: 'nested', except: ['a'], open: ['b'] }))).toEqual({ k: 1 });
    expect(toggleAll({ k: 1, nesting: { mode: 'nested', depth: 1, except: ['a'] } }, st({ mode: 'nested', except: ['a', 'b'] })))
      .toEqual({ k: 1, nesting: { mode: 'nested', depth: 1 } });
  });
  it('toggleOne em nested põe e tira do except', () => {
    const on = toggleOne({ k: 1, nesting: 'nested' }, st({ mode: 'nested', open: ['a', 'b'] }), 'a');
    expect(on).toEqual({ k: 1, nesting: { mode: 'nested', except: ['a'] } });
    expect(toggleOne(on, st({ mode: 'nested', except: ['a'], open: ['b'] }), 'a')).toEqual({ k: 1, nesting: 'nested' });
    expect(toggleOne({ nesting: { mode: 'nested', depth: 1 } }, st({ mode: 'nested' }), 'a'))
      .toEqual({ nesting: { mode: 'nested', depth: 1, except: ['a'] } });
  });
  it('toggleOne em edges: primeiro põe, segundo devolve sem nesting', () => {
    const one = toggleOne({ k: 1, title: 'T' }, st({}), 'a');
    expect(one).toEqual({ k: 1, title: 'T', nesting: { mode: 'edges', except: ['a'] } });
    expect(toggleOne(one, st({ except: ['a'], open: ['a'] }), 'a')).toEqual({ k: 1, title: 'T' });
  });
});
