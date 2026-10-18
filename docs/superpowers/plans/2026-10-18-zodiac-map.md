# 十二宫地图与 13 关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已上线的 10 关减法游戏扩展成 13 关（十二宫 + 教皇厅），首页从横向星图改为自下而上的两列蛇形星座地图，并新增连减与加减混合两个多步题型。

**Architecture:** 仍然是单个 `index.html`，两个 classic `<script>` 块（`game-logic` 纯逻辑、`game-ui` 表现层）共享一个全局作用域，测试用 Node `vm` 抽取 `game-logic` 块执行。本计划分三层推进：**题库模型**（关卡常量、可行集、题目键、混合抽取）→ **多步演示器**（连减/加减混合、进位加法）→ **存档与界面**（schemaVersion 迁移、十三宫地图、限时挑战行为）。前三层是纯函数，可全量单元测试；后两层是 DOM 与 CSS。

**Tech Stack:** 原生 HTML / CSS / JavaScript（ES2020），零依赖零构建；测试用 Node.js 18+ 内置 `node:test` + `node:vm`。

**Spec:** `docs/superpowers/specs/2026-10-17-subtraction-game-design.md`（v3）

## Global Constraints

- **交付物仍是单个 `index.html`**，零依赖、零构建、零网络请求；不得引入任何外部 CDN、字体、图片、音频、动画库。连线用**内联 SVG**（写在文档里，不是外部文件）。
- **两个 script 块共享一个全局作用域。** 顶层 `const`/`let` 在两边重名是**硬 `SyntaxError`**（不是遮蔽），会让整个 `game-ui` 块解析失败、页面全白。新增任何顶层名字前先 grep 另一个块。
- **`game-logic` 块必须保持无 DOM**：不得出现 `document`、`window`、`localStorage`、`setTimeout`、`setInterval`。测试加载器里有源码级守卫（`tests/game-script-loader.js`），违反会直接失败。
- **测试命令：** `npm test`，脚本为 `node --test "tests/*.test.js"`。**不要写成 `node --test tests/`** —— Windows 上会被当成模块入口而报 `Cannot find module`。
- **标识符、注释、日志、异常消息一律英文；面向孩子的界面文案一律中文。**
- **绝不写单行块语句**；每个 `switch` 必须有 `default`；有领域含义的字面量必须具名；每个 `catch` 必须带异常对象记录日志。
- **触屏可点面积 ≥ 64px**（spec §7 硬性下限）。`--touch-target` 不得在任何断点降到 64px 以下。
- **题目与答案的边界**：所有关卡的答案都在 `0–99`；只有第 10 关（连减）的答案可以是 0；键盘最多两位。
- **动效尊重 `prefers-reduced-motion`**。
- **spec 里的数值必须逐字照抄**：关卡题数 `{1:10,2:10,3:10,4:10,5:12,6:12,7:12,8:12,9:12,10:12,11:12,12:15}`；限时挑战 60 秒；过关线 80%；星级 100/90/80；历史错题比例 30%；弱提示 15 秒、强提示 30 秒；`localStorage` 键名 `waynesoft.math.subtraction-game.progress.v1`。

---

## 文件结构

| 文件 | 本计划中的改动 |
|---|---|
| `index.html` | 全部代码改动（`game-logic` 与 `game-ui` 两个分区 + `<style>`） |
| `tests/game-script-loader.js` | 导出名单增加新函数名；无其他改动 |
| `tests/question-generator.test.js` | 关卡约束、可行集规模、混合抽取、题目键 |
| `tests/demo-generator.test.js` | 多步演示、进位加法、步骤标签、全量自检扩到第 11 关 |
| `tests/progress.test.js` | schemaVersion 迁移、多步错题校验、challengePlayed |

不新增文件。

---

## Task 1: 题库模型（13 关、新可行集、题目键、混合抽取）

**Files:**
- Modify: `index.html`（`game-logic` 分区）
- Modify: `tests/game-script-loader.js`（导出名单）
- Test: `tests/question-generator.test.js`

**Interfaces:**
- Consumes: 现有的 `ONES_PER_TEN`、`MIN_TWO_DIGIT_NUMBER`、`MAX_MINUEND_WITH_HUNDRED`、`MIN_ROUND_TEN_MINUEND_FOR_TWO_DIGIT` 等常量
- Produces（后续任务与本任务测试依赖这些精确名字）:
  - `feasibleQuestionsForLevel(levelId: number): Array<Question>` —— 返回该关**全部可行题目**的数组，结果缓存
  - `Question` = `{ a: number, b: number }`（单步）或 `{ a: number, b: number, c: number, operator: '-' | '+' }`（多步）
  - `questionKey(question: Question): string`
  - `formatQuestion(question: Question): string`
  - `toQuestion(entry): Question` —— 把存档条目还原成题目对象
  - 常量：`LEVEL_COUNT = 13`、`MIXED_LEVEL_ID = 12`、`TIMED_CHALLENGE_LEVEL_ID = 13`、`MIXED_LEVEL_IDS = [1..11]`、`CHALLENGE_LEVEL_ID`（= 13，语义别名）

**为什么把 `feasiblePairsForLevel` 改名：** 第 10、11 关的可行解不是 (a, b) 对，而是三元组。继续叫 "pairs" 会让下一个人误以为所有关卡都是两数相减。改名是这次扩展的必然结果，不是洁癖。

- [ ] **Step 1: 写失败测试**

在 `tests/question-generator.test.js` 末尾追加：

```js
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
```

同一文件顶部需要这两个辅助函数，加在现有 `LEVEL_RULES` 之后：

```js
function answerOf(question) {
  const intermediate = question.a - question.b;
  if (question.c === undefined) {
    return intermediate;
  }
  return question.operator === '+' ? intermediate + question.c : intermediate - question.c;
}

function questionKeyOf(question) {
  return logic.questionKey(question);
}
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/question-generator.test.js`
Expected: FAIL —— `logic.feasibleQuestionsForLevel is not a function`

- [ ] **Step 3: 改写关卡常量**

把 `index.html` 中 `const LEVEL_COUNT = 10;` 到 `const LEVEL_TITLES = { … };` 这整段替换为：

