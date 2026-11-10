/** Camadas na ordem do Explorador, com o rótulo em pt-BR. */
export const LAYERS: [string, string][] = [
  ['business', 'Negócio'], ['application', 'Aplicação'], ['technology', 'Tecnologia'], ['strategy', 'Estratégia'],
  ['motivation', 'Motivação'], ['implementation', 'Implementação'], ['physical', 'Física'], ['other', 'Outros'],
];

const LAYER_LABEL: Record<string, string> = Object.fromEntries(LAYERS);

export const layerLabel = (layer: string) => LAYER_LABEL[layer] ?? layer;

/** Dica de tipo de um elemento: o rótulo C4 quando houver, senão o tipo ArchiMate. */
export const typeHint = (e: { c4Label?: string | null; typeLabel?: string; type?: string }) =>
  e.c4Label ?? e.typeLabel ?? e.type ?? '';

/** Variável de cor do diagrama para cada camada (as mesmas do render.mjs). */
export const LAYER_VAR: Record<string, string> = {
  business: 'biz', application: 'app', technology: 'tech', physical: 'tech', motivation: 'mot',
  strategy: 'str', implementation: 'impl', other: 'oth',
};
