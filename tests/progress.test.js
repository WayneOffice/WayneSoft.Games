'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic, hostRealm } = require('./game-script-loader');

const logic = loadGameLogic();

test('eight out of ten is one star, seven is none', () => {
  assert.equal(logic.computeStars(8, 10), 1);
  assert.equal(logic.computeStars(7, 10), 0);
});

test('the star thresholds hold at every level length', () => {
  assert.equal(logic.computeStars(10, 10), 3);
  assert.equal(logic.computeStars(9, 10), 2);
  assert.equal(logic.computeStars(12, 12), 3);
  assert.equal(logic.computeStars(11, 12), 2);
  assert.equal(logic.computeStars(10, 12), 1);
  assert.equal(logic.computeStars(15, 15), 3);
  assert.equal(logic.computeStars(14, 15), 2);
  assert.equal(logic.computeStars(13, 15), 1);
  assert.equal(logic.computeStars(12, 15), 1);
  assert.equal(logic.computeStars(11, 15), 0);
});

test('passing the level means earning at least one star', () => {
  assert.equal(logic.isLevelPassed(8, 10), true);
  assert.equal(logic.isLevelPassed(7, 10), false);
});

// The 80% pass line is not the same as Math.floor(questionCount * 0.8): at
// twelve questions that mutant would pass a 75% run (9/12), unlocking the next
// level. Pin each length just below the line, plus the 90% two-star boundary.
test('the pass line is not rounded down at any level length', () => {
  assert.equal(logic.computeStars(9, 12), 0);
  assert.equal(logic.computeStars(10, 15), 0);
  // 9/10 is exactly 90%, which earns two stars, not zero.
  assert.equal(logic.computeStars(9, 10), 2);
});

test('only level 1 is unlocked on a fresh profile', () => {
  const progress = logic.createInitialProgress();
  assert.equal(logic.isLevelUnlocked(progress, 1), true);
  assert.equal(logic.isLevelUnlocked(progress, 2), false);
  assert.equal(logic.isLevelUnlocked(progress, 10), false);
});

test('clearing a level unlocks the next one', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 9, 15, 15);
  assert.equal(logic.isLevelUnlocked(progress, 10), true);
  logic.recordLevelResult(progress, 12, 15, 15);
  assert.equal(logic.isLevelUnlocked(progress, logic.TIMED_CHALLENGE_LEVEL_ID), true);
});

test('a failed level does not unlock the next one', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 1, 5, 10);
  assert.equal(logic.isLevelUnlocked(progress, 2), false);
});

test('replaying a level keeps the best stars and the best score', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 1, 10, 10);
  logic.recordLevelResult(progress, 1, 8, 10);
  assert.equal(progress.levelStars['1'], 3);
  assert.equal(progress.levelBestScore['1'], 10);
});

test('a wrong answer is tracked, then counted up on repeat', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  assert.deepEqual(hostRealm(progress.wrongAnswers), [{ a: 42, b: 7, count: 2 }]);
});

test('a correct answer is not tracked', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, true);
  assert.deepEqual(hostRealm(progress.wrongAnswers), []);
});

test('answering a tracked question correctly removes it from the pool', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, true);
  assert.deepEqual(hostRealm(progress.wrongAnswers), []);
});

test('mastering one question leaves the other tracked questions alone', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 53, b: 8 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, true);
  assert.deepEqual(hostRealm(progress.wrongAnswers), [{ a: 53, b: 8, count: 1 }]);
});

test('a correct answer on a question that was never wrong is a no-op', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 61, b: 5 }, true);
  assert.deepEqual(hostRealm(progress.wrongAnswers), [{ a: 42, b: 7, count: 1 }]);
});

// The pool array is handed to the question stream once, at level start, and the
// stream closes over that reference for the whole level. Removing a mastered
// question must therefore mutate the array in place; reassigning it (as
// Array.prototype.filter would) would leave the stream reading a stale snapshot.
test('removing a mastered question keeps the pool array identity', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 53, b: 8 }, false);
  const pool = progress.wrongAnswers;
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, true);
  assert.equal(progress.wrongAnswers, pool);
  assert.equal(pool.length, 1);
});

test('the tracked wrong answers list is capped', () => {
  const progress = logic.createInitialProgress();
  for (let i = 0; i < logic.MAX_TRACKED_WRONG_ANSWERS + 10; i += 1) {
    logic.mergeAnswerIntoProgress(progress, { a: 20 + i, b: 3 }, false);
  }
  assert.equal(progress.wrongAnswers.length, logic.MAX_TRACKED_WRONG_ANSWERS);
});

test('progress survives a serialize and parse round trip', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 1, 10, 10);
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  progress.isMuted = true;
  assert.deepEqual(logic.parseProgress(logic.serializeProgress(progress)), progress);
});

