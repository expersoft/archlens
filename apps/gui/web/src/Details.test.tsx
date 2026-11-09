import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getDoc: vi.fn() }));

import { Details } from './Details';
import { getDoc, type Card, type ViewEdge, type ViewNode } from './api';

const card: Card = {
  element: { id: 'tele.api', name: 'API de Agendamento', type: 'application-component', kind: 'container', typeLabel: 'Application Component', c4Label: 'Container', status: 'active', technology: 'REST', description: 'Agenda', aliases: ['api'] },
  parent: { id: 'tele', name: 'Plataforma de Teleconsulta', type: 'application-component' },
  children: [{ id: 'tele.api.x', name: 'Filho X', type: 'application-component' }],
  outgoing: {}, incoming: {}, properties: {},
  sources: [{ kind: 'doc', ref: 'adr-1', excerpt: 'trecho citado' }],
  rounds: [{ id: 'r1', date: '2026-01-01', summary: 'primeira', how: ['scan'] }],
};
const node: ViewNode = { name: 'API de Agendamento', typeLabel: 'Application Component', c4Label: 'Container', layer: 'application', technology: 'REST', role: 'supporter', distance: 1 };
const edges: ViewEdge[] = [
  { id: 'e1', from: 'tele.api', to: 'tele.app', type: 'serving', technology: 'REST', help: { sentence: 'Sentença vinda do viewData, serve App do Paciente.' } },
  { id: 'e2', from: 'x', to: 'y', type: 'serving', help: { sentence: 'Alheia ao nó.' } },
];
const props = { nodeId: 'tele.api', onPick: () => {}, onSelectInView: () => {}, onGlossary: () => {} };

