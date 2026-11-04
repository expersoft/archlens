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
});
