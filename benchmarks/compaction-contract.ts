import assert from 'node:assert/strict';
import { compact, noulAnswer, previewOf, type JevAsker, type Message } from '../src/index.js';

const mode = process.argv[2] ?? 'all';
const results: Record<string, unknown> = {};

if (mode === 'preview' || mode === 'all') {
  const values = ['', 'A', 'do not disclose the middle value', 'HEAD_' + 'x'.repeat(10000) + '_TAIL'];
  let zeroPreviewFailures = 0;
  for (const value of values) {
    if (previewOf(value, 0) !== '') zeroPreviewFailures += 1;
  }
  const long = values[3]!;
  const normal = previewOf(long, 600);
  assert.ok(normal.startsWith('HEAD_'), 'default preview must retain the beginning');
  assert.ok(normal.endsWith('_TAIL'), 'default preview must retain the ending');
  assert.ok(normal.length <= 640, 'default preview must remain bounded');
  assert.equal(previewOf('short result', 600), 'short result');
  results.preview = { zeroPreviewFailures, cases: values.length, defaultPreviewChars: normal.length };
}

if (mode === 'probability' || mode === 'all') {
  let invalidProbabilitiesAccepted = 0;
  const invalid = [-0.01, -1, 1.01, 2, Number.NaN, Number.POSITIVE_INFINITY];
  for (const value of invalid) {
    try {
      noulAnswer({ q: { type: 'noul', noul: value } }, 'q');
      invalidProbabilitiesAccepted += 1;
    } catch (error) {
      assert.match(String(error), /Invalid Jev answer/);
    }
  }
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    assert.equal(noulAnswer({ q: { type: 'noul', noul: value } }, 'q'), value);
  }
  results.probability = { invalidProbabilitiesAccepted, invalidCases: invalid.length, validCases: 5 };
}

if (mode === 'efficiency' || mode === 'all') {
  const fixtures = [
    { name: 'small-only', lengths: Array.from({ length: 24 }, (_, i) => 20 + i), threshold: 1500 },
    { name: 'mixed', lengths: Array.from({ length: 48 }, (_, i) => i % 8 === 0 ? 8000 : 80), threshold: 1500 },
    { name: 'boundary', lengths: [0, 1, 1499, 1500, 1501, 5000], threshold: 1500 },
    { name: 'opt-out', lengths: [0, 1, 80, 1500, 5000], threshold: 0 },
  ];
  let smallQuestions = 0;
  let totalQuestions = 0;
  let requests = 0;
  let requestChars = 0;
  let verifiedResults = 0;
  const cases = [];
  for (const fixture of fixtures) {
    const messages: Message[] = [{ role: 'user', text: 'Never modify generated files. Preserve the task and exact evidence.', toolUses: [] }];
    const outputs = fixture.lengths.map((length, i) => `${i}:`.padEnd(length, 'x').slice(0, length));
    for (const [i, output] of outputs.entries()) {
      messages.push({
        role: 'assistant', text: '',
        toolUses: [{ tool_use_id: `call-${i}`, tool: 'Read', input: { file_path: `fixtures/${i}.txt` }, text: output }],
      });
      messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `call-${i}`, text: output }] });
    }
    messages.push({ role: 'assistant', text: 'Unfinished: verify the failure before deployment.', toolUses: [] });
    messages.push({ role: 'user', text: 'Continue the original task.', toolUses: [] });
    const inputBefore = JSON.stringify(messages);
    let caseQuestions = 0;
    let caseSmallQuestions = 0;
    let caseRequests = 0;
    const asker: JevAsker = {
      async ask(state, questions) {
        const keys = Object.keys(questions);
        requests += 1;
        caseRequests += 1;
        totalQuestions += keys.length;
        caseQuestions += keys.length;
        requestChars += JSON.stringify({ state, questions }).length;
        for (const key of keys) {
          const index = Number(key.match(/_t(\d+)$/)?.[1]) - 1;
          assert.ok(index >= 0 && index < outputs.length, 'questions must refer to real calls');
          if (outputs[index]!.length < fixture.threshold) {
            smallQuestions += 1;
            caseSmallQuestions += 1;
          }
        }
        return { answers: Object.fromEntries(keys.map(key => [key, { type: 'noul' as const, noul: 0 }])) };
      },
    };
    const out = await compact(messages, asker, {
      preserveRecentMessages: 2,
      minDropChars: fixture.threshold,
      maxRequestTokens: 6000,
      maxStateTokens: 5000,
      drawerDir: '/synthetic/.jev-drawer',
    });
    assert.equal(JSON.stringify(messages), inputBefore, 'input transcript must not be mutated');
    assert.deepEqual(out.messages.map(m => m.text), messages.map(m => m.text), 'all dialogue and instructions must stay verbatim');
    assert.equal(out.stats.requests, caseRequests);
    for (const [i, output] of outputs.entries()) {
      assert.equal(out.messages[i * 2 + 1], messages[i * 2 + 1], 'tool-use identity must remain intact in drawer mode');
      const result = out.messages[i * 2 + 2]!.toolResults![0]!;
      assert.equal(result.tool_use_id, `call-${i}`);
      if (output.length < fixture.threshold) {
        assert.equal(out.messages[i * 2 + 2], messages[i * 2 + 2], 'protected result identity must remain intact');
        assert.equal(result.text, output);
      } else {
        const file = out.drawer.find(item => item.path.endsWith(`/t${i + 1}-Read.txt`));
        assert.ok(file, 'every replaced result must have a recovery file');
        assert.ok(result.text.includes(file.path), 'replacement must point to the exact recovery file');
        assert.equal(file.text.slice(file.text.indexOf('\n\n') + 2), output, 'recovery must preserve every byte of output');
      }
      verifiedResults += 1;
    }
    cases.push({ name: fixture.name, questions: caseQuestions, smallQuestions: caseSmallQuestions, requests: caseRequests });
  }
  results.efficiency = { smallQuestions, totalQuestions, requests, requestChars, verifiedResults, cases };
}

assert.ok(Object.keys(results).length > 0, 'unknown benchmark mode');
console.log(JSON.stringify(results));
