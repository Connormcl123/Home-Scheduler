# Siri: tasks and the grocery list

iPhone Shortcuts talk to the Pi's voice endpoints. The Shortcut's name is the Siri phrase.

- **"Hey Siri, add a task"**: Siri asks what the task is and it appears on the wall's task list.
- **"Hey Siri, what's on my list"**: Siri reads out the open tasks due today or earlier, plus any without a date.
- **"Hey Siri, add groceries"**: Siri asks what you need; say one item or several ("milk, eggs and bread") and they land on the wall's grocery list.
- **"Hey Siri, grocery list"**: the grocery list arrives as a text message, grouped by aisle.
- **"Hey Siri, set a budget"**: Siri asks the category and the amount, and sets that month's budget.
- **"Hey Siri, how are my budgets"**: Siri reads back what is over, what is running hot, and what is left.

Tailscale must be connected on the phone, as for the share Shortcut (`docs/share-shortcut.md`).

## The token

Every endpoint needs `ALEXA_WEBHOOK_TOKEN` from the Pi's `.env` (the same token Alexa uses). Read it with:

    ssh connor@192.168.1.185 "grep ALEXA_WEBHOOK_TOKEN ~/Home-Scheduler/mirror-dashboard-app/.env"

Changing it means updating every Shortcut and restarting the dashboard.

## Add a task

In **Shortcuts**, tap **+**, name it **Add a task**, and add these actions in order:

1. **Ask for Input**: type **Text**, prompt `What's the task?`
2. **Get Contents of URL**
   - URL: `http://100.81.206.101:4174/api/voice/task`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <token>`
   - Request Body: **JSON**, Text fields `title` = **Provided Input**, `source` = `siri`
3. **Get Dictionary Value** for key `message` from **Contents of URL**.
4. **Speak Text** with the **Dictionary Value** (or **Show Result** to have Siri say it on the lock screen).

Siri replies "Added task: Buy milk". Dictation's trailing full stop is dropped and the first letter capitalised on the Pi.

## Read the list

New Shortcut named **What's on my list**:

1. **Get Contents of URL**: URL `http://100.81.206.101:4174/api/voice/tasks`, Method **GET**, Headers `Authorization` = `Bearer <token>`
2. **Get Dictionary Value** for key `message`.
3. **Speak Text** with the **Dictionary Value**.

## Add groceries

New Shortcut named **Add groceries**, built like **Add a task**:

1. **Ask for Input**: type **Text**, prompt `What do you need?`
2. **Get Contents of URL**
   - URL: `http://100.81.206.101:4174/api/voice/grocery`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <token>`
   - Request Body: **JSON**, Text field `items` = **Provided Input**
3. **Get Dictionary Value** for key `message` from **Contents of URL**.
4. **Speak Text** with the **Dictionary Value** (or **Show Result**).

Items split on commas and "and", so "milk, eggs and bread" adds three. Say "mac n cheese" for one item with "and" in its name, or type it. Something already on the list is not added twice. Something bought before goes back on with its old aisle and store. Siri replies "Added Eggs and Bread to the grocery list. Milk was already on it."

To add from the Home Screen or Action Button instead of Siri, add the Shortcut to either; it asks the same question and you can type.

## Text the grocery list

New Shortcut named **Grocery list**:

1. **Get Contents of URL**: URL `http://100.81.206.101:4174/api/grocery/text`, Method **GET**, Headers `Authorization` = `Bearer <token>`
2. **Get Dictionary Value** for key `message`.
3. **Send Message** with the **Dictionary Value**, to your own contact card. Expand the action and turn off **Show When Run** so it sends without the compose sheet.

The text looks like this, with only what still needs buying:

    Groceries for Saturday, Sep 19 (28)

    Dairy
    - Butter, 2 tablespoons
    - Parmesan cheese, 1/2 cup

    Fruit
    - Apples (out)

To have it arrive by itself, add a personal automation in the **Automation** tab: **Arrive** at your grocery store (or a time of day), choose **Run Immediately**, and pick **Grocery list**.

## Set a budget

New Shortcut named **Set a budget**:

1. **Ask for Input**, type Text, prompt `Which budget?`  Then **Set Variable** `Category`.
2. **Ask for Input**, type **Number**, prompt `How much a month?`  Then **Set Variable** `Amount`.
3. **Get Contents of URL**
   - URL: `http://100.81.206.101:4174/api/voice/budget`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <token>`
   - Request Body: **JSON**, with `category` = `Category` (Text) and `amount` = `Amount` (Number)
4. **Get Dictionary Value** for key `message`, then **Speak Text**.

Say the category the way it reads on the wall: "groceries", "dining and drinks", "gas and auto", "shopping". A word that matches nothing is refused and the reply lists the categories, so a misheard word never lands on the wrong budget.

## Ask how the budgets are doing

New Shortcut named **Budget check**:

1. **Get Contents of URL**: URL `http://100.81.206.101:4174/api/voice/budgets`, Method **GET**, Headers `Authorization` = `Bearer <token>`
2. **Get Dictionary Value** for key `message`, then **Speak Text**.

Siri answers with the month so far, then anything over or running ahead, for example: "You have spent $1,741 of $2,360 with 10 days left in September. Dining & Drinks is over by $108."

## Replies

| Siri says | Meaning |
|---|---|
| Added task: ... | Saved; the wall picks it up on its next refresh |
| Added ... to the grocery list. | Saved; the wall's Grocery page shows it |
| Say at least one grocery item. | The dictation came through empty |
| You have 3 tasks: ... / Your task list is clear. | The read-back |
| Voice webhook token is required. (as an error) | The `Authorization` header is missing or the token is wrong |
| Task title is required. | The dictation came through empty |
| The grocery list is empty. | Nothing is waiting to be bought |
| Groceries budget set to $600. | The budget was saved |
| There is no category called "..." | The category was misheard; the reply lists the ones that exist |
| No budgets are set yet. | Nothing to report until a budget exists |
| Could not connect to the server | Tailscale is off on the phone |
