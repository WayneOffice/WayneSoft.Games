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

test('only level 1 is unlocked on a fresh profile', () => {
  const progress = logic.createInitialProgress();
  assert.equal(logic.isLevelUnlocked(progress, 1), true);
  assert.equal(logic.isLevelUnlocked(progress, 2), false);
  assert.equal(logic.isLevelUnlocked(progress, 10), false);
});

test('clearing a level unlocks the next one, including the timed challenge', () => {
  const progress = logic.createInitialProgress();
  logic.recordLevelResult(progress, 9, 15, 15);
  assert.equal(logic.isLevelUnlocked(progress, 10), true);
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

test('a leading zero is dropped because the answer is never zero', () => {
  assert.equal(logic.appendDigit('', 0), '');
  assert.equal(logic.appendDigit('', 7), '7');
  assert.equal(logic.appendDigit('4', 0), '40');
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