test('a saved profile is a byte-level fixed point of parse then serialize', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 3, 9, 10);
  logic.recordChallengeScore(progress, logic.TIMED_CHALLENGE_LEVEL_ID, 7);
  logic.mergeAnswerIntoProgress(progress, { a: 42, b: 7 }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 85, b: 27, c: 18, operator: '-' }, false);
  progress.challengePlayed = true;
  progress.isMuted = true;
  const once = logic.serializeProgress(progress);
  assert.equal(logic.serializeProgress(logic.parseProgress(once)), once);
});

test('a missing or corrupt saved value falls back to a fresh profile', () => {
  assert.deepEqual(logic.parseProgress(null), logic.createInitialProgress());
  assert.deepEqual(logic.parseProgress('{not json'), logic.createInitialProgress());
  assert.deepEqual(logic.parseProgress('"a string"'), logic.createInitialProgress());
});

test('a partial saved value keeps what is valid', () => {
  const parsed = logic.parseProgress('{"levelStars":{"1":2},"wrongAnswers":"nope"}');
  assert.deepEqual(hostRealm(parsed.levelStars), { '1': 2 });
  assert.deepEqual(hostRealm(parsed.wrongAnswers), []);
  assert.equal(parsed.isMuted, false);
});

test('a malformed wrong answer entry is dropped at parse time', () => {
  const raw = '{"wrongAnswers":[{"a":"x"},{"a":42,"b":7},{"a":42,"b":7,"count":3},{"a":7,"b":42}]}';
  const parsed = logic.parseProgress(raw);
  assert.deepEqual(hostRealm(parsed.wrongAnswers), [
    { a: 42, b: 7, count: 1 },
    { a: 42, b: 7, count: 3 },
  ]);
});

test('a missing or invalid count falls back to one', () => {
  const parsed = logic.parseProgress('{"wrongAnswers":[{"a":42,"b":7,"count":-5}]}');
  assert.deepEqual(hostRealm(parsed.wrongAnswers), [{ a: 42, b: 7, count: 1 }]);
});

test('an out of range star count is dropped instead of breaking the render', () => {
  const parsed = logic.parseProgress('{"levelStars":{"1":99}}');
  assert.deepEqual(hostRealm(parsed.levelStars), {});
});

test('only in range integer star counts survive parsing', () => {
  const parsed = logic.parseProgress('{"levelStars":{"1":3,"2":0,"3":"3"}}');
  assert.deepEqual(hostRealm(parsed.levelStars), { '1': 3 });
});

test('only positive integer best scores survive parsing', () => {
  const parsed = logic.parseProgress('{"levelBestScore":{"1":-4,"2":7,"3":"x"}}');
  assert.deepEqual(hostRealm(parsed.levelBestScore), { '2': 7 });
});

test('a profile built through recordLevelResult parses back unchanged', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 1, 10, 10);
  logic.recordLevelResult(progress, 2, 8, 10);
  logic.recordLevelResult(progress, 9, 15, 15);
  const parsed = logic.parseProgress(logic.serializeProgress(progress));
  assert.deepEqual(hostRealm(parsed), hostRealm(progress));
});

test('a leading zero is refused unless the question allows a zero answer', () => {
  assert.equal(logic.appendDigit('', 0, false), '');
  assert.equal(logic.appendDigit('', 7, false), '7');
  assert.equal(logic.appendDigit('4', 0, false), '40');
});

test('the answer is capped at two digits', () => {
  assert.equal(logic.appendDigit('40', 5), '40');
  assert.equal(logic.appendDigit('9', 9), '99');
});

test('backspace removes one digit and stops at empty', () => {
  assert.equal(logic.removeLastDigit('42'), '4');
  assert.equal(logic.removeLastDigit('4'), '');
  assert.equal(logic.removeLastDigit(''), '');
});

test('an empty answer cannot be submitted', () => {
  assert.equal(logic.canSubmitAnswer(''), false);
  assert.equal(logic.canSubmitAnswer('4'), true);
});

test('the timed challenge records a best score without awarding stars', () => {
  const progress = logic.createInitialProgress();
  const key = String(logic.TIMED_CHALLENGE_LEVEL_ID);
  logic.recordChallengeScore(progress, logic.TIMED_CHALLENGE_LEVEL_ID, 12);
  logic.recordChallengeScore(progress, logic.TIMED_CHALLENGE_LEVEL_ID, 9);
  assert.equal(progress.levelBestScore[key], 12);
  assert.equal(progress.levelStars[key], undefined);
});

test('the timed challenge lasts sixty seconds', () => {
  assert.equal(logic.TIMED_CHALLENGE_SECONDS, 60);
});

// Both recorders delegate to one shared best-score update, so a lower score
// from either one must never overwrite a higher one from the other.
test('a level and the timed challenge share one best score', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 1, 10, 10);
  logic.recordChallengeScore(progress, 1, 7);
  assert.equal(progress.levelBestScore['1'], 10);
  logic.recordChallengeScore(progress, 1, 12);
  assert.equal(progress.levelBestScore['1'], 12);
  logic.recordLevelResult(progress, 1, 4, 10);
  assert.equal(progress.levelBestScore['1'], 12);
});

