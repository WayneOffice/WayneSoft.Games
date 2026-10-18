'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const LOGIC_SCRIPT_PATTERN = /<script id="game-logic">([\s\S]*?)<\/script>/;

// game-logic must stay evaluable without a DOM: the sandbox below is a bare
// { console }, so the harness's isolation is only real while the block holds no
// DOM or timer reference. A top-level reference would throw at load, but one
// buried inside a function body would not surface until that function ran —
// which is exactly how presentation logic leaks into a "pure" block.
const DOM_DEPENDENT_IDENTIFIERS = ['document', 'window', 'localStorage', 'setTimeout', 'setInterval'];

function assertLogicBlockIsDomFree(source) {
  const leaks = DOM_DEPENDENT_IDENTIFIERS.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
  if (leaks.length === 0) {
    return;
  }
  throw new Error(
    `The game-logic block references ${leaks.join(', ')}, but it must stay evaluable without a DOM. ` +
    'The test harness runs this block in a bare { console } sandbox, so any DOM or timer reference ' +
    'breaks the block\'s isolation: a reference inside a function body would only fail once that ' +
    'function ran, and the harness\'s "pure logic" guarantee would be fiction.',
  );
}

// Every name the tests reach for. Names not yet defined by the current
// implementation resolve to undefined instead of throwing, so this loader
// keeps working while the game is built up task by task.
const EXPORTED_NAMES = [
  'MAX_ANSWER_DIGITS',
  'MAX_STARS',
  'LEVEL_COUNT',
  'MIXED_LEVEL_ID',
  'TIMED_CHALLENGE_LEVEL_ID',
  'TIMED_CHALLENGE_SECONDS',
  'PROGRESS_STORAGE_KEY',
  'HISTORICAL_WRONG_ANSWER_RATE',
  'MAX_TRACKED_WRONG_ANSWERS',
  'MIN_TEEN_SUBTRAHEND',
  'LEVEL_QUESTION_COUNTS',
  'LEVEL_TITLES',
  'feasibleQuestionsForLevel',
  'createRandom',
  'questionKey',
  'createQuestionStream',
  'formatQuestion',
  'toQuestion',
  'answerOfQuestion',
  'CHAIN_OPERATOR',
  'MIXED_OPERATOR',
  'ZODIAC_GLYPHS',
  'ZODIAC_NAMES',
  'POPE_GLYPH',
  'POPE_NAME',
  'ZODIAC_LEVEL_COUNT',
  'buildDemoSteps',
  'needsBorrowing',
  'computeStars',
  'isLevelPassed',
  'isLevelUnlocked',
  'createInitialProgress',
  'parseProgress',
  'serializeProgress',
  'mergeAnswerIntoProgress',
  'recordLevelResult',
  'recordChallengeScore',
  'appendDigit',
  'removeLastDigit',
  'canSubmitAnswer',
];

let cachedExports = null;

// Objects built inside the vm sandbox belong to a different realm than the
// host's assert module, so assert.deepEqual compares prototypes and fails with
// "Values have same structure but are not reference-equal". Round-tripping a
// value through JSON puts it back in the host realm.
function hostRealm(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildExportSource() {
  const entries = EXPORTED_NAMES.map(
    (name) => `${name}: (typeof ${name} === 'undefined' ? undefined : ${name})`,
  );
  return `\n;globalThis.__gameLogicExports = { ${entries.join(', ')} };\n`;
}

function loadGameLogic() {
  if (cachedExports !== null) {
    return cachedExports;
  }
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const match = LOGIC_SCRIPT_PATTERN.exec(html);
  if (match === null) {
    throw new Error('No <script id="game-logic"> block found in index.html');
  }
  assertLogicBlockIsDomFree(match[1]);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(match[1] + buildExportSource(), sandbox, {
    filename: 'index.html#game-logic',
  });
  cachedExports = sandbox.__gameLogicExports;
  return cachedExports;
}

module.exports = { loadGameLogic, hostRealm };
