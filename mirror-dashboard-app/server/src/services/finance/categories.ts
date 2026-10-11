/**
 * Where a bank transaction belongs. Plaid's detailed category decides most of
 * them; the merchant name settles the rest, because banks label plenty of
 * everyday shops as "General merchandise" or nothing at all. The category list
 * itself lives in shared, so the wall and Siri use the same names.
 */
import { FINANCE_CATEGORIES, type FinanceCategory } from "@mirror-dashboard/shared";

export { FINANCE_CATEGORIES, type FinanceCategory };

/** Categories that are not really spending, so budgets and totals leave them out. */
export const NON_SPENDING = new Set<string>(["Income", "Transfers", "Debt"]);

/** Plaid's detailed category (personal_finance_category.detailed) wins where it is specific. */
const DETAILED: Array<[RegExp, FinanceCategory]> = [
  [/^FOOD_AND_DRINK_GROCERIES/, "Groceries"],
  [/^FOOD_AND_DRINK/, "Dining & Drinks"],
  [/^TRANSPORTATION_GAS/, "Gas & Auto"],
  [/^TRANSPORTATION_(PARKING|TOLLS|PUBLIC_TRANSIT|TAXIS|BIKES)/, "Gas & Auto"],
  [/^TRANSPORTATION/, "Gas & Auto"],
  [/^GENERAL_MERCHANDISE_(PET|SUPERSTORES_PET)/, "Pets"],
  [/^GENERAL_MERCHANDISE_(CHILDREN|TOYS)/, "Kids"],
  [/^GENERAL_MERCHANDISE/, "Shopping"],
  [/^RENT_AND_UTILITIES_(RENT|MORTGAGE)/, "Home"],
  [/^RENT_AND_UTILITIES/, "Utilities"],
  [/^HOME_IMPROVEMENT/, "Home"],
  [/^ENTERTAINMENT_(STREAMING|VIDEO_STREAMING|MUSIC)/, "Subscriptions"],
  [/^ENTERTAINMENT/, "Entertainment"],
  [/^MEDICAL/, "Health"],
  [/^PERSONAL_CARE/, "Personal"],
  [/^GENERAL_SERVICES_(CHILDCARE|EDUCATION)/, "Kids"],
  [/^GENERAL_SERVICES_(INSURANCE|SUBSCRIPTION)/, "Subscriptions"],
  [/^GENERAL_SERVICES/, "Personal"],
  [/^TRAVEL/, "Travel"],
  [/^LOAN_PAYMENTS/, "Debt"],
  [/^BANK_FEES/, "Fees"],
  [/^INCOME/, "Income"],
  [/^TRANSFER_IN/, "Transfers"],
  [/^TRANSFER_OUT/, "Transfers"],
  [/^GOVERNMENT_AND_NON_PROFIT/, "Other"]
];