```js
    const LEVEL_COUNT = 13;
    const MIXED_LEVEL_ID = 12;
    const TIMED_CHALLENGE_LEVEL_ID = 13;
    const MIXED_LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    const LEVEL_QUESTION_COUNTS = {
      1: 10,
      2: 10,
      3: 10,
      4: 10,
      5: 12,
      6: 12,
      7: 12,
      8: 12,
      9: 12,
      10: 12,
      11: 12,
      12: 15,
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
      9: '被减数是 100',
      10: '连减',
      11: '加减混合',
      12: '混合综合',
      13: '限时挑战',
    };

    const ZODIAC_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
    const ZODIAC_NAMES = [
      '白羊宫', '金牛宫', '双子宫', '巨蟹宫', '狮子宫', '处女宫',
      '天秤宫', '天蝎宫', '射手宫', '摩羯宫', '水瓶宫', '双鱼宫',
    ];
    const POPE_GLYPH = '⛩';
    const POPE_NAME = '教皇厅';
    const ZODIAC_LEVEL_COUNT = 12;
```

- [ ] **Step 4: 把 `feasiblePairsForLevel` 改成 `feasibleQuestionsForLevel`**

1. 把 `function buildFeasiblePairs(levelId)` 改名为 `function buildFeasibleQuestions(levelId)`，`function feasiblePairsForLevel(levelId)` 改名为 `function feasibleQuestionsForLevel(levelId)`，缓存变量 `feasiblePairsCache` 改名为 `feasibleQuestionsCache`。
2. 在 `buildFeasibleQuestions` 的 `switch` 里，把 `case 9:` 从原第 9 关（混合）改为新第 9 关，并新增 10、11 两个分支：

```js
        case 9:
          collectLevel9Questions(questions);
          break;
        case 10:
          collectLevel10Questions(questions);
          break;
        case 11:
          collectLevel11Questions(questions);
          break;
        default:
          throw new Error(`Unknown level id: ${levelId}`);
```

3. 把 `collectLevel8Pairs` 的上界从 `MAX_MINUEND_WITH_HUNDRED` 改成 `MAX_ROUND_TEN_MINUEND`（即 90），使第 8 关不再包含 100：

```js
    function collectLevel8Pairs(pairs) {
      for (let a = MIN_ROUND_TEN_MINUEND_FOR_TWO_DIGIT; a <= MAX_ROUND_TEN_MINUEND; a += ONES_PER_TEN) {
        for (let b = MIN_TWO_DIGIT_NUMBER; b < a; b += 1) {
          if (onesDigit(a) < onesDigit(b)) {
            pairs.push({ a, b });
          }
        }
      }
    }
```

4. 在 `collectLevel8Pairs` 之后追加三个新收集器：

```js
    function collectLevel9Questions(questions) {
      for (let b = MIN_TWO_DIGIT_NUMBER; b <= MAX_MINUEND; b += 1) {
        questions.push({ a: MAX_MINUEND_WITH_HUNDRED, b });
      }
    }

    function collectLevel10Questions(questions) {
      for (let a = MIN_CHAIN_MINUEND; a <= MAX_MINUEND_WITH_HUNDRED; a += 1) {
        for (let b = MIN_CHAIN_OPERAND; b <= MAX_CHAIN_OPERAND; b += 1) {
          for (let c = MIN_CHAIN_OPERAND; c <= MAX_CHAIN_OPERAND; c += 1) {
            if (a - b - c >= 0) {
              questions.push({ a, b, c, operator: CHAIN_OPERATOR });
            }
          }
        }
      }
    }

    function collectLevel11Questions(questions) {
      for (let a = MIN_MIXED_MINUEND; a <= MAX_MINUEND; a += 1) {
        for (let b = MIN_CHAIN_OPERAND; b <= MAX_CHAIN_OPERAND; b += 1) {
          if (b >= a) {
            continue;
          }
          for (let c = MIN_CHAIN_OPERAND; c <= MAX_CHAIN_OPERAND; c += 1) {
            if (a - b + c <= MAX_MINUEND) {
              questions.push({ a, b, c, operator: MIXED_OPERATOR });
            }
          }
        }
      }
    }
```

5. 在常量区（`MIN_ROUND_TEN_MINUEND_FOR_TWO_DIGIT` 之后）追加：

```js
    const MIN_CHAIN_MINUEND = 50;
    const MIN_MIXED_MINUEND = 20;
    const MIN_CHAIN_OPERAND = 11;
    const MAX_CHAIN_OPERAND = 39;
    const MAX_MIXED_OPERAND = 50;
    const CHAIN_OPERATOR = '-';
    const MIXED_OPERATOR = '+';
```

**注意**：第 11 关的 `b` 上界与第 10 关不同（50 vs 39），所以 `collectLevel11Questions` 的循环里 `b` 用 `MAX_MIXED_OPERAND`，`c` 用 `MAX_CHAIN_OPERAND`。按 spec §4.3 原文照抄。

修正后的第 11 关收集器：

```js
    function collectLevel11Questions(questions) {
      for (let a = MIN_MIXED_MINUEND; a <= MAX_MINUEND; a += 1) {
        for (let b = MIN_CHAIN_OPERAND; b <= MAX_MIXED_OPERAND; b += 1) {
          if (b >= a) {
            continue;
          }
          for (let c = MIN_CHAIN_OPERAND; c <= MAX_MIXED_OPERAND; c += 1) {
            if (a - b + c <= MAX_MINUEND) {
              questions.push({ a, b, c, operator: MIXED_OPERATOR });
            }
          }
        }
      }
    }
```

- [ ] **Step 5: 改写题目键、格式化与存档还原**

把 `questionKey` 与 `formatQuestion` 替换为：

```js
    function questionKey(question) {
      if (question.c === undefined) {
        return `${question.a}-${question.b}`;
      }
      return `${question.a}-${question.b}${question.operator}${question.c}`;
    }

    function toQuestion(entry) {
      if (entry.c === undefined) {
        return { a: entry.a, b: entry.b };
      }
      return { a: entry.a, b: entry.b, c: entry.c, operator: entry.operator };
    }

    function formatQuestion(question) {
      if (question.c === undefined) {
        return `${question.a} − ${question.b} = ?`;
      }
      const operatorGlyph = question.operator === MIXED_OPERATOR ? '+' : '−';
      return `${question.a} − ${question.b} ${operatorGlyph} ${question.c} = ?`;
    }
```

并把 `drawMixedQuestion` 的历史错题分支改为返回完整题目：

```js
      if (canUseHistorical) {
        const candidate = pickRandom(historicalWrongAnswers, random);
        const question = toQuestion(candidate);
        if (!usedKeys.has(questionKey(question))) {
          return question;
        }
      }
```

