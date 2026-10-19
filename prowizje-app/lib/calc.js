// Wyliczanie prowizji i podsumowań.

export const CATEGORIES = ['rezerwacje', 'sniadania', 'obiadokolacje', 'upsell'];

export const CATEGORY_LABELS = {
  rezerwacje: 'Rezerwacje',
  sniadania: 'Śniadania',
  obiadokolacje: 'Obiadokolacje',
  upsell: 'Upsell',
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Domyślne ustawienia (administrator może je zmienić w panelu).
export const DEFAULT_SETTINGS = {
  rate_rezerwacje: 1,
  rate_sniadania: 5,
  rate_obiadokolacje: 5,
  rate_upsell: 5,
  vat: 8,
  // 'divide'   -> netto = brutto / (1 + VAT)   (kwota zawiera VAT – standard)
  // 'subtract' -> netto = brutto * (1 - VAT)
  vat_method: 'divide',
};

export function rateFor(category, settings) {
  return Number(settings[`rate_${category}`]);
}

export function netValue(gross, vat, method) {
  const v = Number(vat) / 100;
  return method === 'subtract' ? gross * (1 - v) : gross / (1 + v);
}

// Prowizja = netto (wartość bez VAT) × stawka %.
export function commission(gross, ratePct, vatPct, method) {
  return round2(netValue(Number(gross) || 0, vatPct, method) * (Number(ratePct) / 100));
}

// Udział w parkingu: kwota dzielona równo na uczestników podziału.
export function parkingShare(amount, participants) {
  if (!participants || !amount) return 0;
  return round2(Number(amount) / participants);
}

// entries: wiersze z bazy, users: lista użytkowników, parkingAmount: kwota za miesiąc.
// Liczy tylko wpisy zatwierdzone ('approved'); oczekujące pokazuje osobno.
export function buildSummary(users, entries, parkingAmount) {
  const participants = users.filter((u) => u.active && u.parking_share);
  const share = parkingShare(parkingAmount, participants.length);
  const rows = users
    .filter((u) => u.active || entries.some((e) => e.user_id === u.id))
    .map((u) => {
      const row = { user_id: u.id, name: u.name, login: u.login, role: u.role, cat: {}, pending: 0, pending_count: 0 };
      let total = 0;
      for (const c of CATEGORIES) {
        const list = entries.filter((e) => e.user_id === u.id && e.category === c && e.status === 'approved');
        const value = round2(list.reduce((s, e) => s + e.value, 0));
        const comm = round2(list.reduce((s, e) => s + e.commission, 0));
        row.cat[c] = { value, commission: comm, count: list.length };
        total += comm;
      }
      const pend = entries.filter((e) => e.user_id === u.id && e.status === 'pending');
      row.pending = round2(pend.reduce((s, e) => s + e.commission, 0));
      row.pending_count = pend.length;
      row.parking = u.active && u.parking_share ? share : 0;
      row.total = round2(total + row.parking);
      return row;
    });
  const totals = { cat: {}, parking: 0, total: 0, pending: 0 };
  for (const c of CATEGORIES) {
    totals.cat[c] = {
      value: round2(rows.reduce((s, r) => s + r.cat[c].value, 0)),
      commission: round2(rows.reduce((s, r) => s + r.cat[c].commission, 0)),
      count: rows.reduce((s, r) => s + r.cat[c].count, 0),
    };
  }
  totals.parking = round2(rows.reduce((s, r) => s + r.parking, 0));
  totals.total = round2(rows.reduce((s, r) => s + r.total, 0));
  totals.pending = round2(rows.reduce((s, r) => s + r.pending, 0));
  return { rows, totals, parking: { amount: Number(parkingAmount) || 0, participants: participants.length, share } };
}