/** Everyday names a bank statement shows, matched when the category is vague. */
const MERCHANTS: Array<[RegExp, FinanceCategory]> = [
  [/\b(aldi|publix|kroger|winn[- ]?dixie|whole ?foods|trader ?joe|sprouts|food ?lion|safeway|wegmans|heb|meijer|costco|sam'?s club|bj'?s)\b/i, "Groceries"],
  [/\b(starbucks|dunkin|mcdonald|chick[- ]?fil[- ]?a|chipotle|wendy|burger king|taco bell|subway|panera|pizza|grill|cantina|brewing|brewery|tavern|bar ?& ?grill|restaurant|cafe|coffee|doordash|ubereats|uber eats|grubhub|postmates)\b/i, "Dining & Drinks"],
  [/\b(shell|chevron|exxon|mobil|bp|sunoco|marathon|circle ?k|racetrac|wawa|speedway|7[- ]?eleven|citgo|valero|gas)\b/i, "Gas & Auto"],
  [/\b(autozone|advance auto|o'?reilly|jiffy lube|firestone|goodyear|discount tire|car ?wash|dmv|geico|progressive|state farm|allstate)\b/i, "Gas & Auto"],
  [/\b(at&?t|verizon|t[- ]?mobile|sprint|comcast|xfinity|spectrum|cox communications|centurylink|frontier|fpl|florida power|duke energy|city of|water|sewer|waste management|republic services)\b/i, "Utilities"],
  [/\b(netflix|spotify|hulu|disney ?\+?|max|hbo|paramount|peacock|apple\.?com\/bill|itunes|icloud|google storage|youtube ?premium|xbox|playstation|nintendo|audible|patreon|substack|prime video|adobe|dropbox|chatgpt|openai|anthropic|claude)\b/i, "Subscriptions"],
  [/\b(amazon|amzn|walmart|target|ebay|etsy|temu|shein|best buy|home ?goods|marshalls|tj ?maxx|ross|kohl|macy|old navy|nike|lowe'?s|home depot|ikea|wayfair)\b/i, "Shopping"],
  [/\b(cvs|walgreens|rite aid|pharmacy|dental|dentist|orthodont|clinic|hospital|medical|urgent care|optometr|vision|labcorp|quest diagnostics)\b/i, "Health"],
  [/\b(petco|petsmart|chewy|veterinar|vet clinic|animal hospital)\b/i, "Pets"],
  [/\b(daycare|preschool|school|pta|gymnastics|karate|dance studio|scholastic|children'?s place|carter'?s)\b/i, "Kids"],
  [/\b(airlines?|airways|delta|united air|southwest|jetblue|spirit air|expedia|booking\.com|airbnb|vrbo|marriott|hilton|hyatt|hertz|enterprise rent|avis)\b/i, "Travel"],
  [/\b(amc|regal|cinemark|movie|theatre|theater|steam ?games|epic games|ticketmaster|stubhub|golf|bowling)\b/i, "Entertainment"],
  [/\b(planet fitness|gym|fitness|barber|salon|spa|nails|massage)\b/i, "Personal"],
  [/\b(overdraft|nsf fee|service charge|interest charge|annual fee|late fee|atm fee|foreign transaction)\b/i, "Fees"],
  [/\b(payroll|direct ?dep|dir dep|salary|wealthfront|dividend|interest paid|irs treas|tax refund)\b/i, "Income"],
  [/\b(zelle|venmo|cash ?app|paypal transfer|transfer to|transfer from|online transfer|withdrawal|deposit)\b/i, "Transfers"],
  [/\b(loan|mortgage|student ?ln|card payment|autopay|credit card payment)\b/i, "Debt"]
];

/** Plaid's primary category, for the rare transaction with no detailed one. */
const PRIMARY: Record<string, FinanceCategory> = {
  FOOD_AND_DRINK: "Dining & Drinks",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Personal",
  GOVERNMENT_AND_NON_PROFIT: "Other",
  HOME_IMPROVEMENT: "Home",
  LOAN_PAYMENTS: "Debt",
  MEDICAL: "Health",
  PERSONAL_CARE: "Personal",
  RENT_AND_UTILITIES: "Utilities",
  TRANSPORTATION: "Gas & Auto",
  TRAVEL: "Travel",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
  INCOME: "Income",
  BANK_FEES: "Fees",
  ENTERTAINMENT: "Entertainment"
};

/** Names used before this list existed, so old budgets and rules keep working. */
export const RENAMED: Record<string, FinanceCategory> = {
  Dining: "Dining & Drinks",
  Gas: "Gas & Auto",
  Bills: "Utilities",
  Uncategorized: "Other",
  Services: "Personal",
  Auto: "Gas & Auto",
  Grocery: "Groceries"
};

/** How the categories get said out loud, so Siri's words land on the right one. */
const SPOKEN: Array<[RegExp, FinanceCategory]> = [
  [/^(grocer(y|ies)|food shop(ping)?|supermarket)$/, "Groceries"],
  [/^(dining( ?& ?drinks?| and drinks?| out)?|restaurants?|eating out|takeout|drinks|food)$/, "Dining & Drinks"],
  [/^(gas( ?& ?auto| and auto)?|fuel|auto|car|gas and car)$/, "Gas & Auto"],
  [/^(shop(ping)?|clothes|clothing)$/, "Shopping"],
  [/^(utilit(y|ies)|bills?|power|electric(ity)?|internet|phone)$/, "Utilities"],
  [/^(home|house|household)$/, "Home"],
  [/^(health|medical|doctor|pharmacy)$/, "Health"],
  [/^(entertainment|fun|going out)$/, "Entertainment"],
  [/^(subscriptions?|streaming)$/, "Subscriptions"],
  [/^(travel|vacations?|holidays?)$/, "Travel"],
  [/^(kids?|children|childcare)$/, "Kids"],
  [/^(pets?|dog|cat)$/, "Pets"],
  [/^(personal|self care)$/, "Personal"],
  [/^(fees?|bank fees?)$/, "Fees"]
];

/** Spoken or typed, on the list or not: the category meant, or null to ask again. */
export function matchCategory(value?: string | null): FinanceCategory | null {
  const said = (value || "").toLowerCase().trim().replace(/[.!?]+$/, "").replace(/\s+and\s+/g, " & ").replace(/\s+/g, " ");
  if (!said) return null;
  const exact = FINANCE_CATEGORIES.find((category) => category.toLowerCase() === said);
  if (exact) return exact;
  const renamed = Object.entries(RENAMED).find(([from]) => from.toLowerCase() === said);
  if (renamed) return renamed[1];
  const plain = said.replace(/ ?& ?/g, " ");
  return SPOKEN.find(([pattern]) => pattern.test(said) || pattern.test(plain))?.[1] ?? null;
}

export function isFinanceCategory(value: string): value is FinanceCategory {
  return (FINANCE_CATEGORIES as readonly string[]).includes(value);
}

/** Accepts anything already stored and answers with a category on the current list. */
export function tidyCategory(value?: string | null): FinanceCategory {
  const name = (value || "").trim();
  if (!name) return "Other";
  if (isFinanceCategory(name)) return name;
  if (RENAMED[name]) return RENAMED[name];
  const match = FINANCE_CATEGORIES.find((category) => category.toLowerCase() === name.toLowerCase());
  return match ?? "Other";
}

/** Where a transaction belongs: the merchant beats a vague bank label, money in is income. */
export function categoryFor(input: { merchant?: string | null; primary?: string | null; detailed?: string | null; amount?: number }): FinanceCategory {
  const merchant = (input.merchant || "").trim();
  const detailed = (input.detailed || "").toUpperCase();
  const primary = (input.primary || "").toUpperCase();

  const fromMerchant = MERCHANTS.find(([pattern]) => pattern.test(merchant))?.[1];
  const fromDetailed = DETAILED.find(([pattern]) => pattern.test(detailed))?.[1];
  const fromPrimary = PRIMARY[primary];

  // Anything Plaid files as "... other", or no label at all, says little; the shop's name decides those.
  const vague = !fromDetailed || /_OTHER$|^OTHER/.test(detailed);
  const best = (vague ? fromMerchant ?? fromDetailed ?? fromPrimary : fromDetailed ?? fromMerchant ?? fromPrimary) ?? "Other";

  // Money arriving is income or a transfer, whatever the shop-shaped name says.
  if ((input.amount ?? 0) > 0 && !NON_SPENDING.has(best)) return fromMerchant === "Transfers" ? "Transfers" : "Income";
  return best;
}
