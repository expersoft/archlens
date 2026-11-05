import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('mostra Nesta visão e Na base, a frase da relação e o chip de tecnologia', () => {
    render(<Details {...props} card={card} viewNode={node} viewEdges={edges} />);
    expect(screen.getByText('Nesta visão')).toBeTruthy();
    expect(screen.getByText('Na base')).toBeTruthy();
    expect(screen.getByText(edges[0].help!.sentence!)).toBeTruthy();
    expect(screen.queryByText('Alheia ao nó.')).toBeNull();
    expect(screen.getAllByText('REST').length).toBeGreaterThan(0);
    expect(screen.getByText(/“trecho citado”/)).toBeTruthy();
    expect(screen.getByText('scan')).toBeTruthy();
  });

  it('clicar no pai chama onPick; clicar na relação seleciona o outro nó; glossário', async () => {
    const onPick = vi.fn(); const onSel = vi.fn(); const onGl = vi.fn();
    render(<Details {...props} card={card} viewNode={node} viewEdges={edges} onPick={onPick} onSelectInView={onSel} onGlossary={onGl} />);
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
  it('Camada em pt-BR e a linha de tipo da base com rótulos, não identificadores', () => {
    const { unmount } = render(<Details {...props} card={card} viewNode={node} viewEdges={edges} />);
    expect(screen.getByText('Aplicação')).toBeTruthy();
    expect(screen.queryByText('application')).toBeNull();
    unmount();
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} />);
    expect(screen.getByText('Container · ArchiMate Application Component')).toBeTruthy();
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

  it('mostra as propriedades do cartão; sem propriedades não há rótulo', () => {
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

  it('sem docsEnabled não há aba Documentação', () => {
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} base="b" docsEnabled={false} />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Documentação')).toBeNull();
    expect(screen.getByText('Filho X')).toBeTruthy();
  });

  it('a aba só busca a documentação ao ser aberta; Detalhes volta ao cartão', async () => {
    render(<Details {...props} card={card} viewNode={null} viewEdges={edges} base="b" docsEnabled />);
    expect(screen.getByRole('tab', { name: 'Detalhes' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Filho X')).toBeTruthy();
    expect(getDoc).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: 'Documentação' }));
    expect(await screen.findByText('Texto do nó')).toBeTruthy();
    expect(getDoc).toHaveBeenCalledWith('b', 'tele.api');
    expect(screen.queryByText('Filho X')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Detalhes' }));
    expect(screen.getByText('Filho X')).toBeTruthy();
    expect(screen.queryByText('Texto do nó')).toBeNull();
  });

  it('a aba aberta acompanha a troca de nó', async () => {
    const view = { card, viewNode: null, viewEdges: edges, base: 'b', docsEnabled: true };
    const { rerender } = render(<Details {...props} {...view} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Documentação' }));
    await screen.findByText('Texto do nó');
    rerender(<Details {...props} {...view} nodeId="outro" card={null} />);
    expect(getDoc).toHaveBeenLastCalledWith('b', 'outro');
  });

  it('numa base sem documentação a aba aberta cede lugar aos detalhes', async () => {
    const view = { card, viewNode: null, viewEdges: edges, base: 'b' };
    const { rerender } = render(<Details {...props} {...view} docsEnabled />);
    await userEvent.click(screen.getByRole('tab', { name: 'Documentação' }));
    rerender(<Details {...props} {...view} docsEnabled={false} />);
    expect(screen.getByText('Filho X')).toBeTruthy();
  });
});