test('a fresh profile carries schema version 3 and an unplayed challenge flag', () => {
  const progress = logic.createInitialProgress();
  assert.equal(progress.schemaVersion, logic.SAVE_SCHEMA_VERSION);
  assert.equal(progress.challengePlayed, false);
});

test('a v2 save is migrated by level content, not by number', () => {
  const legacy = JSON.stringify({
    levelStars: { '1': 3, '8': 2, '9': 3 },
    levelBestScore: { '1': 10, '8': 11, '9': 15, '10': 7 },
    wrongAnswers: [],
    isMuted: false,
  });
  const progress = logic.parseProgress(legacy);
  // 1-7 unchanged; v2 level 8 covered round tens AND the 100 minuend.
  assert.equal(progress.levelStars['1'], 3);
  assert.equal(progress.levelStars['8'], 2);
  assert.equal(progress.levelStars['9'], 2);
  // v2's mixed level becomes v3's level 12.
  assert.equal(progress.levelStars['12'], 3);
  assert.equal(progress.levelBestScore['12'], 15);
  // v2's timed challenge becomes v3's level 13, and never keeps stars.
  assert.equal(progress.levelBestScore['13'], 7);
  assert.equal(progress.levelStars['13'], undefined);
  assert.equal(progress.challengePlayed, true);
  assert.equal(progress.schemaVersion, logic.SAVE_SCHEMA_VERSION);
  // v2's level 8 best score is carried over onto v3's level 9.
  assert.equal(progress.levelBestScore['9'], 11);
});

test('migration runs exactly once', () => {
  const legacy = JSON.stringify({
    levelStars: { '8': 2 },
    levelBestScore: { '8': 9 },
    wrongAnswers: [],
    isMuted: false,
  });
  const once = logic.serializeProgress(logic.parseProgress(legacy));
  const twice = logic.serializeProgress(logic.parseProgress(once));
  assert.equal(twice, once);
});

test('a v3 save that cleared level 10 keeps level 10 after a reload', () => {
  const fresh = logic.createInitialProgress();
  logic.recordLevelResult(fresh, 10, 12, 12);
  const reloaded = logic.parseProgress(logic.serializeProgress(fresh));
  assert.equal(reloaded.levelStars['10'], 3);
  assert.equal(reloaded.levelStars['13'], undefined);
  assert.equal(reloaded.challengePlayed, false);
});

test('a multi-step wrong answer survives a round trip and keeps its shape', () => {
  const progress = logic.createInitialProgress();
  logic.mergeAnswerIntoProgress(progress, { a: 85, b: 27, c: 18, operator: '-' }, false);
  logic.mergeAnswerIntoProgress(progress, { a: 45, b: 18, c: 27, operator: '+' }, false);
  const reloaded = logic.parseProgress(logic.serializeProgress(progress));
  assert.deepEqual(hostRealm(reloaded.wrongAnswers), [
    { a: 85, b: 27, c: 18, operator: '-', count: 1 },
    { a: 45, b: 18, c: 27, operator: '+', count: 1 },
  ]);
});

test('malformed multi-step entries are dropped', () => {
  const raw = JSON.stringify({
    schemaVersion: logic.SAVE_SCHEMA_VERSION,
    levelStars: {},
    levelBestScore: {},
    wrongAnswers: [
      { a: 85, b: 27, operator: '-', count: 1 },
      { a: 85, b: 27, c: 18, operator: '*', count: 1 },
      { a: 50, b: 25, c: 30, operator: '-', count: 1 },
      { a: 99, b: 11, c: 40, operator: '+', count: 1 },
      { a: 85, b: 27, c: 18, operator: '-', count: 2 },
    ],
    isMuted: false,
  });
  const progress = logic.parseProgress(raw);
  assert.deepEqual(hostRealm(progress.wrongAnswers), [
    { a: 85, b: 27, c: 18, operator: '-', count: 2 },
  ]);
});

test('only chained-subtraction questions may answer zero', () => {
  assert.equal(logic.canQuestionAnswerZero({ a: 42, b: 7 }), false);
  assert.equal(logic.canQuestionAnswerZero({ a: 45, b: 18, c: 27, operator: '+' }), false);
  assert.equal(logic.canQuestionAnswerZero({ a: 50, b: 25, c: 25, operator: '-' }), true);
});

test('a zero is only accepted when the question allows it, and completes the input', () => {
  assert.equal(logic.appendDigit('', 0, false), '');
  assert.equal(logic.appendDigit('', 0, true), '0');
  // Spec §5.4: a zero answer is complete on its own, so a second digit is
  // refused rather than producing "01".
  assert.equal(logic.appendDigit('0', 1, true), '0');
  assert.equal(logic.appendDigit('', 4, true), '4');
});

test('the operator glyph mapping lives in exactly one place', () => {
  assert.equal(logic.operatorGlyph(logic.MIXED_OPERATOR), '+');
  assert.equal(logic.operatorGlyph(logic.CHAIN_OPERATOR), '−');
});
