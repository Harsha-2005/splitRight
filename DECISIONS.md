# DECISIONS.md — Engineering Decision Log

## Decision 1: Currency Storage

**Question:** When an expense is in USD, do we convert immediately to INR or store the original?

**Options considered:**
- **A)** Convert to INR at import time, discard original amount
- **B)** Store original amount + currency + exchange rate + INR equivalent

**Chosen:** B

**Reason:** Priya's explicit complaint is that "the sheet pretends a dollar is a rupee." Option B preserves full audit trail: we can show "₹44,900 (from $540 at ₹83.15/USD on 2026-03-09)". Option A would silently lose the original denomination. Exchange rates from `frankfurter.app` (free, no API key, historical rates by date).

**Consequence:** `expenses` table stores `amount`, `currency`, `exchange_rate`, and `amount_inr` — four fields instead of one.

---

## Decision 2: Rounding Rule

**Question:** When dividing ₹1200 equally among 4 people, each gets ₹300.00 exactly. But ₹899.995 among 4 is ₹224.999... — how do we handle sub-paisa?

**Options considered:**
- **A)** Round each share independently → sum may differ by ₹0.01
- **B)** Round all shares down, add remainder to last person's share
- **C)** Round all shares down, add remainder to first person's share (payer if possible)
- **D)** Use integer arithmetic (paise), convert back

**Chosen:** C — add rounding remainder to the first split member's share.

**Reason:** D (paise arithmetic) is most precise but adds complexity. C is deterministic, transparent, and the rounding is at most ₹0.01 — well within acceptable tolerance. The first member is conventionally the payer, so any rounding error is attributed to them — they're already tracking the expense.

---

## Decision 3: Duplicate Detection

**Question:** Row 5 and row 6 are the same dinner. Rows 24 and 25 are the same dinner with different amounts and payers. How do we detect and handle duplicates?

**Options considered:**
- **A)** Exact match only (same amount + date + payer)
- **B)** Fuzzy match on description + same date → near-duplicate
- **C)** User manually marks duplicates before import

**Chosen:** Both A and B in combination. A catches exact duplicates (rows 5,6). B catches near-duplicates (rows 24,25).

**Detection logic:**
- Exact: same `date` + same `paid_by` + same `amount` + same `currency`
- Near: same `date` + first 6 chars of normalised description overlap

**Handling:** Surface both rows to user with side-by-side view. User decides which to keep. We never silently delete — Meera's requirement.

---

## Decision 4: Settlement Detection

**Question:** Row 14 ("Rohan paid Aisha back") and Row 38 ("Sam deposit share") are not expenses — they are payments. How do we identify these automatically?

**Options considered:**
- **A)** Require a dedicated `type` column in CSV (can't edit CSV)
- **B)** Keyword detection on description
- **C)** Structural detection: blank `split_type` + single `split_with` entry
- **D)** Both B and C combined

**Chosen:** D — keyword detection AND structural detection.

**Keywords:** "paid back", "settled", "deposit", "deposit share", "repaid", "reimburs"
**Structural:** `split_type` is blank AND `split_with` has exactly one person

**Handling:** Flagged as `PROBABLE_SETTLEMENT`. User confirms → creates a `Settlement` record (not `Expense`). If user rejects detection → import as expense.

---

## Decision 5: Post-Exit Members in Splits

**Question:** Row 36 has Meera in the split for an April 2 grocery — but Meera left March 31. Sam's concern: "Why would March electricity affect my balance?"

**Options considered:**
- **A)** Hard reject: any row with a member outside their date range is an error → block
- **B)** Soft warn: flag it, user decides
- **C)** Auto-strip: silently remove the out-of-range member and redistribute

**Chosen:** B — warn and let user decide.

**Reason:** C (silent auto-strip) violates the spirit of the importer — Meera explicitly said she wants to approve anything changed. A (hard block) is too aggressive; sometimes you intentionally include someone after they leave (e.g., a farewell expense counted the day after). B surfaces the issue and respects user agency.

**Membership check:** `group_members.joined_at <= expense_date AND (left_at IS NULL OR left_at >= expense_date)`

---

## Decision 6: Negative Amounts

**Question:** Row 26 is `-30 USD` (parasailing refund). Is this an error or a refund?

**Options considered:**
- **A)** Always treat negative as error → block
- **B)** Always treat as refund → import with `is_refund=true`
- **C)** Flag as warning → user decides

**Chosen:** C with context hint.

**Reason:** Without context, negative amounts are ambiguous. But the note ("one slot got cancelled") makes this clearly a refund. The importer flags it, explains the context, and defaults the suggestion to "refund". User can override to skip.

**Refund mechanics:** `is_refund=true` → balance engine multiplies all split amounts by -1 → each split member gets a credit of their share.

---

## Decision 7: Balance Algorithm

**Question:** How do we compute and display who owes whom?

**Options considered:**
- **A)** Pairwise: track A→B, A→C, B→C etc. separately → can result in 15 transactions for 6 people
- **B)** Net balance per person → minimized transaction settlement (greedy)

**Chosen:** B — net balance first, then minimized transactions.

**Net balance:** For each expense, the payer's balance goes up by the sum of other people's shares. Each debtor's balance goes down by their share. Settlements adjust balances directly.

**Minimization:** Sort creditors (positive balance) and debtors (negative balance) by magnitude. Match largest creditor with largest debtor. This minimizes the number of transactions — Aisha's "one number per person" requirement.

---

## Decision 8: Percentage Sum Validation

**Question:** Row 15 has percentages summing to 110%. Is this an error or do we normalize?

**Options considered:**
- **A)** Normalize silently (divide each by total → make them sum to 100%)
- **B)** Block and require user correction
- **C)** Warn but import with normalization, showing what changed

**Chosen:** B — block and require user correction.

**Reason:** Silent normalization (A) would mean Aisha's 30% becomes 27.27% without her knowing — a financial change made without consent. The assignment explicitly says "A silent guess is a failing answer." We surface the exact percentages and the total, and block until the user provides correct values.

---

## Decision 9: "Priya S" Unknown Member

**Question:** Row 11 has `paid_by = "Priya S"`. Fuzzy match scores this ~0.65 against "Priya". Do we auto-match?

**Options considered:**
- **A)** Auto-match if fuzzy score > 0.5
- **B)** Block and show mapping UI
- **C)** Auto-match if score > 0.9 (high confidence only)

**Chosen:** C/B hybrid — auto-match only if score > 0.9 (exact case-insensitive match = 1.0). For "Priya S" (score ~0.65), show a mapping UI to let user confirm "Priya S → Priya".

**Reason:** Financial data requires high precision on identity. A wrong auto-match (e.g., "Priya S" → "Sam") would corrupt balances silently.

---

## Decision 10: Ambiguous Date `04-05-2026`

**Question:** Is this April 5 (DD-MM-YYYY) or May 4 (MM-DD-YYYY)?

**Options considered:**
- **A)** Default DD-MM-YYYY (dominant format in this file)
- **B)** Block and require user input
- **C)** Flag as warning, default to DD-MM-YYYY

**Chosen:** C — default DD-MM-YYYY (→ April 5, 2026), flag as `AMBIGUOUS_DATE` warning with a note that the user should confirm.

**Reason:** 38 out of 43 date entries use DD-MM-YYYY. The note even confirms confusion ("is this April 5 or May 4?"), suggesting the author themselves wasn't sure. We make the most likely interpretation explicit and give the user a chance to correct.
