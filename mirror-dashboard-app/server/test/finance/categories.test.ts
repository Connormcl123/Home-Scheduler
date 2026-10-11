import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryFor, tidyCategory } from "../../src/services/finance/categories.js";

test("Plaid's detailed category decides the clear cases", () => {
  assert.equal(categoryFor({ merchant: "SAFEWAY", detailed: "FOOD_AND_DRINK_GROCERIES", amount: -60 }), "Groceries");
  assert.equal(categoryFor({ merchant: "Some Diner", detailed: "FOOD_AND_DRINK_RESTAURANT", amount: -22 }), "Dining & Drinks");
  assert.equal(categoryFor({ merchant: "Shell", detailed: "TRANSPORTATION_GAS", amount: -41 }), "Gas & Auto");
  assert.equal(categoryFor({ merchant: "Rent", detailed: "RENT_AND_UTILITIES_RENT", amount: -1800 }), "Home");
  assert.equal(categoryFor({ merchant: "FPL", detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", amount: -140 }), "Utilities");
});

test("the shop's name rescues the vague labels this household actually sees", () => {
  assert.equal(categoryFor({ merchant: "ALDI 77079 JENSEN BEAC", detailed: "GENERAL_MERCHANDISE_OTHER", amount: -127.22 }), "Groceries");
  assert.equal(categoryFor({ merchant: "ATT*BILL PAYMENT", detailed: null, primary: "TRANSFER_OUT", amount: -80.28 }), "Utilities");
  assert.equal(categoryFor({ merchant: "Amazon.com", detailed: "OTHER", amount: -37.44 }), "Shopping");
  assert.equal(categoryFor({ merchant: "Microsoft Xbox", detailed: "ENTERTAINMENT_OTHER", amount: -10.61 }), "Subscriptions");
  assert.equal(categoryFor({ merchant: "Mystery LLC", amount: -12 }), "Other");
});

test("money arriving is income, not a shop", () => {
  assert.equal(categoryFor({ merchant: "Wealthfront", detailed: "TRANSFER_IN_DEPOSIT", amount: 3000 }), "Transfers");
  assert.equal(categoryFor({ merchant: "ACME PAYROLL", detailed: "INCOME_WAGES", amount: 2400 }), "Income");
  assert.equal(categoryFor({ merchant: "Target refund", detailed: "GENERAL_MERCHANDISE_OTHER", amount: 25 }), "Income");
});

test("names from before the list are brought forward", () => {
  assert.equal(tidyCategory("Dining"), "Dining & Drinks");
  assert.equal(tidyCategory("Gas"), "Gas & Auto");
  assert.equal(tidyCategory("Bills"), "Utilities");
  assert.equal(tidyCategory("Uncategorized"), "Other");
  assert.equal(tidyCategory("groceries"), "Groceries");
  assert.equal(tidyCategory(""), "Other");
});

test("spoken category names land on the right budget, and nonsense is refused", async () => {
  const { matchCategory } = await import("../../src/services/finance/categories.js");
  assert.equal(matchCategory("dining and drinks"), "Dining & Drinks");
  assert.equal(matchCategory("Dining & Drinks"), "Dining & Drinks");
  assert.equal(matchCategory("restaurants"), "Dining & Drinks");
  assert.equal(matchCategory("gas and auto"), "Gas & Auto");
  assert.equal(matchCategory("grocery"), "Groceries");
  assert.equal(matchCategory("bills"), "Utilities");
  assert.equal(matchCategory("streaming"), "Subscriptions");
  assert.equal(matchCategory("the dog"), null);
  assert.equal(matchCategory(""), null);
});
