# AI_USAGE.md — AI Tool Usage Log

## AI Tool Used

**Antigravity IDE** (powered by Google DeepMind's advanced agentic coding model, Claude Sonnet variant)

Used as the **primary development collaborator** for the entire build. I reviewed, understood, and approved every line before it was committed.

---

## Key Prompts Used

1. **"Read the CSV and create a full implementation plan with every anomaly you find"**
   → The AI read all 44 rows and identified 19 distinct data problems, categorised by type and severity. I cross-checked each finding manually against the file.

2. **"Build the CSV anomaly detector in `csvAnomalyDetector.js` — it must handle all 19 problems we found"**
   → Produced the full detector. I verified each check was wired to the correct row.

3. **"Build the split engine — equal, unequal, percentage, share — and the balance minimization algorithm"**
   → Core financial logic. I traced through the math by hand for a sample expense set.

4. **"Design the DB schema for time-bounded group membership"**
   → The AI's first draft had `joined_at` as TIMESTAMPTZ. I changed this to `DATE` because we only care about the date, not the time, for membership boundary checks.

5. **"Write the import commit logic — it should read user decisions from `import_anomalies` and apply them row by row"**
   → Produced the route. I found a bug (see below) and had it fixed.

---

## Three Cases Where the AI Was Wrong (And How I Caught It)

### Case 1: Balance Engine — Double-Counting the Payer's Own Share

**What the AI produced:**
```js
// Original (WRONG)
for (const split of expense.splits) {
  const debtorId = split.userId;
  balances[payerId] += amount;       // ← added for EVERY split including payer's own
  balances[debtorId] -= amount;
}
```

**The bug:** When the payer's own split was processed, their balance was incremented (as if someone owed them their own share) AND their own balance was also decremented (as the debtor). This double-counted the payer's own portion.

**How I caught it:** I traced a simple test case manually: Aisha pays ₹1200, split equally among 4. Aisha's share = ₹300. Rohan, Priya, Meera each owe Aisha ₹300. So Aisha's net balance should be +₹900, not +₹1200.

**Fix applied:**
```js
if (debtorId !== payerId) {    // ← added this guard
  balances[payerId] += amount;
  balances[debtorId] -= amount;
}
```

---

### Case 2: Date Parsing — Wrong Year for `Mar-14`

**What the AI produced:**
```js
if (fmt === 'MMM-DD') {
  finalDate = dayjs(`${s}-2025`, 'MMM-DD-YYYY').toDate(); // ← hardcoded 2025
}
```

**The bug:** The AI hardcoded 2025 as the fallback year for the ambiguous `Mar-14` date (row 27). All expenses in this CSV are from 2026. This would import the airport cab expense as March 14, 2025 — a year off.

**How I caught it:** I reviewed the `parseDate` function output and noticed the year field was 2025. Since the entire CSV is from Feb–April 2026, this was clearly wrong.

**Fix applied:** Changed to `2026` as the assumed year, with a logged warning so the user can still verify.

---

### Case 3: Percentage Normalization (Silent Guess)

**What the AI initially suggested in the plan:**
> "For percentages that don't sum to 100%, silently normalize by dividing each percentage by the total."

**The problem:** This was a silent guess — exactly what the assignment says is a failing answer. For row 15 (Aisha 30% + Rohan 30% + Priya 30% + Meera 20% = 110%), silent normalization would make Meera's share 18.18% instead of 20%, changing her financial obligation without her knowledge.

**How I caught it:** I re-read the assignment requirement: *"A crashed import and a silent guess are both failing answers."* The AI's suggestion violated this directly.

**Fix applied:** Changed policy to **block the row** and surface the exact percentages + total to the user. The user must either correct the values or reject the row entirely. Documented in DECISIONS.md Decision 8.

---

## Summary Assessment

The AI was highly effective at:
- Scaffolding boilerplate (routes, middleware, schema)
- Generating CSV parsing logic
- Writing the minimized transaction algorithm

The AI needed human correction for:
- Financial math edge cases (the balance double-count bug)
- Year assumptions in date parsing (hardcoded wrong year)
- Policy decisions on data quality (the silent normalization issue — which required re-reading the assignment brief to catch)

**Conclusion:** The AI accelerated development by ~60-70% but required careful review of every piece of financial logic and every data quality policy. The three bugs above would have produced incorrect balances or violated the assignment requirements if left unchecked.
