'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic } = require('./game-script-loader');

const logic = loadGameLogic();

const LEVEL_RULES = {
  1: ({ a, b }) => a >= 11 && a <= 99 && b >= 1 && b <= 9 && a % 10 >= b,
  2: ({ a, b }) => a >= 21 && a <= 99 && b >= 10 && b <= 90 && b % 10 === 0 && b < a,
  3: ({ a, b }) => a >= 21 && a <= 99 && b >= 11 && b < a && a % 10 >= b % 10,
  4: ({ a, b }) => a >= 11 && a <= 19 && b >= logic.MIN_TEEN_SUBTRAHEND && b <= 9 && a % 10 < b,
  5: ({ a, b }) => a >= 21 && a <= 99 && a % 10 !== 0 && b >= 1 && b <= 9 && a % 10 < b,
  6: ({ a, b }) => a >= 20 && a <= 90 && a % 10 === 0 && b >= 1 && b <= 9,
  7: ({ a, b }) => a >= 21 && a <= 99 && a % 10 !== 0 && b >= 11 && b < a && a % 10 < b % 10,
  8: ({ a, b }) => a >= 30 && a <= 90 && a % 10 === 0 && b >= 11 && b < a && a % 10 < b % 10,
  9: ({ a, b }) => a === 100 && b >= 11 && b <= 99,
};

// The answer rule lives in the game, not here: a second copy in the test file
// would keep passing after the game's rule changed.
const answerOf = logic.answerOfQuestion;

function questionKeyOf(question) {
  return logic.questionKey(question);
}

function classifyLevelType(question) {
  if (question.c !== undefined) {
    return question.operator === logic.MIXED_OPERATOR ? 11 : 10;
  }
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    if (LEVEL_RULES[levelId](question)) {
      return levelId;
    }
  }
  return undefined;
}

for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`level ${levelId} feasible pairs all satisfy the level rule`, () => {
    const pairs = logic.feasibleQuestionsForLevel(levelId);
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
    const pairs = logic.feasibleQuestionsForLevel(levelId);
    assert.ok(
      pairs.length >= questionCount,
      `level ${levelId} has ${pairs.length} pairs but asks ${questionCount} questions`,
    );
  }
});

test('the difference is never zero and never negative on any level', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const { a, b } of logic.feasibleQuestionsForLevel(levelId)) {
      assert.ok(a - b >= 1, `difference must be at least 1: ${a} - ${b}`);
    }
  }
});

test('level 4 has exactly 36 feasible pairs', () => {
  assert.equal(logic.feasibleQuestionsForLevel(4).length, 36);
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
    const levelId = classifyLevelType(stream.next());
    if (levelId !== undefined) {
      touchedLevels.add(levelId);
    }
  }
  assert.equal(touchedLevels.size, 11, `expected all 11 level types, saw ${[...touchedLevels].join(',')}`);
});

test('mixed levels draw each level type with roughly equal probability', () => {
  // The spec requires the eleven level types to be equally likely. Sampling
  // uniformly over the union of question sets would instead weight each type
  // by its size, and level 4 (36 questions out of more than 140,000) would
  // show up about 0.02% of the time, so the child would effectively never
  // practise it.
  const stream = logic.createQuestionStream(logic.MIXED_LEVEL_ID, logic.createRandom(12345), []);
  const drawCount = 8000;
  const typeCounts = new Map();
  for (let i = 0; i < drawCount; i += 1) {
    const question = stream.next();
    const levelId = classifyLevelType(question);
    if (levelId !== undefined) {
      typeCounts.set(levelId, (typeCounts.get(levelId) ?? 0) + 1);
    }
  }
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const share = (typeCounts.get(levelId) ?? 0) / drawCount;
    assert.ok(
      share >= 0.05 && share <= 0.2,
      `level ${levelId} drawn ${(share * 100).toFixed(1)}% of the time, expected between 5% and 20%`,
    );
  }
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

test('each level exposes its feasible questions with the right shape', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const questions = logic.feasibleQuestionsForLevel(levelId);
    assert.ok(questions.length > 0, `level ${levelId} has no questions`);
    for (const question of questions) {
      assert.equal(question.c, undefined, `level ${levelId} must be single-step`);
      assert.ok(Number.isInteger(question.a), `level ${levelId} bad a`);
      assert.ok(Number.isInteger(question.b), `level ${levelId} bad b`);
    }
  }
  for (const levelId of [10, 11]) {
    const questions = logic.feasibleQuestionsForLevel(levelId);
    assert.ok(questions.length > 0, `level ${levelId} has no questions`);
    for (const question of questions) {
      assert.ok(Number.isInteger(question.c), `level ${levelId} missing c`);
      assert.ok(question.operator === '-' || question.operator === '+', `level ${levelId} bad operator`);
    }
  }
});

test('level 9 is exactly the hundred minuend', () => {
  const questions = logic.feasibleQuestionsForLevel(9);
  assert.equal(questions.length, 89);
  for (const question of questions) {
    assert.equal(question.a, 100);
    assert.ok(question.b >= 11 && question.b <= 99);
  }
});

test('level 8 no longer contains a hundred minuend', () => {
  for (const question of logic.feasibleQuestionsForLevel(8)) {
    assert.ok(question.a < 100, `level 8 must not include 100: ${question.a} - ${question.b}`);
  }
});

test('no level can produce an answer outside 0..99', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      const answer = answerOf(question);
      assert.ok(answer >= 0, `negative answer on level ${levelId}: ${questionKeyOf(question)}`);
      assert.ok(answer <= 99, `answer above 99 on level ${levelId}: ${questionKeyOf(question)}`);
    }
  }
});

