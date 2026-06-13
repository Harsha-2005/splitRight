# SCOPE.md — Anomaly Log & Database Schema

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(100) | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | TEXT | bcrypt hash |
| created_at | TIMESTAMPTZ | |

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| created_by | INT FK → users | |
| created_at | TIMESTAMPTZ | |

### `group_members` — time-bounded membership
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| group_id | INT FK → groups | |
| user_id | INT FK → users | |
| joined_at | DATE | When they joined |
| left_at | DATE nullable | NULL = currently active |

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| group_id | INT FK | |
| description | VARCHAR(500) | |
| paid_by | INT FK → users | |
| amount | DECIMAL(12,2) | In original currency |
| currency | CHAR(3) | INR, USD, etc |
| exchange_rate | DECIMAL(10,4) | Rate at expense date |
| amount_inr | DECIMAL(12,2) | Always in INR |
| expense_date | DATE | |
| split_type | VARCHAR(20) | equal/unequal/percentage/share |
| is_refund | BOOLEAN | Negative amounts |
| notes | TEXT | |
| import_row | INT | CSV row number |
| created_at | TIMESTAMPTZ | |

### `expense_splits`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| expense_id | INT FK → expenses (cascade delete) | |
| user_id | INT FK → users | |
| share_amount | DECIMAL(12,2) | In INR |

### `settlements`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| group_id | INT FK | |
| from_user | INT FK → users | Who paid |
| to_user | INT FK → users | Who received |
| amount | DECIMAL(12,2) | |
| currency | CHAR(3) | |
| settled_at | DATE | |
| notes | TEXT | |

### `import_sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| group_id | INT FK | |
| filename | VARCHAR | |
| imported_by | INT FK → users | |
| status | VARCHAR | pending_review / completed / cancelled |
| total_rows | INT | |
| imported_count | INT | |
| skipped_count | INT | |
| anomaly_count | INT | |
| raw_data | JSONB | Full parsed CSV stored for review |

### `import_anomalies`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| session_id | INT FK | |
| row_number | INT | 1-indexed including header |
| raw_data | JSONB | Original CSV row |
| anomaly_type | VARCHAR | DUPLICATE, MISSING_PAYER, etc |
| description | TEXT | Human-readable explanation |
| severity | VARCHAR | error / warning / info |
| user_decision | VARCHAR | pending / approve / reject / modify |
| resolved_data | JSONB | What was actually used |

### `exchange_rates`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| from_currency | CHAR(3) | |
| to_currency | CHAR(3) | |
| rate_date | DATE | |
| rate | DECIMAL(10,4) | |
| UNIQUE(from_currency, to_currency, rate_date) | | |

---

## Anomaly Log — All 19 Data Problems Found

