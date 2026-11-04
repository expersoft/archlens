import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanChat } from './PlanChat';

const noop = () => {};

describe('PlanChat: anexar repositório', () => {
  it('anexa url e ref, mostra o chip url@ref e envia o anexo com a mensagem', async () => {
    const u = userEvent.setup();
    const onSend = vi.fn();
    render(<PlanChat chat={[]} onSend={onSend} onAnswer={noop} />);
    await u.click(screen.getByRole('button', { name: 'Anexar repositório' }));
    await u.type(screen.getByLabelText('URL do repositório'), 'https://github.com/a/pagamentos.git');
    await u.type(screen.getByLabelText('Ref (opcional)'), 'v2');
    await u.click(screen.getByRole('button', { name: 'Anexar' }));
    expect(screen.getByText('https://github.com/a/pagamentos.git@v2')).toBeTruthy();
    await u.type(screen.getByLabelText('Mensagem'), 'leia{Enter}');
    expect(onSend).toHaveBeenCalledWith('leia', { url: 'https://github.com/a/pagamentos.git', ref: 'v2' });
    // the attachment goes once
    expect(screen.queryByText('https://github.com/a/pagamentos.git@v2')).toBeNull();
  });

  it('anexo sem texto envia um pedido de leitura', async () => {
    const u = userEvent.setup();
    const onSend = vi.fn();
    render(<PlanChat chat={[]} onSend={onSend} onAnswer={noop} />);
    await u.click(screen.getByRole('button', { name: 'Anexar repositório' }));
    await u.type(screen.getByLabelText('URL do repositório'), 'git@github.com:a/b.git{Enter}');
    await u.type(screen.getByLabelText('Mensagem'), '{Enter}');
    expect(onSend).toHaveBeenCalledWith('Leia o repositório git@github.com:a/b.git', { url: 'git@github.com:a/b.git' });
  });

  it('web: anexar desabilitado com repositório no rascunho; chip mostra url@ref', () => {
    render(<PlanChat chat={[]} onSend={noop} onAnswer={noop} repo={{ url: 'https://github.com/a/b.git', ref: 'main', commit: 'abcdef1234' }} />);
    expect((screen.getByRole('button', { name: 'Anexar repositório' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('https://github.com/a/b.git@main')).toBeTruthy();
  });

  it('sem ref, o chip do rascunho mostra o commit curto', () => {
    render(<PlanChat chat={[]} onSend={noop} onAnswer={noop} repo={{ url: 'https://github.com/a/b.git', commit: 'abcdef1234' }} />);
    expect(screen.getByText('https://github.com/a/b.git@abcdef1')).toBeTruthy();
  });

  it('URL com credencial embutida é recusada no navegador e não vira anexo', async () => {
    const u = userEvent.setup();
    const onSend = vi.fn();
    render(<PlanChat chat={[]} onSend={onSend} onAnswer={noop} />);
    await u.click(screen.getByRole('button', { name: 'Anexar repositório' }));
    await u.type(screen.getByLabelText('URL do repositório'), 'https://x-access-token:ghp_segredo@github.com/a/b.git');
    await u.click(screen.getByRole('button', { name: 'Anexar' }));
    expect(screen.getByText('a URL do repositório não pode ter credencial embutida; use o token do ambiente (.env)')).toBeTruthy();
    expect(screen.queryByText(/ghp_segredo@github.com\/a\/b.git@?/, { selector: '.chip' })).toBeNull();
    await u.type(screen.getByLabelText('Mensagem'), 'leia{Enter}');
    expect(onSend).toHaveBeenCalledWith('leia');
    expect(JSON.stringify(onSend.mock.calls)).not.toContain('ghp_segredo');
  });

  it('ssh com só o usuário é aceito; ssh com senha é recusado', async () => {
    const u = userEvent.setup();
    render(<PlanChat chat={[]} onSend={noop} onAnswer={noop} />);
    await u.click(screen.getByRole('button', { name: 'Anexar repositório' }));
    await u.type(screen.getByLabelText('URL do repositório'), 'ssh://git:senha@host/a.git{Enter}');
    expect(screen.getByText(/não pode ter credencial embutida/)).toBeTruthy();
    await u.clear(screen.getByLabelText('URL do repositório'));
    await u.type(screen.getByLabelText('URL do repositório'), 'ssh://git@host/a.git{Enter}');
    expect(screen.getByText('ssh://git@host/a.git')).toBeTruthy();
    expect(screen.queryByText(/não pode ter credencial embutida/)).toBeNull();
  });
});

describe('PlanChat: caixa de mensagem', () => {
  it('cresce com o texto e volta ao tamanho inicial depois de enviar', async () => {
    const u = userEvent.setup();
    const proto = HTMLTextAreaElement.prototype;
    const sh = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get(this: HTMLTextAreaElement) { return 60 + this.value.split('\n').length * 20; } });
    try {
      render(<PlanChat chat={[]} onSend={noop} onAnswer={noop} />);
      const box = screen.getByLabelText('Mensagem') as HTMLTextAreaElement;
      const start = parseFloat(box.style.height);
      await u.type(box, 'a{Shift>}{Enter}{/Shift}b{Shift>}{Enter}{/Shift}c{Shift>}{Enter}{/Shift}d');
      expect(parseFloat(box.style.height)).toBeGreaterThan(start);
      await u.type(box, '{Enter}');
      expect(parseFloat(box.style.height)).toBe(start);
    } finally {
      delete (proto as unknown as Record<string, unknown>).scrollHeight;
      if (sh) Object.defineProperty(Element.prototype, 'scrollHeight', sh);
    }
  });
});
