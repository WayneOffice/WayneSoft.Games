'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic } = require('./game-script-loader');

const logic = loadGameLogic();

const LEVEL_RULES = {
  1: ({ a, b }) => a >= 11 && a <= 99 && b >= 1 && b <= 9 && a % 10 >= b,
  2: ({ a, b }) => a >= 21 && a <= 99 && b >= 10 && b <= 90 && b % 10 === 0 && b < a,
  3: ({ a, b }) => a >= 21 && a <= 99 && b >= 11 && b < a && a % 10 >= b % 10,
  4: ({ a, b }) => a >= 11 && a <= 19 && b >= 2 && b <= 9 && a % 10 < b,
  5: ({ a, b }) => a >= 21 && a <= 99 && a % 10 !== 0 && b >= 1 && b <= 9 && a % 10 < b,
  6: ({ a, b }) => a >= 20 && a <= 90 && a % 10 === 0 && b >= 1 && b <= 9,
  7: ({ a, b }) => a >= 21 && a <= 99 && a % 10 !== 0 && b >= 11 && b < a && a % 10 < b % 10,
  8: ({ a, b }) => a >= 30 && a <= 100 && a % 10 === 0 && b >= 11 && b < a && a % 10 < b % 10,
};

for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`level ${levelId} feasible pairs all satisfy the level rule`, () => {
    const pairs = logic.feasiblePairsForLevel(levelId);
    assert.ok(pairs.length > 0, `level ${levelId} must have feasible pairs`);
    for (const pair of pairs) {
      assert.ok(LEVEL_RULES[levelId](pair), `pair violates level ${levelId} rule: ${pair.a} - ${pair.b}`);
    }
  });
}

test('every level has at least as many feasible pairs as questions it asks', () => {
  // Level 9 is the mixed level: it has no pair set of its own, so it is
  // excluded here.
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const questionCount = logic.LEVEL_QUESTION_COUNTS[levelId];
    const pairs = logic.feasiblePairsForLevel(levelId);
    assert.ok(
      pairs.length >= questionCount,
      `level ${levelId} has ${pairs.length} pairs but asks ${questionCount} questions`,
    );
  }
});

test('the difference is never zero and never negative on any level', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const { a, b } of logic.feasiblePairsForLevel(levelId)) {
      assert.ok(a - b >= 1, `difference must be at least 1: ${a} - ${b}`);
    }
  }
});

test('level 4 has exactly 36 feasible pairs', () => {
  assert.equal(logic.feasiblePairsForLevel(4).length, 36);
});

test('a level never repeats a question within one run', () => {
  const stream = logic.createQuestionStream(4, logic.createRandom(1), []);
  const seen = new Set();
  for (let i = 0; i < logic.LEVEL_QUESTION_COUNTS[4]; i += 1) {
    const question = stream.next();
    const key = logic.questionKey(question);
    assert.ok(!seen.has(key), `duplicate question: ${key}`);
    seen.add(key);
  }
});

test('the same seed produces the same question sequence', () => {
  const first = logic.createQuestionStream(7, logic.createRandom(42), []);
  const second = logic.createQuestionStream(7, logic.createRandom(42), []);
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(first.next(), second.next());
  }
});

test('mixed levels draw from every level type over many draws', () => {
  const stream = logic.createQuestionStream(logic.MIXED_LEVEL_ID, logic.createRandom(7), []);
  const touchedLevels = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const question = stream.next();
    for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (LEVEL_RULES[levelId](question)) {
        touchedLevels.add(levelId);
        break;
      }
    }
  }
  assert.equal(touchedLevels.size, 8, `expected all 8 level types, saw ${[...touchedLevels].join(',')}`);
});

test('mixed levels never repeat a question within one run', () => {
  const stream = logic.createQuestionStream(logic.TIMED_CHALLENGE_LEVEL_ID, logic.createRandom(3), []);
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const key = logic.questionKey(stream.next());
    assert.ok(!seen.has(key), `duplicate question: ${key}`);
    seen.add(key);
  }
});

test('historical wrong answers are reused by mixed levels', () => {
  const wrongAnswers = [{ a: 42, b: 27, count: 3 }];
  const stream = logic.createQuestionStream(logic.MIXED_LEVEL_ID, logic.createRandom(11), wrongAnswers);
  let reused = 0;
  for (let i = 0; i < 500; i += 1) {
    const question = stream.next();
    if (question.a === 42 && question.b === 27) {
      reused += 1;
    }
  }
  assert.ok(reused > 0, 'a tracked wrong answer should come back around');
});

test('formatQuestion renders the question with a minus sign', () => {
  assert.equal(logic.formatQuestion({ a: 42, b: 7 }), '42 − 7 = ?');
});
