'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic, hostRealm } = require('./game-script-loader');

const logic = loadGameLogic();

// A step reads "[<label>：]<a> <op> <b> = <c>", where the label is optional
// (the borrowing strategies have none, the place-value one does).
const STEP_PATTERN = /^(?:[^：]+：)?(\d+) ([−+]) (\d+) = (\d+)$/;

function parseStep(step) {
  const match = STEP_PATTERN.exec(step);
  assert.ok(match !== null, `step has an unexpected shape: ${step}`);
  return { left: Number(match[1]), operator: match[2], right: Number(match[3]), result: Number(match[4]) };
}

function assertStepIsArithmeticallyTrue(step) {
  const parsed = parseStep(step);
  const expected = parsed.operator === '−' ? parsed.left - parsed.right : parsed.left + parsed.right;
  assert.equal(expected, parsed.result, `bad step: ${step}`);
}

function lastStepResult(steps) {
  return parseStep(steps[steps.length - 1]).result;
}

test('the demo for 45 - 3 breaks the numbers into place values', () => {
  const demo = logic.buildDemoSteps(45, 3);
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 3 = 2', '合起来：40 + 2 = 42']);
  assert.equal(demo.result, 42);
});

test('the demo for 45 - 23 breaks both place values apart', () => {
  const demo = logic.buildDemoSteps(45, 23);
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 3 = 2', '十位：4 − 2 = 2', '合起来：20 + 2 = 22']);
  assert.equal(demo.result, 22);
});

test('the demo for 13 - 7 uses the break-ten strategy', () => {
  const demo = logic.buildDemoSteps(13, 7);
  assert.deepEqual(hostRealm(demo.steps), ['10 − 7 = 3', '3 + 3 = 6']);
  assert.equal(demo.result, 6);
});

test('the demo for 42 - 7 uses the flatten-ten strategy', () => {
  const demo = logic.buildDemoSteps(42, 7);
  assert.deepEqual(hostRealm(demo.steps), ['42 − 2 = 40', '40 − 5 = 35']);
  assert.equal(demo.result, 35);
});

test('the demo for 40 - 7 uses the break-ten strategy', () => {
  const demo = logic.buildDemoSteps(40, 7);
  assert.deepEqual(hostRealm(demo.steps), ['10 − 7 = 3', '30 + 3 = 33']);
  assert.equal(demo.result, 33);
});

test('the demo for 42 - 27 nests a flatten-ten step', () => {
  const demo = logic.buildDemoSteps(42, 27);
  assert.deepEqual(hostRealm(demo.steps), ['42 − 20 = 22', '22 − 2 = 20', '20 − 5 = 15']);
  assert.equal(demo.result, 15);
});

test('the demo for 40 - 27 nests a break-ten step', () => {
  const demo = logic.buildDemoSteps(40, 27);
  assert.deepEqual(hostRealm(demo.steps), ['40 − 20 = 20', '10 − 7 = 3', '10 + 3 = 13']);
  assert.equal(demo.result, 13);
});

test('the demo for 100 - 37 nests a break-ten step', () => {
  const demo = logic.buildDemoSteps(100, 37);
  assert.deepEqual(hostRealm(demo.steps), ['100 − 30 = 70', '10 − 7 = 3', '60 + 3 = 63']);
  assert.equal(demo.result, 63);
});

test('no demo step ever contains a negative operand', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const { a, b } of logic.feasiblePairsForLevel(levelId)) {
      for (const step of logic.buildDemoSteps(a, b).steps) {
        assert.ok(
          !step.includes('− -') && !step.includes('+ -'),
          `negative operand in the ${a} - ${b} demo: ${step}`,
        );
      }
    }
  }
});

test('every demo step is arithmetically true and lands on the correct difference', () => {
  for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const { a, b } of logic.feasiblePairsForLevel(levelId)) {
      const demo = logic.buildDemoSteps(a, b);
      assert.equal(demo.result, a - b, `wrong result for ${a} - ${b}`);
      assert.ok(demo.steps.length > 0, `empty demo for ${a} - ${b}`);
      for (const step of demo.steps) {
        assertStepIsArithmeticallyTrue(step);
      }
      assert.equal(
        lastStepResult(demo.steps),
        a - b,
        `the last step of the ${a} - ${b} demo does not reach the answer`,
      );
    }
  }
});

test('every level 4 to 8 demo mentions a ten being broken, so the promise holds', () => {
  for (const levelId of [4, 5, 6, 7, 8]) {
    for (const { a, b } of logic.feasiblePairsForLevel(levelId)) {
      const demo = logic.buildDemoSteps(a, b);
      assert.ok(
        demo.steps.length >= 2,
        `the demo for ${a} - ${b} collapses the borrowing step`,
      );
    }
  }
});
