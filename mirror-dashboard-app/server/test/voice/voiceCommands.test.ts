import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetSaidBack, budgetsSpoken, grocerySaidBack, splitGroceryDictation, spokenTaskList, tidyDictation } from "../../src/services/voiceCommands.js";

test("dictated task titles lose Siri's full stop and start with a capital", () => {
  assert.equal(tidyDictation("  buy milk. "), "Buy milk");
  assert.equal(tidyDictation("Call the dentist!"), "Call the dentist");
  assert.equal(tidyDictation(""), "");
});

test("the spoken list reads naturally and stops after five", () => {
  const tasks = (...titles: string[]) => titles.map((title) => ({ title }));
  assert.equal(spokenTaskList([]), "Your task list is clear.");
  assert.equal(spokenTaskList(tasks("Buy milk.")), "You have 1 task: Buy milk.");
  assert.equal(spokenTaskList(tasks("A", "B", "C")), "You have 3 tasks: A, B and C.");
  assert.equal(spokenTaskList(tasks("A", "B", "C", "D", "E", "F", "G")), "You have 7 tasks: A, B, C, D, E and 2 more.");
});

const budget = (category: string, limitAmount: number, spentAmount: number, state: "under" | "ahead" | "over") => ({
  id: 1, category, limitAmount, spentAmount, color: "#fff", remaining: Number((limitAmount - spentAmount).toFixed(2)),
  percent: Math.round((spentAmount / limitAmount) * 100), projected: spentAmount * 2, state
});
const summary = (budgets: ReturnType<typeof budget>[], unbudgetedSpent = 0) => ({
  monthLabel: "September 2026", dayOfMonth: 20, daysInMonth: 30, budgets,
  totalLimit: budgets.reduce((sum, b) => sum + b.limitAmount, 0),
  totalSpent: budgets.reduce((sum, b) => sum + b.spentAmount, 0),
  unbudgetedSpent, available: []
});

test("setting a budget is read back with the month's spending", () => {
  assert.equal(budgetSaidBack(budget("Groceries", 600, 0, "under")), "Groceries budget set to $600.");
  assert.equal(budgetSaidBack(budget("Groceries", 600, 310.5, "under")), "Groceries budget set to $600. You have spent $311 of it this month.");
});

test("the spoken budget check leads with what is over, and says when all is well", () => {
  const hot = budgetsSpoken(summary([budget("Groceries", 600, 700, "over"), budget("Shopping", 450, 300, "ahead")], 120));
  assert.match(hot, /^You have spent \$1,000 of \$1,050 with 10 days left in September\./);
  assert.match(hot, /Groceries is over by \$100\./);
  assert.match(hot, /Shopping is running ahead, \$300 of \$450\./);
  assert.match(hot, /Another \$120 went to things with no budget\./);
  assert.match(budgetsSpoken(summary([budget("Groceries", 600, 100, "under")])), /Every budget is on track\.$/);
  assert.match(budgetsSpoken(summary([])), /^No budgets are set yet/);
});

test("a dictated grocery list splits into tidy items", () => {
  assert.deepEqual(splitGroceryDictation("milk, eggs and bread."), ["Milk", "Eggs", "Bread"]);
  assert.deepEqual(splitGroceryDictation("Paper towels"), ["Paper towels"]);
  assert.deepEqual(splitGroceryDictation("bananas\ncoffee beans,, milk"), ["Bananas", "Coffee beans", "Milk"]);
  assert.deepEqual(splitGroceryDictation("milk and Milk"), ["Milk"]);
  assert.deepEqual(splitGroceryDictation("  . "), []);
});

test("adding groceries is read back naturally", () => {
  assert.equal(grocerySaidBack(["Milk"], []), "Added Milk to the grocery list.");
  assert.equal(grocerySaidBack(["Milk", "Eggs", "Bread"], []), "Added Milk, Eggs and Bread to the grocery list.");
  assert.equal(grocerySaidBack(["Eggs"], ["Milk"]), "Added Eggs to the grocery list. Milk was already on it.");
  assert.equal(grocerySaidBack([], ["Milk", "Eggs"]), "Milk and Eggs were already on the grocery list.");
});
