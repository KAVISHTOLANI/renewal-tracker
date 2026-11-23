import { addDays, addMonths, daysBetween, isValidISODate } from '../shared/dates';

export const KINDS = ['Passport', 'Driving licence', 'ID card', 'Visa or permit', 'Insurance', 'Membership', 'Subscription', 'Certification', 'Vehicle', 'Other'] as const;
export type Kind = (typeof KINDS)[number];

/** Typical lead time (days before expiry to start) used as a suggestion when adding an item. */
export const SUGGESTED_LEAD: Record<Kind, number> = {
  Passport: 70, 'Driving licence': 42, 'ID card': 42, 'Visa or permit': 90, Insurance: 21, Membership: 14, Subscription: 7, Certification: 60, Vehicle: 30, Other: 30,
};

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Renewal {
  renewedOn: string;
  previousExpiry: string;
  newExpiry: string;
  cost: number | null;
}

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  owner: string;
  reference: string;
  expires: string;
  leadDays: number;
  cost: number | null;
  notes: string;
  checklist: CheckItem[];
  history: Renewal[];
  demo?: boolean;
}

export const startBy = (i: Pick<Item, 'expires' | 'leadDays'>) => addDays(i.expires, -i.leadDays);

export type Status = 'expired' | 'act-now' | 'plan' | 'ok';
export const STATUS_LABEL: Record<Status, string> = { expired: 'Expired', 'act-now': 'Start renewing', plan: 'Coming up', ok: 'Fine' };

/** expired: past expiry · act-now: past the start-by date · plan: start-by within `planDays` · ok: otherwise. */
export function status(i: Item, today: string, planDays = 60): Status {
  if (i.expires < today) return 'expired';
  const s = startBy(i);
  if (s <= today) return 'act-now';
  return daysBetween(today, s) <= planDays ? 'plan' : 'ok';
}

export function maskReference(ref: string): string {
  const clean = ref.replace(/\s+/g, '');
  if (clean.length <= 4) return clean ? '•'.repeat(clean.length) : '';
  return `${'•'.repeat(Math.min(6, clean.length - 4))}${clean.slice(-4)}`;
}

/** Suggests the next expiry: the same length as the last renewal period, or one year if unknown. */
export function suggestNextExpiry(i: Item): string {
  const last = i.history[i.history.length - 1];
  if (last) {
    const months = Math.round(daysBetween(last.previousExpiry, last.newExpiry) / 30.44);
    if (months > 0) return addMonths(i.expires, months);
  }
  return addMonths(i.expires, 12);
}

export function renew(i: Item, renewedOn: string, newExpiry: string, cost: number | null): Item {
  return {
    ...i,
    expires: newExpiry,
    history: [...i.history, { renewedOn, previousExpiry: i.expires, newExpiry, cost }],
    checklist: i.checklist.map((c) => ({ ...c, done: false })),
  };
}

export function validateRenewal(i: Item, renewedOn: string, newExpiry: string, costText: string, today: string): string | null {
  if (!isValidISODate(renewedOn) || renewedOn > today) return 'The renewal date must be today or earlier.';
  if (!isValidISODate(newExpiry)) return 'Enter the new expiry date.';
  if (newExpiry <= i.expires) return 'The new expiry must be after the current one.';
  if (costText.trim() && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) return 'Cost must be 0 or more.';
  return null;
}

export interface ItemDraft {
  name: string;
  kind: Kind;
  owner: string;
  reference: string;
  expires: string;
  leadDays: string;
  cost: string;
  notes: string;
}

export function validateItem(d: ItemDraft): Partial<Record<keyof ItemDraft, string>> {
  const e: Partial<Record<keyof ItemDraft, string>> = {};
  if (!d.name.trim()) e.name = 'Name the document or membership.';
  if (!isValidISODate(d.expires)) e.expires = 'Enter the expiry date.';
  const lead = Number(d.leadDays);
  if (!Number.isInteger(lead) || lead < 0 || lead > 730) e.leadDays = 'Lead time must be 0–730 days.';
  if (d.cost.trim() && (!Number.isFinite(Number(d.cost)) || Number(d.cost) < 0)) e.cost = 'Cost must be 0 or more.';
  return e;
}

/** Items whose start-by or expiry falls in each of the next `months` months. */
export function byMonth(items: Item[], today: string, months = 12) {
  const end = addMonths(today, months);
  const events = items.flatMap((i) => [
    { item: i, date: startBy(i), what: 'start' as const },
    { item: i, date: i.expires, what: 'expires' as const },
  ]).filter((e) => e.date >= today && e.date <= end);
  const groups = new Map<string, typeof events>();
  for (const e of events.sort((a, b) => a.date.localeCompare(b.date))) groups.set(e.date.slice(0, 7), [...(groups.get(e.date.slice(0, 7)) ?? []), e]);
  return [...groups.entries()].map(([month, list]) => ({ month, list }));
}

/* ---------- iCalendar export ---------- */
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso: string) => iso.replace(/-/g, '');

/** Folds lines longer than 75 octets as RFC 5545 requires (approximated by characters). */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? ' ' : '') + line.slice(i, i + 73));
  return out.join('\r\n');
}

export function toICS(items: Item[], stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Renewal Radar//Local export//EN', 'CALSCALE:GREGORIAN'];
  for (const i of items) {
    const events: [string, string, string][] = [
      [`start-${i.id}`, startBy(i), `Start renewing: ${i.name}`],
      [`exp-${i.id}`, i.expires, `Expires: ${i.name}`],
    ];
    for (const [uid, date, summary] of events) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}@renewal-radar.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(date)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`,
        fold(`SUMMARY:${icsEscape(summary)}`),
        fold(`DESCRIPTION:${icsEscape(`${i.kind}${i.owner ? ` for ${i.owner}` : ''}. Expires ${i.expires}; start renewing by ${startBy(i)}.`)}`),
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
