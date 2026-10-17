// YAML with line numbers, on the vendored "yaml" library: every document of a file, and the line of any path.
import { parseAllDocuments, LineCounter } from '../../vendor/yaml/index.js';

export function readYaml(text) {
  const lc = new LineCounter();
  const docs = [...parseAllDocuments(text, { lineCounter: lc, uniqueKeys: false })];
  return docs.map(doc => {
    if (doc.errors.length) throw new Error(doc.errors[0].message);
    return {
      data: doc.toJS({ maxAliasCount: 1000 }),
      lineOf: (...path) => {
        const node = path.length ? doc.getIn(path, true) : doc.contents;
        const off = node?.range?.[0];
        return off == null ? 1 : lc.linePos(off).line;
      },
    };
  }).filter(d => d.data != null);
}
