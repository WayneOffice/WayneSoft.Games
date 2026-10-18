'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic, hostRealm } = require('./game-script-loader');

const logic = loadGameLogic();

// A step reads "[<label>：]<n> (<op> <n>)+ = <result>". The label is optional
// (place-value steps have one, borrowing steps do not), and a step may chain
// several operands — the carry-addition demo writes "20 + 20 + 10 = 50" so the
// carried ten is visible.
const STEP_LABEL_PATTERN = /^(?:[^：]+：)?(.+)$/;
const OPERAND_PATTERN = /(\d+)/g;
const OPERATOR_PATTERN = /([−+])/g;

function evaluateStepExpression(expression) {
  const operands = expression.match(OPERAND_PATTERN);
  const operators = expression.match(OPERATOR_PATTERN);
  assert.ok(operands !== null && operators !== null, `unparseable step: ${expression}`);
  assert.equal(
    operands.length,
    operators.length + 1,
    `operand/operator count mismatch: ${expression}`,
  );
  let total = Number(operands[0]);
  for (let index = 0; index < operators.length; index += 1) {
    const operand = Number(operands[index + 1]);
    total = operators[index] === '−' ? total - operand : total + operand;
  }
  return total;
}

function parseStep(step) {
  const labelled = STEP_LABEL_PATTERN.exec(step);
  assert.ok(labelled !== null, `step has an unexpected shape: ${step}`);
  const body = labelled[1];
  const parts = body.split('=');
  assert.equal(parts.length, 2, `step must contain exactly one equals sign: ${step}`);
  return {
    expression: parts[0].trim(),
    result: Number(parts[1].trim()),
  };
}

function assertStepIsArithmeticallyTrue(step) {
  const parsed = parseStep(step);
  assert.equal(
    evaluateStepExpression(parsed.expression),
    parsed.result,
    `bad step: ${step}`,
  );
}

function lastStepResult(steps) {
  return parseStep(steps[steps.length - 1]).result;
}

// The answer rule lives in the game, not here: a second copy in the test file
// would keep passing after the game's rule changed.
const answerOf = logic.answerOfQuestion;

// The level rules are the oracle here, and they are read straight off each
// level's own collection rule rather than through needsBorrowing: levels 1-3
// collect pairs with `a % 10 >= b % 10` (level 2 trivially, since its
// subtrahend is always a multiple of ten), so they never borrow; levels 4-8
// collect pairs with `a % 10 < b % 10`, so they always do. The ones digits are
// computed inline on purpose: a sweep scoped by needsBorrowing cannot falsify
// needsBorrowing, because a wrong predicate would silently redefine its own
// passing scope.
const NON_BORROWING_LEVEL_IDS = [1, 2, 3];
const BORROWING_LEVEL_IDS = [4, 5, 6, 7, 8];
// Levels 9-11 are multi-step, so the single-step borrowing rules below do not
// describe them: level 9 holds both borrowing and non-borrowing questions, and
// levels 10-11 pair every question with a second operand. A multi-step demo
// always opens with its own label (`第一步：` / `先减：`), never with the
// place-value step, so the single-step assertions are scoped to levels 1-9.
const SINGLE_STEP_LEVEL_IDS = [...NON_BORROWING_LEVEL_IDS, ...BORROWING_LEVEL_IDS, 9];
const ALL_LEVEL_IDS = [...SINGLE_STEP_LEVEL_IDS, 10, 11];
const DECIMAL_BASE = 10;

test('the demo for 45 - 3 breaks the numbers into place values', () => {
  const demo = logic.buildDemoSteps({ a: 45, b: 3 });
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 3 = 2', '合起来：40 + 2 = 42']);
  assert.equal(demo.result, 42);
});

test('the demo for 45 - 23 breaks both place values apart', () => {
  const demo = logic.buildDemoSteps({ a: 45, b: 23 });
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 3 = 2', '十位：4 − 2 = 2', '合起来：20 + 2 = 22']);
  assert.equal(demo.result, 22);
});

test('the demo for 13 - 7 uses the break-ten strategy', () => {
  const demo = logic.buildDemoSteps({ a: 13, b: 7 });
  assert.deepEqual(hostRealm(demo.steps), ['10 − 7 = 3', '3 + 3 = 6']);
  assert.equal(demo.result, 6);
});

test('the demo for 42 - 7 uses the flatten-ten strategy', () => {
  const demo = logic.buildDemoSteps({ a: 42, b: 7 });
  assert.deepEqual(hostRealm(demo.steps), ['42 − 2 = 40', '40 − 5 = 35']);
  assert.equal(demo.result, 35);
});

test('the demo for 40 - 7 uses the break-ten strategy', () => {
  const demo = logic.buildDemoSteps({ a: 40, b: 7 });
  assert.deepEqual(hostRealm(demo.steps), ['10 − 7 = 3', '30 + 3 = 33']);
  assert.equal(demo.result, 33);
});

test('the demo for 42 - 27 nests a flatten-ten step', () => {
  const demo = logic.buildDemoSteps({ a: 42, b: 27 });
  assert.deepEqual(hostRealm(demo.steps), ['42 − 20 = 22', '22 − 2 = 20', '20 − 5 = 15']);
  assert.equal(demo.result, 15);
});

test('the demo for 40 - 27 nests a break-ten step', () => {
  const demo = logic.buildDemoSteps({ a: 40, b: 27 });
  assert.deepEqual(hostRealm(demo.steps), ['40 − 20 = 20', '10 − 7 = 3', '10 + 3 = 13']);
  assert.equal(demo.result, 13);
});

