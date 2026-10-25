/**
 * The Quick Add picker on the Grocery tab. Each item's picture is its emoji,
 * drawn by Twemoji 14, so only emoji from Unicode 14 or earlier render (no
 * pea pod or ginger root yet). Add items freely; the test checks every one.
 */
export interface QuickItem {
  name: string;
  icon: string;
}

export interface QuickCategory {
  category: string;
  color: string;
  icon: string;
  items: QuickItem[];
}

const item = (name: string, icon: string): QuickItem => ({ name, icon });

export const groceryQuickCategories: QuickCategory[] = [
  {
    category: "Vegetables",
    color: "#22c55e",
    icon: "🥕",
    items: [
      item("Lettuce", "🥬"),
      item("Romaine", "🥬"),
      item("Spinach", "🥬"),
      item("Kale", "🥬"),
      item("Bok choy", "🥬"),
      item("Cabbage", "🥬"),
      item("Broccoli", "🥦"),
      item("Cauliflower", "🥦"),
      item("Brussels sprouts", "🥦"),
      item("Zucchini", "🥒"),
      item("Yellow squash", "🥒"),
      item("Cucumbers", "🥒"),
      item("Green beans", "🫘"),
      item("Asparagus", "🌿"),
      item("Celery", "🥬"),
      item("Carrots", "🥕"),
      item("Potatoes", "🥔"),
      item("Sweet potatoes", "🍠"),
      item("Onions", "🧅"),
      item("Red onions", "🧅"),
      item("Green onions", "🧅"),
      item("Shallots", "🧅"),
      item("Garlic", "🧄"),
      item("Ginger", "🌿"),
      item("Bell peppers", "🫑"),
      item("Jalapeños", "🌶️"),
      item("Tomatoes", "🍅"),
      item("Cherry tomatoes", "🍅"),
      item("Avocados", "🥑"),
      item("Corn", "🌽"),
      item("Mushrooms", "🍄"),
      item("Eggplant", "🍆"),
      item("Butternut squash", "🎃"),
      item("Beets", "🥕"),
      item("Radishes", "🥕"),
      item("Peas", "🥬"),
      item("Cilantro", "🌿"),
      item("Parsley", "🌿"),
      item("Basil", "🌿"),
      item("Salad mix", "🥗")
    ]
  },
  {
    category: "Fruit",
    color: "#fb7185",
    icon: "🍎",
    items: [
      item("Apples", "🍎"),
      item("Bananas", "🍌"),
      item("Strawberries", "🍓"),
      item("Blueberries", "🫐"),
      item("Raspberries", "🫐"),
      item("Blackberries", "🫐"),
      item("Grapes", "🍇"),
      item("Oranges", "🍊"),
      item("Clementines", "🍊"),
      item("Lemons", "🍋"),
      item("Limes", "🍋"),
      item("Pears", "🍐"),
      item("Peaches", "🍑"),
      item("Plums", "🍑"),
      item("Cherries", "🍒"),
      item("Watermelon", "🍉"),
      item("Cantaloupe", "🍈"),
      item("Pineapple", "🍍"),
      item("Mangoes", "🥭"),
      item("Kiwi", "🥝"),
      item("Coconut", "🥥"),
      item("Raisins", "🍇"),
      item("Applesauce", "🍎")
    ]
  },
  {
    category: "Meat",
    color: "#f97316",
    icon: "🥩",
    items: [
      item("Chicken breast", "🍗"),
      item("Chicken thighs", "🍗"),
      item("Whole chicken", "🍗"),
      item("Ground beef", "🥩"),
      item("Ground turkey", "🦃"),
      item("Steak", "🥩"),
      item("Pork chops", "🥩"),
      item("Pork tenderloin", "🥩"),
      item("Bacon", "🥓"),
      item("Sausage", "🌭"),
      item("Hot dogs", "🌭"),
      item("Ham", "🍖"),
      item("Deli turkey", "🦃"),
      item("Salami", "🍖"),
      item("Meatballs", "🍖"),
      item("Salmon", "🐟"),
      item("White fish", "🐟"),
      item("Tuna", "🐟"),
      item("Shrimp", "🍤"),
      item("Scallops", "🦪"),
      item("Tofu", "🧈")
    ]
  },
  {
    category: "Dairy",
    color: "#38bdf8",
    icon: "🥛",
    items: [
      item("Milk", "🥛"),
      item("Oat milk", "🥛"),
      item("Almond milk", "🥛"),
      item("Eggs", "🥚"),
      item("Butter", "🧈"),
      item("Cheddar", "🧀"),
      item("Mozzarella", "🧀"),
      item("Parmesan", "🧀"),
      item("Shredded cheese", "🧀"),
      item("Sliced cheese", "🧀"),
      item("Cream cheese", "🧀"),
      item("Cottage cheese", "🥣"),
      item("Yogurt", "🥣"),
      item("Greek yogurt", "🥣"),
      item("Sour cream", "🥣"),
      item("Heavy cream", "🥛"),
      item("Half and half", "🥛"),
      item("Creamer", "☕")
    ]
  },
  {
    category: "Bakery",
    color: "#d97706",
    icon: "🥖",
    items: [
      item("Bread", "🍞"),
      item("Whole wheat bread", "🍞"),
      item("Bagels", "🥯"),
      item("English muffins", "🧁"),
      item("Tortillas", "🫓"),
      item("Pita", "🫓"),
      item("Hamburger buns", "🍔"),
      item("Hot dog buns", "🌭"),
      item("Baguette", "🥖"),
      item("Croissants", "🥐"),
      item("Muffins", "🧁"),
      item("Pancake mix", "🥞")
    ]
  },
  {
    category: "Pantry",
    color: "#eab308",
    icon: "🥫",
    items: [
      item("Rice", "🍚"),
      item("Brown rice", "🍚"),
      item("Pasta", "🍝"),
      item("Spaghetti", "🍝"),
      item("Noodles", "🍜"),
      item("Quinoa", "🌾"),
      item("Oats", "🥣"),
      item("Cereal", "🥣"),
      item("Flour", "🌾"),
      item("Sugar", "🍚"),
      item("Brown sugar", "🍚"),
      item("Baking soda", "🧂"),
      item("Baking powder", "🧂"),
      item("Vanilla", "🍨"),
      item("Chocolate chips", "🍫"),
      item("Olive oil", "🫒"),
      item("Vegetable oil", "🫒"),
      item("Cooking spray", "🫒"),
      item("Vinegar", "🧴"),
      item("Soy sauce", "🥢"),
      item("Pasta sauce", "🍅"),
      item("Canned tomatoes", "🥫"),
      item("Tomato paste", "🥫"),
      item("Black beans", "🥫"),
      item("Chickpeas", "🥫"),
      item("Canned tuna", "🥫"),
      item("Chicken broth", "🥫"),
      item("Soup", "🥫"),
      item("Peanut butter", "🥜"),
      item("Jelly", "🍓"),
      item("Honey", "🍯"),
      item("Maple syrup", "🥞"),
      item("Ketchup", "🍅"),
      item("Mustard", "🌭"),
      item("Mayo", "🥚"),
      item("Salsa", "🌶️"),
      item("Hot sauce", "🌶️"),
      item("Breadcrumbs", "🍞")
    ]
  },
  {
    category: "Spices",
    color: "#a855f7",
    icon: "🧂",
    items: [
      item("Salt", "🧂"),
      item("Black pepper", "🧂"),
      item("Garlic powder", "🧄"),
      item("Onion powder", "🧅"),
      item("Paprika", "🌶️"),
      item("Chili powder", "🌶️"),
      item("Red pepper flakes", "🌶️"),
      item("Cumin", "🧂"),
      item("Cinnamon", "🥄"),
      item("Italian seasoning", "🌿"),
      item("Oregano", "🌿"),
      item("Thyme", "🌿"),
      item("Rosemary", "🌿"),
      item("Bay leaves", "🍃"),
      item("Taco seasoning", "🌮"),
      item("Everything bagel seasoning", "🥯")
    ]
  },
  {
    category: "Frozen",
    color: "#06b6d4",
    icon: "❄️",
    items: [
      item("Frozen pizza", "🍕"),
      item("Frozen veggies", "🥦"),
      item("Frozen peas", "🥦"),
      item("Frozen corn", "🌽"),
      item("Frozen berries", "🫐"),
      item("Smoothie fruit", "🍓"),
      item("Ice cream", "🍨"),
      item("Popsicles", "🍧"),
      item("Waffles", "🧇"),
      item("Fries", "🍟"),
      item("Chicken nuggets", "🍗"),
      item("Frozen dumplings", "🥟"),
      item("Frozen burritos", "🌯"),
      item("Ice", "🧊")
    ]
  },
  {
    category: "Snacks",
    color: "#ec4899",
    icon: "🍿",
    items: [
      item("Chips", "🥔"),
      item("Tortilla chips", "🌮"),
      item("Pretzels", "🥨"),
      item("Popcorn", "🍿"),
      item("Crackers", "🍘"),
      item("Goldfish", "🐟"),
      item("Granola bars", "🌾"),
      item("Nuts", "🥜"),
      item("Trail mix", "🥜"),
      item("Cookies", "🍪"),
      item("Chocolate", "🍫"),
      item("Fruit snacks", "🍬"),
      item("Rice cakes", "🍘"),
      item("Hummus", "🫘")
    ]
  },
  {
    category: "Drinks",
    color: "#0ea5e9",
    icon: "🧃",
    items: [
      item("Coffee", "☕"),
      item("Coffee beans", "☕"),
      item("Tea", "🍵"),
      item("Orange juice", "🧃"),
      item("Apple juice", "🧃"),
      item("Juice boxes", "🧃"),
      item("Sparkling water", "💧"),
      item("Bottled water", "💧"),
      item("Soda", "🥤"),
      item("Sports drinks", "🥤"),
      item("Beer", "🍺"),
      item("Wine", "🍷")
    ]
  },
  {
    category: "Baby & Kids",
    color: "#f59e0b",
    icon: "🍼",
    items: [
      item("Diapers", "👶"),
      item("Wipes", "🧻"),
      item("Formula", "🍼"),
      item("Baby food", "🥣"),
      item("Baby snacks", "🍪"),
      item("Whole milk", "🥛"),
      item("Diaper cream", "🧴"),
      item("Baby wash", "🧴"),
      item("Sippy cups", "🥤")
    ]
  },
  {
    category: "Household",
    color: "#64748b",
    icon: "🧼",
    items: [
      item("Paper towels", "🧻"),
      item("Toilet paper", "🧻"),
      item("Tissues", "🧻"),
      item("Napkins", "🧻"),
      item("Dish soap", "🧼"),
      item("Dishwasher pods", "🧼"),
      item("Sponges", "🧽"),
      item("Laundry soap", "🧺"),
      item("Fabric softener", "🧺"),
      item("Dryer sheets", "🧺"),
      item("Trash bags", "🗑️"),
      item("All-purpose cleaner", "🧴"),
      item("Disinfecting wipes", "🧴"),
      item("Aluminum foil", "🧻"),
      item("Plastic wrap", "🧻"),
      item("Ziploc bags", "🛍️"),
      item("Batteries", "🔋"),
      item("Light bulbs", "💡")
    ]
  },
  {
    category: "Personal Care",
    color: "#14b8a6",
    icon: "🧴",
    items: [
      item("Shampoo", "🧴"),
      item("Conditioner", "🧴"),
      item("Body wash", "🧴"),
      item("Hand soap", "🧼"),
      item("Toothpaste", "🪥"),
      item("Toothbrushes", "🪥"),
      item("Floss", "🦷"),
      item("Deodorant", "🧴"),
      item("Lotion", "🧴"),
      item("Sunscreen", "☀️"),
      item("Razors", "🪒"),
      item("Cotton swabs", "🩹"),
      item("Bandages", "🩹"),
      item("Pain reliever", "💊"),
      item("Vitamins", "💊")
    ]
  }
];

/**
 * Twemoji names its files by code point, joined with "-", leaving out the
 * U+FE0F variation selector (so ❄️ is 2744.svg, not 2744-fe0f.svg).
 */
export function twemojiCode(emoji: string): string {
  return [...emoji]
    .map((char) => char.codePointAt(0)!)
    .filter((point) => point !== 0xfe0f)
    .map((point) => point.toString(16))
    .join("-");
}

export function twemojiUrl(emoji: string): string {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${twemojiCode(emoji)}.svg`;
}