- [ ] **Step 6: 把新名字加进测试加载器的导出名单**

在 `tests/game-script-loader.js` 的 `EXPORTED_NAMES` 里，把 `'feasiblePairsForLevel',` 替换为：

```js
  'feasibleQuestionsForLevel',
```

并在 `'formatQuestion',` 之后加入：

```js
  'toQuestion',
  'ZODIAC_GLYPHS',
  'ZODIAC_NAMES',
  'POPE_GLYPH',
  'POPE_NAME',
  'ZODIAC_LEVEL_COUNT',
```

- [ ] **Step 7: 修掉旧测试里对 `feasiblePairsForLevel` 的引用**

`tests/question-generator.test.js` 与 `tests/demo-generator.test.js` 里所有 `logic.feasiblePairsForLevel(` 改为 `logic.feasibleQuestionsForLevel(`。同时把 `tests/question-generator.test.js` 的 `LEVEL_RULES` 表补上第 9 关：

```js
  9: ({ a, b }) => a === 100 && b >= 11 && b <= 99,
```

并把遍历 `[1, 2, 3, 4, 5, 6, 7, 8]` 的地方按需要扩到 9（第 9 关是单步题，规则表可覆盖）。

- [ ] **Step 8: 运行测试，确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add index.html tests/
git commit -m "feat: 关卡模型扩到 13 关，新增连减与加减混合的可行集"
```

---

## Task 2: 多步演示器（连减、加减混合、进位加法、步骤标签）

**Files:**
- Modify: `index.html`（`game-logic` 分区）
- Test: `tests/demo-generator.test.js`

**Interfaces:**
- Consumes: `Question`、`needsBorrowing(a, b)`、`ONES_PER_TEN`、`MIXED_OPERATOR`
- Produces:
  - `buildDemoSteps(question: Question): { steps: string[], result: number }` —— **签名从 `(a, b)` 改为接收整个题目对象**
  - `buildAdditionSteps(x, y): { steps: string[], result: number }`

**演示格式约定（关键）：** 步骤字符串的语法是

```
[<标签>：]<数字> (<−|+>) <数字>[(<−|+>) <数字>]* = <数字>
```

即**可以有多个操作数**——`20 + 20 + 10 = 50` 是合法的（进位加法要显式写出进上去的那个十）。自检的解析器必须支持任意长度的同号链，从左到右求值。

- [ ] **Step 1: 写失败测试**

在 `tests/demo-generator.test.js` 末尾追加：

```js
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
    carrying.steps.includes('7 + 7 = 14'),
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/demo-generator.test.js`
Expected: FAIL —— `demo.steps[0].startsWith` 抛错，因为 `buildDemoSteps` 目前接收两个数字。

- [ ] **Step 3: 实现多步演示**

1. 把现有 `function buildDemoSteps(a, b)` 改名为 `function buildSingleStepDemo(a, b)`，内容不变。
2. 追加：

```js
    const STEP_LABEL_FIRST = '第一步';
    const STEP_LABEL_SECOND = '第二步';
    const STEP_LABEL_SUBTRACT = '先减';
    const STEP_LABEL_ADD = '再加';
    const CARRY_TEN = ONES_PER_TEN;

    // Inside a multi-step demo a sub-step that needs no borrowing is shown as
    // one line, not as the three-line place-value breakdown. The demo's job
    // there is to show how the two steps connect; expanding every easy
    // sub-step would push a wrong answer's overlay to eight or nine lines.
    function buildSubStepDemo(a, b) {
      if (!needsBorrowing(a, b)) {
        return { steps: [`${a} − ${b} = ${a - b}`], result: a - b };
      }
      return buildSingleStepDemo(a, b);
    }

    function buildAdditionSteps(x, y) {
      const xOnes = onesDigit(x);
      const yOnes = onesDigit(y);
      const onesSum = xOnes + yOnes;
      const total = x + y;
      if (onesSum < CARRY_TEN) {
        return { steps: [`${x} + ${y} = ${total}`], result: total };
      }
      const xTensValue = x - xOnes;
      const yTensValue = y - yOnes;
      const tensSum = xTensValue + yTensValue + CARRY_TEN;
      return {
        steps: [
          `${xOnes} + ${yOnes} = ${onesSum}`,
          `${xTensValue} + ${yTensValue} + ${CARRY_TEN} = ${tensSum}`,
          `${tensSum} + ${onesSum - CARRY_TEN} = ${total}`,
        ],
        result: total,
      };
    }

    function buildMultiStepDemo(question) {
      const intermediate = question.a - question.b;
      const firstLabel = question.operator === MIXED_OPERATOR
        ? STEP_LABEL_SUBTRACT
        : STEP_LABEL_FIRST;
      const secondLabel = question.operator === MIXED_OPERATOR
        ? STEP_LABEL_ADD
        : STEP_LABEL_SECOND;
      const first = buildSubStepDemo(question.a, question.b);
      const second = question.operator === MIXED_OPERATOR
        ? buildAdditionSteps(intermediate, question.c)
        : buildSubStepDemo(intermediate, question.c);
      return {
        steps: [
          `${firstLabel}：${first.steps[0]}`,
          ...first.steps.slice(1),
          `${secondLabel}：${second.steps[0]}`,
          ...second.steps.slice(1),
        ],
        result: second.result,
      };
    }

    function buildDemoSteps(question) {
      if (question.c === undefined) {
        return buildSingleStepDemo(question.a, question.b);
      }
      return buildMultiStepDemo(question);
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/demo-generator.test.js`
Expected: PASS

- [ ] **Step 5: 扩展自检解析器以接受多操作数**

把 `tests/demo-generator.test.js` 里的 `STEP_PATTERN`、`parseStep`、`assertStepIsArithmeticallyTrue`、`lastStepResult` 替换为：

```js
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
```

- [ ] **Step 6: 把全量自检扩到第 10、11 关**

把 `tests/demo-generator.test.js` 里两处 `for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8])` 改为：

```js
    for (const levelId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
```

并把调用 `logic.buildDemoSteps(a, b)` 的循环体改为遍历题目对象：

```js
      for (const question of logic.feasibleQuestionsForLevel(levelId)) {
        const demo = logic.buildDemoSteps(question);
        assert.equal(demo.result, answerOf(question), `wrong result for ${logic.questionKey(question)}`);
        assert.ok(demo.steps.length > 0, `empty demo for ${logic.questionKey(question)}`);
        for (const step of demo.steps) {
          assertStepIsArithmeticallyTrue(step);
        }
        assert.equal(
          lastStepResult(demo.steps),
          answerOf(question),
          `the last step of the ${logic.questionKey(question)} demo does not reach the answer`,
        );
      }
```

同一文件顶部加上与 `question-generator.test.js` 相同的 `answerOf` 辅助函数：

```js
function answerOf(question) {
  const intermediate = question.a - question.b;
  if (question.c === undefined) {
    return intermediate;
  }
  return question.operator === '+' ? intermediate + question.c : intermediate - question.c;
}
```

**注意**：单步题固定期望的样例测试（`13 − 7`、`42 − 7` 等）仍需把 `logic.buildDemoSteps(13, 7)` 改成 `logic.buildDemoSteps({ a: 13, b: 7 })`。

- [ ] **Step 7: 运行全部测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add index.html tests/
git commit -m "feat: 连减与加减混合的演示，含进位加法与步骤标签"
```

---

## Task 3: 存档（schemaVersion、迁移、多步校验、challengePlayed）

**Files:**
- Modify: `index.html`（`game-logic` 分区）
- Modify: `tests/game-script-loader.js`（导出名单加 `SAVE_SCHEMA_VERSION`、`migrateProgress`）
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `parseWrongAnswers`、`sanitizeLevelStars`、`sanitizeLevelBestScore`、`CHAIN_OPERATOR`（Task 1）
- Produces:
  - `SAVE_SCHEMA_VERSION = 3`
  - `createInitialProgress()` 现在返回带 `schemaVersion` 与 `challengePlayed` 的对象
  - `migrateProgress(progress): Progress`
  - `isValidWrongAnswer(entry): boolean` —— 现在接受多步条目

**为什么必须有 `schemaVersion`：** 迁移的触发条件不能靠「有没有某个关卡键」推断。没有闸门时，一个 v3 新玩家通关第 10 关后，下次打开会因为没有 `"13"` 而被判成 v2 存档，把第 10 关的星级搬到第 13 关并丢弃——**第 10 关凭空变回未通关**。

- [ ] **Step 1: 写失败测试**

在 `tests/progress.test.js` 末尾追加：

```js
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
  assert.equal(progress.levelStars['10'], undefined);
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/progress.test.js`
Expected: FAIL —— `progress.schemaVersion` 为 `undefined`。

- [ ] **Step 3: 实现迁移与校验**

1. 在 `MAX_TRACKED_WRONG_ANSWERS` 附近加入：

```js
    const SAVE_SCHEMA_VERSION = 3;
    const LEGACY_STABLE_LEVEL_KEYS = ['1', '2', '3', '4', '5', '6', '7'];
    const LEGACY_ROUND_TEN_KEY = '8';
    const LEGACY_MIXED_KEY = '9';
    const LEGACY_TIMED_KEY = '10';
    const V3_ROUND_TEN_KEY = '8';
    const V3_HUNDRED_KEY = '9';
    const V3_MIXED_KEY = '12';
    const V3_TIMED_KEY = '13';
    const WRONG_ANSWER_OPERATORS = [CHAIN_OPERATOR, MIXED_OPERATOR];
```

2. 把 `createInitialProgress()` 替换为：

```js
    function createInitialProgress() {
      return {
        schemaVersion: SAVE_SCHEMA_VERSION,
        levelStars: {},
        levelBestScore: {},
        wrongAnswers: [],
        challengePlayed: false,
        isMuted: false,
      };
    }
```

3. 把 `isValidWrongAnswer` 替换为：

```js
    function isValidWrongAnswer(entry) {
      if (!isPlainObject(entry)
        || !Number.isInteger(entry.a)
        || !Number.isInteger(entry.b)
        || entry.b <= 0
        || entry.b >= entry.a
        || entry.a > MAX_MINUEND_WITH_HUNDRED) {
        return false;
      }
      if (entry.c === undefined) {
        return true;
      }
      if (!Number.isInteger(entry.c) || !WRONG_ANSWER_OPERATORS.includes(entry.operator)) {
        return false;
      }
      if (entry.operator === CHAIN_OPERATOR) {
        return entry.a - entry.b - entry.c >= 0;
      }
      return entry.a - entry.b + entry.c <= MAX_MINUEND;
    }
```

4. 把 `parseWrongAnswers` 的 `.map(...)` 替换为保留多步字段的版本：

```js
        .map((entry) => {
          const kept = {
            a: entry.a,
            b: entry.b,
            count: Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 1,
          };
          if (entry.c !== undefined) {
            kept.c = entry.c;
            kept.operator = entry.operator;
          }
          return kept;
        });
```

5. 在 `parseProgress` 之前加入迁移函数：

```js
    function copyLevelValue(target, source, fromKey, toKey) {
      if (Object.prototype.hasOwnProperty.call(source, fromKey)) {
        target[toKey] = source[fromKey];
      }
    }

    function migrateLevelRecord(record) {
      const migrated = {};
      for (const key of LEGACY_STABLE_LEVEL_KEYS) {
        copyLevelValue(migrated, record, key, key);
      }
      // v2's level 8 was "round tens minus two-digit, including 100". v3 splits
      // that into level 8 (no 100) and level 9 (100 only), so a v2 clear counts
      // for both — the child practised both shapes.
      copyLevelValue(migrated, record, LEGACY_ROUND_TEN_KEY, V3_ROUND_TEN_KEY);
      copyLevelValue(migrated, record, LEGACY_ROUND_TEN_KEY, V3_HUNDRED_KEY);
      // v2's level 9 was the mixed level; v3 moved it to 12.
      copyLevelValue(migrated, record, LEGACY_MIXED_KEY, V3_MIXED_KEY);
      // v2's level 10 was the timed challenge; v3 moved it to 13.
      copyLevelValue(migrated, record, LEGACY_TIMED_KEY, V3_TIMED_KEY);
      return migrated;
    }

    function migrateProgress(progress) {
      if (progress.schemaVersion >= SAVE_SCHEMA_VERSION) {
        return progress;
      }
      const migratedStars = migrateLevelRecord(progress.levelStars);
      // The timed challenge never earns stars, so a legacy star entry there
      // carries no meaning in v3.
      delete migratedStars[V3_TIMED_KEY];
      return {
        schemaVersion: SAVE_SCHEMA_VERSION,
        levelStars: migratedStars,
        levelBestScore: migrateLevelRecord(progress.levelBestScore),
        wrongAnswers: progress.wrongAnswers,
        challengePlayed: (progress.levelBestScore[LEGACY_TIMED_KEY] || 0) > 0,
        isMuted: progress.isMuted,
      };
    }
```

6. 把 `parseProgress` 的成功分支替换为：

```js
      try {
        const parsed = JSON.parse(rawValue);
        if (!isPlainObject(parsed)) {
          return createInitialProgress();
        }
        return migrateProgress({
          schemaVersion: Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0,
          levelStars: sanitizeLevelStars(parsed.levelStars),
          levelBestScore: sanitizeLevelBestScore(parsed.levelBestScore),
          wrongAnswers: parseWrongAnswers(parsed.wrongAnswers),
          challengePlayed: parsed.challengePlayed === true,
          isMuted: parsed.isMuted === true,
        });
      } catch (error) {
        console.error('Failed to parse saved progress, starting fresh.', error);
        return createInitialProgress();
      }
```

- [ ] **Step 4: 加导出并运行测试**

在 `tests/game-script-loader.js` 的 `EXPORTED_NAMES` 里加入 `'SAVE_SCHEMA_VERSION',` 与 `'migrateProgress',`。

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add index.html tests/
git commit -m "feat: 存档 schemaVersion 与 v2→v3 迁移，支持多步错题"
```

---

## Task 4: 十三宫蛇形地图（DOM + CSS + SVG 连线）

**Files:**
- Modify: `index.html`（`<style>` 与 `game-ui` 分区）

**Interfaces:**
- Consumes: `ZODIAC_GLYPHS`、`ZODIAC_NAMES`、`POPE_GLYPH`、`POPE_NAME`、`ZODIAC_LEVEL_COUNT`、`LEVEL_TITLES`、`LEVEL_COUNT`、`TIMED_CHALLENGE_LEVEL_ID`、`levelState`、`isLevelCleared`、`levelProgressText`
- Produces:
  - `starNodeRow(levelId): number` / `starNodeColumn(levelId): number`
  - `renderStarMapLines(): void` / `clearStarMapLines(): void`
  - `buildStarMapNode(levelId)` 现在渲染星座徽记 + 中文名，并让**整个节点**可点

**布局规则（写死，不留歧义）：** 十二宫排成 **2 列 × 6 行**，自下而上蛇形；教皇厅**单独占第 1 行、横跨两列**。

- 十二宫第 `N` 关：列 = `(N - 1) % 2 + 1`（奇数列 1、偶数列 2），行 = `ZODIAC_ROW_COUNT + 1 - Math.floor((N - 1) / 2)`。
- 教皇厅（第 13 关）：行 1，`grid-column: 1 / -1`。
- 结果：第 1 关在**左下**、第 2 关右下、第 3 关左上 …… 第 12 关在顶部，教皇厅在它上面居中。

- [ ] **Step 1: 替换地图标记**

把 `<main id="screen-map">` 里的 `.star-map-scroll` 与 `<ol id="star-map">` 一段替换为：

```html
    <div id="star-map-scroll" class="star-map-scroll">
      <div id="star-map-frame" class="star-map-frame">
        <svg id="star-map-lines" class="star-map-lines" aria-hidden="true"></svg>
        <ol id="star-map" class="star-map"></ol>
      </div>
    </div>
```

- [ ] **Step 2: 写失败测试（布局函数是纯函数，可测）**

在 `tests/question-generator.test.js` 末尾追加：

```js
test('the zodiac map places levels bottom-up in a two-column snake', () => {
  assert.equal(logic.starNodeColumn(1), 1);
  assert.equal(logic.starNodeColumn(2), 2);
  assert.equal(logic.starNodeColumn(3), 1);
  assert.equal(logic.starNodeColumn(12), 2);
  // Level 1 sits in the last row, level 12 in the first row below the Pope.
  assert.equal(logic.starNodeRow(1), 7);
  assert.equal(logic.starNodeRow(2), 7);
  assert.equal(logic.starNodeRow(3), 6);
});

test('each zodiac level has a glyph and a name', () => {
  assert.equal(logic.ZODIAC_GLYPHS.length, logic.ZODIAC_LEVEL_COUNT);
  assert.equal(logic.ZODIAC_NAMES.length, logic.ZODIAC_LEVEL_COUNT);
  assert.equal(logic.ZODIAC_GLYPHS[0], '♈');
  assert.equal(logic.ZODIAC_NAMES[11], '双鱼宫');
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `node --test tests/question-generator.test.js`
Expected: FAIL —— `logic.starNodeColumn is not a function`.

- [ ] **Step 4: 实现布局函数与节点渲染**

1. 在 `game-logic` 常量区加入：

```js
    const ZODIAC_ROW_COUNT = 6;
    const POPE_ROW = 1;
    const FIRST_ZODIAC_ROW_OFFSET = 1;
```

2. 在 `game-logic` 中加入（纯函数，可被测试直接调用）：

```js
    function starNodeColumn(levelId) {
      return (levelId - 1) % 2 + 1;
    }

    function starNodeRow(levelId) {
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        return POPE_ROW;
      }
      return ZODIAC_ROW_COUNT + FIRST_ZODIAC_ROW_OFFSET - Math.floor((levelId - 1) / 2);
    }
```

3. 在 `game-ui` 中把 `buildStarMapNode` 替换为：

```js
    function starNodeGlyph(levelId) {
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        return POPE_GLYPH;
      }
      return ZODIAC_GLYPHS[levelId - 1];
    }

    function starNodeName(levelId) {
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        return POPE_NAME;
      }
      return ZODIAC_NAMES[levelId - 1];
    }

    function buildStarMapNode(levelId) {
      const state = levelState(levelId);
      const isUnlocked = state !== STAR_MAP_STATE_LOCKED;
      const item = document.createElement('li');
      item.className = `star-node ${state}`;
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        item.classList.add('is-pope');
      }
      item.style.gridRow = String(starNodeRow(levelId));
      item.style.gridColumn = levelId === TIMED_CHALLENGE_LEVEL_ID
        ? '1 / -1'
        : String(starNodeColumn(levelId));
      if (levelId === gameState.justClearedLevelId) {
        item.classList.add(STAR_MAP_STATE_JUST_CLEARED);
      }

      if (levelId === gameState.selectedLevelId) {
        const ship = document.createElement('span');
        ship.className = 'star-node-ship';
        ship.textContent = SHIP_ICON;
        item.appendChild(ship);
      }

      // The whole node is the tap target: a 7-year-old is more likely to tap
      // the constellation name they can read than the small glyph.
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'star-node-button';
      button.disabled = !isUnlocked;
      button.setAttribute(
        'aria-label',
        `第 ${levelId} 关 ${starNodeName(levelId)} ${LEVEL_TITLES[levelId]}`,
      );
      button.addEventListener('click', () => selectLevel(levelId));

      const glyph = document.createElement('span');
      glyph.className = 'star-node-glyph';
      glyph.textContent = isUnlocked ? starNodeGlyph(levelId) : LOCKED_ICON;

      const name = document.createElement('span');
      name.className = 'star-node-name';
      name.textContent = starNodeName(levelId);

      const number = document.createElement('span');
      number.className = 'star-node-number';
      number.textContent = String(levelId);

      button.append(glyph, name, number);
      item.appendChild(button);

      if (isLevelCleared(levelId)) {
        const badge = document.createElement('span');
        badge.className = 'star-node-stars';
        badge.textContent = levelProgressText(levelId);
        item.appendChild(badge);
      }
      return item;
    }
```

4. 把 `renderLevelMap` 替换为：

```js
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
      // The map is taller than a tablet screen, so the level the detail card
      // describes has to be brought into view or the child sees a card for a
      // constellation they cannot find.
      if (selectedNode !== null) {
        selectedNode.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      window.requestAnimationFrame(renderStarMapLines);
      gameState.justClearedLevelId = null;
    }
```

5. 在 `renderLevelMap` 之后加入 SVG 连线：

```js
    function clearStarMapLines() {
      elementById('star-map-lines').replaceChildren();
    }

    // Connectors cannot be CSS pseudo-elements: the snake needs diagonals whose
    // angle depends on the row height and column width, and those change with
    // the viewport. An inline SVG recomputed from the laid-out node positions
    // stays attached at every width — and it is still zero external resources.
    function renderStarMapLines() {
      const svg = elementById('star-map-lines');
      const frame = elementById('star-map-frame');
      clearStarMapLines();
      const frameRect = frame.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${frameRect.width} ${frameRect.height}`);
      const nodes = [...elementById('star-map').querySelectorAll('.star-node')];
      for (let index = 1; index < nodes.length; index += 1) {
        const from = nodes[index - 1].getBoundingClientRect();
        const to = nodes[index].getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(from.left + from.width / 2 - frameRect.left));
        line.setAttribute('y1', String(from.top + from.height / 2 - frameRect.top));
        line.setAttribute('x2', String(to.left + to.width / 2 - frameRect.left));
        line.setAttribute('y2', String(to.top + to.height / 2 - frameRect.top));
        line.setAttribute(
          'class',
          isLevelCleared(index) ? 'star-map-line is-cleared' : 'star-map-line',
        );
        svg.appendChild(line);
      }
    }
