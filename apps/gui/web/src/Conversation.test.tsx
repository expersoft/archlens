import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Conversation } from './Conversation';
import type { Turn } from './question';

const noop = () => {};
const props = { turns: [] as Turn[], enabled: true, model: 'm1', onAsk: noop, onChoose: noop, onOpen: noop };

afterEach(() => vi.restoreAllMocks());

describe('Conversation', () => {
  it('Enter envia o texto e limpa; Shift+Enter quebra linha', async () => {
    const onAsk = vi.fn();
    const u = userEvent.setup();
    render(<Conversation {...props} onAsk={onAsk} />);
    const box = screen.getByLabelText('Pergunta') as HTMLTextAreaElement;
    await u.type(box, 'o que há{Shift>}{Enter}{/Shift}aqui');
    expect(onAsk).not.toHaveBeenCalled();
    expect(box.value).toBe('o que há\naqui');
    await u.keyboard('{Enter}');
    expect(onAsk).toHaveBeenCalledWith('o que há\naqui');
    expect(box.value).toBe('');
    expect(screen.getByText('via m1')).toBeTruthy();
  });

  it('desligada mostra como ligar e não aceita texto', () => {
    render(<Conversation {...props} enabled={false} />);
    expect(screen.getByText('Busca em texto desligada. Suba com archlens serve <base> --llm anthropic.')).toBeTruthy();
    expect((screen.getByLabelText('Pergunta') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('turno clarify mostra um botão por opção e o clique escolhe', async () => {
    const onChoose = vi.fn();
    const turn: Turn = {
      id: 1, question: 'quem é o pedido?', status: 'done',
      result: { kind: 'clarify', question: 'Qual deles?', options: [{ id: 'loja.pedidos', name: 'Pedidos', typeLabel: 'Sistema' }, { id: 'api.pedidos', name: 'API de Pedidos', typeLabel: 'Interface' }] },
    };
    render(<Conversation {...props} turns={[turn]} onChoose={onChoose} />);
    expect(screen.getByText('Qual deles?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'API de Pedidos · Interface' }));
    expect(onChoose).toHaveBeenCalledWith(turn, 'api.pedidos');
  });

  it('turno com answer mostra a tabela e copia o markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const u = userEvent.setup();
    const turn: Turn = {
      id: 2, question: 'o que sustenta o checkout?', status: 'done', markdown: '# Suporte\n',
      result: { kind: 'view', spec: {} },
      answer: {
        title: 'Suporte', spec: {}, notes: ['nota <b>x</b>'],
        sections: [{ label: 'Aplicação', rows: [{ name: 'Pedidos', type: 'ApplicationComponent', status: 'active', technology: 'Node' }] }],
        edges: [{ from: 'a', to: 'b', type: 'serving', sentence: 'Pedidos atende o checkout' }],
      },
    };
    render(<Conversation {...props} turns={[turn]} />);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    expect(screen.getByRole('columnheader', { name: 'Tecnologia' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Pedidos' })).toBeTruthy();
    expect(screen.getByText('Pedidos atende o checkout')).toBeTruthy();
    expect(screen.getByText('nota <b>x</b>')).toBeTruthy(); // texto, nunca HTML
    await u.click(screen.getByRole('button', { name: 'Copiar markdown' }));
    expect(writeText).toHaveBeenCalledWith('# Suporte\n');
  });

  it('mostra cancelada, erro, aviso e o botão Abrir visão', async () => {
    const onOpen = vi.fn();
    const view = { html: '', data: null, alerts: [], nodes: [], ms: { resolve: 0, layout: 0, render: 0 }, spec: {}, title: 'T', cached: false };
    const turns: Turn[] = [
      { id: 1, question: 'a', status: 'canceled' },
      { id: 2, question: 'b', status: 'error', error: 'provedor fora do ar' },
      { id: 3, question: 'c', status: 'done', warning: 'teto de 4 rodadas', result: { kind: 'view', spec: {} }, view },
      { id: 4, question: 'd', status: 'running', stage: 'consultando a base' },
    ];
    render(<Conversation {...props} turns={turns} onOpen={onOpen} />);
    expect(screen.getByText('cancelada')).toBeTruthy();
    expect(screen.getByText('provedor fora do ar')).toBeTruthy();
    expect(screen.getByText('teto de 4 rodadas')).toBeTruthy();
    expect(screen.getByText(/consultando a base/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir visão' }));
    expect(onOpen).toHaveBeenCalledWith(turns[2]);
  });
});