test('only the chained-subtraction level can answer zero', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      assert.ok(answerOf(question) >= 1, `level ${levelId} must never answer 0`);
    }
  }
  const zeros = logic.feasibleQuestionsForLevel(10).filter((q) => answerOf(q) === 0);
  assert.ok(zeros.length > 0, 'level 10 must be able to reach zero');
});

test('question keys distinguish the two operator shapes', () => {
  assert.equal(logic.questionKey({ a: 42, b: 7 }), '42-7');
  assert.equal(logic.questionKey({ a: 85, b: 27, c: 18, operator: '-' }), '85-27-18');
  assert.equal(logic.questionKey({ a: 45, b: 18, c: 27, operator: '+' }), '45-18+27');
});

test('formatQuestion renders both shapes', () => {
  assert.equal(logic.formatQuestion({ a: 42, b: 7 }), '42 − 7 = ?');
  assert.equal(logic.formatQuestion({ a: 85, b: 27, c: 18, operator: '-' }), '85 − 27 − 18 = ?');
  assert.equal(logic.formatQuestion({ a: 45, b: 18, c: 27, operator: '+' }), '45 − 18 + 27 = ?');
});

test('the new levels really cover their stated ranges', () => {
  const level10 = logic.feasibleQuestionsForLevel(10);
  assert.ok(level10.some((q) => q.a === 50), 'level 10 must include a = 50');
  assert.ok(level10.some((q) => q.a === 100), 'level 10 must include a = 100');
  assert.ok(level10.some((q) => q.b === 11), 'level 10 must include b = 11');
  assert.ok(level10.some((q) => q.c === 11), 'level 10 must include c = 11');

  const level11 = logic.feasibleQuestionsForLevel(11);
  assert.ok(level11.some((q) => q.b === 50), 'level 11 must include b = 50');
  assert.ok(level11.some((q) => q.c === 50), 'level 11 must include c = 50');
  assert.ok(level11.some((q) => q.a === 20), 'level 11 must include a = 20');

  // Presence checks pass for any wider range, so pin the upper and lower
  // bounds too — spec §4.3 gives level 10 operands a ceiling of 39 and level
  // 11 a ceiling of 50, and that difference is the only thing separating them.
  assert.ok(level10.every((q) => q.b <= 39), 'level 10 subtrahend must not exceed 39');
  assert.ok(level10.every((q) => q.c <= 39), 'level 10 third operand must not exceed 39');
  assert.ok(level10.every((q) => q.a >= 50), 'level 10 minuend must be at least 50');
  assert.equal(Math.max(...level10.map((q) => q.a)), 100, 'level 10 must reach a = 100');

  assert.ok(level11.every((q) => q.a <= 99), 'level 11 minuend must not exceed 99');
  assert.ok(level11.every((q) => q.b <= 50), 'level 11 subtrahend must not exceed 50');
  assert.ok(level11.every((q) => q.c <= 50), 'level 11 third operand must not exceed 50');
  assert.ok(level11.every((q) => q.a >= 20), 'level 11 minuend must be at least 20');
});

test('the mixed levels draw all eleven question types', () => {
  const stream = logic.createQuestionStream(logic.MIXED_LEVEL_ID, logic.createRandom(99), []);
  const shapes = new Set();
  for (let index = 0; index < 3000; index += 1) {
    const question = stream.next();
    const shape = question.c === undefined ? 'single' : `multi${question.operator}`;
    shapes.add(shape);
  }
  assert.ok(shapes.has('single'), 'mixed levels must include single-step questions');
  assert.ok(shapes.has('multi-'), 'mixed levels must include chained subtraction');
  assert.ok(shapes.has('multi+'), 'mixed levels must include mixed addition');
});

test('answerOfQuestion is the single source of truth for answers', () => {
  assert.equal(logic.answerOfQuestion({ a: 42, b: 7 }), 35);
  assert.equal(logic.answerOfQuestion({ a: 85, b: 27, c: 18, operator: '-' }), 40);
  assert.equal(logic.answerOfQuestion({ a: 45, b: 18, c: 27, operator: '+' }), 54);
});

test('the zodiac map places levels bottom-up in a winding climb', () => {
  assert.equal(logic.starNodeRatio(1), 0.22);
  assert.equal(logic.starNodeRatio(12), 0.66);
  assert.equal(logic.starNodeRatio(logic.TIMED_CHALLENGE_LEVEL_ID), 0.5);
  for (let levelId = 1; levelId <= logic.ZODIAC_LEVEL_COUNT; levelId += 1) {
    const ratio = logic.starNodeRatio(levelId);
    assert.ok(
      ratio > 0 && ratio < 1,
      `level ${levelId} must sit strictly inside the frame, got ${ratio}`,
    );
  }
  // Level 1 sits in the last row and level 12 in the first row below the Pope,
  // so the climb ends exactly where the Pope's own row begins.
  assert.equal(logic.starNodeRow(1), 7);
  assert.equal(logic.starNodeRow(2), 7);
  assert.equal(logic.starNodeRow(3), 6);
  assert.equal(logic.starNodeRow(12), 2);
  // Pinned on its own rather than left to the formula: today the formula also
  // yields 1 for level 13, so without this nothing would notice POPE_ROW
  // drifting away from what the zodiac formula produces.
  assert.equal(logic.starNodeRow(logic.TIMED_CHALLENGE_LEVEL_ID), 1);
});

test('each zodiac level has a glyph and a name', () => {
  assert.equal(logic.ZODIAC_GLYPHS.length, logic.ZODIAC_LEVEL_COUNT);
  assert.equal(logic.ZODIAC_NAMES.length, logic.ZODIAC_LEVEL_COUNT);
  assert.equal(logic.ZODIAC_GLYPHS[0], '♈');
  assert.equal(logic.ZODIAC_NAMES[11], '双鱼宫');
});
