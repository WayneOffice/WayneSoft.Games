# 100 以内减法闯关游戏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个单文件 `index.html` 的 100 以内减法闯关游戏，给小学二年级学生用，零依赖、零构建、零网络请求。

**Architecture:** 一个 `index.html` 内含两个 `<script>` 分区。`<script id="game-logic">` 是**纯逻辑**（出题器、演示器、进度与状态模型），不碰 DOM、不碰 `AudioContext`；`<script id="game-ui">` 是**表现层**（渲染、事件绑定、Web Audio），只调用前者的函数。测试通过 Node 内置 `vm` 把 `game-logic` 脚本抽出来执行——因此纯逻辑可以在没有浏览器的情况下被完整单元测试，而交付物仍然是单个 HTML 文件。

**Tech Stack:** 原生 HTML / CSS / JavaScript（ES2020，无框架、无构建、无 npm 依赖）。测试用 Node.js 内置的 `node:test` + `node:vm`（仅开发期使用，游戏运行时不需要 Node）。

**Spec:** `docs/superpowers/specs/2026-10-17-subtraction-game-design.md`

## Global Constraints

- **交付物是单个 `index.html`**，CSS 与 JS 全部内嵌。不得引用任何外部 CDN、字体、图片、音频文件。视觉用 emoji + CSS，音效用 Web Audio API 现场合成。
- **游戏运行时零依赖、零构建、零网络请求。** `package.json` 只用于开发期跑测试，不得声明任何 `dependencies` / `devDependencies`。
- **测试运行器**：Node.js 18 或以上。命令 `npm test`，其脚本为 `node --test "tests/*.test.js"`。
  **不要写成 `node --test tests/`** —— 在 Windows + Node 24 上目录参数会被当成模块入口，报 `Cannot find module ...\tests` 并以 exit 1 结束，一个测试都不会跑。
- **计划内嵌的代码已在本机实际组装并跑通，演示输出与 spec §6 逐条核对一致。** 若你改了任何逻辑，改完必须重跑 `npm test`，不要靠推演。
- **测试数只增不减。** 每关任务里的 `Expected: PASS（55/55 …）` 是撰写时的数字；到 Task 10–12 时套房可能已被前面的评审修复轮加到更多。**数字对不上不是故障**——只要没有失败即可，不要为了凑数去改测试。若确实新增了测试，在报告里说明。
- **标识符、代码注释、日志、异常消息一律英文**；**面向孩子的界面文案一律中文**。
- **绝不写单行块语句**——`if` / `for` / `while` / `try` / `catch` 的循环体一律另起一行并带花括号。
- **每个 `switch` 必须有 `default` 分支。**
- **任何有领域含义的字面量都必须是具名常量**，不得散落裸值。派生值从源头推导，不得重复。
- **每个 `catch` 必须带异常对象记录日志**，禁止空 `catch`。
- **方法体 ≤ 50 行，参数 ≤ 5 个，嵌套 ≤ 3 层。**
- 游戏文案与常量必须与 spec 逐字一致：关卡题数 `{1:10, 2:10, 3:10, 4:10, 5:12, 6:12, 7:12, 8:12, 9:15}`；限时挑战 `60` 秒；过关线正确率 `80%`；星级 `100%→3星 / ≥90%→2星 / ≥80%→1星`；历史错题优先比例 `30%`；弱提示 `15` 秒、强提示 `30` 秒；localStorage 键名 `waynesoft.math.subtraction-game.progress.v1`。
- **视觉主题是太空闯关**（spec §7）：深空蓝紫底 + 发光描边 + 星尘，10 关沿一条横向星图排布，答对星光炸开、过关星球点亮。全部用 emoji + CSS 实现，**不引外部图片、字体或动画库**——单文件可单发优先于视觉便利。动效必须尊重 `prefers-reduced-motion`。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `index.html` | 全部交付物：HTML 结构、内嵌 CSS、`<script id="game-logic">`（纯逻辑）、`<script id="game-ui">`（表现层） |
| `package.json` | 仅声明 `test` 脚本，无任何依赖 |
| `tests/game-script-loader.js` | 从 `index.html` 抽出 `game-logic` 脚本并在 `vm` 沙箱中求值，导出其函数与常量 |
| `tests/question-generator.test.js` | 出题器测试 |
| `tests/demo-generator.test.js` | 演示器测试 + 全量自检 |
| `tests/progress.test.js` | 星级、解锁、进度读写、输入规则测试 |

**为什么 `game-logic` 必须是独立的 `<script>` 分区：** 它是被测对象。`game-ui` 依赖 `document` 与 `AudioContext`，无法在 `vm` 沙箱里跑；把纯逻辑隔离出来，才能让「演示正确性用代码全量自检」这条验收（spec §9.5）真正落地。

---

## Task 1: 出题器 + 测试基础设施

**Files:**
- Create: `index.html`
- Create: `package.json`
- Create: `tests/game-script-loader.js`
- Test: `tests/question-generator.test.js`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `feasiblePairsForLevel(levelId: number): Array<{a: number, b: number}>` —— 返回该关全部可行题目对，结果被缓存
  - `createRandom(seed: number): () => number` —— 确定性 PRNG（mulberry32），返回 `[0, 1)` 的浮点数
  - `questionKey(question: {a, b}): string` —— 题目唯一键，格式 `"<a>-<b>"`
  - `createQuestionStream(levelId: number, random: () => number, historicalWrongAnswers: Array<{a, b, count}>): {next(): {a: number, b: number}}`
  - `formatQuestion(question: {a, b}): string` —— 返回 `"42 − 7 = ?"`
  - 常量：`LEVEL_COUNT = 10`、`MIXED_LEVEL_ID = 9`、`TIMED_CHALLENGE_LEVEL_ID = 10`、`MIXED_LEVEL_IDS = [1..8]`、`LEVEL_QUESTION_COUNTS`、`LEVEL_TITLES`、`HISTORICAL_WRONG_ANSWER_RATE = 0.3`

- [ ] **Step 1: 建 `package.json`（无依赖，只有 test 脚本）**

```json
{
  "name": "waynesoft-math-subtraction-game",
  "version": "0.1.0",
  "private": true,
  "description": "100 以内减法闯关游戏（单文件 HTML）",
  "scripts": {
    "test": "node --test \"tests/*.test.js\""
  }
}
```

- [ ] **Step 2: 建 `index.html` 骨架，`game-logic` 分区先放一个占位常量**

这一步只建立文件骨架与分区边界，出题器在 Step 4 填入。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>100 以内减法闯关</title>
  <style>
    /* Filled in by Task 10. */
  </style>
</head>
<body>
  <main id="app"></main>

  <script id="game-logic">
    'use strict';

    const LEVEL_COUNT = 10;
    const MIXED_LEVEL_ID = 9;
    const TIMED_CHALLENGE_LEVEL_ID = 10;
    const MIXED_LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
  </script>

  <script id="game-ui">
    'use strict';
    // Filled in by Task 4 onward.
  </script>
