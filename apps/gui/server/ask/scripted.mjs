// Scripted provider for tests: replays canned replies in order.
export function scripted(turns, { tools = true } = {}) {
  const queue = [...turns];
  const seen = [];
  return {
    name: 'scripted', model: 'scripted', tools, seen,
    open({ system, tools: toolDefs }) {
      return {
        async send(input) {
          seen.push({ system, tools: toolDefs, input });
          if (!queue.length) throw new Error('scripted: sem resposta');
          const turn = queue.shift();
          if (turn instanceof Error) throw turn;
          return typeof turn === 'function' ? turn(input) : turn;
        },
      };
    },
  };
}
