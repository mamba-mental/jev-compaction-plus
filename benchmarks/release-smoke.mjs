import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { collectToolCalls, compact, JevClient, noulAnswer, previewOf } from '../dist/index.js';

let checkedResults = 0;
let observedQuestions = 0;
for (const threshold of [400, 1500, 3000]) {
  const messages = [{ role: 'user', text: 'Keep the original task and exact evidence.', toolUses: [] }];
  for (let i = 0; i < 47; i++) {
    const length = [0, threshold - 1, threshold, threshold + 1, (i * 173) % 7000][i % 5];
    const text = `case-${i}:λ🙂\n`.repeat(Math.ceil(length / 8)).slice(0, length);
    messages.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: `id-${i}`, tool: 'Read', input: { path: `case-${i}` }, text }] });
    messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `id-${i}`, text, isError: i % 7 === 0 }] });
  }
  messages.push({ role: 'user', text: 'Still unfinished: validate before deploying.', toolUses: [] });
  const original = JSON.stringify(messages);
  const calls = collectToolCalls(messages, 6, 600);
  const expected = new Set(calls.filter(c => !c.pinned && c.resultChars >= threshold).flatMap(c => [`call_${c.id}`, `result_${c.id}`]));
  const asked = new Set();
  const client = new JevClient({
    apiKey: 'synthetic-test-key',
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      for (const name of Object.keys(body.questions)) {
        assert.ok(expected.has(name), `unexpected question: ${name}`);
        assert.equal(asked.has(name), false, 'each question must be sent once');
        asked.add(name);
      }
      return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(body.questions).map(name => [name, { noul: 0 }])) }));
    },
  });
  const result = await compact(messages, client, { minDropChars: threshold, preserveRecentMessages: 6, maxStateTokens: 6000, maxRequestTokens: 8000 });
  assert.deepEqual(asked, expected);
  assert.equal(JSON.stringify(messages), original);
  assert.deepEqual(result.messages.map(m => m.text), messages.map(m => m.text));
  for (const [i, call] of calls.entries()) {
    const before = messages[2 * i + 2].toolResults[0];
    const after = result.messages[2 * i + 2].toolResults[0];
    assert.equal(result.messages[2 * i + 1], messages[2 * i + 1]);
    assert.equal(after.tool_use_id, before.tool_use_id);
    if (call.pinned || call.resultChars < threshold) assert.equal(after, before);
    else {
      const file = result.drawer.find(f => f.path.endsWith(`/${call.id}-Read.txt`));
      assert.ok(file);
      assert.ok(after.text.includes(file.path));
      assert.equal(file.text.slice(file.text.indexOf('\n\n') + 2), before.text);
      assert.equal(after.isError, before.isError);
    }
    checkedResults++;
  }
  observedQuestions += asked.size;
}
for (const text of ['🙂', '\0', 'λ'.repeat(8193), 'line\n'.repeat(311)]) assert.equal(previewOf(text, 0), '');
for (const value of [-Number.EPSILON, 1 + Number.EPSILON, -1e100, 1e100]) assert.throws(() => noulAnswer({ q: { noul: value } }, 'q'), /Invalid Jev answer/);
for (const value of [0, Number.EPSILON, 1 - Number.EPSILON, 1]) assert.equal(noulAnswer({ q: { noul: value } }, 'q'), value);
const tiny = [{ role: 'user', text: 'start', toolUses: [] }, { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'tiny', tool: 'Read', input: {}, text: 'small' }] }];
tiny.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'tiny', text: 'small' }] });
const noRequest = await compact(tiny, { ask: async () => { throw new Error('should not ask'); } }, { preserveRecentMessages: 0, maxStateTokens: 1, maxRequestTokens: 1 });
assert.equal(noRequest.stats.requests, 0);
assert.deepEqual(noRequest.messages, tiny);
const large = [{ role: 'user', text: 'start', toolUses: [] }, { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'large', tool: 'Read', input: {}, text: 'x'.repeat(2000) }] }];
large.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'large', text: 'x'.repeat(2000) }] });
const invalidClient = new JevClient({ apiKey: 'synthetic-test-key', fetch: async () => new Response(JSON.stringify({ answers: { call_t1: { noul: -0.1 }, result_t1: { noul: 0 } } })) });
await assert.rejects(compact(large, invalidClient, { preserveRecentMessages: 0 }), /Invalid Jev answer/);
const files = ['src/compact.ts', 'src/state.ts', 'src/request.ts', 'dist/compact.js', 'dist/state.js', 'dist/request.js'];
const evidence = {
  timestamp: new Date().toISOString(), status: 'pass', compiledLibrary: true, network: 'mocked; no paid calls',
  checkedResults, observedQuestions, thresholds: [400, 1500, 3000],
  provenance: 'Additional scenarios written after selection; not a blinded external benchmark.',
  sha256: Object.fromEntries(files.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])),
};
mkdirSync('autoresearch-results', { recursive: true });
writeFileSync('autoresearch-results/release-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