test('the demo for 100 - 37 nests a break-ten step', () => {
  const demo = logic.buildDemoSteps({ a: 100, b: 37 });
  assert.deepEqual(hostRealm(demo.steps), ['100 − 30 = 70', '10 − 7 = 3', '60 + 3 = 63']);
  assert.equal(demo.result, 63);
});

test('no demo step ever contains a negative operand', () => {
  for (const levelId of ALL_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      for (const step of logic.buildDemoSteps(question).steps) {
        assert.ok(
          !step.includes('− -') && !step.includes('+ -'),
          `negative operand in the ${question.a} - ${question.b} demo: ${step}`,
        );
      }
    }
  }
});

test('every demo step is arithmetically true and lands on the correct difference', () => {
  for (const levelId of ALL_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      const demo = logic.buildDemoSteps(question);
      assert.equal(
        demo.result,
        answerOf(question),
        `wrong result for ${question.a} - ${question.b}`,
      );
      assert.ok(demo.steps.length > 0, `empty demo for ${question.a} - ${question.b}`);
      for (const step of demo.steps) {
        assertStepIsArithmeticallyTrue(step);
      }
      assert.equal(
        lastStepResult(demo.steps),
        answerOf(question),
        `the last step of the ${question.a} - ${question.b} demo does not reach the answer`,
      );
    }
  }
});

// The assertion is deliberately only "the borrow is not collapsed into a single
// step": which step carries the borrow differs by strategy (break-ten leads
// with `10 − b`, flatten-ten strips the ones first, split-subtrahend nests a
// whole second demo), so there is no single shape to assert. The stronger
// property — that a borrowing demo never opens with the place-value step — is
// covered by the sweep below.
test('every level 4 to 8 demo spends at least two steps on the borrow', () => {
  for (const levelId of BORROWING_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      const demo = logic.buildDemoSteps(question);
      assert.ok(
        demo.steps.length >= 2,
        `the demo for ${question.a} - ${question.b} collapses the borrowing step`,
      );
    }
  }
});

test('a problem that needs no borrowing is always explained by place value', () => {
  for (const levelId of SINGLE_STEP_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      if (logic.needsBorrowing(question.a, question.b)) {
        continue;
      }
      const firstStep = logic.buildDemoSteps(question).steps[0];
      assert.ok(
        firstStep.startsWith('个位：'),
        `the ${question.a} - ${question.b} demo borrows a ten it does not need: ${firstStep}`,
      );
    }
  }
});

test('the demo for 45 - 10 subtracts a whole ten, not a borrowed one', () => {
  const demo = logic.buildDemoSteps({ a: 45, b: 10 });
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 0 = 5', '十位：4 − 1 = 3', '合起来：30 + 5 = 35']);
  assert.equal(demo.result, 35);
});

test('the level rules, not the predicate, decide whether a demo borrows', () => {
  for (const levelId of NON_BORROWING_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      assert.ok(
        question.a % DECIMAL_BASE >= question.b % DECIMAL_BASE,
        `level ${levelId} is supposed not to borrow, but ${question.a} - ${question.b} breaks that rule`,
      );
      const firstStep = logic.buildDemoSteps(question).steps[0];
      assert.ok(
        firstStep.startsWith('个位：'),
        `level ${levelId} never borrows, but the ${question.a} - ${question.b} demo does: ${firstStep}`,
      );
    }
  }
  for (const levelId of BORROWING_LEVEL_IDS) {
    for (const question of logic.feasibleQuestionsForLevel(levelId)) {
      assert.ok(
        question.a % DECIMAL_BASE < question.b % DECIMAL_BASE,
        `level ${levelId} is supposed to borrow, but ${question.a} - ${question.b} breaks that rule`,
      );
      const firstStep = logic.buildDemoSteps(question).steps[0];
      assert.ok(
        !firstStep.startsWith('个位：'),
        `level ${levelId} always borrows, but the ${question.a} - ${question.b} demo does not: ${firstStep}`,
      );
    }
  }
});

test('chained subtraction explains both steps and labels them', () => {
  const demo = logic.buildDemoSteps({ a: 85, b: 27, c: 18, operator: '-' });
  assert.equal(demo.result, 40);
  assert.ok(demo.steps[0].startsWith('第一步：'), `first step label missing: ${demo.steps[0]}`);
  assert.ok(
    demo.steps.some((step) => step.startsWith('第二步：')),
    `second step label missing: ${JSON.stringify(demo.steps)}`,
  );
});

test('a sub-step that needs no borrowing is a single line, not a place-value demo', () => {
  // 58 - 18: ones(58)=8, ones(18)=8, 8 < 8 is false -> no borrowing.
  const demo = logic.buildDemoSteps({ a: 85, b: 27, c: 18, operator: '-' });
  assert.ok(
    demo.steps.includes('第二步：58 − 18 = 40'),
    `expected a one-line second step, got ${JSON.stringify(demo.steps)}`,
  );
});

test('mixed addition explains the carry only when there is one', () => {
  const carrying = logic.buildDemoSteps({ a: 45, b: 18, c: 27, operator: '+' });
  assert.equal(carrying.result, 54);
  assert.ok(
    carrying.steps.includes('再加：7 + 7 = 14'),
    `carry step missing: ${JSON.stringify(carrying.steps)}`,
  );
  assert.ok(
    carrying.steps.includes('20 + 20 + 10 = 50'),
    `carried-ten step missing: ${JSON.stringify(carrying.steps)}`,
  );

  const plain = logic.buildDemoSteps({ a: 62, b: 40, c: 15, operator: '+' });
  assert.equal(plain.result, 37);
  assert.ok(
    plain.steps.includes('再加：22 + 15 = 37'),
    `expected a one-line addition, got ${JSON.stringify(plain.steps)}`,
  );
});
