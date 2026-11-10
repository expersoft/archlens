/**
 * Why screen editing waits: a chat round (true or 'chat'), a screen edit being written into the draft ('save') or a
 * view being loaded ('view').
 */
export type Lock = boolean | 'chat' | 'save' | 'view' | undefined;

export const LOCKED_CHAT = 'Aguarde o chat terminar para editar';
export const LOCKED_SAVE = 'Aguarde a gravação terminar';
export const LOCKED_VIEW = 'Disponível quando a visão terminar de carregar';

/** The tooltip of a control the lock disables. */
export const lockText = (locked: Lock) => (locked === 'save' ? LOCKED_SAVE : locked === 'view' ? LOCKED_VIEW : LOCKED_CHAT);