| # | Row(s) | Type | Severity | Description | Handling Policy |
|---|--------|------|----------|-------------|-----------------|
| 1 | 6 | EXACT_DUPLICATE | Error | "dinner - marina bites" is exact duplicate of row 5 (same payer Dev, same amount ₹3200, same date, same split group) — only differ in capitalisation and notes | Surface both rows. User must choose which to keep. Default: keep row 5 (proper casing, has a note). Reject row 6. |
| 2 | 7 | COMMA_AMOUNT | Info | Electricity Feb amount is `"1,200"` — quoted with a comma. csv-parse returns this as a string. | Auto-strip comma, parse as 1200. Log as info. No user action needed. |
| 3 | 9 | NAME_CASING | Warning | paid_by is `priya` (all lowercase) vs canonical `Priya` | Fuzzy-match to "Priya" with 1.0 confidence (exact case-insensitive). Normalise silently, log as warning. |
| 4 | 10 | EXCESS_PRECISION | Info | Cylinder refill amount is `899.995` — 3 decimal places (sub-paisa) | Round to ₹900.00 using standard rounding. Log as info. |
| 5 | 11 | UNKNOWN_MEMBER | Error | paid_by is `Priya S` — not in member list. Fuzzy match to "Priya" (score ~0.65) but not certain | Block import of this row. Surface to user: "Map 'Priya S' to?" with dropdown. Only commit when user confirms. |
| 6 | 13 | MISSING_PAYER | Error | paid_by field is blank. Note says "can't remember who paid" | Block this row. User must assign a payer or choose to skip the row entirely. |
| 7 | 14 | PROBABLE_SETTLEMENT | Warning | "Rohan paid Aisha back" — blank split_type, single recipient, settlement keyword detected | Flag as settlement. User confirms → create Settlement record (not Expense). If rejected → import as expense with equal split. |
| 8 | 15 | PERCENTAGE_SUM | Error | Pizza Friday: Aisha 30% + Rohan 30% + Priya 30% + Meera 20% = 110% (not 100%) | Block row. Show the percentages and total. User must correct values before import. |
| 9 | 20,21,23,26 | FOREIGN_CURRENCY | Info | USD amounts: Goa villa ($540), Beach shack ($84), Parasailing ($150), Refund (-$30) | Fetch historical USD→INR rate for each expense date from frankfurter.app. Store original amount + rate + INR equivalent. |
| 10 | 23 | UNKNOWN_SPLIT_MEMBER | Warning | "Dev's friend Kabir" in split_with is not a registered member | Flag. Offer two choices: (a) add Kabir as guest/temporary member, (b) redistribute his share equally among the other split members. |
| 11 | 24,25 | NEAR_DUPLICATE | Warning | "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450) — same date, similar description, same group. Note on row 25 says "Aisha also logged this" | Surface both rows side-by-side. User picks one to keep. Default: keep row 25 per the note (row 24 is likely wrong). |
| 12 | 26 | NEGATIVE_AMOUNT | Warning | Parasailing refund: `-30 USD`. Could be error or refund. Note says "one slot got cancelled" | Context makes it clearly a refund. Import as expense with `is_refund=true`. Reverse the split (all split members get a credit). |
| 13 | 27 | DATE_FORMAT | Warning | Date is `Mar-14` — not DD-MM-YYYY. Parsed using MMM-DD format + assumed year 2026. | Parse to 2026-03-14. Log as warning so user can verify. |
| 14 | 28 | MISSING_CURRENCY | Warning | Groceries DMart ₹2105 has blank currency field | Default to INR (all non-trip expenses are INR; amount scale confirms). Log warning. |
| 15 | 31 | ZERO_AMOUNT | Warning | Dinner order Swiggy is ₹0. Note says "counted twice earlier — fixing later" | Skip row. Do not create a ₹0 expense. Log as skipped with reason. |
| 16 | 34 | AMBIGUOUS_DATE | Warning | `04-05-2026` — could be April 5 (DD-MM) or May 4 (MM-DD). Note: "is this April 5 or May 4? format is a mess" | Default to DD-MM-YYYY (dominant format in this file) → April 5, 2026. Flag with confirmation prompt to user. |
| 17 | 36 | MEMBER_TIMELINE | Warning | Meera is in split_with for April 2 grocery (she left March 31) | Flag: "Meera left on 2026-03-31 but appears in split on 2026-04-02". User decides: (a) remove Meera from split and redistribute, (b) include anyway with override. |
| 18 | 38 | PROBABLE_SETTLEMENT | Warning | "Sam deposit share" paid by Sam to Aisha — a deposit payment, not a shared expense. Keyword "deposit" detected. Single recipient. | Flag as settlement. If confirmed → create Settlement record (Sam→Aisha ₹15,000). |
| 19 | 42 | SPLIT_TYPE_CONFLICT | Info | split_type=`equal` but split_details has `Aisha 1; Rohan 1; Priya 1; Sam 1` (share notation). Note says "someone added shares anyway" | Since all share values are equal (1:1:1:1), this is equivalent to equal split. Import as equal split. Log as info. |
