/** Why screen editing waits: a chat round (true or 'chat') or a screen edit being written into the draft ('save'). */
export type Lock = boolean | 'chat' | 'save' | undefined;

export const LOCKED_CHAT = 'Aguarde o chat terminar para editar';
export const LOCKED_SAVE = 'Aguarde a gravação terminar';

/** The tooltip of a control the lock disables. */
export const lockText = (locked: Lock) => (locked === 'save' ? LOCKED_SAVE : LOCKED_CHAT);
