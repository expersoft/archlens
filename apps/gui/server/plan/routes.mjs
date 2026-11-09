// The planning routes: /plan (the agent, as NDJSON), /plan/open (restore a draft), /plan/preview (draw it),
// /plan/edit (an edit made on screen), /plan/element (a node as the draft leaves it), /plan/apply (write the confirmed
// plan, then the document and the diagrams) and /plan/notes (the interpretation notes).
import { dirname, relative, sep } from 'node:path';
import { newDraft, checkDraft, replanDraft, draftOpsHash, DRAFT_MAX_BYTES } from './draft.mjs';
import { applyEdit, screenConflicts } from './edits.mjs';
import { runPlan } from './agent.mjs';
import { checkRepo, scrubCredentials } from './repo.mjs';
import { ONE_REPO } from './tools.mjs';
import { normalizeRepoUrl } from '../../../../scripts/lib/scan/git.mjs';
import { buildPreview, previewActions, previewFlip, previewElement } from './preview.mjs';
import { applyAndDocument, writeNotes } from '../../../../scripts/lib/apply-flow.mjs';
import { buildDiagrams } from '../../../../scripts/lib/build.mjs';
import { openQuestions } from '../../../../scripts/lib/merge.mjs';
import { describeItem } from '../../../../scripts/lib/merge-report.mjs';
import { checkDocText, plainWikilinks } from '../../../../scripts/lib/node-doc.mjs';
import { docsUnsupported } from '../../../../scripts/lib/store/errors.mjs';

const MESSAGE_MAX = 20000;
const HISTORY_MAX = 40;
const SPECS_MAX = 20;
// A draft (its cap leaves out the plan, about 2.5× the delta) plus the message and the history.
const BODY_MAX = 4 * DRAFT_MAX_BYTES + 256 * 1024;
const APPLIED_LIST_MAX = 5000;
const DOC_FAILED = 'a base foi gravada, mas o ARCHITECTURE.md não foi regenerado; rode "archlens doc" na base';
const NOTE_MAX = 200_000;
const NOTE_FIELDS = ['overview', 'notes'];
// The write refusals the user solves by planning again (or by moving the document away): 409, with a GUI message (the
// core's names paths of the machine and CLI commands).
const CHANGED_WHILE_APPLYING = 'a base mudou enquanto o plano era aplicado; nada foi gravado. Revise o plano novo';
const REFUSALS = {
  E_STORE_CONFLICT: CHANGED_WHILE_APPLYING,
  E_PLAN_STALE: CHANGED_WHILE_APPLYING,
  E_STORE_DOC_FOREIGN: 'o ARCHITECTURE.md desta base não foi gerado por ela; mova-o ou gere em outro lugar antes de gravar',
};
const NO_CHROMIUM = 'Chromium indisponível no servidor; rode "npx playwright install chromium" na máquina do servidor';
const BUILD_FAILED = { E_BUILD_INVALID: 'o modelo gravado tem erros', E_BUILD_EMPTY: 'nenhuma visão com conteúdo', E_BUILD_VIEW: 'uma visão salva não abre' };
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const SCREEN_CONFLICT = 'O chat quer mudar algo que você editou; responda o aviso antes de aplicar';
/** The core's message without its leading code ("E_X: …"). */
const coreMessage = e => (e.code && e.message.startsWith(`${e.code}: `) ? e.message.slice(e.code.length + 2) : e.message);

/** Runs a write; a refusal in REFUSALS comes back as 409 with its GUI message and code. */
function guiWrite(fn) {
  try { return fn(); } catch (e) {
    if (!Object.hasOwn(REFUSALS, e.code)) throw e;
    throw Object.assign(new Error(REFUSALS[e.code]), { status: 409, code: e.code });
  }
}

function assertLocal(ctx) {
  if (ctx.store?.remote) {
    throw Object.assign(new Error('planejar ainda não funciona numa base gbrain no modo MCP; use a skill archlens-plan'), { status: 409, code: 'E_GUI_PLAN_MCP' });
  }
}

