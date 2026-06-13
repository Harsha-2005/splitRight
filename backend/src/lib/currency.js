import fetch from 'node-fetch';
import prisma from './prisma.js';

/**
 * Get USD → INR exchange rate for a specific date.
 * Uses frankfurter.app (free, no API key needed, historical rates).
 * Caches result in DB.
 */
export async function getExchangeRate(fromCurrency, toCurrency, date) {
  // If same currency, rate = 1
  if (fromCurrency === toCurrency) return 1.0;

  const dateStr = date instanceof Date
    ? date.toISOString().split('T')[0]
    : date;

  // Check cache first
  const cached = await prisma.exchangeRate.findUnique({
    where: {
      fromCurrency_toCurrency_rateDate: {
        fromCurrency,
        toCurrency,
        rateDate: new Date(dateStr),
      },
    },
  });
  if (cached) return Number(cached.rate);

  try {
    const url = `https://api.frankfurter.app/${dateStr}?from=${fromCurrency}&to=${toCurrency}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Frankfurter API error: ${resp.status}`);
    const data = await resp.json();
    const rate = data.rates[toCurrency];

    // Cache it
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_rateDate: {
          fromCurrency,
          toCurrency,
          rateDate: new Date(dateStr),
        },
      },
      create: { fromCurrency, toCurrency, rateDate: new Date(dateStr), rate },
      update: { rate },
    });

    return rate;
  } catch (err) {
    console.error(`Exchange rate fetch failed for ${fromCurrency}→${toCurrency} on ${dateStr}:`, err.message);
    // Fallback: use approximate rate
    const FALLBACK_RATES = { 'USD-INR': 83.5, 'EUR-INR': 90.0, 'GBP-INR': 105.0 };
    return FALLBACK_RATES[`${fromCurrency}-${toCurrency}`] || 83.5;
  }
}

export function convertToInr(amount, currency, rate) {
  if (currency === 'INR') return Number(amount);
  return +(Number(amount) * rate).toFixed(2);
}
