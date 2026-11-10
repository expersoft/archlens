import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planElement: vi.fn(), planEdit: vi.fn() }));

import * as api from '../api';
import { NodePanel } from './NodePanel';

const draft = (n = 0) => ({ 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: `n${n}` });
const card = (id: string, name: string): api.Card => ({
  element: { id, name, type: 'application-component', layer: 'application', typeLabel: 'Application Component' },
  parent: null, children: [], outgoing: {}, incoming: {}, properties: { dono: 'time' },
});
const el = (id: string, name: string, over: Partial<api.PlanElement> = {}): api.PlanElement => ({ card: card(id, name), doc: null, docRaw: null, docs: false, removed: false, ...over });
const planElement = vi.mocked(api.planElement);
const planEdit = vi.mocked(api.planEdit);

beforeEach(() => { vi.resetAllMocks(); });

describe('NodePanel', () => {
  it('sem nó selecionado pede para selecionar na prévia', () => {
    render(<NodePanel base="b" draft={draft()} id={null} onDraft={() => {}} />);
    expect(screen.getByText(/Selecione um nó/)).toBeTruthy();
    expect(planElement).not.toHaveBeenCalled();
  });

  it('mostra o cartão do planElement e a documentação do rascunho sem buscar a da base', async () => {
    planElement.mockResolvedValue(el('a', 'Cashback', { doc: 'Texto do rascunho', docs: true }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Cashback' })).toBeTruthy();
    expect(screen.getByText('time')).toBeTruthy();
    expect(await screen.findByText('Texto do rascunho')).toBeTruthy();
    expect(planElement).toHaveBeenCalledWith('b', draft(), 'a');
  });

  it('recarrega quando o rascunho muda e descarta a resposta atrasada', async () => {
    let slow!: (r: api.PlanElement) => void;
    planElement.mockImplementationOnce(() => new Promise((r) => { slow = r; }));
    planElement.mockResolvedValueOnce(el('a', 'Novo nome'));
    const { rerender } = render(<NodePanel base="b" draft={draft(1)} id="a" onDraft={() => {}} />);
    rerender(<NodePanel base="b" draft={draft(2)} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Novo nome' })).toBeTruthy();
    slow(el('a', 'Nome velho'));
    await waitFor(() => expect(screen.queryByText('Nome velho')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Novo nome' })).toBeTruthy();
  });

  it('nó removido pelo rascunho aparece sem Editar', async () => {
    planElement.mockResolvedValue(el('a', 'Legado', { removed: true, docs: true }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Legado' })).toBeTruthy();
    expect(screen.getByText(/removido pelo rascunho/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });

  it('mostra o erro do servidor', async () => {
    planElement.mockRejectedValue(new Error('nó não existe'));
    render(<NodePanel base="b" draft={draft()} id="zzz" onDraft={() => {}} />);
    expect(await screen.findByText('nó não existe')).toBeTruthy();
  });

  describe('edição', () => {
    const newDraft = { ...draft(9), edits: { a: { properties: { dono: 'outro' } } } };
    it('editar propriedades chama planEdit com { op: "properties" } e devolve o rascunho por onDraft', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, docRaw: 'x', doc: 'x' }));
      planEdit.mockResolvedValue({ draft: newDraft, opsHash: 'h', screenConflicts: [] });
      const onDraft = vi.fn();
      render(<NodePanel base="b" draft={draft()} id="a" onDraft={onDraft} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar propriedades/ }));
      fireEvent.change(screen.getByLabelText('Valor de dono'), { target: { value: 'outro' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => expect(onDraft).toHaveBeenCalledWith(newDraft, 'h', []));
      expect(planEdit).toHaveBeenCalledWith('b', draft(), { op: 'properties', id: 'a', properties: { dono: 'outro' } });
    });

    it('mantém as edições de tela anteriores do nó ao enviar as propriedades', async () => {
      const d = { ...draft(), edits: { a: { properties: { velho: 'v' } } } };
      planElement.mockResolvedValue(el('a', 'Cashback'));
      planEdit.mockResolvedValue({ draft: d, opsHash: null, screenConflicts: [] });
      render(<NodePanel base="b" draft={d} id="a" onDraft={() => {}} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar propriedades/ }));
      fireEvent.change(screen.getByLabelText('Valor de dono'), { target: { value: 'outro' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => expect(planEdit).toHaveBeenCalled());
      expect(planEdit.mock.calls[0][2]).toEqual({ op: 'properties', id: 'a', properties: { velho: 'v', dono: 'outro' } });
    });

    it('editar a documentação carrega o texto bruto e chama planEdit com { op: "doc" }', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'Veja Pix', docRaw: 'Veja [[pix]]' }));
      planEdit.mockResolvedValue({ draft: newDraft, opsHash: null, screenConflicts: [] });
      render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
      const ta = screen.getByLabelText('Documentação') as HTMLTextAreaElement;
      expect(ta.value).toBe('Veja [[pix]]');
      fireEvent.change(ta, { target: { value: 'Veja [[pix]] já' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => expect(planEdit).toHaveBeenCalledWith('b', draft(), { op: 'doc', id: 'a', text: 'Veja [[pix]] já' }));
    });

    it('sem documentação o cartão oferece Escrever', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true }));
      render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Escrever' }));
      expect(screen.getByLabelText('Documentação')).toBeTruthy();
    });

    it('erro 400 do planEdit aparece no cartão e o editor continua aberto', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'x', docRaw: 'x' }));
      planEdit.mockRejectedValue(new api.ApiError('marcador do archlens na documentação', undefined, 400));
      render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
      fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'y' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect((await screen.findByRole('alert')).textContent).toContain('marcador do archlens');
      expect(screen.getByLabelText('Documentação')).toBeTruthy();
    });

    it('erro ao confirmar no editor ampliado aparece no rodapé da janela', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'x', docRaw: 'x' }));
      planEdit.mockRejectedValue(new api.ApiError('marcador do archlens na documentação', undefined, 400));
      render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
      const dlg = screen.getByRole('dialog');
      fireEvent.change(dlg.querySelector('textarea')!, { target: { value: 'y' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      await waitFor(() => expect(dlg.querySelector('.doc-win-f [role="alert"]')?.textContent).toContain('marcador do archlens'));
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('o editor continua aberto, com o texto, quando o pai renderiza com outro onDirty', async () => {
      planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'x', docRaw: 'x' }));
      const { rerender } = render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} onDirty={() => {}} />);
      await screen.findByRole('heading', { name: 'Cashback' });
      fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
      fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo' } });
      rerender(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} onDirty={() => {}} />);
      expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('novo');
    });
  });

  it('com o chat rodando (locked) Editar, Escrever e Confirmar ficam desabilitados, com a dica', async () => {
    planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'x', docRaw: 'x' }));
    const { rerender } = render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo' } });
    rerender(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} locked />);
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    for (const n of [/Editar propriedades/, /Editar documentação/]) {
      const b = screen.getByRole('button', { name: n }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.title).toBe('Aguarde o chat terminar para editar');
    }
  });

  it('com o chat rodando o Escrever de um nó sem documentação fica desabilitado', async () => {
    planElement.mockResolvedValue(el('a', 'Cashback', { docs: true }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} locked />);
    await screen.findByRole('heading', { name: 'Cashback' });
    expect((screen.getByRole('button', { name: 'Escrever' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Editar num cartão recolhido abre o cartão, e ele não recolhe com o editor aberto', async () => {
    localStorage.setItem('archlens-node-card:properties', 'false');
    planElement.mockResolvedValue(el('a', 'Cashback'));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar propriedades' }));
    const input = screen.getByLabelText('Valor de dono') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'outro' } });
    fireEvent.click(screen.getByRole('button', { name: /Propriedades/ }));
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('outro');
    localStorage.clear();
  });

  it('travado só pela gravação, a dica pede para esperar a gravação', async () => {
    planElement.mockResolvedValue(el('a', 'Cashback', { docs: true, doc: 'x', docRaw: 'x' }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} locked="save" />);
    await screen.findByRole('heading', { name: 'Cashback' });
    for (const n of [/Editar propriedades/, /Editar documentação/]) {
      const b = screen.getByRole('button', { name: n }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.title).toBe('Aguarde a gravação terminar');
    }
  });
});