/** The draft from the browser: validated, then planned again over the current base (never used as sent). */
function draftFrom(ctx, raw) {
  assertLocal(ctx);
  return replanDraft(ctx, checkDraft(raw, ctx));
}

/** The document's path as the user knows it: relative to the folder that holds the base. */
const docName = (store, doc) => relative(dirname(store.locator.path), doc).split(sep).join('/');

/** The chat × screen conflicts of a draft still waiting for the user's answer. */
const conflictsOf = draft => screenConflicts(draft.delta, draft.edits ?? {}, draft.kept ?? []);

/** `draft` with the documentation of `id` out of the screen layer (and its "keep mine" answers). */
function dropDoc(draft, id) {
  const entry = draft.edits?.[id];
  if (typeof entry?.doc !== 'string') return draft;
  const { doc: _doc, ...rest } = entry;
  const edits = { ...draft.edits };
  if (Object.keys(rest).length) edits[id] = rest; else delete edits[id];
  return { ...draft, edits, kept: (draft.kept ?? []).filter(k => !(k.id === id && k.field === 'doc')) };
}

const questionsOf = plan => (plan ? openQuestions(plan).map(i => ({ key: i.key, class: i.class, question: describeItem(i).split('  → ')[0] })) : []);

/** The saved diagrams rebuilt with screenshots; the quality report without the machine's paths. Never throws. */
export async function rebuild(store, build = buildDiagrams) {
  try {
    const r = await build(store, store.read().raw, { shots: true });
    return { available: r.available, problems: r.problems, results: r.results.map(({ shot: _shot, ...rest }) => rest), ...(r.available ? {} : { reason: NO_CHROMIUM }) };
  } catch (e) {
    const why = BUILD_FAILED[e.code] ?? 'erro inesperado';
    return { available: false, problems: 0, results: [], error: `os diagramas não foram regenerados (${why}); a base foi gravada`, ...(e.code ? { code: e.code } : {}) };
  }
}

async function bodyOf(readJson, req, httpError, limit) {
  const body = await readJson(req, limit);
  if (!isObject(body)) throw httpError(400, 'o corpo deve ser um objeto JSON');
  return body;
}

function historyOf(history, httpError) {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > HISTORY_MAX
    || !history.every(m => isObject(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.length <= MESSAGE_MAX)) {
    throw httpError(400, 'history inválido: use uma lista de { role, text }');
  }
  // a credential typed in a url never reaches the model
  return history.map(({ role, text }) => ({ role, text: scrubCredentials(text) }));
}

/** The round just applied (its changelog entry), sent with the notes request. */
function appliedOf(applied, httpError) {
  if (applied === undefined) return undefined;
  const ids = v => Array.isArray(v) && v.length <= APPLIED_LIST_MAX && v.every(x => typeof x === 'string' && x.length <= 500);
  if (!isObject(applied) || typeof applied.summary !== 'string' || applied.summary.length > MESSAGE_MAX
    || !['added', 'changed', 'removed'].every(k => ids(applied[k]))) {
    throw httpError(400, 'applied inválido: use { summary, added, changed, removed }');
  }
  const { summary, added, changed, removed } = applied;
  return { summary, added, changed, removed };
}

const NOTATIONS = new Set(['archimate', 'c4']);

/**
 * Route table entries, to be mounted only when planning is on.
 * `h` brings the server's helpers (readJson, httpError, streaming headers) so this file does not import app.mjs.
 */