</body>
</html>
```

- [ ] **Step 3: 建 `tests/game-script-loader.js`，并从 `tests/question-generator.test.js` 写第一个失败测试**

`tests/game-script-loader.js`：

```js
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
  'MAX_STARS',
  'MIXED_LEVEL_ID',
  'TIMED_CHALLENGE_LEVEL_ID',
  'TIMED_CHALLENGE_SECONDS',
  'PROGRESS_STORAGE_KEY',
  'HISTORICAL_WRONG_ANSWER_RATE',
  'MAX_TRACKED_WRONG_ANSWERS',
  'LEVEL_QUESTION_COUNTS',
  'LEVEL_TITLES',
  'feasiblePairsForLevel',
  'createRandom',
  'questionKey',
  'createQuestionStream',
  'formatQuestion',
  'buildDemoSteps',
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
```

`tests/question-generator.test.js`（第一个测试，此刻必然失败）：

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic } = require('./game-script-loader');

const logic = loadGameLogic();

test('level 1 rejects questions where the ones digit is too small', () => {
  const pairs = logic.feasiblePairsForLevel(1);
  assert.ok(pairs.length > 0, 'level 1 must have feasible pairs');
  for (const { a, b } of pairs) {
    assert.ok(a >= 11 && a <= 99, `minuend out of range: ${a}`);
    assert.ok(b >= 1 && b <= 9, `subtrahend out of range: ${b}`);
    assert.ok(a % 10 >= b, `would require borrowing: ${a} - ${b}`);
  }
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `logic.feasiblePairsForLevel is not a function`

- [ ] **Step 5: 在 `game-logic` 分区实现出题器**

把下面全部代码插到 `index.html` 的 `<script id="game-logic">` 内、现有常量之后。

```js
    const LEVEL_QUESTION_COUNTS = {
      1: 10,
      2: 10,
      3: 10,
      4: 10,
      5: 12,
      6: 12,
      7: 12,
      8: 12,
      9: 15,
    };

    const LEVEL_TITLES = {
      1: '两位数减一位数',
      2: '减整十数',
      3: '两位数减两位数',
      4: '十几减几',
      5: '退位减一位数',
      6: '整十数减一位数',
      7: '退位减两位数',
      8: '整十数减两位数',
      9: '混合综合',
      10: '限时挑战',
    };

    const HISTORICAL_WRONG_ANSWER_RATE = 0.3;

    const MIN_TWO_DIGIT_NUMBER = 11;
    const MAX_MINUEND = 99;
    const MAX_MINUEND_WITH_HUNDRED = 100;
    const MIN_ONES_DIGIT = 1;
    const MAX_ONES_DIGIT = 9;
    const ONES_PER_TEN = 10;
    const MAX_TEEN_MINUEND = 19;
    const MIN_MINUEND_FOR_ROUND_TEN_SUBTRAHEND = 21;
    const MIN_ROUND_TEN_MINUEND = 20;
    const MAX_ROUND_TEN_MINUEND = 90;
    const MIN_ROUND_TEN_MINUEND_FOR_TWO_DIGIT = 30;

    const feasiblePairsCache = new Map();

    function onesDigit(value) {
      return value % ONES_PER_TEN;
    }

    function buildFeasiblePairs(levelId) {
      const pairs = [];
      switch (levelId) {
        case 1:
          collectLevel1Pairs(pairs);
          break;
        case 2:
          collectLevel2Pairs(pairs);
          break;
        case 3:
          collectLevel3Pairs(pairs);
          break;
        case 4:
          collectLevel4Pairs(pairs);
          break;
        case 5:
          collectLevel5Pairs(pairs);
          break;
        case 6:
          collectLevel6Pairs(pairs);
          break;
        case 7:
          collectLevel7Pairs(pairs);
          break;
        case 8:
          collectLevel8Pairs(pairs);
          break;
        default:
          throw new Error(`Unknown level id: ${levelId}`);
      }
      return pairs;
    }

    function feasiblePairsForLevel(levelId) {
      if (!feasiblePairsCache.has(levelId)) {
        feasiblePairsCache.set(levelId, buildFeasiblePairs(levelId));
      }
      return feasiblePairsCache.get(levelId);
    }

    function collectLevel1Pairs(pairs) {
      for (let a = MIN_TWO_DIGIT_NUMBER; a <= MAX_MINUEND; a += 1) {
        for (let b = MIN_ONES_DIGIT; b <= MAX_ONES_DIGIT; b += 1) {
          if (onesDigit(a) >= b) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel2Pairs(pairs) {
      for (let a = MIN_MINUEND_FOR_ROUND_TEN_SUBTRAHEND; a <= MAX_MINUEND; a += 1) {
        for (let b = ONES_PER_TEN; b <= MAX_ROUND_TEN_MINUEND; b += ONES_PER_TEN) {
          if (b < a) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel3Pairs(pairs) {
      for (let a = MIN_MINUEND_FOR_ROUND_TEN_SUBTRAHEND; a <= MAX_MINUEND; a += 1) {
        for (let b = MIN_TWO_DIGIT_NUMBER; b < a; b += 1) {
          if (onesDigit(a) >= onesDigit(b)) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel4Pairs(pairs) {
      for (let a = MIN_TWO_DIGIT_NUMBER; a <= MAX_TEEN_MINUEND; a += 1) {
        for (let b = 2; b <= MAX_ONES_DIGIT; b += 1) {
          if (onesDigit(a) < b) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel5Pairs(pairs) {
      for (let a = MIN_MINUEND_FOR_ROUND_TEN_SUBTRAHEND; a <= MAX_MINUEND; a += 1) {
        if (onesDigit(a) === 0) {
          continue;
        }
        for (let b = MIN_ONES_DIGIT; b <= MAX_ONES_DIGIT; b += 1) {
          if (onesDigit(a) < b) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel6Pairs(pairs) {
      for (let a = MIN_ROUND_TEN_MINUEND; a <= MAX_ROUND_TEN_MINUEND; a += ONES_PER_TEN) {
        for (let b = MIN_ONES_DIGIT; b <= MAX_ONES_DIGIT; b += 1) {
          pairs.push({ a, b });
        }
      }
    }

    function collectLevel7Pairs(pairs) {
      for (let a = MIN_MINUEND_FOR_ROUND_TEN_SUBTRAHEND; a <= MAX_MINUEND; a += 1) {
        if (onesDigit(a) === 0) {
          continue;
        }
        for (let b = MIN_TWO_DIGIT_NUMBER; b < a; b += 1) {
          if (onesDigit(a) < onesDigit(b)) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function collectLevel8Pairs(pairs) {
      for (let a = MIN_ROUND_TEN_MINUEND_FOR_TWO_DIGIT; a <= MAX_MINUEND_WITH_HUNDRED; a += ONES_PER_TEN) {
        for (let b = MIN_TWO_DIGIT_NUMBER; b < a; b += 1) {
          if (onesDigit(a) < onesDigit(b)) {
            pairs.push({ a, b });
          }
        }
      }
    }

    function questionKey(question) {
      return `${question.a}-${question.b}`;
    }

    function createRandom(seed) {
      let state = seed >>> 0;
      return function random() {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function pickRandom(items, random) {
      return items[Math.floor(random() * items.length)];
    }

    // Uniform over feasible (a, b) pairs, never over minuends: picking the
    // minuend first would over-weight small minuends, which have fewer
    // feasible subtrahends.
    function drawFromLevel(levelId, random, usedKeys) {
      const pairs = feasiblePairsForLevel(levelId);
      const available = pairs.filter((pair) => !usedKeys.has(questionKey(pair)));
      return pickRandom(available.length > 0 ? available : pairs, random);
    }

    function drawMixedQuestion(random, usedKeys, historicalWrongAnswers) {
      const canUseHistorical = historicalWrongAnswers.length > 0
        && random() < HISTORICAL_WRONG_ANSWER_RATE;
      if (canUseHistorical) {
        const candidate = pickRandom(historicalWrongAnswers, random);
        if (!usedKeys.has(questionKey(candidate))) {
          return { a: candidate.a, b: candidate.b };
        }
      }
      return drawFromLevel(pickRandom(MIXED_LEVEL_IDS, random), random, usedKeys);
    }

    function createQuestionStream(levelId, random, historicalWrongAnswers) {
      const usedKeys = new Set();
      const isMixed = levelId === MIXED_LEVEL_ID || levelId === TIMED_CHALLENGE_LEVEL_ID;
      return {
        next() {
          const question = isMixed
            ? drawMixedQuestion(random, usedKeys, historicalWrongAnswers)
            : drawFromLevel(levelId, random, usedKeys);
          usedKeys.add(questionKey(question));
          return question;
        },
      };
    }

    function formatQuestion(question) {
      return `${question.a} − ${question.b} = ?`;
    }
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（1 个测试通过）

- [ ] **Step 7: 补齐出题器测试**

把 `tests/question-generator.test.js` 扩成下面完整内容。

```js
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
```

- [ ] **Step 8: 运行测试，确认全部通过**

Run: `npm test`
Expected: PASS（全部测试通过）

- [ ] **Step 9: 提交**

```bash
git add index.html package.json tests/game-script-loader.js tests/question-generator.test.js
git commit -m "feat: 出题器与测试基础设施"
```

---

## Task 2: 演示器 + 全量自检

**Files:**
- Modify: `index.html`（`<script id="game-logic">` 分区内追加）
- Test: `tests/demo-generator.test.js`

**Interfaces:**
- Consumes: `feasiblePairsForLevel(levelId)`、`onesDigit(value)`（Task 1）
- Produces:
  - `buildDemoSteps(a: number, b: number): { steps: string[], result: number }` —— 返回逐步演示。`steps` 每条形如 `"42 − 2 = 40"` 或 `"个位：5 − 3 = 2"`；`result` 恒等于 `a - b`
  - `needsBorrowing(a: number, b: number): boolean` —— 个位是否不够减
  - 常量：`DEMO_STRATEGY`（`PLACE_VALUE` / `BREAK_TEN` / `FLATTEN_TEN` / `SPLIT_SUBTRAHEND`）、`MAX_TEEN_MINUEND`、`ONES_PER_TEN`

**策略选择规则（源自 spec §6，并补上 spec 未覆盖的不退位情形）：**

| 条件 | 策略 |
|---|---|
| **不需要退位** | `PLACE_VALUE` 数位分解：个位归个位、十位归十位 |
| 需要退位，且减数 ≥ 11（两位数） | `SPLIT_SUBTRAHEND` 分步减：先减整十，第二步**递归**调用本函数展开 |
| 需要退位，被减数 ≤ 19（十几） | `BREAK_TEN` 破十法 |
| 需要退位，被减数个位为 0（整十数） | `BREAK_TEN` 破十法 |
| 需要退位，其余 | `FLATTEN_TEN` 平十法 |

「需要退位」的判据：被减数个位 < 减数个位（减数是一位数时即减数本身）。

**为什么必须补 `PLACE_VALUE`：** spec §6 的表只列了第 4–8 关（退位）的演示，第 1–3 关（不退位）从未定义，而 §5.1 要求每次答错都弹演示。若把不退位题硬套平十法，`45 − 3` 会算出 `40 − -2 = 42` —— 在产品的教学面上输出负数。数位分解与破十法同构（都是「先算个位、再合十位」），孩子后面学「个位不够减要借」时才有落脚点。

**演示步骤的文本格式：** `[<标签>：]<表达式>`，标签可选。退位策略沿用 spec §6 给出的无标签写法；`PLACE_VALUE` 用 `个位：` / `十位：` / `合起来：` 三个标签。自检时剥掉可选标签再校验算式。

- [ ] **Step 1: 写失败测试**

`tests/demo-generator.test.js`：

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic, hostRealm } = require('./game-script-loader');

const logic = loadGameLogic();

test('the demo for 45 - 3 breaks the numbers into place values', () => {
  const demo = logic.buildDemoSteps(45, 3);
  assert.deepEqual(hostRealm(demo.steps), ['个位：5 − 3 = 2', '合起来：40 + 2 = 42']);
  assert.equal(demo.result, 42);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/demo-generator.test.js`
Expected: FAIL —— `logic.buildDemoSteps is not a function`

- [ ] **Step 3: 实现演示器**

把下面代码插到 `index.html` 的 `<script id="game-logic">` 内、`formatQuestion` 之后。

```js
    const DEMO_STRATEGY = {
      PLACE_VALUE: 'placeValue',
      BREAK_TEN: 'breakTen',
      FLATTEN_TEN: 'flattenTen',
      SPLIT_SUBTRAHEND: 'splitSubtrahend',
    };

    const PLACE_LABEL_ONES = '个位';
    const PLACE_LABEL_TENS = '十位';
    const PLACE_LABEL_COMBINE = '合起来';

    function subtrahendOnesDigit(b) {
      return b >= MIN_TWO_DIGIT_NUMBER ? onesDigit(b) : b;
    }

    function needsBorrowing(a, b) {
      return onesDigit(a) < subtrahendOnesDigit(b);
    }

    function selectDemoStrategy(a, b) {
      if (!needsBorrowing(a, b)) {
        return DEMO_STRATEGY.PLACE_VALUE;
      }
      if (b >= MIN_TWO_DIGIT_NUMBER) {
        return DEMO_STRATEGY.SPLIT_SUBTRAHEND;
      }
      if (a <= MAX_TEEN_MINUEND || onesDigit(a) === 0) {
        return DEMO_STRATEGY.BREAK_TEN;
      }
      return DEMO_STRATEGY.FLATTEN_TEN;
    }

    function buildPlaceValueSteps(a, b) {
      const minuendOnes = onesDigit(a);
      const minuendTens = Math.floor(a / ONES_PER_TEN);
      const subtrahendTens = Math.floor(b / ONES_PER_TEN);
      const onesResult = minuendOnes - subtrahendOnesDigit(b);
      const steps = [
        `${PLACE_LABEL_ONES}：${minuendOnes} − ${subtrahendOnesDigit(b)} = ${onesResult}`,
      ];
      let tensResult = minuendTens;
      if (subtrahendTens > 0) {
        tensResult = minuendTens - subtrahendTens;
        steps.push(`${PLACE_LABEL_TENS}：${minuendTens} − ${subtrahendTens} = ${tensResult}`);
      }
      steps.push(
        `${PLACE_LABEL_COMBINE}：${tensResult * ONES_PER_TEN} + ${onesResult} = ${a - b}`,
      );
      return { steps, result: a - b };
    }

    function buildBreakTenSteps(a, b) {
      const remainderOfTen = ONES_PER_TEN - b;
      const remainingTens = a - ONES_PER_TEN;
      return {
        steps: [
          `${ONES_PER_TEN} − ${b} = ${remainderOfTen}`,
          `${remainingTens} + ${remainderOfTen} = ${a - b}`,
        ],
        result: a - b,
      };
    }

    function buildFlattenTenSteps(a, b) {
      const strippedOnes = onesDigit(a);
      const roundTen = a - strippedOnes;
      const remainingSubtrahend = b - strippedOnes;
      return {
        steps: [
          `${a} − ${strippedOnes} = ${roundTen}`,
          `${roundTen} − ${remainingSubtrahend} = ${a - b}`,
        ],
        result: a - b,
      };
    }

    function buildNestedSteps(intermediate, subtrahend) {
      if (subtrahend === 0) {
        return [];
      }
      return buildDemoSteps(intermediate, subtrahend).steps;
    }

    function buildSplitSubtrahendSteps(a, b) {
      const wholeTens = Math.floor(b / ONES_PER_TEN) * ONES_PER_TEN;
      const intermediate = a - wholeTens;
      return {
        steps: [
          `${a} − ${wholeTens} = ${intermediate}`,
          ...buildNestedSteps(intermediate, b - wholeTens),
        ],
        result: a - b,
      };
    }

    function buildDemoSteps(a, b) {
      switch (selectDemoStrategy(a, b)) {
        case DEMO_STRATEGY.PLACE_VALUE:
          return buildPlaceValueSteps(a, b);
        case DEMO_STRATEGY.BREAK_TEN:
          return buildBreakTenSteps(a, b);
        case DEMO_STRATEGY.FLATTEN_TEN:
          return buildFlattenTenSteps(a, b);
        case DEMO_STRATEGY.SPLIT_SUBTRAHEND:
          return buildSplitSubtrahendSteps(a, b);
        default:
          throw new Error(`Unknown demo strategy for ${a} - ${b}`);
      }
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/demo-generator.test.js`
Expected: PASS

- [ ] **Step 5: 写全量自检测试（spec §9.5 的验收项）**

把 `tests/demo-generator.test.js` 扩成下面完整内容。这里对**每一关的全部可行 (a, b)** 逐条断言，取代人工抽查。

```js
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
```

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: PASS（出题器与演示器测试全部通过）

- [ ] **Step 7: 提交**

```bash
git add index.html tests/demo-generator.test.js
git commit -m "feat: 退位演示器与全量自检"
```

---

## Task 3: 进度模型与输入规则

**Files:**
- Modify: `index.html`（`<script id="game-logic">` 分区内追加）
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `questionKey(question)`（Task 1）
- Produces:
  - `computeStars(correctCount: number, questionCount: number): number` —— 返回 0–3
  - `isLevelPassed(correctCount: number, questionCount: number): boolean`
  - `isLevelUnlocked(progress: Progress, levelId: number): boolean`
  - `createInitialProgress(): Progress`
  - `parseProgress(rawValue: string | null): Progress` —— 损坏时回退初始状态并 `console.error`
  - `serializeProgress(progress: Progress): string`
  - `mergeAnswerIntoProgress(progress: Progress, question: {a, b}, isCorrect: boolean): Progress`
  - `recordLevelResult(progress: Progress, levelId: number, correctCount: number, questionCount: number): Progress`
  - `appendDigit(currentInput: string, digit: number): string`
  - `removeLastDigit(currentInput: string): string`
  - `canSubmitAnswer(currentInput: string): boolean`
  - 常量：`MAX_ANSWER_DIGITS = 2`、`PROGRESS_STORAGE_KEY`、`MAX_TRACKED_WRONG_ANSWERS = 50`、`FIRST_LEVEL_ID = 1`、`PASS_ACCURACY_PERCENT = 80`、`TWO_STAR_ACCURACY_PERCENT = 90`、`PERCENT_SCALE = 100`

**Progress 形状：**

```js
{
  levelStars: { "1": 3, "2": 2 },     // levelId -> 0..3
  levelBestScore: { "1": 10 },         // levelId -> 最高答对题数
  wrongAnswers: [ { a: 42, b: 7, count: 2 } ],
  isMuted: false,
}
```

**星级用整数运算，不用浮点比较**：`correct * 100 >= question * 90` 这样的形式，避免 `12 / 15 === 0.8` 之类的浮点边界问题。

- [ ] **Step 1: 写失败测试**

`tests/progress.test.js`：

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadGameLogic } = require('./game-script-loader');

const logic = loadGameLogic();

test('eight out of ten is one star, seven is none', () => {
  assert.equal(logic.computeStars(8, 10), 1);
  assert.equal(logic.computeStars(7, 10), 0);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/progress.test.js`
Expected: FAIL —— `logic.computeStars is not a function`

- [ ] **Step 3: 实现进度模型与输入规则**

把下面代码插到 `index.html` 的 `<script id="game-logic">` 内、`buildDemoSteps` 之后。

```js
    const MAX_ANSWER_DIGITS = 2;
    const FIRST_LEVEL_ID = 1;
    const PERCENT_SCALE = 100;
    const PASS_ACCURACY_PERCENT = 80;
    const TWO_STAR_ACCURACY_PERCENT = 90;
    const MAX_STARS = 3;
    const MIN_EARNED_STARS = 1;
    const MAX_TRACKED_WRONG_ANSWERS = 50;
    const PROGRESS_STORAGE_KEY = 'waynesoft.math.subtraction-game.progress.v1';

    function computeStars(correctCount, questionCount) {
      if (questionCount <= 0) {
        return 0;
      }
      if (correctCount >= questionCount) {
        return MAX_STARS;
      }
      if (correctCount * PERCENT_SCALE >= questionCount * TWO_STAR_ACCURACY_PERCENT) {
        return 2;
      }
      if (correctCount * PERCENT_SCALE >= questionCount * PASS_ACCURACY_PERCENT) {
        return 1;
      }
      return 0;
    }

    function isLevelPassed(correctCount, questionCount) {
      return computeStars(correctCount, questionCount) > 0;
    }

    function createInitialProgress() {
      return {
        levelStars: {},
        levelBestScore: {},
        wrongAnswers: [],
        isMuted: false,
      };
    }

    function isPlainObject(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isValidWrongAnswer(entry) {
      return isPlainObject(entry)
        && Number.isInteger(entry.a)
        && Number.isInteger(entry.b)
        && entry.a > 0
        && entry.b > 0
        && entry.b < entry.a;
    }

    // A hand-edited or half-written save can hold entries the game would then
    // feed straight into the question generator, producing "undefined −
    // undefined = ?". Drop anything that is not a usable question.
    function parseWrongAnswers(value) {
      if (!Array.isArray(value)) {
        return [];
      }
      return value.filter(isValidWrongAnswer).map((entry) => ({
        a: entry.a,
        b: entry.b,
        count: Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 1,
      }));
    }

    function parseProgress(rawValue) {
      if (typeof rawValue !== 'string') {
        return createInitialProgress();
      }
      try {
        const parsed = JSON.parse(rawValue);
        if (!isPlainObject(parsed)) {
          return createInitialProgress();
        }
        return {
          levelStars: isPlainObject(parsed.levelStars) ? parsed.levelStars : {},
          levelBestScore: isPlainObject(parsed.levelBestScore) ? parsed.levelBestScore : {},
          wrongAnswers: parseWrongAnswers(parsed.wrongAnswers),
          isMuted: parsed.isMuted === true,
        };
      } catch (error) {
        console.error('Failed to parse saved progress, starting fresh.', error);
        return createInitialProgress();
      }
    }

    function serializeProgress(progress) {
      return JSON.stringify(progress);
    }

    function isLevelUnlocked(progress, levelId) {
      if (levelId <= FIRST_LEVEL_ID) {
        return true;
      }
      return (progress.levelStars[String(levelId - 1)] || 0) > 0;
    }

    function mergeAnswerIntoProgress(progress, question, isCorrect) {
      const key = questionKey(question);
      if (isCorrect) {
        // Spec §4.2: a question the child has since got right leaves the pool.
        // Without this the pool saturates with mastered material and level
        // 9/10 permanently spends 30% of every run on questions from week one,
        // crowding out whatever is actually still hard.
        progress.wrongAnswers = progress.wrongAnswers.filter(
          (entry) => questionKey(entry) !== key,
        );
        return progress;
      }
      const existing = progress.wrongAnswers.find((entry) => questionKey(entry) === key);
      if (existing !== undefined) {
        existing.count += 1;
        return progress;
      }
      progress.wrongAnswers.push({ a: question.a, b: question.b, count: 1 });
      if (progress.wrongAnswers.length > MAX_TRACKED_WRONG_ANSWERS) {
        progress.wrongAnswers.shift();
      }
      return progress;
    }

    function recordLevelResult(progress, levelId, correctCount, questionCount) {
      const key = String(levelId);
      const stars = computeStars(correctCount, questionCount);
      if (stars > (progress.levelStars[key] || 0)) {
        progress.levelStars[key] = stars;
      }
      if (correctCount > (progress.levelBestScore[key] || 0)) {
        progress.levelBestScore[key] = correctCount;
      }
      return progress;
    }

    function appendDigit(currentInput, digit) {
      if (currentInput.length >= MAX_ANSWER_DIGITS) {
        return currentInput;
      }
      // The difference is never zero on any level, so a leading zero is
      // always a slip and is dropped rather than shown as "07".
      if (currentInput.length === 0 && digit === 0) {
        return currentInput;
      }
      return currentInput + String(digit);
    }

    function removeLastDigit(currentInput) {
      return currentInput.slice(0, -1);
    }

    function canSubmitAnswer(currentInput) {
      return currentInput.length > 0;
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/progress.test.js`
Expected: PASS

- [ ] **Step 5: 补齐进度测试**

把 `tests/progress.test.js` 扩成下面完整内容。

```js
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
```

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: PASS（三个测试文件全部通过）

- [ ] **Step 7: 提交**

```bash
git add index.html tests/progress.test.js
git commit -m "feat: 进度模型与输入规则"
```

---

## Task 4: 页面骨架 + 关卡地图 + 进度落盘

**Files:**
- Modify: `index.html`（替换 `<body>` 与 `<script id="game-ui">` 分区）

**Interfaces:**
- Consumes: `createInitialProgress`、`parseProgress`、`serializeProgress`、`isLevelUnlocked`、`LEVEL_TITLES`、`LEVEL_COUNT`、`FIRST_LEVEL_ID`、`PROGRESS_STORAGE_KEY`（Task 1、3）
- Produces（供后续任务调用，全部定义在 `game-ui` 分区）：
  - `gameState` —— 全局状态对象
  - `elementById(id: string): HTMLElement`
  - `showScreen(screenName: string): void`
  - `renderLevelMap(): void`
  - `loadProgress(): Progress` / `saveProgress(progress): void`
  - 常量：`SCREEN_MAP`、`SCREEN_PLAY`、`SCREEN_RESULT`、`MAX_STARS = 3`、`STAR_FILLED`、`STAR_EMPTY`、`MUTE_ICON_ON`、`MUTE_ICON_OFF`

- [ ] **Step 1: 替换 `index.html` 的 body 占位元素**

把 `<body>` 里那一行 `<main id="app"></main>` 替换为下面内容。

**只替换这一行。** 两个 `<script>` 块（`game-logic` 与 `game-ui`）必须原样保留在 `</body>` 之前 —— 本步骤新增的只是界面结构，不是整段 body。若照「整段替换 body」执行，两个 script 块会被删掉，测试随即报 `No <script id="game-logic"> block found`。

`<style>` 仍保持为空，Task 10 填。

```html
  <button id="mute-toggle" type="button" class="mute-toggle" aria-label="音效开关">🔊</button>

  <main id="screen-map" class="screen">
    <h1 class="screen-title">100 以内减法闯关</h1>
    <p class="screen-subtitle">点一关开始练习</p>
    <ul id="level-map" class="level-map"></ul>
  </main>

  <main id="screen-play" class="screen" hidden>
    <header class="play-header">
      <button id="back-to-map" type="button" class="ghost-button">← 返回</button>
      <span id="level-title" class="play-title"></span>
      <span id="question-counter" class="play-counter"></span>
      <span id="challenge-clock" class="challenge-clock" hidden></span>
      <span id="combo-indicator" class="combo-indicator"></span>
    </header>

    <section id="question-area" class="question-area">
      <p id="question-text" class="question-text"></p>
      <p id="answer-display" class="answer-display"></p>
    </section>

    <p id="hint-text" class="hint-text"></p>

    <section id="keypad" class="keypad"></section>

    <div id="demo-overlay" class="demo-overlay" hidden>
      <div class="demo-card">
        <p id="demo-title" class="demo-title"></p>
        <ol id="demo-steps" class="demo-steps"></ol>
        <button id="demo-continue" type="button" class="primary-button">继续</button>
      </div>
    </div>
  </main>

  <main id="screen-result" class="screen" hidden>
    <h2 id="result-heading" class="screen-title"></h2>
    <p id="result-stars" class="result-stars"></p>
    <p id="result-summary" class="result-summary"></p>
    <p id="result-wrong-review" class="result-wrong-review"></p>
    <div class="result-actions">
      <button id="result-primary" type="button" class="primary-button"></button>
      <button id="result-replay" type="button" class="secondary-button">再来一次</button>
      <button id="result-back" type="button" class="ghost-button">回关卡地图</button>
    </div>
  </main>
```

- [ ] **Step 2: 实现地图页与进度读写**

把 `<script id="game-ui">` 分区替换为下面内容。

```js
    'use strict';

    const SCREEN_MAP = 'map';
    const SCREEN_PLAY = 'play';
    const SCREEN_RESULT = 'result';

    // MAX_STARS is NOT declared here. Task 4's review fix moved it into the
    // game-logic block, because a duplicate top-level const across the two
    // classic scripts is a hard SyntaxError, not a shadow.
    const STAR_FILLED = '⭐';
    const STAR_EMPTY = '☆';
    const LEVEL_LOCK_ICON = '🔒';
    const MUTE_ICON_ON = '🔊';
    const MUTE_ICON_OFF = '🔇';

    const gameState = {
      progress: createInitialProgress(),
      currentLevelId: null,
    };

    function elementById(id) {
      const element = document.getElementById(id);
      if (element === null) {
        throw new Error(`Missing element: #${id}`);
      }
      return element;
    }

    function loadProgress() {
      try {
        return parseProgress(window.localStorage.getItem(PROGRESS_STORAGE_KEY));
      } catch (error) {
        console.error('localStorage is unavailable, progress will not be saved.', error);
        return createInitialProgress();
      }
    }

    function saveProgress(progress) {
      try {
        window.localStorage.setItem(PROGRESS_STORAGE_KEY, serializeProgress(progress));
      } catch (error) {
        console.error('Failed to save progress.', error);
      }
    }

    function showScreen(screenName) {
      elementById('screen-map').hidden = screenName !== SCREEN_MAP;
      elementById('screen-play').hidden = screenName !== SCREEN_PLAY;
      elementById('screen-result').hidden = screenName !== SCREEN_RESULT;
    }

    function formatStars(starCount) {
      return STAR_FILLED.repeat(starCount) + STAR_EMPTY.repeat(MAX_STARS - starCount);
    }

    function buildLevelCard(levelId) {
      const isUnlocked = isLevelUnlocked(gameState.progress, levelId);
      const item = document.createElement('li');
      item.className = isUnlocked ? 'level-card' : 'level-card is-locked';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-button';
      button.disabled = !isUnlocked;
      button.addEventListener('click', () => startLevel(levelId));

      const number = document.createElement('span');
      number.className = 'level-number';
      number.textContent = isUnlocked ? `第 ${levelId} 关` : LEVEL_LOCK_ICON;

      const title = document.createElement('span');
      title.className = 'level-name';
      title.textContent = LEVEL_TITLES[levelId];

      const stars = document.createElement('span');
      stars.className = 'level-stars';
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        // The timed challenge is never awarded stars, so showing three empty
        // ones would be a lie. Show its best score instead.
        const bestScore = gameState.progress.levelBestScore[String(levelId)] || 0;
        stars.textContent = bestScore > 0 ? `最高 ${bestScore} 题` : '';
      } else {
        stars.textContent = formatStars(gameState.progress.levelStars[String(levelId)] || 0);
      }

      button.append(number, title, stars);
      item.appendChild(button);
      return item;
    }

    function renderLevelMap() {
      const list = elementById('level-map');
      list.replaceChildren();
      for (let levelId = FIRST_LEVEL_ID; levelId <= LEVEL_COUNT; levelId += 1) {
        list.appendChild(buildLevelCard(levelId));
      }
    }

    function goToLevelMap() {
      renderLevelMap();
      showScreen(SCREEN_MAP);
    }

    function initGame() {
      gameState.progress = loadProgress();
      elementById('mute-toggle').textContent = MUTE_ICON_ON;
      elementById('back-to-map').addEventListener('click', goToLevelMap);
      goToLevelMap();
    }

    window.addEventListener('DOMContentLoaded', initGame);
```

- [ ] **Step 3: 手工验证**

Run: 在浏览器里打开 `index.html`（Windows 上直接双击）。
Expected:
- 看到「100 以内减法闯关」标题与 10 张关卡卡片。
- 第 1 关可点，第 2–10 关显示 🔒 且按钮为禁用（灰）。
- 页面加载完成后控制台无报错。
- **先不要点第 1 关。** `startLevel` 要到 Task 5 才实现，此刻点击会在控制台抛 `ReferenceError: startLevel is not defined` —— 这是预期的，不是本任务的缺陷；Task 5 完成后该按钮才会工作。验收时只看渲染与控制台在**未点击**状态下是否干净。

- [ ] **Step 4: 运行测试，确认没有被破坏**

Run: `npm test`
Expected: PASS（三个测试文件仍然全绿；`game-ui` 分区不参与测试）

- [ ] **Step 5: 提交**

```bash
git add index.html
git commit -m "feat: 页面骨架与关卡地图"
```

---

## Task 5: 单题流程 + 屏幕键盘 + 连击

**Files:**
- Modify: `index.html`（`<script id="game-ui">` 分区内追加）

**Interfaces:**
- Consumes: `createQuestionStream`、`createRandom`、`formatQuestion`、`appendDigit`、`removeLastDigit`、`canSubmitAnswer`、`LEVEL_QUESTION_COUNTS`、`MAX_ANSWER_DIGITS`、`questionKey`（Task 1、3）
- Produces:
  - `startLevel(levelId: number): void`
  - `presentNextQuestion(): void`
  - `submitAnswer(): void`
  - `renderQuestion(): void`
  - `renderKeypad(): void`
  - `renderCombo(): void`
  - 常量：`KEYPAD_DIGITS`、`FEEDBACK_DELAY_MS = 400`、`FEEDBACK_CLASS_CORRECT = 'is-correct'`、`FEEDBACK_CLASS_WRONG = 'is-wrong'`、`COMBO_VISIBLE_FROM = 3`

**注意：** 本任务**不**接入提示计时与音效——它们分别由 Task 7、Task 8 显式修改这两个函数加入，避免留下未定义的调用。

- [ ] **Step 1: 追加单题流程**

把下面代码插到 `<script id="game-ui">` 内、`initGame` 之前。

```js
    const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const FEEDBACK_DELAY_MS = 400;
    const ONES_DIGIT_CLASS = 'ones-digit';
    const FEEDBACK_CLASS_CORRECT = 'is-correct';
    const FEEDBACK_CLASS_WRONG = 'is-wrong';
    const COMBO_VISIBLE_FROM = 3;

    function questionCountFor(levelId) {
      return LEVEL_QUESTION_COUNTS[levelId];
    }

    function startLevel(levelId) {
      gameState.currentLevelId = levelId;
      gameState.questionStream = createQuestionStream(
        levelId,
        createRandom(Date.now()),
        gameState.progress.wrongAnswers,
      );
      gameState.answeredCount = 0;
      gameState.correctCount = 0;
      gameState.combo = 0;
      gameState.wrongQuestions = [];
      gameState.retryQueue = [];
      gameState.isRetrying = false;
      gameState.currentQuestion = null;
      gameState.currentInput = '';
      renderCombo();
      elementById('level-title').textContent = LEVEL_TITLES[levelId];
      elementById('challenge-clock').hidden = true;
      showScreen(SCREEN_PLAY);
      presentNextQuestion();
    }

    function presentNextQuestion() {
      if (gameState.isRetrying) {
        if (gameState.retryQueue.length === 0) {
          finishLevel();
          return;
        }
        gameState.currentQuestion = gameState.retryQueue.shift();
      } else {
        if (gameState.answeredCount >= questionCountFor(gameState.currentLevelId)) {
          beginRetryRound();
          return;
        }
        gameState.currentQuestion = gameState.questionStream.next();
      }
      gameState.currentInput = '';
      renderQuestion();
      renderKeypad();
    }

    function beginRetryRound() {
      if (gameState.wrongQuestions.length === 0) {
        finishLevel();
        return;
      }
      gameState.isRetrying = true;
      gameState.retryQueue = gameState.wrongQuestions.slice();
      presentNextQuestion();
    }

    function buildDigitNodes(value) {
      const digits = String(value).split('');
      const lastIndex = digits.length - 1;
      return digits.map((digit, index) => {
        const span = document.createElement('span');
        span.className = index === lastIndex ? `digit ${ONES_DIGIT_CLASS}` : 'digit';
        span.textContent = digit;
        return span;
      });
    }

    // The ones digits get their own elements so the hint styles can colour and
    // ring them without touching the rest of the question.
    function renderQuestionText() {
      const question = gameState.currentQuestion;
      const container = elementById('question-text');
      container.setAttribute('aria-label', formatQuestion(question));
      container.replaceChildren(
        ...buildDigitNodes(question.a),
        document.createTextNode(' − '),
        ...buildDigitNodes(question.b),
        document.createTextNode(' = ?'),
      );
    }

    function renderQuestion() {
      renderQuestionText();
      elementById('question-text').classList.remove(FEEDBACK_CLASS_CORRECT, FEEDBACK_CLASS_WRONG);
      elementById('hint-text').textContent = '';
      if (gameState.isRetrying) {
        elementById('question-counter').textContent = '错题重练';
      } else {
        const total = questionCountFor(gameState.currentLevelId);
        const shown = Math.min(gameState.answeredCount + 1, total);
        elementById('question-counter').textContent = `第 ${shown} / ${total} 题`;
      }
      renderAnswerDisplay();
    }

    function renderAnswerDisplay() {
      elementById('answer-display').textContent = gameState.currentInput;
      const confirmButton = document.querySelector('.keypad-confirm');
      if (confirmButton !== null) {
        confirmButton.disabled = !canSubmitAnswer(gameState.currentInput);
      }
    }

    function buildKeypadButton(label, extraClass, onPress) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `keypad-button ${extraClass}`;
      button.textContent = label;
      button.addEventListener('click', onPress);
      return button;
    }

    function handleDigitInput(digit) {
      gameState.currentInput = appendDigit(gameState.currentInput, digit);
      renderAnswerDisplay();
    }

    function handleBackspace() {
      gameState.currentInput = removeLastDigit(gameState.currentInput);
      renderAnswerDisplay();
    }

    function renderKeypad() {
      const keypad = elementById('keypad');
      keypad.replaceChildren();
      for (const digit of KEYPAD_DIGITS) {
        keypad.appendChild(
          buildKeypadButton(String(digit), 'keypad-digit', () => handleDigitInput(digit)),
        );
      }
      keypad.appendChild(buildKeypadButton('⌫', 'keypad-backspace', handleBackspace));
      keypad.appendChild(buildKeypadButton('确定', 'keypad-confirm', submitAnswer));
      renderAnswerDisplay();
    }

    function renderCombo() {
      const indicator = elementById('combo-indicator');
      const isVisible = gameState.combo >= COMBO_VISIBLE_FROM;
      indicator.textContent = isVisible ? `连击 ×${gameState.combo}` : '';
      indicator.classList.toggle('is-visible', isVisible);
    }

    function flashQuestion(feedbackClass) {
      const questionText = elementById('question-text');
      questionText.classList.remove(FEEDBACK_CLASS_CORRECT, FEEDBACK_CLASS_WRONG);
      questionText.classList.add(feedbackClass);
    }

    let feedbackTimeoutId = null;

    // A pending "next question" callback must not survive leaving the level:
    // if it fired after a new level started it would consume one of that
    // level's questions before the child ever saw it.
    function clearFeedbackTimeout() {
      if (feedbackTimeoutId !== null) {
        window.clearTimeout(feedbackTimeoutId);
        feedbackTimeoutId = null;
      }
    }

    function scheduleNextQuestion(delayMs) {
      clearFeedbackTimeout();
      feedbackTimeoutId = window.setTimeout(presentNextQuestion, delayMs);
    }

    function submitAnswer() {
      if (!canSubmitAnswer(gameState.currentInput)) {
        return;
      }
      const question = gameState.currentQuestion;
      const isCorrect = Number(gameState.currentInput) === question.a - question.b;
      if (isCorrect) {
        handleCorrectAnswer();
      } else {
        handleWrongAnswer();
      }
    }

    function handleCorrectAnswer() {
      isFeedbackPending = true;
      gameState.combo += 1;
      if (!gameState.isRetrying) {
        gameState.correctCount += 1;
        gameState.answeredCount += 1;
        // Spec §4.2: getting a question right removes it from the historical
        // wrong-answer pool, so level 9/10 keeps surfacing what is still hard
        // instead of spending a third of every run on mastered material.
        mergeAnswerIntoProgress(gameState.progress, gameState.currentQuestion, true);
        saveProgress(gameState.progress);
      }
      renderCombo();
      flashQuestion(FEEDBACK_CLASS_CORRECT);
      scheduleNextQuestion(FEEDBACK_DELAY_MS);
    }

    function handleWrongAnswer() {
      gameState.combo = 0;
      renderCombo();
      if (!gameState.isRetrying) {
        gameState.answeredCount += 1;
        gameState.wrongQuestions.push(gameState.currentQuestion);
        mergeAnswerIntoProgress(gameState.progress, gameState.currentQuestion, false);
        saveProgress(gameState.progress);
      }
      flashQuestion(FEEDBACK_CLASS_WRONG);
      showDemo(gameState.currentQuestion);
    }
```

- [ ] **Step 2: 追加演示弹层与结算占位**

`showDemo` 现在实现，`finishLevel` 在 Task 6 实现。把下面代码插在 `handleWrongAnswer` 之后。

```js
    const DEMO_ANSWER_TEMPLATE = '正确答案是 {answer}';

    function showDemo(question) {
      const overlay = elementById('demo-overlay');
      const list = elementById('demo-steps');
      // Spec §5.1 requires the correct answer to be shown, and §5.3 lets the
      // child dismiss the overlay by tapping outside it. Putting the answer
      // only in the last step means a child who swipes the overlay away never
      // sees it, so it gets its own line at the top of the card.
      elementById('demo-title').textContent = DEMO_ANSWER_TEMPLATE.replace(
        '{answer}',
        String(question.a - question.b),
      );
      list.replaceChildren();
      for (const step of buildDemoSteps(question.a, question.b).steps) {
        const item = document.createElement('li');
        item.textContent = step;
        list.appendChild(item);
      }
      overlay.hidden = false;
    }

    function hideDemo() {
      elementById('demo-overlay').hidden = true;
      presentNextQuestion();
    }

    function finishLevel() {
      // Implemented in Task 6.
    }
```

- [ ] **Step 3: 接线事件与物理键盘**

把 `initGame` 替换为下面内容，并给 `goToLevelMap` 的开头补一行 `clearFeedbackTimeout();`。

**为什么补这一行：** 反馈回调必须随关卡一起取消。答对后 400 毫秒内点「返回」再开新关，陈旧回调会在新关卡第一题渲染之后才触发，白白吃掉一道题，计数器直接从「第 1 题」跳到「第 2 题」。`clearFeedbackTimeout` 与 `scheduleNextQuestion` 都在 Step 1 已定义。

改完的 `goToLevelMap` 应为：

```js
    function goToLevelMap() {
      clearFeedbackTimeout();
      renderLevelMap();
      showScreen(SCREEN_MAP);
    }
```

`initGame` 的新内容：

```js
    const DIGIT_KEY_PATTERN = /^[0-9]$/;

    function isDemoVisible() {
      return !elementById('demo-overlay').hidden;
    }

    function handlePhysicalKey(event) {
      if (elementById('screen-play').hidden) {
        return;
      }
      if (isDemoVisible()) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          hideDemo();
        }
        return;
      }
      if (DIGIT_KEY_PATTERN.test(event.key)) {
        handleDigitInput(Number(event.key));
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
        return;
      }
      if (event.key === 'Enter') {
        submitAnswer();
      }
    }

    function initGame() {
      gameState.progress = loadProgress();
      elementById('mute-toggle').textContent = MUTE_ICON_ON;
      elementById('back-to-map').addEventListener('click', goToLevelMap);
      elementById('demo-continue').addEventListener('click', hideDemo);
      elementById('demo-overlay').addEventListener('click', (event) => {
        if (event.target === elementById('demo-overlay')) {
          hideDemo();
        }
      });
      document.addEventListener('keydown', handlePhysicalKey);
      goToLevelMap();
    }
```

- [ ] **Step 4: 手工验证**

Run: 浏览器打开 `index.html`，点第 1 关。
Expected:
- 出现题目（如 `45 − 3 = ?`）、空白答案区、数字键盘。
- 点数字能输入；首位点 `0` 无反应；输满两位后再点数字无反应；`⌫` 逐位删除；空输入时「确定」为禁用。
- 答对：题目变绿，约 0.4 秒后进入下一题。
- 答错：题目变红，弹出演示弹层；点「继续」进入下一题。
- 连对 3 题后右上角出现「连击 ×3」；答错后连击消失。
- 物理键盘数字键、`Backspace`、`Enter` 同样生效。
- 控制台无报错（`finishLevel` 为空函数，一关做完不会跳转——预期）。

- [ ] **Step 5: 运行测试，确认没有被破坏**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add index.html
git commit -m "feat: 单题流程、屏幕键盘与连击"
```

---

## Task 6: 关卡结算 + 星级解锁

**Files:**
- Modify: `index.html`（`<script id="game-ui">` 分区内替换 `finishLevel` 空实现）

**Interfaces:**
- Consumes: `computeStars`、`isLevelPassed`、`recordLevelResult`、`LEVEL_COUNT`（Task 3）
- Produces:
  - `finishLevel(): void`
  - `finishStandardLevel(): void`
  - `renderResult(levelId, stars, isPassed, total): void`
  - 常量：`RESULT_PASS_HEADING`、`RESULT_FAIL_HEADING`、`RESULT_NEXT_LABEL`、`RESULT_RETRY_LABEL`

- [ ] **Step 1: 替换 `finishLevel` 空实现**

把 `finishLevel` 的空函数体替换为下面代码，并追加其依赖。

```js
    const RESULT_PASS_HEADING = '过关啦！';
    const RESULT_FAIL_HEADING = '再试一次吧';
    const RESULT_NEXT_LABEL = '下一关';
    const RESULT_RETRY_LABEL = '再来一次';
    const RESULT_WRONG_REVIEW_PREFIX = '错题回顾：';
    const RESULT_NO_WRONG_REVIEW = '这一关全对，没有错题！';

    function finishLevel() {
      finishStandardLevel();
    }

    function finishStandardLevel() {
      const levelId = gameState.currentLevelId;
      const total = questionCountFor(levelId);
      const stars = computeStars(gameState.correctCount, total);
      const isPassed = isLevelPassed(gameState.correctCount, total);
      recordLevelResult(gameState.progress, levelId, gameState.correctCount, total);
      saveProgress(gameState.progress);
      renderResult(levelId, stars, isPassed, total);
      showScreen(SCREEN_RESULT);
    }

    function buildWrongReviewText() {
      if (gameState.wrongQuestions.length === 0) {
        return RESULT_NO_WRONG_REVIEW;
      }
      const list = gameState.wrongQuestions
        .map((question) => `${question.a} − ${question.b}`)
        .join('、');
      return `${RESULT_WRONG_REVIEW_PREFIX}${list}`;
    }

    function renderResult(levelId, stars, isPassed, total) {
      elementById('result-heading').textContent = isPassed ? RESULT_PASS_HEADING : RESULT_FAIL_HEADING;
      elementById('result-stars').textContent = formatStars(stars);
      elementById('result-summary').textContent = `答对 ${gameState.correctCount} / ${total} 题`;
      elementById('result-wrong-review').textContent = buildWrongReviewText();

      const hasNextLevel = levelId < LEVEL_COUNT;
      const primaryLabel = isPassed && hasNextLevel ? RESULT_NEXT_LABEL : RESULT_RETRY_LABEL;
      const primary = elementById('result-primary');
      primary.textContent = primaryLabel;
      primary.onclick = () => {
        if (isPassed && hasNextLevel) {
          startLevel(levelId + 1);
          return;
        }
        startLevel(levelId);
      };

      // When the primary button already restarts the level, a second restart
      // button next to it is just noise.
      const replay = elementById('result-replay');
      replay.hidden = primaryLabel === RESULT_RETRY_LABEL;
      replay.onclick = () => startLevel(levelId);
      elementById('result-back').onclick = goToLevelMap;
    }
```

- [ ] **Step 2: 手工验证**

Run: 浏览器打开 `index.html`，把第 1 关做完。
Expected:
- 全部答对 → 「过关啦！」+ ⭐⭐⭐ + 「答对 10 / 10 题」+「下一关」按钮。
- 点「下一关」进入第 2 关。
- 答对 8–9 题 → 一星或二星，同样显示「下一关」。
- 答对 ≤ 7 题 → 「再试一次吧」+ ☆☆☆ + 按钮文案为「再来一次」。
- 答错过的题在最后自动重练一轮，顶部显示「错题重练」。
- 返回关卡地图，已过关的关卡显示对应星星，下一关解锁（锁图标消失、可点）。
- 刷新页面后星星仍在（localStorage 生效）。
- 控制台无报错。

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat: 关卡结算、星级与解锁"
```

---

## Task 7: 分级提示

**Files:**
- Modify: `index.html`（`<script id="game-ui">` 分区）

**Interfaces:**
- Consumes: `onesDigit`、`needsBorrowing`（Task 2，`game-logic` 分区）、`MIN_TWO_DIGIT_NUMBER`、`ONES_PER_TEN`（Task 1）
- Produces:
  - `startHintTimers(): void` / `clearHintTimers(): void`
  - `showWeakHint(): void` / `showStrongHint(): void`
  - `buildStrongHintText(question): string`
  - 常量：`WEAK_HINT_DELAY_MS = 15 * 1000`、`STRONG_HINT_DELAY_MS = 30 * 1000`、`WEAK_HINT_CLASS`、`STRONG_HINT_CLASS`、`HINT_BORROW_TEMPLATE`、`HINT_PLAIN_TEXT`

**规则（spec §5.2）：** 弱提示 15 秒（题目轻微放大 + 个位变色，**无文字**）；强提示 30 秒（圈出个位 + 引导文案）。计时从题目出现起算，**不因输入而重置**。提示**从不给答案**。

- [ ] **Step 1: 追加提示逻辑**

把下面代码插到 `<script id="game-ui">` 内、`renderCombo` 之后。

```js
    const WEAK_HINT_DELAY_MS = 15 * 1000;
    const STRONG_HINT_DELAY_MS = 30 * 1000;
    const WEAK_HINT_CLASS = 'is-weak-hint';
    const STRONG_HINT_CLASS = 'is-strong-hint';
    const HINT_BORROW_TEMPLATE = '个位 {ones} 减 {subtrahendOnes} 不够减，要向十位借 1 个十';
    const HINT_PLAIN_TEXT = '先算个位，再算十位';

    // needsBorrowing lives in the game-logic block; do not redefine it here —
    // both blocks share the page's global scope and a second definition would
    // silently overwrite the one the demo generator uses.
    function buildStrongHintText(question) {
      const subtrahendOnes = question.b >= MIN_TWO_DIGIT_NUMBER
        ? question.b % ONES_PER_TEN
        : question.b;
      if (!needsBorrowing(question.a, question.b)) {
        return HINT_PLAIN_TEXT;
      }
      return HINT_BORROW_TEMPLATE
        .replace('{ones}', String(onesDigit(question.a)))
        .replace('{subtrahendOnes}', String(subtrahendOnes));
    }

    function showWeakHint() {
      elementById('question-area').classList.add(WEAK_HINT_CLASS);
    }

    function showStrongHint() {
      elementById('question-area').classList.add(STRONG_HINT_CLASS);
      elementById('hint-text').textContent = buildStrongHintText(gameState.currentQuestion);
    }

    function clearHintTimers() {
      window.clearTimeout(gameState.weakHintTimerId);
      window.clearTimeout(gameState.strongHintTimerId);
      gameState.weakHintTimerId = null;
      gameState.strongHintTimerId = null;
    }

    function startHintTimers() {
      clearHintTimers();
      gameState.weakHintTimerId = window.setTimeout(showWeakHint, WEAK_HINT_DELAY_MS);
      gameState.strongHintTimerId = window.setTimeout(showStrongHint, STRONG_HINT_DELAY_MS);
    }
```

- [ ] **Step 2: 在状态对象里加两个计时器字段**

把 `gameState` 的初始化替换为：

```js
    const gameState = {
      progress: createInitialProgress(),
      currentLevelId: null,
      currentQuestion: null,
      currentInput: '',
      questionStream: null,
      answeredCount: 0,
      correctCount: 0,
      combo: 0,
      wrongQuestions: [],
      retryQueue: [],
      isRetrying: false,
      weakHintTimerId: null,
      strongHintTimerId: null,
    };
```

- [ ] **Step 3: 接线——题目出现时启动计时、提交时清除、换题时重置视觉**

三处修改：

1. 在 `presentNextQuestion` 末尾，把
```js
      gameState.currentInput = '';
      renderQuestion();
      renderKeypad();
```
改成
```js
      gameState.currentInput = '';
      renderQuestion();
      renderKeypad();
      startHintTimers();
```

2. 在 `renderQuestion` 内，把
```js
      elementById('question-text').classList.remove(FEEDBACK_CLASS_CORRECT, FEEDBACK_CLASS_WRONG);
      elementById('hint-text').textContent = '';
```
改成
```js
      elementById('question-text').classList.remove(FEEDBACK_CLASS_CORRECT, FEEDBACK_CLASS_WRONG);
      elementById('question-area').classList.remove(WEAK_HINT_CLASS, STRONG_HINT_CLASS);
      elementById('hint-text').textContent = '';
```

3. 在 `submitAnswer` 内，把
```js
      const question = gameState.currentQuestion;
      const isCorrect = Number(gameState.currentInput) === question.a - question.b;
```
改成
```js
      const question = gameState.currentQuestion;
      const isCorrect = Number(gameState.currentInput) === question.a - question.b;
      clearHintTimers();
```

- [ ] **Step 4: 手工验证**

Run: 浏览器打开 `index.html`，进入第 5 关，出一道题后**什么都不做**，盯着看。
Expected:
- 第 15 秒：题目轻微放大、个位数字变色（弱提示，**不出现任何文字**）。
- 第 30 秒：个位被圈出，题目下方出现「个位 2 减 7 不够减，要向十位借 1 个十」这类文案。
- 提示里**没有**正确答案。
- 中途敲数字不会重置计时（第 15 秒、第 30 秒照常触发）。
- 提交答案后立刻进入下一题，提示消失、新题的计时从 0 开始。
- 回到第 1 关（不退位）测一次：强提示文案为「先算个位，再算十位」，不出现「借十」字样。

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add index.html
git commit -m "feat: 分级提示"
```

---

## Task 8: 音效 + 静音开关

**Files:**
- Modify: `index.html`（`<script id="game-ui">` 分区）

**Interfaces:**
- Produces:
  - `ensureAudioContext(): AudioContext | null`
  - `playSound(soundName: string): void`
  - `toggleMute(): void` / `renderMuteToggle(): void`
  - 常量：`SOUND`、`SOUND_GAIN`、`SOUND_DURATION_SECONDS`、`CORRECT_FREQUENCY_HZ`、`CORRECT_SECOND_FREQUENCY_HZ`、`WRONG_FREQUENCY_HZ`、`COMBO_BASE_FREQUENCY_HZ`、`COMBO_FREQUENCY_STEP_HZ`、`MAX_COMBO_PITCH_STEPS`、`COMPLETE_MELODY_HZ`

**关键约束（spec §7）：** `AudioContext` 必须在**首次用户手势**中 `resume()`。加载时创建的 `AudioContext` 处于 `suspended`，不 resume 则全程无声且不报错。

- [ ] **Step 1: 追加音效实现**

把下面代码插到 `<script id="game-ui">` 内、`startHintTimers` 之后。

```js
    const SOUND = {
      CORRECT: 'correct',
      WRONG: 'wrong',
      COMBO: 'combo',
      LEVEL_COMPLETE: 'levelComplete',
    };

    const SOUND_GAIN = 0.15;
    const SOUND_DURATION_SECONDS = 0.15;
    const SILENT_GAIN = 0.0001;
    const CORRECT_FREQUENCY_HZ = 523.25;
    const CORRECT_SECOND_FREQUENCY_HZ = 659.25;
    const WRONG_FREQUENCY_HZ = 155.56;
    const COMBO_BASE_FREQUENCY_HZ = 523.25;
    const COMBO_FREQUENCY_STEP_HZ = 55;
    const MAX_COMBO_PITCH_STEPS = 6;
    const COMPLETE_MELODY_HZ = [523.25, 659.25, 783.99];

    let audioContext = null;

    function ensureAudioContext() {
      if (audioContext === null) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (typeof AudioContextClass !== 'function') {
          return null;
        }
        audioContext = new AudioContextClass();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch((error) => {
          console.error('Failed to resume the audio context.', error);
        });
      }
      return audioContext;
    }

    function playTone(frequencyHz, startDelaySeconds) {
      const context = ensureAudioContext();
      if (context === null || gameState.progress.isMuted) {
        return;
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + startDelaySeconds;
      const endAt = startAt + SOUND_DURATION_SECONDS;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequencyHz, startAt);
      gain.gain.setValueAtTime(SOUND_GAIN, startAt);
      gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);
    }

    function comboFrequency() {
      const steps = Math.min(gameState.combo, MAX_COMBO_PITCH_STEPS);
      return COMBO_BASE_FREQUENCY_HZ + steps * COMBO_FREQUENCY_STEP_HZ;
    }

    function playMelody(frequenciesHz) {
      frequenciesHz.forEach((frequencyHz, index) => {
        playTone(frequencyHz, index * SOUND_DURATION_SECONDS);
      });
    }

    function playSound(soundName) {
      switch (soundName) {
        case SOUND.CORRECT:
          playMelody([CORRECT_FREQUENCY_HZ, CORRECT_SECOND_FREQUENCY_HZ]);
          break;
        case SOUND.WRONG:
          playTone(WRONG_FREQUENCY_HZ, 0);
          break;
        case SOUND.COMBO:
          playTone(comboFrequency(), 0);
          break;
        case SOUND.LEVEL_COMPLETE:
          playMelody(COMPLETE_MELODY_HZ);
          break;
        default:
          throw new Error(`Unknown sound: ${soundName}`);
      }
    }

    function renderMuteToggle() {
      const toggle = elementById('mute-toggle');
      toggle.textContent = gameState.progress.isMuted ? MUTE_ICON_OFF : MUTE_ICON_ON;
    }

    function toggleMute() {
      gameState.progress.isMuted = !gameState.progress.isMuted;
      renderMuteToggle();
      saveProgress(gameState.progress);
    }

    // Browsers keep a freshly created AudioContext suspended until a user
    // gesture happens, so the first tap or key press has to resume it.
    function primeAudioContext() {
      ensureAudioContext();
      document.removeEventListener('pointerdown', primeAudioContext);
      document.removeEventListener('keydown', primeAudioContext);
    }
```

- [ ] **Step 2: 接线播放点**

四处修改：

1. 在 `handleCorrectAnswer` 开头加一行，把
```js
    function handleCorrectAnswer() {
      gameState.combo += 1;
```
改成
```js
    function handleCorrectAnswer() {
      playSound(SOUND.CORRECT);
      gameState.combo += 1;
```

2. 在 `handleCorrectAnswer` 的 `renderCombo();` 之后加连击音，把
```js
      renderCombo();
      flashQuestion(FEEDBACK_CLASS_CORRECT);
```
改成
```js
      renderCombo();
      if (gameState.combo >= COMBO_VISIBLE_FROM) {
        playSound(SOUND.COMBO);
      }
      flashQuestion(FEEDBACK_CLASS_CORRECT);
```

3. 在 `handleWrongAnswer` 开头加一行，把
```js
    function handleWrongAnswer() {
      gameState.combo = 0;
```
改成
```js
    function handleWrongAnswer() {
      playSound(SOUND.WRONG);
      gameState.combo = 0;
```

4. 在 `finishStandardLevel` 内加通关音，把
```js
      recordLevelResult(gameState.progress, levelId, gameState.correctCount, total);
      saveProgress(gameState.progress);
```
改成
```js
      recordLevelResult(gameState.progress, levelId, gameState.correctCount, total);
      saveProgress(gameState.progress);
      if (isPassed) {
        playSound(SOUND.LEVEL_COMPLETE);
      }
```

- [ ] **Step 3: 接线静音开关与首次手势**

把 `initGame` 替换为：

```js
    function initGame() {
      gameState.progress = loadProgress();
      renderMuteToggle();
      elementById('mute-toggle').addEventListener('click', toggleMute);
      elementById('back-to-map').addEventListener('click', goToLevelMap);
      elementById('demo-continue').addEventListener('click', hideDemo);
      elementById('demo-overlay').addEventListener('click', (event) => {
        if (event.target === elementById('demo-overlay')) {
          hideDemo();
        }
      });
      document.addEventListener('pointerdown', primeAudioContext);
      document.addEventListener('keydown', primeAudioContext);
      document.addEventListener('keydown', handlePhysicalKey);
      goToLevelMap();
    }
```

- [ ] **Step 4: 手工验证**

Run: 浏览器打开 `index.html`，**先点一下页面任意位置**，然后进第 1 关答题。
Expected:
- 首次答对能听到上扬双音（这是关键——如果没声音，说明 `AudioContext` 没被 resume）。
- 答错听到低沉短音。
- 连击 ≥ 3 时听到音调更高的短音。
- 过关听到三音小旋律。
- 点右上角 🔊 变成 🔇，之后全程静音；再点回 🔊 恢复。
- 刷新页面后静音状态保持。
- 控制台无报错。

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add index.html
git commit -m "feat: 音效与静音开关"
```

---

## Task 9: 限时挑战（第 10 关）

**Files:**
- Modify: `index.html`（`<script id="game-logic">` 与 `<script id="game-ui">` 两个分区）
- Modify: `tests/game-script-loader.js`（把 `recordChallengeScore` 加进导出名单）
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `TIMED_CHALLENGE_LEVEL_ID`、`LEVEL_QUESTION_COUNTS`、`recordLevelResult`（Task 1、3）
- Produces:
  - `recordChallengeScore(progress, levelId, correctCount): Progress` —— 只更新最高分，不动星级
  - `isTimedChallenge(): boolean` / `startChallengeClock(): void` / `tickChallengeClock(): void` / `clearChallengeClock(): void` / `renderChallengeClock(): void`
  - `skipQuestion(): void` / `finishTimedChallenge(): void`
  - 常量：`TIMED_CHALLENGE_SECONDS = 60`、`CHALLENGE_TICK_MS = 1000`、`CHALLENGE_FEEDBACK_DELAY_MS`、`CHALLENGE_HEADING`、`CHALLENGE_SKIP_LABEL`

- [ ] **Step 1: 写失败测试**

在 `tests/progress.test.js` 末尾追加：

```js
test('the timed challenge records a best score without awarding stars', () => {
  const progress = logic.createInitialProgress();
  logic.recordChallengeScore(progress, logic.TIMED_CHALLENGE_LEVEL_ID, 12);
  logic.recordChallengeScore(progress, logic.TIMED_CHALLENGE_LEVEL_ID, 9);
  assert.equal(progress.levelBestScore['10'], 12);
  assert.equal(progress.levelStars['10'], undefined);
});

test('the timed challenge lasts sixty seconds', () => {
  assert.equal(logic.TIMED_CHALLENGE_SECONDS, 60);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/progress.test.js`
Expected: FAIL —— `logic.recordChallengeScore is not a function`

- [ ] **Step 3: 在 `game-logic` 分区实现**

把下面代码插到 `index.html` 的 `<script id="game-logic">` 内、`recordLevelResult` 之后。

```js
    const TIMED_CHALLENGE_SECONDS = 60;

    function recordChallengeScore(progress, levelId, correctCount) {
      const key = String(levelId);
      if (correctCount > (progress.levelBestScore[key] || 0)) {
        progress.levelBestScore[key] = correctCount;
      }
      return progress;
    }
```

- [ ] **Step 4: 把新函数加进测试导出名单**

在 `tests/game-script-loader.js` 的 `EXPORTED_NAMES` 数组里，把

```js
  'recordLevelResult',
```

改成

```js
  'recordLevelResult',
  'recordChallengeScore',
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `node --test tests/progress.test.js`
Expected: PASS

- [ ] **Step 6: 在 `game-ui` 分区实现限时挑战**

把下面代码插到 `<script id="game-ui">` 内、`playSound` 之后。

```js
    const CHALLENGE_TICK_MS = 1000;
    const CHALLENGE_FEEDBACK_DELAY_MS = 700;
    const CHALLENGE_HEADING = '挑战结束';
    const CHALLENGE_SKIP_LABEL = '跳过';

    function isTimedChallenge() {
      return gameState.currentLevelId === TIMED_CHALLENGE_LEVEL_ID;
    }

    function renderChallengeClock() {
      elementById('challenge-clock').textContent = `⏱ ${gameState.challengeRemainingSeconds} 秒`;
    }

    function clearChallengeClock() {
      if (gameState.challengeTimerId !== null) {
        window.clearInterval(gameState.challengeTimerId);
        gameState.challengeTimerId = null;
      }
    }

    function tickChallengeClock() {
      gameState.challengeRemainingSeconds -= 1;
      renderChallengeClock();
      if (gameState.challengeRemainingSeconds <= 0) {
        clearChallengeClock();
        finishLevel();
      }
    }

    function startChallengeClock() {
      clearChallengeClock();
      gameState.challengeRemainingSeconds = TIMED_CHALLENGE_SECONDS;
      elementById('challenge-clock').hidden = false;
      renderChallengeClock();
      gameState.challengeTimerId = window.setInterval(tickChallengeClock, CHALLENGE_TICK_MS);
    }

    function skipQuestion() {
      clearHintTimers();
      presentNextQuestion();
    }

    function finishTimedChallenge() {
      recordChallengeScore(gameState.progress, TIMED_CHALLENGE_LEVEL_ID, gameState.correctCount);
      saveProgress(gameState.progress);
      const bestScore = gameState.progress.levelBestScore[String(TIMED_CHALLENGE_LEVEL_ID)] || 0;
      elementById('result-heading').textContent = CHALLENGE_HEADING;
      elementById('result-stars').textContent = '';
      elementById('result-summary').textContent =
        `${TIMED_CHALLENGE_SECONDS} 秒答对 ${gameState.correctCount} 题 · 最高纪录 ${bestScore} 题`;
      elementById('result-wrong-review').textContent = buildWrongReviewText();
      const primary = elementById('result-primary');
      primary.textContent = RESULT_RETRY_LABEL;
      primary.onclick = () => startLevel(TIMED_CHALLENGE_LEVEL_ID);
      elementById('result-replay').hidden = true;
      elementById('result-back').onclick = goToLevelMap;
      showScreen(SCREEN_RESULT);
    }
```

- [ ] **Step 7: 把限时挑战接进既有流程**

六处修改：

1. `gameState` 里加两个字段——把
```js
      weakHintTimerId: null,
      strongHintTimerId: null,
    };
```
改成
```js
      weakHintTimerId: null,
      strongHintTimerId: null,
      challengeRemainingSeconds: 0,
      challengeTimerId: null,
    };
```

2. `startLevel` 末尾启动时钟——把
```js
      elementById('level-title').textContent = LEVEL_TITLES[levelId];
      elementById('challenge-clock').hidden = true;
      showScreen(SCREEN_PLAY);
      presentNextQuestion();
```
改成
```js
      elementById('level-title').textContent = LEVEL_TITLES[levelId];
      elementById('challenge-clock').hidden = true;
      clearChallengeClock();
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        startChallengeClock();
      }
      showScreen(SCREEN_PLAY);
      presentNextQuestion();
```

3. `presentNextQuestion` 不按题数结束限时关——把
```js
        if (gameState.answeredCount >= questionCountFor(gameState.currentLevelId)) {
          beginRetryRound();
          return;
        }
```
改成
```js
        if (!isTimedChallenge() && gameState.answeredCount >= questionCountFor(gameState.currentLevelId)) {
          beginRetryRound();
          return;
        }
```

4. `beginRetryRound` 对限时关直接结束——把
```js
    function beginRetryRound() {
      if (gameState.wrongQuestions.length === 0) {
```
改成
```js
    function beginRetryRound() {
      if (isTimedChallenge() || gameState.wrongQuestions.length === 0) {
```

5. `renderQuestion` 的计数器区分限时关——把
```js
      if (gameState.isRetrying) {
        elementById('question-counter').textContent = '错题重练';
      } else {
```
改成
```js
      if (isTimedChallenge()) {
        elementById('question-counter').textContent = `已答对 ${gameState.correctCount} 题`;
      } else if (gameState.isRetrying) {
        elementById('question-counter').textContent = '错题重练';
      } else {
```

6. `renderKeypad` 为限时关加「跳过」——把
```js
      keypad.appendChild(buildKeypadButton('⌫', 'keypad-backspace', handleBackspace));
      confirmButton = buildKeypadButton('确定', 'keypad-confirm', submitAnswer);
      keypad.appendChild(confirmButton);
      renderAnswerDisplay();
```
改成
```js
      keypad.appendChild(buildKeypadButton('⌫', 'keypad-backspace', handleBackspace));
      confirmButton = buildKeypadButton('确定', 'keypad-confirm', submitAnswer);
      keypad.appendChild(confirmButton);
      if (isTimedChallenge()) {
        keypad.appendChild(buildKeypadButton(CHALLENGE_SKIP_LABEL, 'keypad-skip', skipQuestion));
      }
      renderAnswerDisplay();
```

- [ ] **Step 8: 答错时不给演示，直接下一题**

限时关的时间本身就是压力源，弹演示会烧掉时钟（spec §5.6）。把 `handleWrongAnswer` 的结尾

```js
      flashQuestion(FEEDBACK_CLASS_WRONG);
      showDemo(gameState.currentQuestion);
    }
```

改成

```js
      flashQuestion(FEEDBACK_CLASS_WRONG);
      if (isTimedChallenge()) {
        const answer = gameState.currentQuestion.a - gameState.currentQuestion.b;
        elementById('hint-text').textContent = `正确答案是 ${answer}`;
        scheduleNextQuestion(CHALLENGE_FEEDBACK_DELAY_MS);
        return;
      }
      showDemo(gameState.currentQuestion);
    }
```

- [ ] **Step 9: `finishLevel` 分流**

把

```js
    function finishLevel() {
      finishStandardLevel();
    }
```

改成

```js
    function finishLevel() {
      clearHintTimers();
      clearFeedbackTimeout();
      if (isTimedChallenge()) {
        finishTimedChallenge();
        return;
      }
      finishStandardLevel();
    }
```

- [ ] **Step 10: 手工验证**

Run: 浏览器打开 `index.html`，先通关第 9 关解锁第 10 关，再进入第 10 关。
Expected:
- 顶部出现 `⏱ 60 秒` 并逐秒倒数。
- 计数器显示「已答对 N 题」。
- 键盘区多出「跳过」按钮，点了立即换下一题。
- 答错时题目变红、下方显示「正确答案是 X」，约 0.7 秒后自动下一题，**不弹演示**。
- 答对连击照常。
- 60 秒到 → 「挑战结束」+「60 秒答对 N 题 · 最高纪录 M 题」，按钮为「再来一次」。
- 再玩一次，最高纪录只增不减。
- 关卡地图上第 10 关**没有星星**（限时挑战不计星级）。
- 控制台无报错。

- [ ] **Step 11: 运行全部测试**

Run: `npm test`
Expected: PASS（三个测试文件全部通过）

- [ ] **Step 12: 提交**

```bash
git add index.html tests/game-script-loader.js tests/progress.test.js
git commit -m "feat: 限时挑战关"
```

---

## Task 10: 太空主题设计令牌 + 星图关卡地图

**Files:**
- Modify: `index.html`（`<style>` 分区填入设计令牌与地图样式；`<script id="game-ui">` 内重写 `renderLevelMap` / `buildLevelCard`）

**Interfaces:**
- Consumes: `LEVEL_COUNT`、`FIRST_LEVEL_ID`、`LEVEL_TITLES`、`TIMED_CHALLENGE_LEVEL_ID`、`isLevelUnlocked`、`gameState`、`formatStars`、`elementById`、`goToLevelMap`、`startLevel`
- Produces（Task 11 全部消费）:
  - **设计令牌** —— 全套 CSS 自定义属性定义在 `:root`，Task 11 只引用不重定义
  - `levelState(levelId): string` —— 返回 `is-cleared` / `is-current` / `is-locked` 之一
  - `buildStarMapNode(levelId): HTMLElement`、`renderLevelMap(): void`
  - `buildLevelDetail(levelId): HTMLElement`、`renderLevelDetail(): void`、`selectLevel(levelId): void`
  - 常量：`PLANET_ICONS`、`STAR_MAP_STATE_CLEARED`、`STAR_MAP_STATE_CURRENT`、`STAR_MAP_STATE_LOCKED`

**设计方向（spec §7）：** 深空蓝紫底 + 发光描边 + 星尘；10 关沿一条横向星图排布，不是一格格卡片。已通关节点点亮并显示星星，当前节点高亮，未解锁节点暗色锁定。点节点在下方详情卡里显示该关信息与「开始」。

```
🌌 减法星球                         🔊
●━━━●━━━○━━━○━━━○━━━○  (可横向滚动)
1   2   3   4   5   6  …
┌──────────────────────────┐
│ 第 1 关 · 两位数减一位数   │
│        ⭐⭐⭐             │
│       [ 开始 ]            │
└──────────────────────────┘
```

- [ ] **Step 1: 替换 `#screen-map` 的标记**

把 `<main id="screen-map" class="screen">…</main>` 整段替换为：

```html
  <main id="screen-map" class="screen">
    <header class="app-header">
      <h1 class="app-title">🌌 减法星球</h1>
      <p class="app-subtitle">沿着星图，一关一关往前闯</p>
    </header>
    <div class="star-map-scroll">
      <ol id="star-map" class="star-map"></ol>
    </div>
    <section id="level-detail" class="level-detail"></section>
  </main>
```

- [ ] **Step 2: 用星图渲染替换 `buildLevelCard` 与 `renderLevelMap`**

把 `index.html` 的 `<script id="game-ui">` 里现有的 `buildLevelCard` 与 `renderLevelMap` 两个函数**整体删除**，替换为下面代码。

```js
    const PLANET_ICONS = ['🪐', '🌕', '⭐', '☄️', '🌠', '🔭', '🚀', '🛸', '🌌', '👽'];
    const SHIP_ICON = '🚀';
    const STAR_MAP_STATE_CLEARED = 'is-cleared';
    const STAR_MAP_STATE_CURRENT = 'is-current';
    const STAR_MAP_STATE_LOCKED = 'is-locked';
    const STAR_MAP_STATE_JUST_CLEARED = 'is-just-cleared';
    const LOCKED_ICON = '🔒';
    const CHALLENGE_BEST_SCORE_TEMPLATE = '最高 {score} 题';

    // The timed challenge never earns stars (spec §3.2), so its "played" state
    // has to come from the best score instead — judged on stars alone its node
    // would pulse as "current" forever, however many times the child ran it.
    function isLevelCleared(levelId) {
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        return (gameState.progress.levelBestScore[String(levelId)] || 0) > 0;
      }
      return (gameState.progress.levelStars[String(levelId)] || 0) > 0;
    }

    function levelState(levelId) {
      if (isLevelCleared(levelId)) {
        return STAR_MAP_STATE_CLEARED;
      }
      if (isLevelUnlocked(gameState.progress, levelId)) {
        return STAR_MAP_STATE_CURRENT;
      }
      return STAR_MAP_STATE_LOCKED;
    }

    function buildStarMapNode(levelId) {
      const state = levelState(levelId);
      const isUnlocked = state !== STAR_MAP_STATE_LOCKED;
      const item = document.createElement('li');
      item.className = `star-node ${state}`;
      if (levelId === gameState.justClearedLevelId) {
        item.classList.add(STAR_MAP_STATE_JUST_CLEARED);
      }

      if (levelId === gameState.selectedLevelId) {
        const ship = document.createElement('span');
        ship.className = 'star-node-ship';
        ship.textContent = SHIP_ICON;
        item.appendChild(ship);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'star-node-button';
      button.disabled = !isUnlocked;
      button.setAttribute('aria-label', `第 ${levelId} 关 ${LEVEL_TITLES[levelId]}`);
      button.addEventListener('click', () => selectLevel(levelId));

      const icon = document.createElement('span');
      icon.className = 'star-node-icon';
      icon.textContent = isUnlocked ? PLANET_ICONS[levelId - 1] : LOCKED_ICON;
      button.appendChild(icon);
      item.appendChild(button);

      const number = document.createElement('span');
      number.className = 'star-node-number';
      number.textContent = String(levelId);
      item.appendChild(number);

      if (isLevelCleared(levelId)) {
        const badge = document.createElement('span');
        badge.className = 'star-node-stars';
        badge.textContent = levelId === TIMED_CHALLENGE_LEVEL_ID
          ? CHALLENGE_BEST_SCORE_TEMPLATE.replace(
            '{score}',
            String(gameState.progress.levelBestScore[String(levelId)] || 0),
          )
          : formatStars(gameState.progress.levelStars[String(levelId)] || 0);
        item.appendChild(badge);
      }
      return item;
    }

    function renderLevelMap() {
      const list = elementById('star-map');
      list.replaceChildren();
      let selectedNode = null;
      for (let levelId = FIRST_LEVEL_ID; levelId <= LEVEL_COUNT; levelId += 1) {
        const node = buildStarMapNode(levelId);
        if (levelId === gameState.selectedLevelId) {
          selectedNode = node;
        }
        list.appendChild(node);
      }
      renderLevelDetail();
      // The map is wider than the screen, so the level the detail card is
      // describing has to be brought into view or the child sees a card for a
      // planet they cannot find.
      if (selectedNode !== null) {
        selectedNode.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      gameState.justClearedLevelId = null;
    }

    function firstPlayableLevelId() {
      for (let levelId = FIRST_LEVEL_ID; levelId <= LEVEL_COUNT; levelId += 1) {
        if (!isLevelCleared(levelId)) {
          return levelId;
        }
      }
      return LEVEL_COUNT;
    }

    function buildLevelDetail(levelId) {
      const state = levelState(levelId);
      const isUnlocked = state !== STAR_MAP_STATE_LOCKED;
      const fragment = document.createDocumentFragment();

      const heading = document.createElement('h2');
      heading.className = 'level-detail-heading';
      heading.textContent = `第 ${levelId} 关 · ${LEVEL_TITLES[levelId]}`;
      fragment.appendChild(heading);

      const stars = document.createElement('p');
      stars.className = 'level-detail-stars';
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        const bestScore = gameState.progress.levelBestScore[String(levelId)] || 0;
        stars.textContent = bestScore > 0 ? `最高 ${bestScore} 题` : '60 秒内答对越多越好';
      } else {
        stars.textContent = formatStars(gameState.progress.levelStars[String(levelId)] || 0);
      }
      fragment.appendChild(stars);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'primary-button level-detail-action';
      action.disabled = !isUnlocked;
      action.textContent = isUnlocked ? '开始' : '还没解锁';
      if (isUnlocked) {
        action.addEventListener('click', () => startLevel(levelId));
      }
      fragment.appendChild(action);

      return fragment;
    }

    function renderLevelDetail() {
      const container = elementById('level-detail');
      container.replaceChildren(buildLevelDetail(gameState.selectedLevelId));
    }

    function selectLevel(levelId) {
      gameState.selectedLevelId = levelId;
      renderLevelMap();
    }
```

- [ ] **Step 3: 在 `gameState` 里加选中项，并让返回地图时复位**

1. 在 `gameState` 的定义里，把
```js
      currentLevelId: null,
```
改成
```js
      currentLevelId: null,
      selectedLevelId: null,
```

2. 把 `goToLevelMap` 改成

```js
    function goToLevelMap() {
      clearFeedbackTimeout();
      clearChallengeClock();
      isFeedbackPending = false;
      gameState.selectedLevelId = firstPlayableLevelId();
      renderLevelMap();
      showScreen(SCREEN_MAP);
    }
```

- [ ] **Step 4: 填入设计令牌与星图样式**

把 `<style>` 分区（Task 1 起一直是空的）替换为下面内容。

```css
      :root {
        /* Colour channels are declared as rgb triples so every translucent
           glow derives from one source. Retuning a glow colour then moves all
           of its shadows and text-glows with it, instead of leaving some
           behind at the old hue. */
        --space-deep: #070b1c;
        --space-mid: #131a3d;
        --space-panel-rgb: 30 39 82;
        --space-line-rgb: 120 160 255;
        --glow-cyan-rgb: 79 209 255;
        --glow-violet-rgb: 166 120 255;
        --glow-amber-rgb: 255 209 102;
        --glow-mint-rgb: 94 234 212;
        --danger: #ff6b81;

        --space-panel: rgb(var(--space-panel-rgb) / 0.92);
        --space-line: rgb(var(--space-line-rgb) / 0.35);
        --glow-cyan: rgb(var(--glow-cyan-rgb));
        --glow-violet: rgb(var(--glow-violet-rgb));
        --glow-amber: rgb(var(--glow-amber-rgb));
        --glow-mint: rgb(var(--glow-mint-rgb));
        --success: var(--glow-mint);

        --text-bright: #f2f5ff;
        --text-dim: #96a3d0;
        --node-locked: #2a3160;
        --radius-panel: 24px;
        --radius-button: 18px;
        --touch-target: 64px;
        --question-font-size: 56px;
        --keypad-font-size: 32px;
        --glow-soft: 0 0 18px rgb(var(--glow-cyan-rgb) / 0.45);
        --glow-strong: 0 0 28px rgb(var(--glow-violet-rgb) / 0.65);
      }

      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text-bright);
        font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        background:
          radial-gradient(1100px 600px at 15% -10%, rgb(var(--glow-violet-rgb) / 0.28), transparent 60%),
          radial-gradient(900px 500px at 90% 0%, rgb(var(--glow-cyan-rgb) / 0.22), transparent 55%),
          var(--space-deep);
        display: flex;
        justify-content: center;
        padding: 16px;
      }

      .screen {
        width: 100%;
        max-width: 760px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
      }

      .screen[hidden] {
        display: none;
      }

      .app-header {
        text-align: center;
      }

      .app-title {
        margin: 8px 0 4px;
        font-size: 34px;
        letter-spacing: 2px;
        text-shadow: var(--glow-soft);
      }

      .app-subtitle {
        margin: 0;
        color: var(--text-dim);
        font-size: 17px;
      }

      .mute-toggle {
        position: fixed;
        /* viewport-fit=cover opts the page into the unsafe area, so the
           button has to clear the notch / rounded corner itself. */
        top: calc(12px + env(safe-area-inset-top, 0px));
        right: calc(12px + env(safe-area-inset-right, 0px));
        width: var(--touch-target);
        height: var(--touch-target);
        border: 2px solid var(--space-line);
        border-radius: 50%;
        background: var(--space-panel);
        color: var(--text-bright);
        font-size: 26px;
        cursor: pointer;
        z-index: 10;
      }

      .star-map-scroll {
        width: 100%;
        overflow-x: auto;
        padding: 26px 4px 4px;
        scrollbar-width: thin;
        scroll-behavior: smooth;
      }

      /* 10 nodes x 64px + 9 gaps x 28px = 892px, wider than .screen's 760px,
         so the star map scrolls horizontally on every viewport. That is
         deliberate: the path is meant to be travelled along, not fitted.
         The connector spans exactly the gap (left: -28px, width: 28px), so
         it reads as a line between two planets rather than a dash painted
         over one. */
      .star-map {
        list-style: none;
        margin: 0;
        padding: 0 8px;
        display: flex;
        align-items: flex-start;
        gap: 28px;
        min-width: max-content;
      }

      .star-node {
        width: 64px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        position: relative;
      }

      .star-node + .star-node::before {
        content: "";
        position: absolute;
        top: 31px;
        left: -28px;
        width: 28px;
        height: 2px;
        border-radius: 1px;
        background: var(--space-line);
      }

      .star-node.is-cleared + .star-node::before {
        background: var(--glow-cyan);
        box-shadow: var(--glow-soft);
      }

      .star-node-ship {
        position: absolute;
        top: -22px;
        font-size: 20px;
        animation: ship-bob 1.6s ease-in-out infinite;
      }

      @keyframes ship-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }

      .star-node-button {
        width: var(--touch-target);
        height: var(--touch-target);
        border-radius: 50%;
        border: 3px solid var(--space-line);
        background: var(--space-panel);
        color: var(--text-bright);
        font-size: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }

      .star-node.is-cleared .star-node-button {
        border-color: var(--glow-cyan);
        box-shadow: var(--glow-soft);
      }

      .star-node.is-current .star-node-button {
        border-color: var(--glow-amber);
        box-shadow: 0 0 22px rgb(var(--glow-amber-rgb) / 0.7);
        animation: node-pulse 1.8s ease-in-out infinite;
      }

      .star-node.is-locked .star-node-button {
        background: var(--node-locked);
        border-color: transparent;
        color: var(--text-dim);
        cursor: not-allowed;
      }

      .star-node-button:active:not(:disabled) {
        transform: scale(0.92);
      }

      .star-node-number {
        font-size: 13px;
        color: var(--text-dim);
      }

      .star-node-stars {
        font-size: 11px;
        line-height: 1;
        white-space: nowrap;
      }

      /* The "just cleared" pulse runs when the child returns to the map after
         passing a level, so the planet they lit up is the one that moves. */
      .star-node.is-just-cleared .star-node-button {
        animation: planet-light-up 0.9s ease-out both;
      }

      @keyframes planet-light-up {
        0% { box-shadow: 0 0 0 rgb(var(--glow-mint-rgb) / 0); }
        40% { box-shadow: 0 0 42px rgb(var(--glow-mint-rgb) / 0.9); }
        100% { box-shadow: 0 0 0 rgb(var(--glow-mint-rgb) / 0); }
      }

      @keyframes node-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }

      .level-detail {
        width: 100%;
        max-width: 460px;
        padding: 22px 20px;
        border-radius: var(--radius-panel);
        border: 2px solid var(--space-line);
        background: var(--space-panel);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .level-detail-heading {
        margin: 0;
        font-size: 22px;
      }

      .level-detail-stars {
        margin: 0;
        font-size: 30px;
        line-height: 1;
        color: var(--text-dim);
      }

      .level-detail-action {
        width: 100%;
        max-width: 260px;
      }

      .primary-button,
      .secondary-button,
      .ghost-button {
        min-height: var(--touch-target);
        padding: 0 26px;
        border: none;
        border-radius: var(--radius-button);
        font-family: inherit;
        font-size: 22px;
        font-weight: 700;
        cursor: pointer;
      }

      .primary-button {
        background: linear-gradient(160deg, var(--glow-violet), var(--glow-cyan));
        color: #0a0f26;
        box-shadow: var(--glow-soft);
      }

      .primary-button:disabled {
        background: var(--node-locked);
        color: var(--text-dim);
        box-shadow: none;
        cursor: not-allowed;
      }

      .secondary-button {
        background: var(--space-panel);
        border: 2px solid var(--glow-cyan);
        color: var(--glow-cyan);
      }

      .ghost-button {
        background: transparent;
        color: var(--text-dim);
      }

      @media (prefers-reduced-motion: reduce) {
        .star-node.is-current .star-node-button {
          animation: none;
        }
      }
```

- [ ] **Step 5: 手工验证**

Run: 浏览器打开 `index.html`。
Expected:
- 深空蓝紫渐变背景，标题「🌌 减法星球」带发光。
- 一行 10 个圆形星球节点，**每个可点面积 ≥ 64px**，节点之间有连线**横跨整个间距**（不是一截短横压在星球上）。
- 第 1 关是琥珀色高亮并轻微脉动，第 2–10 关是暗色 🔒。
- **选中的关卡上方浮着一枚 🚀 飞船标记**，并轻微上下浮动。
- 节点下方显示关号；已通关的节点下方显示星星。
- 下方详情卡显示「第 1 关 · 两位数减一位数」、☆☆☆、可点的「开始」。
- **星图可以横向滑动**（10 个节点比屏幕宽是设计如此），且**页面加载时自动把选中的节点滚到视野中央**。
- 点第 5 关（锁着）无反应；点第 1 关节点，详情卡切到第 1 关、飞船跟过去。
- 页面加载后控制台无报错。
- 点「开始」会跳进答题页（Task 5 已实现）。
- 在系统设置里打开「减少动态效果」后刷新，节点不再脉动、飞船不再浮动。
- 右上角静音按钮 **≥ 64px**，且在带刘海的设备上不被遮挡。

- [ ] **Step 6: 运行测试**

Run: `npm test`
Expected: PASS（51/51，本任务不碰 `game-logic`）

- [ ] **Step 7: 提交**

```bash
git add index.html
git commit -m "feat: 太空主题设计令牌与星图关卡地图"
```

---

## Task 11: 答题与结算界面的视觉与动效

**Files:**
- Modify: `index.html`（`<style>` 分区追加；`<script id="game-ui">` 内加特效钩子）

**Interfaces:**
- Consumes: Task 10 的全部设计令牌；`gameState`、`elementById`、`FLASH_*`、`COMBO_VISIBLE_FROM`
- Produces:
  - `spawnSparkBurst(): void`、`renderLevelCompleteGlow(): void`
  - 常量：`SPARK_BURST_CLASS`、`SPARK_COUNT`、`SPARK_LIFETIME_MS`

**视觉要求（spec §7）：** 答对时星光从题目处炸开；答错红色抖动；连击反馈强度递增；过关时星球点亮 + 星尘庆祝。全部用 emoji + CSS，不引外部资源。`prefers-reduced-motion` 开启时关闭位移与缩放类动画。

- [ ] **Step 1: 追加答题与结算界面样式**

把下面 CSS 追加到 `<style>` 分区末尾（`@media (prefers-reduced-motion: reduce)` 块之前）。

```css
      .play-header {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .play-title {
        font-size: 22px;
        font-weight: 700;
      }

      .play-counter,
      .challenge-clock {
        color: var(--text-dim);
        font-size: 18px;
      }

      .challenge-clock {
        color: var(--glow-amber);
        font-weight: 700;
      }

      .combo-indicator {
        margin-left: auto;
        font-size: 20px;
        font-weight: 700;
        color: var(--glow-amber);
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      /* Spec §7 requires the feedback to ramp with the streak, so ×3 and ×8
         must not look identical. renderCombo sets --combo-step. */
      .combo-indicator.is-visible {
        opacity: 1;
        transform: scale(calc(1 + var(--combo-step, 0) * 0.07));
        text-shadow: 0 0 calc(14px + var(--combo-step, 0) * 4px) rgb(var(--glow-amber-rgb) / 0.85);
      }

      .question-area {
        position: relative;
        width: 100%;
        padding: 30px 16px;
        border-radius: var(--radius-panel);
        border: 2px solid var(--space-line);
        background: var(--space-panel);
        text-align: center;
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }

      .question-area.is-weak-hint {
        transform: scale(1.05);
      }

      .question-area.is-strong-hint {
        border-color: var(--glow-amber);
        box-shadow: 0 0 24px rgb(var(--glow-amber-rgb) / 0.5);
      }

      .question-text {
        margin: 0;
        font-size: var(--question-font-size);
        font-weight: 700;
        letter-spacing: 3px;
      }

      .question-text .ones-digit {
        transition: color 0.2s ease;
      }

      .question-area.is-weak-hint .ones-digit {
        color: var(--glow-amber);
      }

      .question-area.is-strong-hint .ones-digit {
        display: inline-block;
        min-width: 1.2em;
        border: 4px solid var(--glow-amber);
        border-radius: 50%;
        color: var(--glow-amber);
      }

      .question-text.is-correct {
        color: var(--success);
        text-shadow: 0 0 20px rgb(var(--glow-mint-rgb) / 0.8);
      }

      .question-text.is-wrong {
        color: var(--danger);
        animation: shake 0.3s ease;
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-8px); }
        75% { transform: translateX(8px); }
      }

      .answer-display {
        margin: 14px 0 0;
        min-height: 62px;
        font-size: 46px;
        font-weight: 700;
        letter-spacing: 5px;
        color: var(--glow-cyan);
        text-shadow: var(--glow-soft);
      }

      .hint-text {
        margin: 0;
        min-height: 26px;
        font-size: 18px;
        color: var(--glow-amber);
        text-align: center;
      }

      .keypad {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }

      .keypad-button {
        min-height: var(--touch-target);
        border: 2px solid var(--space-line);
        border-radius: var(--radius-button);
        background: var(--space-panel);
        color: var(--text-bright);
        font-family: inherit;
        font-size: var(--keypad-font-size);
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }

      .keypad-button:active:not(:disabled) {
        transform: translateY(2px);
        box-shadow: var(--glow-soft);
      }

      .keypad-confirm {
        background: linear-gradient(160deg, var(--glow-violet), var(--glow-cyan));
        color: #0a0f26;
        border-color: transparent;
      }

      .keypad-confirm:disabled {
        background: var(--node-locked);
        color: var(--text-dim);
        border-color: transparent;
        cursor: not-allowed;
      }

      .keypad-skip {
        border-color: var(--glow-amber);
        color: var(--glow-amber);
        font-size: 22px;
      }

      .demo-overlay {
        position: fixed;
        inset: 0;
        background: rgba(4, 7, 20, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 20;
      }

      .demo-overlay[hidden] {
        display: none;
      }

      .demo-card {
        width: 100%;
        max-width: 480px;
        padding: 26px;
        border-radius: var(--radius-panel);
        border: 2px solid var(--glow-cyan);
        background: var(--space-mid);
        box-shadow: var(--glow-strong);
        text-align: center;
      }

      .demo-title {
        margin: 0 0 14px;
        font-size: 22px;
        font-weight: 700;
      }

      .demo-steps {
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .demo-steps li {
        font-size: 30px;
        font-weight: 700;
        color: var(--glow-cyan);
        animation: step-in 0.35s ease both;
      }

      @keyframes step-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .result-stars {
        margin: 0;
        font-size: 52px;
        line-height: 1.1;
      }

      /* Task 4 put class="screen-title" on the map <h1> and the result <h2>.
         Task 10 replaced the map markup, so this class now survives only on
         the result heading — which is the screen meant to reward the child
         and must not render as a browser-default h2. */
      .screen-title {
        margin: 8px 0 0;
        font-size: 34px;
        text-align: center;
        letter-spacing: 2px;
        text-shadow: var(--glow-soft);
      }

      .result-summary {
        margin: 0;
        font-size: 20px;
        color: var(--text-dim);
      }

      .result-wrong-review {
        margin: 0;
        font-size: 18px;
        line-height: 1.7;
        color: var(--glow-amber);
        text-align: center;
      }

      .result-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: center;
      }

      .spark-burst {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: visible;
      }

      .spark {
        position: absolute;
        left: 50%;
        top: 50%;
        font-size: 22px;
        animation: spark-fly 0.7s ease-out both;
      }

      @keyframes spark-fly {
        from {
          opacity: 1;
          transform: translate(-50%, -50%) scale(0.4);
        }
        to {
          opacity: 0;
          transform: translate(calc(-50% + var(--spark-x)), calc(-50% + var(--spark-y))) scale(1.2);
        }
      }

      /* There is deliberately no .level-complete-glow rule here. Spec §7 asks
         for 该星球点亮 — the planet node on the star map — not the question
         card, and #question-area lives inside #screen-play, which is hidden
         by the time the result screen appears, so an animation on it would
         never render. Task 10 owns that effect as .star-node.is-just-cleared
         / @keyframes planet-light-up. */
```

- [ ] **Step 2: 追加特效钩子**

把下面代码插到 `<script id="game-ui">` 内、`flashQuestion` 之后。

```js
    const SPARK_BURST_CLASS = 'spark-burst';
    const SPARK_CLASS = 'spark';
    const SPARK_COUNT = 8;
    const SPARK_ICONS = ['✨', '⭐', '🌟', '💫'];
    const SPARK_LIFETIME_MS = 750;
    const SPARK_RADIUS_PX = 110;
    const COMBO_INTENSITY_PROPERTY = '--combo-step';

    function spawnSparkBurst() {
      const area = elementById('question-area');
      const burst = document.createElement('div');
      burst.className = SPARK_BURST_CLASS;
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const angle = (Math.PI * 2 * index) / SPARK_COUNT;
        const spark = document.createElement('span');
        spark.className = SPARK_CLASS;
        spark.textContent = SPARK_ICONS[index % SPARK_ICONS.length];
        spark.style.setProperty('--spark-x', `${Math.cos(angle) * SPARK_RADIUS_PX}px`);
        spark.style.setProperty('--spark-y', `${Math.sin(angle) * SPARK_RADIUS_PX}px`);
        burst.appendChild(spark);
      }
      area.appendChild(burst);
      window.setTimeout(() => burst.remove(), SPARK_LIFETIME_MS);
    }

    // Spec §7 requires the feedback to ramp with the streak. The CSS scales
    // and brightens off this one property.
    function renderComboIntensity() {
      const steps = Math.max(gameState.combo - COMBO_VISIBLE_FROM, 0);
      elementById('combo-indicator').style.setProperty(COMBO_INTENSITY_PROPERTY, String(steps));
    }
```

- [ ] **Step 3: 接线答对特效与过关特效**

1. 在 `handleCorrectAnswer` 内，把
```js
      flashQuestion(FEEDBACK_CLASS_CORRECT);
      scheduleNextQuestion(FEEDBACK_DELAY_MS);
```
改成
```js
      flashQuestion(FEEDBACK_CLASS_CORRECT);
      spawnSparkBurst();
      scheduleNextQuestion(FEEDBACK_DELAY_MS);
```

2. 在 `finishStandardLevel` 内，把
```js
      renderResult(levelId, stars, isPassed, total);
      showScreen(SCREEN_RESULT);
```
改成
```js
      renderResult(levelId, stars, isPassed, total);
      if (isPassed) {
        // Consumed and cleared by renderLevelMap on the way back to the map,
        // so the planet the child just lit up is the one that animates.
        gameState.justClearedLevelId = levelId;
      }
      showScreen(SCREEN_RESULT);
```

3. 让连击反馈随连击数增强——在 `renderCombo` 末尾追加一行，把
```js
      indicator.classList.toggle('is-visible', isVisible);
    }
```
改成
```js
      indicator.classList.toggle('is-visible', isVisible);
      renderComboIntensity();
    }
```

- [ ] **Step 4: 在 `prefers-reduced-motion` 块里关闭位移与缩放动画**

把 `<style>` 末尾的 `@media (prefers-reduced-motion: reduce)` 块替换为：

```css
      @media (prefers-reduced-motion: reduce) {
        .star-node.is-current .star-node-button,
        .star-node.is-just-cleared .star-node-button,
        .star-node-ship,
        .question-text.is-wrong,
        .demo-steps li {
          animation: none;
        }

        .spark-burst {
          display: none;
        }

        .question-area.is-weak-hint {
          transform: none;
        }

        .combo-indicator.is-visible {
          transform: none;
        }

        .keypad-button:active:not(:disabled),
        .star-node-button:active:not(:disabled) {
          transform: none;
        }
      }
```

- [ ] **Step 5: 手工验证**

Run: 浏览器打开 `index.html`，进第 1 关答一关。
Expected:
- 答题页深空配色，题目区带发光边框，数字键盘大而好点。
- 答对：题目变青色发光，题目区中心炸开一圈 ✨⭐🌟💫 星光，然后进下一题。
- 答错：题目红色抖动，弹出演示卡（青色发光描边），点「继续」进下一题。
- 连击 ≥ 3：右上角琥珀色「连击 ×N」。
- 卡住 15 秒题目轻微放大、个位数字变琥珀色；30 秒个位被琥珀色圆圈圈住并出现提示文案。
- 过关：结算页显示星星，标题带发光（不是浏览器默认 h2）；**返回星图时，刚通关的那颗星球闪一下薄荷色光**——注意发光的是星图上的星球，不是答题区（答题区此时已经隐藏，动画打在上面根本不会渲染）。
- 连击：连到 ×3 与连到 ×8 时，右上角指示器的大小与光晕**明显不同**，不是一个样子。
- 打开系统「减少动态效果」后刷新：不再有星光炸开、不再抖动、节点不脉动。
- 控制台无报错。

- [ ] **Step 6: 运行测试**

Run: `npm test`
Expected: PASS（55/55，本任务不碰 game-logic）

- [ ] **Step 7: 提交**

```bash
git add index.html
git commit -m "feat: 答题与结算界面视觉及动效"
```

---

## Task 12: 响应式布局与端到端验收

**Files:**
- Modify: `index.html`（`<style>` 分区追加响应式规则）

**Interfaces:**
- Consumes: 前面所有任务的标记与令牌
- Produces: 无新接口

- [ ] **Step 1: 追加响应式规则**

把下面 CSS 追加到 `<style>` 分区末尾（`@media (prefers-reduced-motion: reduce)` 块之后）。

```css
      @media (max-width: 520px) {
        :root {
          /* --touch-target is deliberately NOT lowered here. Spec §7 sets a
             hard ≥64px floor for a finger on a tablet, and shrinking it on
             the narrowest viewports would break the requirement exactly
             where the child is most likely to mis-tap. */
          --question-font-size: 48px;
          --keypad-font-size: 26px;
        }

        body {
          padding: 12px;
        }

        .app-title {
          font-size: 26px;
        }

        .app-subtitle {
          font-size: 15px;
        }

        .star-node-button {
          width: 52px;
          height: 52px;
          font-size: 22px;
        }

        .star-node + .star-node::before {
          top: 26px;
          left: -16px;
          width: 28px;
        }

        .star-node-number {
          top: 54px;
        }

        .level-detail-heading {
          font-size: 19px;
        }

        .level-detail-stars {
          font-size: 26px;
        }

        .answer-display {
          font-size: 38px;
        }
      }

      @media (min-width: 900px) and (orientation: landscape) {
        :root {
          --question-font-size: 64px;
        }
      }
```

- [ ] **Step 2: 在 Windows 电脑上跑一遍完整验收**

Run: 双击 `index.html`（Chrome 或 Edge）。
逐项确认：
- [ ] 无控制台报错，Network 面板**没有任何请求**（单文件、零依赖）。
- [ ] 星图显示 10 个节点；未解锁的暗色锁定且不可点；当前关琥珀色高亮。
- [ ] 第 1–9 关都能出题；同一关内不出现重复题目。
- [ ] 答案永远不为 0；首位点 `0` 无反应；输满两位后再点数字无反应。
- [ ] 答错时演示的每一步算式与正确答案一致（抽查第 4、5、6、7、8 关各一题）。
- [ ] 第 7 关的演示有 3 步（如 `42 − 20 = 22` → `22 − 2 = 20` → `20 − 5 = 15`）。
- [ ] 第 2 关的 `45 − 10` 演示是数位分解（`个位：5 − 0 = 5` …），**不是**平十法或破十法。
- [ ] 第 8 关 `100 − 37` 的演示有 3 步（`100 − 30 = 70` → `10 − 7 = 3` → `60 + 3 = 63`）。
- [ ] 达到 80% 正确率后下一关解锁，星图节点点亮；不到 80% 不解锁。
- [ ] 刷新后星星、最高分、静音状态都还在。
- [ ] 屏幕键盘与物理键盘都能完成一关。
- [ ] 首次答对**能听到声音**。
- [ ] 弱提示 15 秒、强提示 30 秒按 spec §5.2 触发；提示不含答案。
- [ ] 第 10 关：60 秒倒计时、跳过按钮、答错不弹演示、结束显示最高纪录。
- [ ] 第 10 关跑过一次后回到星图，它的节点**不再显示成琥珀色脉动的「当前关」**——限时关的「已玩过」由最高分判定，与星级无关（spec §3.2）。
- [ ] 答错后**不点「继续」，直接点弹层外的空白处关掉它**，题目下方仍能看到「正确答案是 X」（spec §5.1：答案不能只藏在演示的最后一步里）。
- [ ] 用 DevTools 量一下可点区域：静音按钮与星图节点**都 ≥ 64px**（spec §7 的硬性要求，不能只在桌面宽度上满足）。
- [ ] 把窗口拉窄到手机宽度，布局不溢出、按钮仍可点，且**尺寸没有缩到 64px 以下**。
- [ ] 连击指示器在 ×3 与 ×8 时大小/光晕明显不同。

- [ ] **Step 3: 在安卓平板上跑一遍分发验收（spec §9.2）**

把 `index.html` 传到安卓平板（微信/数据线/网盘均可），用文件管理器选 Chrome 打开，或在 Chrome 地址栏输入 `file://` 路径。
逐项确认：
- [ ] 文件能打开，星图与答题页正常显示（**这一步是重点** —— 安卓上不是双击，需要选择打开方式）。
- [ ] 能玩完整一关，触屏按钮点得准、不误触。
- [ ] 答对**能听到声音**（触屏的第一次点击应当已经 resume 了 `AudioContext`）。
- [ ] 通关后刷新页面，星星还在（验证 `file://` 下 `localStorage` 可读写）。
- [ ] 横竖屏切换布局都不破版。

**若任一项失败**，在 `index.html` 顶部加一行注释记录现象，并回到本计划的 Triage 讨论，不要静默绕过。

**其中「通关后刷新页面，星星还在」这一项是有预案的，不是死路：** 若安卓 Chrome 在 `file://` 下拒绝写入 `localStorage`（`loadProgress` 的 `catch` 会静默降级成全新存档），就把同一份文件托管到 `wayneoffice.cn` 的某个 URL 再测一遍——spec §2.1 已把这条路写成兜底方案，届时托管从「可选便利」升级为必需项。**先按单文件测；测不过再托管，不要提前托管。** 结论写进报告。

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: PASS（55/55，本任务不碰 game-logic）

- [ ] **Step 5: 收尾（在提交之前）**

按 `~/.claude/CLAUDE.md` 的「代码修改收尾」一节，顺序是**实现完成 → 收尾 → 跑测试 → 提交**。所以在提交之前跑一次 `/simplify`（本次 diff 含 `.cs` 之外的源代码改动，`reviewing-dotnet-idioms` 不适用 —— 这不是 .NET 项目）。

CSS 密集的 Task 10–12 正是重复容易堆积的地方，这一步不能跳。

- [ ] **Step 6: 跑测试并提交**

Run: `npm test`
Expected: PASS（无失败即可；数字以实际为准）

```bash
git add index.html
git commit -m "feat: 响应式布局"
```

---

## 完成标准

全部任务打勾后，交付物应满足 spec §9 的 10 条验收标准。最关键的几条复述如下：

1. `index.html` 双击可玩，无报错、无网络请求。
2. 安卓平板实测通过（打开、游玩、音效、`localStorage` 持久化）。
3. 演示正确性由 `npm test` 的全量自检保证，不依赖人工抽查。
4. 弱提示 15 秒 / 强提示 30 秒，且从不给答案。
5. 首次答对能听到音效。
6. 界面是太空闯关主题：深空配色、星图关卡地图、答对星光炸开、过关星球点亮，且尊重 `prefers-reduced-motion`。