```

**注意**：`nodes[index - 1]` 与 `nodes[index]` 是按 DOM 顺序取的，即第 1 关到第 12 关再到教皇厅——与蛇形路径一致。`isLevelCleared(index)` 用的是「第 index 关」（1-based）是否通关。

6. 在 `initGame` 里注册重算：

```js
      window.addEventListener('resize', renderStarMapLines);
```

7. 详情卡标题带上星座名——把 `buildLevelDetail` 里的

```js
      heading.textContent = `第 ${levelId} 关 · ${LEVEL_TITLES[levelId]}`;
```

改为

```js
      heading.textContent = `第 ${levelId} 关 · ${starNodeName(levelId)} · ${LEVEL_TITLES[levelId]}`;
```

- [ ] **Step 5: 写地图样式**

在 `<style>` 的星图区替换旧的 `.star-map-scroll` / `.star-map` / 连线伪元素规则，改为：

```css
      .star-map-scroll {
        width: 100%;
        max-height: 62vh;
        overflow-y: auto;
        padding: 8px 4px;
        scrollbar-width: none;
        scroll-behavior: smooth;
      }

      .star-map-scroll::-webkit-scrollbar {
        display: none;
      }

      .star-map-frame {
        position: relative;
        max-width: 420px;
        margin: 0 auto;
      }

      .star-map-lines {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .star-map-line {
        stroke: var(--space-line);
        stroke-width: 2;
        stroke-linecap: round;
      }

      .star-map-line.is-cleared {
        stroke: var(--glow-cyan);
        filter: drop-shadow(0 0 4px rgb(var(--glow-cyan-rgb) / 0.8));
      }

      .star-map {
        position: relative;
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-auto-rows: minmax(96px, auto);
        gap: 12px 28px;
        justify-items: center;
      }

      .star-node {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        position: relative;
      }

      .star-node.is-pope {
        grid-column: 1 / -1;
        margin-bottom: 8px;
      }

      .star-node-glyph {
        font-size: 28px;
        line-height: 1;
      }

      .star-node-name {
        font-size: 12px;
        color: var(--text-dim);
        white-space: nowrap;
      }

      .star-node-button {
        /* min-width, not width: the constellation name (白羊宫) is wider than
           64px and must not overflow the rounded border. */
        min-width: var(--touch-target);
        min-height: var(--touch-target);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        padding: 6px 10px;
        border-radius: 18px;
        border: 2px solid var(--space-line);
        background: var(--space-panel);
        color: var(--text-bright);
        cursor: pointer;
      }

      .star-node.is-pope .star-node-button {
        width: auto;
        min-width: calc(var(--touch-target) * 2);
        height: var(--touch-target);
        flex-direction: row;
        gap: 8px;
        padding: 0 18px;
      }

      .star-node.is-cleared .star-node-button {
        border-color: var(--glow-amber);
        box-shadow: 0 0 18px rgb(var(--glow-amber-rgb) / 0.55);
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
```

**已通关改为金色**（黄金圣斗士），因此把原来的 `--glow-cyan` 描边一律换成 `--glow-amber`。连线仍用青色，形成「金色节点 + 青色路径」的对比。

- [ ] **Step 6: 在浏览器里验证**

Run: 打开 `index.html`。
Expected: 见 Task 6 的验收清单第 11–16 项。此步至少确认：地图纵向排列、第 1 关在左下、教皇厅居中最上、连线两端接在节点上、点中文名也能选中、缩窄窗口后连线仍连着。

- [ ] **Step 7: 运行测试并提交**

Run: `npm test`
Expected: PASS

```bash
git add index.html tests/
git commit -m "feat: 十三宫蛇形地图与 SVG 连线"
```

---

## Task 5: 多步题的渲染、第 13 关行为、零答案输入

**Files:**
- Modify: `index.html`（`game-logic` 与 `game-ui` 分区）
- Modify: `tests/game-script-loader.js`（导出 `canQuestionAnswerZero`）
- Modify: `tests/progress.test.js`（输入规则）

**Interfaces:**
- Consumes: `buildDemoSteps(question)`、`questionKey`、`CHAIN_OPERATOR`、`TIMED_CHALLENGE_LEVEL_ID`（= 13）
- Produces:
  - `canQuestionAnswerZero(question): boolean`
  - `appendDigit(currentInput, digit, isZeroAllowed)` —— **签名多一个参数**

**零答案的真正条件不是「哪一关」，而是「哪道题」。** 第 12、13 关会抽到第 10 关的题，那些题的答案也可能是 0。按关卡判断会让综合关里出现一道输不进的题。

- [ ] **Step 1: 写失败测试**

在 `tests/progress.test.js` 末尾追加：

```js
test('only chained-subtraction questions may answer zero', () => {
  assert.equal(logic.canQuestionAnswerZero({ a: 42, b: 7 }), false);
  assert.equal(logic.canQuestionAnswerZero({ a: 45, b: 18, c: 27, operator: '+' }), false);
  assert.equal(logic.canQuestionAnswerZero({ a: 50, b: 25, c: 25, operator: '-' }), true);
});

test('a zero is only accepted when the question allows it', () => {
  assert.equal(logic.appendDigit('', 0, false), '');
  assert.equal(logic.appendDigit('', 0, true), '0');
  // A chained-subtraction answer of 12 must not become "01".
  assert.equal(logic.appendDigit('0', 1, true), '01');
  assert.equal(logic.appendDigit('', 4, true), '4');
});
```

**注意**：上面第二条断言的期望值是 `'01'` —— 这是**有意允许**的临时输入状态：孩子先点了 0 再点 1，判定时 `Number('01') === 1`，不会误判。不要为此增加「输满后禁止」的额外规则。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/progress.test.js`
Expected: FAIL —— `logic.canQuestionAnswerZero is not a function`.

- [ ] **Step 3: 实现零答案判定与输入**

1. 在 `game-logic` 中加入：

```js
    function canQuestionAnswerZero(question) {
      return question.c !== undefined && question.operator === CHAIN_OPERATOR;
    }

    function appendDigit(currentInput, digit, isZeroAllowed) {
      if (currentInput.length >= MAX_ANSWER_DIGITS) {
        return currentInput;
      }
      if (currentInput.length === 0 && digit === 0 && !isZeroAllowed) {
        return currentInput;
      }
      return currentInput + String(digit);
    }
```

2. 在 `game-ui` 的 `handleDigitInput` 里传入条件：

```js
    function handleDigitInput(digit) {
      gameState.currentInput = appendDigit(
        gameState.currentInput,
        digit,
        canQuestionAnswerZero(gameState.currentQuestion),
      );
      renderAnswerDisplay();
    }
```

- [ ] **Step 4: 多步题的题目渲染**

把 `<script id="game-ui">` 里的 `renderQuestionText` 替换为：

```js
    function renderQuestionText() {
      const question = gameState.currentQuestion;
      const container = elementById('question-text');
      container.setAttribute('aria-label', formatQuestion(question));
      const parts = [
        ...buildDigitNodes(question.a),
        document.createTextNode(' − '),
        ...buildDigitNodes(question.b),
      ];
      if (question.c !== undefined) {
        const operatorGlyph = question.operator === MIXED_OPERATOR ? ' + ' : ' − ';
        parts.push(document.createTextNode(operatorGlyph), ...buildDigitNodes(question.c));
      }
      parts.push(document.createTextNode(' = ?'));
      container.replaceChildren(...parts);
    }
```

- [ ] **Step 5: 第 13 关的答错行为与 challengePlayed**

把 `handleWrongAnswer` 里 `isTimedChallenge()` 的分支改为：

```js
      if (isTimedChallenge()) {
        const answer = answerOfQuestion(gameState.currentQuestion);
        elementById('hint-text').textContent =
          DEMO_ANSWER_TEMPLATE.replace('{answer}', String(answer));
        scheduleNextQuestion(CHALLENGE_FEEDBACK_DELAY_MS);
        return;
      }
```

并在 `game-ui` 里加入：

```js
    function answerOfQuestion(question) {
      const intermediate = question.a - question.b;
      if (question.c === undefined) {
        return intermediate;
      }
      return question.operator === MIXED_OPERATOR
        ? intermediate + question.c
        : intermediate - question.c;
    }
```

把 `finishTimedChallenge` 里设置成绩的那一行之前加入：

```js
      gameState.progress.challengePlayed = true;
```

把 `showDemo(question)` 里调用 `buildDemoSteps` 的那一行从

```js
      for (const step of buildDemoSteps(question.a, question.b).steps) {
```

改为

```js
      for (const step of buildDemoSteps(question).steps) {
```

- [ ] **Step 6: 第 13 关的「已玩过」改用 challengePlayed**

把 `isLevelCleared` 与 `levelProgressText` 的第 13 关分支改为使用布尔字段：

```js
    function isLevelCleared(levelId) {
      if (levelId === TIMED_CHALLENGE_LEVEL_ID) {
        return gameState.progress.challengePlayed === true;
      }
      return starsFor(levelId) > 0;
    }
```

```js
    function levelProgressText(levelId) {
      if (levelId !== TIMED_CHALLENGE_LEVEL_ID) {
        return formatStars(starsFor(levelId));
      }
      if (gameState.progress.challengePlayed !== true) {
        return CHALLENGE_UNPLAYED_TEXT;
      }
      return CHALLENGE_BEST_SCORE_TEMPLATE.replace('{score}', String(bestScoreFor(levelId)));
    }
```

- [ ] **Step 7: 错题回顾渲染多步题**

把 `buildWrongReviewText` 的映射改为：

```js
      const list = gameState.wrongQuestions
        .map((question) => formatQuestion(question).replace(' = ?', ''))
        .join('、');
```

`formatQuestion` 已经按题目形状渲染，单步题输出 `42 − 7`、多步题输出 `85 − 27 − 18`。

- [ ] **Step 8: 多步题的分级提示**

现在的 `buildStrongHintText` 是按单步减法写的（判断退位、点名个位）。对多步题它会给出一个误导性的借位提示。在 `game-ui` 里把 `buildStrongHintText` 的开头改为先处理多步题：

```js
    const HINT_MULTI_STEP_TEXT = '先算前两个数的差，再把结果和第三个数相减/相加';

    function buildStrongHintText(question) {
      if (question.c !== undefined) {
        return HINT_MULTI_STEP_TEXT;
      }
      const subtrahendOnes = subtrahendOnesDigit(question.b);
      if (!needsBorrowing(question.a, question.b)) {
        return HINT_PLAIN_TEXT;
      }
      return HINT_BORROW_TEMPLATE
        .replace('{ones}', String(onesDigit(question.a)))
        .replace('{subtrahendOnes}', String(subtrahendOnes));
    }
```

弱提示不需要改：它只是给 `#question-area` 加缩放类，对多步题同样成立。

- [ ] **Step 9: 加导出并运行测试**

在 `tests/game-script-loader.js` 的 `EXPORTED_NAMES` 里加入 `'canQuestionAnswerZero',`。

Run: `npm test`
Expected: PASS

- [ ] **Step 10: 在浏览器里验证**

Run: 打开 `index.html`，把 `localStorage` 里第 12 关的星级手动置为 3 以解锁第 13 关，进入教皇厅。
Expected: 答错不弹演示、题目下方出现「正确答案是 X」、约 0.7 秒后下一题、时钟继续走；跑完一局（哪怕 0 分）后回到地图，教皇厅节点显示「最高 N 题」而不是「还没挑战过」。

- [ ] **Step 11: 提交**

```bash
git add index.html tests/
git commit -m "feat: 多步题渲染、第 13 关无演示行为与零答案输入"
```

---

## Task 6: 收尾、端到端验收与部署

**Files:**
- 不新增代码文件；可能由 `/simplify` 修正既有文件

- [ ] **Step 1: 收尾（在提交之前）**

按 `~/.claude/CLAUDE.md` 的「代码修改收尾」一节，顺序是**实现完成 → 收尾 → 跑测试 → 提交**。对整个分支的 diff 跑一次 `/simplify`：

```bash
git diff $(git merge-base develop HEAD)..HEAD -- index.html tests/
```

- [ ] **Step 2: 跑全部测试**

Run: `npm test`
Expected: PASS，无失败。

- [ ] **Step 3: 桌面端逐条验收（spec §9）**

双击 `index.html`（Chrome / Edge），逐项确认：

- [ ] 无控制台报错；Network 面板**没有任何请求**（favicon 已内联）。
- [ ] 第 1–13 关都能出题；同一关内不重复。
- [ ] 第 9 关的题都是 `100 − b`；第 8 关不再出现被减数 100。
- [ ] 第 10 关是两连减（`85 − 27 − 18`），第 11 关是加减混合（`45 − 18 + 27`）。
- [ ] **第 11 关不出现答案 100**：连玩几局，确认答案都在两位以内。
- [ ] 第 10 关出现答案为 0 的题时，能输入 `0` 并判对；其余关卡首位点 `0` 仍被忽略。
- [ ] 答错时的演示：连减显示「第一步：…」「第二步：…」两段；加减混合显示「先减：…」「再加：…」；不需要借位的那一步只有一行。
- [ ] 进位加法演示出现 `7 + 7 = 14` 与 `20 + 20 + 10 = 50`。
- [ ] 第 13 关答错不弹演示，题目下方显示正确答案，自动进入下一题。
- [ ] 第 13 关 0 分结束，地图上该节点仍显示「最高 0 题」而不是「还没挑战过」。
- [ ] 把 `localStorage` 里的存档删掉一条（模拟 v2），刷新后按 §8.1 迁移正确；再刷新一次不变。
- [ ] 刷新后星星、最高分、静音状态仍在。
- [ ] 屏幕键盘与物理键盘都能完成一关。
- [ ] 首次答对能听到音效；静音开关生效并持久化。
- [ ] 弱提示 15 秒、强提示 30 秒按 §5.2 触发。

- [ ] **Step 4: 地图专属验收（spec §9.11–9.16）**

- [ ] 13 个节点按蛇形排布：第 1 关在左下、第 2 关右下、第 3 关左上……第 12 关在顶部，教皇厅居中最上。**不在一条直线上。**
- [ ] 连线从节点连到节点，不断开、不压在星座名上。
- [ ] **把窗口缩到 600px 宽**，连线仍然连着。
- [ ] 点**星座名文字**与点徽记效果相同。
- [ ] 选中靠上的节点后，「开始」按钮的矩形仍在视口内。
- [ ] 打开「减少动态效果」后：节点不再脉动、飞船不再浮动、地图不平滑滚动。

- [ ] **Step 5: 部署到 wayneoffice.cn**

按 vault 笔记「云主机 Nginx 与 frps」的流程（**必须传 LF 版本**）：

```bash
git show HEAD:index.html > /tmp/subtraction-game.html
md5sum /tmp/subtraction-game.html
scp /tmp/subtraction-game.html wayne@wayneoffice.cn:/var/www/wayneoffice.cn/subtraction/index.html
ssh wayne@wayneoffice.cn 'md5sum /var/www/wayneoffice.cn/subtraction/index.html'
curl -s https://wayneoffice.cn/subtraction/ | md5sum
```

三方 md5 必须一致。

- [ ] **Step 6: 线上验证**

在浏览器打开 `https://wayneoffice.cn/subtraction/`，确认 13 个节点、蛇形布局、连线正常，控制台无消息；玩一关确认答题与进度写入正常。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: 十二宫地图与 13 关的端到端验收"
```

---

## 完成标准

1. `npm test` 全绿。
2. 13 关全部可玩，第 1–11 关的答案都在 0–99，第 11 关不出现 100。
3. 多步题答错时演示分段且带步骤标签；不需要借位/进位的子步只有一行。
4. 第 13 关答错不弹演示、0 分也记录「玩过」。
5. v2 存档迁移正确且只执行一次；v3 新存档不会被再次迁移。
6. 首页是自下而上的两列蛇形十三宫图，连线随窗口宽度重算，教皇厅居中最上。
7. 已部署到 `https://wayneoffice.cn/subtraction/`，三方 md5 一致。


