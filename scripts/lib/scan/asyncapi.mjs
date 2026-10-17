// AsyncAPI: channels (topics/queues) the application publishes or subscribes. In 2.x the operation verbs are seen
// from the client: "subscribe" lists what the application sends, "publish" what it receives. 3.x says send/receive.
export function asyncapiFacts(path, doc) {
  const d = doc.data;
  const facts = [];
  if (String(d.asyncapi).startsWith('2')) {
    for (const [name, ch] of Object.entries(d.channels ?? {})) {
      const at = { file: path, line: doc.lineOf('channels', name) };
      if (ch?.subscribe) facts.push({ kind: 'channel', name, action: 'publish', ...msg(ch.subscribe), at });
      if (ch?.publish) facts.push({ kind: 'channel', name, action: 'subscribe', ...msg(ch.publish), at });
    }
  } else {
    for (const [opId, op] of Object.entries(d.operations ?? {})) {
      const key = String(op?.channel?.$ref ?? '').split('/').at(-1);
      const name = d.channels?.[key]?.address ?? key;
      if (!name || !['send', 'receive'].includes(op.action)) continue;
      facts.push({ kind: 'channel', name, action: op.action === 'send' ? 'publish' : 'subscribe', at: { file: path, line: doc.lineOf('operations', opId) } });
    }
  }
  return facts;
}
const msg = op => (op.message?.name ? { message: op.message.name } : {});