describe('Details', () => {
  beforeEach(() => { vi.mocked(getDoc).mockReset(); vi.mocked(getDoc).mockResolvedValue({ text: 'Texto do nó' }); });

  it('mostra Nesta visão e Na base, a frase da relação e o chip de tecnologia', async () => {
    render(<Details {...props} card={card} viewNode={node} viewEdges={edges} />);
    expect(screen.getByText('Nesta visão')).toBeTruthy();
    expect(screen.getByText('Na base')).toBeTruthy();
    expect(screen.getByText(edges[0].help!.sentence!)).toBeTruthy();
    expect(screen.queryByText('Alheia ao nó.')).toBeNull();
    expect(screen.getAllByText('REST').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /Fontes e rodadas/ }));
    expect(screen.getByText(/“trecho citado”/)).toBeTruthy();
    expect(screen.getByText('scan')).toBeTruthy();
  });

  it('clicar no pai chama onPick; clicar na relação seleciona o outro nó; glossário', async () => {
    const onPick = vi.fn(); const onSel = vi.fn(); const onGl = vi.fn();
    render(<Details {...props} card={card} viewNode={node} viewEdges={edges} onPick={onPick} onSelectInView={onSel} onGlossary={onGl} />);
    await userEvent.click(screen.getByRole('button', { name: /Na base/ }));
    await userEvent.click(screen.getByText('Plataforma de Teleconsulta'));
    expect(onPick).toHaveBeenCalledWith('tele');
    await userEvent.click(screen.getByText(edges[0].help!.sentence!));
    expect(onSel).toHaveBeenCalledWith('tele.app');
    await userEvent.click(screen.getByText('Como ler as relações?'));
    expect(onGl).toHaveBeenCalled();
  });

  it('sem viewNode não mostra Nesta visão', () => {
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} />);
    expect(screen.queryByText('Nesta visão')).toBeNull();
    expect(screen.getByText('API de Agendamento')).toBeTruthy();
  });

  it('Camada em pt-BR e a linha de tipo com rótulos, não identificadores', () => {
    const { unmount } = render(<Details {...props} card={card} viewNode={node} viewEdges={edges} />);
    expect(screen.getByText('Aplicação')).toBeTruthy();
    expect(screen.queryByText('application')).toBeNull();
    unmount();
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} />);
    expect(screen.getByText('Container')).toBeTruthy();
    expect(screen.getByText('ArchiMate Application Component')).toBeTruthy();
    expect(screen.queryByText(/application-component/)).toBeNull();
  });

  it('relações de saída e de entrada iguais não repetem a chave', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = { id: 'tele.app', name: 'App', sentence: 'mesma' };
    render(<Details {...props} card={{ ...card, outgoing: { serving: [r] }, incoming: { serving: [r] } }} viewNode={null} viewEdges={[]} />);
    expect(screen.getAllByText('mesma')).toHaveLength(2);
    expect(err.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
    err.mockRestore();
  });

  it('mostra as propriedades do cartão; sem propriedades não há cartão', () => {
    const withProps: Card = { ...card, properties: { squad: 'Checkout', canais: ['web', 'app'] } };
    const { unmount } = render(<Details {...props} card={withProps} viewNode={null} viewEdges={edges} />);
    expect(screen.getByText('Propriedades')).toBeTruthy();
    expect(screen.getByText('squad')).toBeTruthy();
    expect(screen.getByText('Checkout')).toBeTruthy();
    expect(screen.getByText('web, app')).toBeTruthy();
    unmount();
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} />);
    expect(screen.queryByText('Propriedades')).toBeNull();
  });

  it('cabeçalho usa a cor da camada', () => {
    const { container, unmount } = render(<Details {...props} card={card} viewNode={node} viewEdges={edges} />);
    const head = container.querySelector('.np-head') as HTMLElement;
    expect(head.style.background).toContain('var(--app)');
    expect(head.style.borderBottom).toContain('var(--app-s)');
    unmount();
    const c2 = render(<Details {...props} card={card} viewNode={null} viewEdges={edges} layer="strategy" />);
    expect((c2.container.querySelector('.np-head') as HTMLElement).style.background).toContain('var(--str)');
  });

  it('cartões na ordem da spec', () => {
    const full: Card = { ...card, properties: { a: '1' }, outgoing: { serving: [{ id: 'x', name: 'X', sentence: 's' }] } };
    const { container } = render(<Details {...props} card={full} viewNode={node} viewEdges={edges} base="b" docsEnabled />);
    const titles = [...container.querySelectorAll('.np-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Propriedades', 'Documentação', 'Nesta visão', 'Relações na visão', 'Na base', 'Filhos', 'Fontes e rodadas']);
    const c2 = render(<Details {...props} card={full} viewNode={null} viewEdges={edges} base="b" docsEnabled />);
    expect([...c2.container.querySelectorAll('.np-title')].map((t) => t.textContent))
      .toEqual(['Propriedades', 'Documentação', 'Relações', 'Na base', 'Filhos', 'Fontes e rodadas']);
  });

  it('lista com 14 relações mostra 5 e "Mostrar mais 9"', async () => {
    const many: ViewEdge[] = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, from: 'tele.api', to: `o${i}`, type: 'serving', help: { sentence: `rel ${i}` } }));
    render(<Details {...props} card={card} viewNode={node} viewEdges={many} />);
    expect(screen.getAllByText(/^rel \d+$/)).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mais 9' }));
    expect(screen.getAllByText(/^rel \d+$/)).toHaveLength(14);
  });

  it('cartão recolhido continua recolhido ao trocar de nó', async () => {
    const view = { card, viewNode: node, viewEdges: edges };
    const { rerender } = render(<Details {...props} {...view} />);
    expect(screen.getByText(edges[0].help!.sentence!)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Relações na visão/ }));
    expect(screen.queryByText(edges[0].help!.sentence!)).toBeNull();
    rerender(<Details {...props} {...view} nodeId="outro" />);
    expect(screen.queryByText(edges[0].help!.sentence!)).toBeNull();
    expect(screen.getByRole('button', { name: /Relações na visão/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('dois cartões recolhidos continuam recolhidos ao trocar de nó', async () => {
    const withProps: Card = { ...card, properties: { squad: 'Checkout' } };
    const view = { card: withProps, viewNode: node, viewEdges: edges };
    const { rerender } = render(<Details {...props} {...view} />);
    await userEvent.click(screen.getByRole('button', { name: /Propriedades/ }));
    await userEvent.click(screen.getByRole('button', { name: /Nesta visão/ }));
    rerender(<Details {...props} {...view} nodeId="outro" />);
    expect(screen.getByRole('button', { name: /Propriedades/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /Nesta visão/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('base JSON: sem cartão Documentação', () => {
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} base="b" docsEnabled={false} />);
    expect(screen.queryByText('Documentação')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('documentação só é buscada com o cartão aberto', async () => {
    localStorage.setItem('archlens-node-card:doc', 'false');
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} base="b" docsEnabled />);
    expect(getDoc).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Documentação/ }));
    expect(await screen.findByText('Texto do nó')).toBeTruthy();
    expect(getDoc).toHaveBeenCalledWith('b', 'tele.api');
  });

  it('o cartão da documentação acompanha a troca de nó', async () => {
    const view = { card, viewNode: null, viewEdges: edges, base: 'b', docsEnabled: true };
    const { rerender } = render(<Details {...props} {...view} />);
    await screen.findByText('Texto do nó');
    rerender(<Details {...props} {...view} nodeId="outro" card={null} />);
    expect(getDoc).toHaveBeenLastCalledWith('b', 'outro');
  });

  it('slots trocam o conteúdo de Propriedades e Documentação; actions vão ao título', () => {
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} base="b" docsEnabled
      slots={{ properties: <div>editor de props</div>, doc: <div>editor de doc</div> }}
      actions={{ doc: <button type="button">✎ Editar</button> }} />);
    expect(screen.getByText('editor de props')).toBeTruthy();
    expect(screen.getByText('editor de doc')).toBeTruthy();
    expect(getDoc).not.toHaveBeenCalled();
    const docCard = screen.getByText('editor de doc').closest('.np-card') as HTMLElement;
    expect(within(docCard).getByRole('button', { name: '✎ Editar' })).toBeTruthy();
  });
});
