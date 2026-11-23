import { describe, expect, it } from 'vitest';
import { byMonth, maskReference, renew, startBy, status, suggestNextExpiry, toICS, validateItem, validateRenewal, type Item } from './renewals';

const today = '2026-11-23';
const item = (p: Partial<Item>): Item => ({ id: 'p', name: 'Passport', kind: 'Passport', owner: 'Sam', reference: 'X1234567', expires: '2027-03-01', leadDays: 70, cost: 88, notes: '', checklist: [{ id: 'c', text: 'Photo', done: true }], history: [], ...p });

describe('status', () => {
  it('works back from expiry with the lead time', () => {
    expect(startBy(item({}))).toBe('2026-12-21');
    expect(status(item({}), today)).toBe('plan');
    expect(status(item({}), '2026-12-21')).toBe('act-now');
    expect(status(item({}), '2027-03-01')).toBe('act-now');
    expect(status(item({}), '2027-03-02')).toBe('expired');
    expect(status(item({ expires: '2028-01-01' }), today)).toBe('ok');
  });
});

describe('references', () => {
  it('masks all but the last four characters', () => {
    expect(maskReference('X1234567')).toBe('••••4567');
    expect(maskReference('AB 12 34 56 C')).toBe('•••••456C');
    expect(maskReference('123')).toBe('•••');
    expect(maskReference('')).toBe('');
  });
});

describe('renewing', () => {
  it('suggests the same period as last time, or a year', () => {
    expect(suggestNextExpiry(item({}))).toBe('2028-03-01');
    const tenYear = item({ history: [{ renewedOn: '2016-01-01', previousExpiry: '2017-03-01', newExpiry: '2027-03-01', cost: 72 }] });
    expect(suggestNextExpiry(tenYear)).toBe('2037-03-01');
  });
  it('records history and resets the checklist', () => {
    const r = renew(item({}), today, '2037-03-01', 95);
    expect(r.expires).toBe('2037-03-01');
    expect(r.history).toEqual([{ renewedOn: today, previousExpiry: '2027-03-01', newExpiry: '2037-03-01', cost: 95 }]);
    expect(r.checklist[0].done).toBe(false);
  });
  it('validates renewals', () => {
    expect(validateRenewal(item({}), '2026-12-01', '2037-01-01', '', today)).toMatch(/today or earlier/);
    expect(validateRenewal(item({}), today, '2027-02-01', '', today)).toMatch(/after the current/);
    expect(validateRenewal(item({}), today, '2037-01-01', '-1', today)).toMatch(/Cost/);
    expect(validateRenewal(item({}), today, '2037-01-01', '', today)).toBeNull();
  });
  it('validates new items', () => {
    expect(Object.keys(validateItem({ name: '', kind: 'Other', owner: '', reference: '', expires: '', leadDays: '-1', cost: 'x', notes: '' })).sort()).toEqual(['cost', 'expires', 'leadDays', 'name']);
  });
});

describe('calendar views', () => {
  it('groups start-by and expiry events by month', () => {
    const g = byMonth([item({})], today, 12);
    expect(g.map((x) => [x.month, x.list.map((e) => e.what)])).toEqual([['2026-12', ['start']], ['2027-03', ['expires']]]);
  });
  it('exports a valid iCalendar file with escaped, folded text', () => {
    const ics = toICS([item({ name: 'Gym, pool; sauna', owner: '' })], '20261123T120000Z');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261221');
    expect(ics).toContain('DTEND;VALUE=DATE:20270302');
    expect(ics).toContain('SUMMARY:Expires: Gym\\, pool\\; sauna');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
