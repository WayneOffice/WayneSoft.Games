'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const LOGIC_SCRIPT_PATTERN = /<script id="game-logic">([\s\S]*?)<\/script>/;

// Every name the tests reach for. Names not yet defined by the current
// implementation resolve to undefined instead of throwing, so this loader
// keeps working while the game is built up task by task.
const EXPORTED_NAMES = [
  'MAX_ANSWER_DIGITS',
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
  'feasiblePairsForLevel',
  'createRandom',
  'questionKey',
  'createQuestionStream',
  'formatQuestion',
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
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(match[1] + buildExportSource(), sandbox, {
    filename: 'index.html#game-logic',
  });
  cachedExports = sandbox.__gameLogicExports;
  return cachedExports;
}

module.exports = { loadGameLogic, hostRealm };
