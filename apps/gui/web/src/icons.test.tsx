import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ArchlensMark, InfoIcon } from './icons';

describe('ícones', () => {
  it('InfoIcon é um svg decorativo no tamanho pedido', () => {
    const { container } = render(<InfoIcon size={14} />);
    const s = container.querySelector('svg')!;
    expect(s.getAttribute('aria-hidden')).toBe('true');
    expect(s.getAttribute('width')).toBe('14');
  });
  it('ArchlensMark usa o aro e as três faixas de camada pelos tokens', () => {
    const { container } = render(<ArchlensMark />);
    const s = container.querySelector('svg[data-mark="archlens"]')!;
    expect(s.getAttribute('aria-hidden')).toBe('true');
    const html = s.innerHTML;
    for (const t of ['--accent', '--biz-s', '--app-s', '--tech-s']) expect(html).toContain(`var(${t})`);
  });
});
