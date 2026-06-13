/**
 * Split calculation engine.
 * Given an expense, returns per-user share amounts in INR.
 *
 * Split types:
 *   equal      - divide equally among all members
 *   unequal    - exact INR amounts per person
 *   percentage - % share per person (must sum to 100)
 *   share      - weighted shares (e.g., 2:1:1)
 */

/**
 * @param {number} totalInr  - Total expense in INR
 * @param {string} splitType - equal | unequal | percentage | share
 * @param {Array}  members   - [{ userId, value }] where value depends on splitType
 * @returns {Array}          - [{ userId, shareAmount }]
 */
export function calculateSplits(totalInr, splitType, members) {
  if (!members || members.length === 0) {
    throw new Error('At least one member required for split');
  }

  let splits = [];

  switch (splitType) {
    case 'equal': {
      const share = Math.floor((totalInr * 100) / members.length) / 100;
      const remainder = +(totalInr - share * members.length).toFixed(2);
      splits = members.map((m, i) => ({
        userId: m.userId,
        shareAmount: i === 0 ? +(share + remainder).toFixed(2) : share,
      }));
      break;
    }

    case 'unequal': {
      // members[i].value = exact INR amount
      const total = members.reduce((s, m) => s + Number(m.value), 0);
      if (Math.abs(total - totalInr) > 0.02) {
        throw new Error(
          `Unequal split amounts (${total}) do not match expense total (${totalInr})`
        );
      }
      splits = members.map(m => ({
        userId: m.userId,
        shareAmount: +Number(m.value).toFixed(2),
      }));
      break;
    }

    case 'percentage': {
      // members[i].value = percentage (e.g. 30 for 30%)
      const totalPct = members.reduce((s, m) => s + Number(m.value), 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new Error(`Percentages sum to ${totalPct}, must equal 100`);
      }
      splits = members.map(m => ({
        userId: m.userId,
        shareAmount: +((totalInr * Number(m.value)) / 100).toFixed(2),
      }));
      // Fix rounding
      const splitTotal = splits.reduce((s, sp) => s + sp.shareAmount, 0);
      const diff = +(totalInr - splitTotal).toFixed(2);
      if (splits.length > 0) splits[0].shareAmount = +(splits[0].shareAmount + diff).toFixed(2);
      break;
    }

    case 'share': {
      // members[i].value = share weight (e.g. 2 means double share)
      const totalShares = members.reduce((s, m) => s + Number(m.value), 0);
      splits = members.map(m => ({
        userId: m.userId,
        shareAmount: +((totalInr * Number(m.value)) / totalShares).toFixed(2),
      }));
      // Fix rounding
      const splitTotal = splits.reduce((s, sp) => s + sp.shareAmount, 0);
      const diff = +(totalInr - splitTotal).toFixed(2);
      if (splits.length > 0) splits[0].shareAmount = +(splits[0].shareAmount + diff).toFixed(2);
      break;
    }

    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }

  return splits;
}

/**
 * Calculate net balances for a group.
 * Returns: { userId: netBalance } where positive = owed to user, negative = user owes
 */
export function calculateBalances(expenses, settlements) {
  const balances = {};

  for (const expense of expenses) {
    const payerId = expense.paidBy;
    const totalInr = Number(expense.amountInr);
    const multiplier = expense.isRefund ? -1 : 1;

    if (!balances[payerId]) balances[payerId] = 0;

    for (const split of expense.splits) {
      const debtorId = split.userId;
      const amount = Number(split.shareAmount) * multiplier;

      if (!balances[debtorId]) balances[debtorId] = 0;

      if (debtorId !== payerId) {
        balances[payerId] += amount;   // payer is owed this amount
        balances[debtorId] -= amount;  // debtor owes this amount
      }
    }
  }

  // Apply settlements
  for (const s of settlements) {
    const amount = Number(s.amount);
    if (!balances[s.fromUserId]) balances[s.fromUserId] = 0;
    if (!balances[s.toUserId]) balances[s.toUserId] = 0;
    balances[s.fromUserId] += amount;
    balances[s.toUserId] -= amount;
  }

  return balances;
}

/**
 * Minimize transactions using greedy algorithm.
 * Returns: [{ from, to, amount }]
 */
export function minimizeTransactions(balances) {
  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of Object.entries(balances)) {
    const rounded = +Number(balance).toFixed(2);
    if (rounded > 0) creditors.push({ userId: parseInt(userId), amount: rounded });
    else if (rounded < 0) debtors.push({ userId: parseInt(userId), amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const credit = creditors[i];
    const debit = debtors[j];
    const amount = Math.min(credit.amount, debit.amount);

    transactions.push({
      from: debit.userId,
      to: credit.userId,
      amount: +amount.toFixed(2),
    });

    credit.amount = +(credit.amount - amount).toFixed(2);
    debit.amount = +(debit.amount - amount).toFixed(2);

    if (credit.amount < 0.01) i++;
    if (debit.amount < 0.01) j++;
  }

  return transactions;
}
