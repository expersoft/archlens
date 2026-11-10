import type { AlertAction } from './AlertBadge';
import type { NestState, ViewSpec } from './api';
import { layerLabel } from './labels';
import { allLabel } from './nesting';

export interface AlertActionsInput {
  spec: ViewSpec;
  nest: NestState | null;
  selected: string | null;
  selectedName: string;
  /** Camadas presentes na visão. */
  layers: string[];
  notation: string;
  nestAll: () => void;
  /** Abre uma visão derivada da atual. */
  runSpec: (spec: ViewSpec, label: string) => void;
}

/** As ações do painel de avisos do Navegar: só as que se aplicam à visão e à seleção. */
export function alertActions(i: AlertActionsInput): AlertAction[] {
  const out: AlertAction[] = [];
  if (i.nest) out.push({ id: 'nest', label: allLabel(i.nest), run: i.nestAll });
  if (i.selected) {
    const id = i.selected;
    out.push({ id: 'focus', label: 'Focar no selecionado', run: () => i.runSpec({ ...i.spec, focus: [id], depth: 1 }, `Focar: ${i.selectedName}`) });
  }
  if (i.notation !== 'c4' && i.layers.length > 1) {
    out.push({
      id: 'layer', label: 'Mostrar só uma camada', run: () => {},
      options: i.layers.map((l) => ({ label: layerLabel(l), run: () => i.runSpec({ ...i.spec, layers: [l] }, `Só a camada ${layerLabel(l)}`) })),
    });
  }
  return out;
}
