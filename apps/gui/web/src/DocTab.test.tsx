import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getDoc: vi.fn() }));

import { DocTab } from './DocTab';
import { getDoc } from './api';

const doc = vi.mocked(getDoc);
/** A getDoc answer the test releases by hand. */
function pending() {
  let answer!: (v: { text: string | null }) => void;
  const promise = new Promise<{ text: string | null }>((done) => { answer = done; });
  return { promise, answer };
}

describe('DocTab', () => {
  beforeEach(() => { doc.mockReset(); });

  it('busca só ao montar', async () => {
    doc.mockResolvedValue({ text: 'Texto' });
    const { rerender } = render(<DocTab base="b" id="x" />);
    await screen.findByText('Texto');
    rerender(<DocTab base="b" id="x" />);
    expect(doc).toHaveBeenCalledTimes(1);
    expect(doc).toHaveBeenCalledWith('b', 'x');
  });

  it('mostra markdown formatado, sem HTML ativo', async () => {
    doc.mockResolvedValue({ text: '## Como funciona\n\n- **item**\n\n<script>alert(1)</script>' });
    const { container } = render(<DocTab base="b" id="x" />);
    expect((await screen.findByRole('heading', { name: 'Como funciona' })).tagName).toBe('H2');
    expect(container.querySelector('strong')?.textContent).toBe('item');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert/)).toBeTruthy();
  });

  it('estado vazio diz como escrever', async () => {
    doc.mockResolvedValue({ text: null });
    render(<DocTab base="b" id="x" />);
    expect(await screen.findByText('Este nó ainda não tem documentação. Peça no Planejar, use a skill archlens-plan ou escreva no markdown, depois do bloco do archlens.')).toBeTruthy();
  });

  it('resposta atrasada do nó anterior é ignorada', async () => {
    const a = pending(), b = pending();
    doc.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { rerender } = render(<DocTab base="b" id="a" />);
    rerender(<DocTab base="b" id="b" />);
    await act(async () => { b.answer({ text: 'Texto de B' }); });
    await act(async () => { a.answer({ text: 'Texto de A' }); });
    expect(screen.getByText('Texto de B')).toBeTruthy();
    expect(screen.queryByText('Texto de A')).toBeNull();
  });

  it('o texto do nó anterior some assim que o nó muda', async () => {
    doc.mockResolvedValueOnce({ text: 'Texto de A' }).mockReturnValueOnce(pending().promise);
    const { rerender } = render(<DocTab base="b" id="a" />);
    await screen.findByText('Texto de A');
    rerender(<DocTab base="b" id="b" />);
    expect(screen.queryByText('Texto de A')).toBeNull();
    expect(screen.getByText('Carregando…')).toBeTruthy();
  });

  it('erro mostra mensagem, sem quebrar o painel', async () => {
    doc.mockRejectedValue(new Error('o remoto não respondeu'));
    render(<DocTab base="b" id="x" />);
    expect(await screen.findByText('Não consegui ler a documentação: o remoto não respondeu')).toBeTruthy();
  });

  it('com text dado, não busca', () => {
    render(<DocTab base="b" id="x" text="Já em mãos" />);
    expect(screen.getByText('Já em mãos')).toBeTruthy();
    expect(doc).not.toHaveBeenCalled();
  });

  it('max corta, expande e abre a janela de leitura', async () => {
    const { container } = render(<DocTab base="b" id="x" text="Corpo" max />);
    expect(container.querySelector('.doc-box.open')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir' }));
    expect(container.querySelector('.doc-box.open')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(screen.getByRole('dialog', { name: 'Documentação do nó' })).toBeTruthy();
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