export function planRoutes({ registry, provider, config, telemetry, h }) {
  const { readJson, httpError, STREAMED, NDJSON_HEADERS } = h;
  const read = (req, limit = BODY_MAX) => bodyOf(readJson, req, httpError, limit);
  // Replanning reads the connector on this thread: in the turn of the base, it does not cross a read in a worker.
  const replan = (b, ctx, draft) => registry.inTurn(b, () => draftFrom(ctx, draft));

  async function plan(req, res, b) {
    const body = await read(req);
    const ctx = registry.get(b);
    const message = typeof body.message === 'string' ? scrubCredentials(body.message.trim()) : undefined;
    if (body.message !== undefined && message === undefined) throw httpError(400, 'message deve ser texto');
    if (message && message.length > MESSAGE_MAX) throw httpError(400, `a mensagem passa de ${MESSAGE_MAX} caracteres`);
    const { answer } = body;
    if (answer !== undefined && !(isObject(answer) && typeof answer.key === 'string' && typeof answer.resolution === 'string')) {
      throw httpError(400, 'answer deve ser { key, resolution }');
    }
    let attach;
    if (body.attach !== undefined) {
      if (!isObject(body.attach)) throw httpError(400, 'attach deve ser { url, ref? }');
      try { attach = checkRepo(body.attach, { allowFileUrls: !!config.plan.allowFileUrls }); } catch (e) { throw httpError(400, e.message, e.code); }
    }
    if (!message && !answer && !attach) throw httpError(400, 'informe a mensagem em {message} ou a resposta em {answer}');
    // `history` holds the prior turns only; the current text goes only in `message` (the agent adds it itself).
    const history = historyOf(body.history, httpError);
    const applied = appliedOf(body.applied, httpError);
    const replanned = await replan(b, ctx, body.draft === undefined ? newDraft(ctx) : body.draft);
    const had = replanned.draft.repo;
    if (attach && had && normalizeRepoUrl(had.url) !== normalizeRepoUrl(attach.url)) throw httpError(409, ONE_REPO, 'E_GUI_REPO');

    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    res.writeHead(200, NDJSON_HEADERS);
    const write = ev => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
    const t0 = Date.now();
    let metrics = { total: 0, llm: 0, tools: 0, rounds: 0, calls: 0, mode: 'tools', usage: { input: 0, output: 0, cacheRead: 0 } };
    let outcome = 'error';
    try {
      const out = await runPlan(ctx, { draft: replanned.draft, message, answer, history, attach, applied }, {
        provider, signal: ctl.signal, emit: write, git: { env: config.env ?? {}, plan: config.plan }, maxRounds: config.plan.maxRounds, timeoutMs: config.plan.timeoutMs, maxTokens: config.plan.maxTokens,
      });
      metrics = out.metrics;
      let { reply } = out;
      if (replanned.warning && !reply.warning) reply = { ...reply, warning: replanned.warning };
      outcome = reply.kind;
      write({ type: 'result', draft: out.draft, reply, previews: out.previews, opsHash: draftOpsHash(out.draft), screenConflicts: conflictsOf(out.draft) });
    } catch (e) {
      metrics.total = Date.now() - t0;
      if (e.code !== 'E_LLM_ABORT' || !ctl.signal.aborted) {
        // The work done so far goes back with the error.
        write({ type: 'error', error: e.message ?? String(e), ...(e.code ? { code: e.code } : {}), draft: e.draft ?? replanned.draft, previews: e.previews ?? [],
          ...(replanned.warning ? { warning: replanned.warning } : {}) });
      }
    }
    write({ type: 'done', metrics });
    if (!ctl.signal.aborted) {
      telemetry.record({
        at: new Date().toISOString(), base: b, route: 'plan', provider: provider.name, model: provider.model, mode: 'tools', outcome,
        ms: { total: metrics.total, llm: metrics.llm, tools: metrics.tools }, rounds: metrics.rounds, calls: metrics.calls,
        cacheRead: metrics.usage?.cacheRead ?? 0, question: message,
      });
    }
    res.end();
    return STREAMED;
  }

  /** Plans the draft again over the base as it is now; writes only when its ops are the ones the user confirmed. */
  async function apply(req, b) {
    const { draft, confirm } = await read(req);
    if (typeof confirm !== 'string') throw httpError(400, 'informe em {confirm} o opsHash do plano confirmado');
    assertLocal(registry.get(b));
    await registry.reload(b); // another write may have landed since the last poll
    const ctx = registry.get(b);
    // One turn from the check to the write: no read of the base gets between them.
    const res = await registry.inTurn(b, () => {
      const replanned = draftFrom(ctx, draft);
      const { plan: planned } = replanned.draft;
      const opsHash = draftOpsHash(replanned.draft);
      const conflicts = conflictsOf(replanned.draft);
      if (opsHash === null || opsHash !== confirm) {
        const message = conflicts.length ? SCREEN_CONFLICT : opsHash === null
          ? `o plano não está final; responda as perguntas abertas antes de aplicar${replanned.warning ? ` (${replanned.warning})` : ''}`
          : 'o plano mudou desde a confirmação (a base mudou); revise o plano novo e confirme de novo';
        throw Object.assign(httpError(409, message, 'E_GUI_PLAN_CHANGED'), {
          extra: { draft: replanned.draft, opsHash, questions: questionsOf(planned), screenConflicts: conflicts, ...(replanned.warning ? { warning: replanned.warning } : {}) },
        });
      }
      return guiWrite(() => applyAndDocument(ctx.store, planned));
    });
    if (!res.entry) return { entry: null, doc: null, build: null, preserved: [], notesDraftNeeded: false };
    await registry.reload(b);
    // the base is written: a document that failed is reported, not thrown (the core's error names the machine's paths)
    const doc = res.docError ? { error: DOC_FAILED } : docName(ctx.store, res.doc);
    return { entry: res.entry, doc, build: await registry.inTurn(b, () => rebuild(ctx.store)), preserved: res.preserved, notesDraftNeeded: true };
  }

  /**
   * An edit made on screen: validated, put in the draft's screen layer and planned again. A documentation equal to the
   * base's leaves the layer (unless the chat proposes another text): it changes nothing.
   */
  async function edit(req, b) {
    const { draft, edit: e } = await read(req);
    const ctx = registry.get(b);
    assertLocal(ctx);
    if (!isObject(e) || typeof e.id !== 'string' || !e.id.trim()) throw httpError(400, 'informe a edição em {edit}, com o id do nó');
    const { id } = e;
    const inBase = ctx.model.elements.has(id);
    let baseDoc = null;
    if (e.op === 'doc') {
      if (!ctx.store.supportsDocs) { const err = docsUnsupported(); throw httpError(400, coreMessage(err), err.code); }
      if (typeof e.text !== 'string') throw httpError(400, `a documentação editada de "${id}" precisa ser texto`, 'E_GUI_DRAFT');
      try { checkDocText(e.text, id); } catch (err) { throw httpError(400, coreMessage(err), err.code); }
      // read before the turn: readDoc waits on the queue of the base
      if (inBase) baseDoc = await ctx.readDoc(id);
    }
    const out = await registry.inTurn(b, () => {
      const checked = checkDraft(draft, ctx);
      if ((e.op === 'properties' || e.op === 'doc') && !inBase && !checked.delta?.model?.elements?.some(x => x?.id === id)) {
        throw httpError(400, `"${id}" não existe na base nem no rascunho`, 'E_UNKNOWN_REF');
      }
      let next = applyEdit(checked, e, ctx.model.elements.get(id)?.properties ?? {});
      if (e.op === 'doc' && e.text.trim() === (baseDoc ?? '').trim()) {
        const chat = checked.delta?.docs?.find(d => d?.id === id);
        if (!chat || chat.text.trim() === e.text.trim()) next = dropDoc(next, id);
      }
      // applyEdit leaves the plan's state and ops behind: always plan again
      return replanDraft(ctx, next);
    });
    return { ...out, opsHash: draftOpsHash(out.draft), screenConflicts: conflictsOf(out.draft) };
  }

  /** A node as the draft leaves it: its card over the preview, its documentation and whether the draft removes it. */
  async function element(req, b) {
    const { draft, id } = await read(req);
    if (typeof id !== 'string' || !id) throw httpError(400, 'informe o id do elemento');
    const ctx = registry.get(b);
    const { draft: replanned } = await replan(b, ctx, draft);
    const { card, removed, doc: drafted } = previewElement(ctx, replanned, id);
    // the draft's text, else the base's read now (not the snapshot in memory); `docRaw` as written (what the editor
    // loads), `doc` with its wikilinks as names (what is shown)
    let raw = drafted ?? null;
    if (drafted === undefined && ctx.store.supportsDocs && ctx.model.elements.has(id)) raw = await ctx.readDoc(id);
    const docRaw = raw || null;
    return { card, doc: docRaw ? plainWikilinks(docRaw) : null, docRaw, docs: !!ctx.store.supportsDocs, removed };
  }

  async function notes(req, b) {
    const body = await read(req);
    const given = NOTE_FIELDS.filter(k => body[k] !== undefined);
    if (!given.length) throw httpError(400, 'informe as notas em {overview} e/ou {notes}');
    for (const k of given) {
      if (typeof body[k] !== 'string') throw httpError(400, `${k} deve ser texto`);
      if (body[k].length > NOTE_MAX) throw httpError(400, `${k} passa de ${NOTE_MAX} caracteres`);
    }
    const ctx = registry.get(b);
    assertLocal(ctx);
    const { doc } = await registry.inTurn(b, () => guiWrite(() => writeNotes(ctx.store, Object.fromEntries(given.map(k => [k, body[k]])))));
    await registry.reload(b);
    return { doc: docName(ctx.store, doc) };
  }

  return [
    ['POST', /^\/api\/bases\/([^/]+)\/plan$/, (req, [b], _url, res) => plan(req, res, b)],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/open$/, async (req, [b]) => {
      const { draft } = await read(req);
      const out = await replan(b, registry.get(b), draft);
      return { ...out, opsHash: draftOpsHash(out.draft), screenConflicts: conflictsOf(out.draft) };
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/preview$/, async (req, [b]) => {
      const { draft, specs, notation } = await read(req);
      if (specs !== undefined && !(Array.isArray(specs) && specs.every(isObject))) throw httpError(400, 'specs deve ser uma lista de visões');
      if (specs && specs.length > SPECS_MAX) throw httpError(400, `no máximo ${SPECS_MAX} visões por pedido`);
      if (notation !== undefined && !NOTATIONS.has(notation)) throw httpError(400, 'notation deve ser archimate ou c4');
      const ctx = registry.get(b);
      const { draft: replanned } = await replan(b, ctx, draft);
      return { ...(await buildPreview(ctx, replanned, specs, { notation })), opsHash: draftOpsHash(replanned), screenConflicts: conflictsOf(replanned) };
    }],
    // Navigation over the preview: the context menu and the notation flip see what the draft adds.
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/actions$/, async (req, [b]) => {
      const { draft, id } = await read(req);
      if (typeof id !== 'string' || !id) throw httpError(400, 'informe o id do elemento');
      const ctx = registry.get(b);
      return { actions: previewActions(ctx, (await replan(b, ctx, draft)).draft, id) };
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/flip$/, async (req, [b]) => {
      const { draft, spec } = await read(req);
      if (!isObject(spec)) throw httpError(400, 'informe a visão em {spec}');
      const ctx = registry.get(b);
      return { spec: previewFlip(ctx, (await replan(b, ctx, draft)).draft, spec) };
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/edit$/, async (req, [b]) => edit(req, b)],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/element$/, async (req, [b]) => element(req, b)],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/apply$/, async (req, [b]) => apply(req, b)],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/notes$/, async (req, [b]) => notes(req, b)],
  ];
}
