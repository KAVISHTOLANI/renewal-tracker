import { useMemo, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { DataTable, useTable, type Column } from './shared/table';
import { addDays, addMonths, daysBetween, formatDay, fromISO, relativeDays, todayISO } from './shared/dates';
import {
  KINDS,
  STATUS_LABEL,
  SUGGESTED_LEAD,
  byMonth,
  maskReference,
  renew,
  startBy,
  status,
  suggestNextExpiry,
  toICS,
  validateItem,
  validateRenewal,
  type Item,
  type ItemDraft,
  type Kind,
  type Status,
} from './lib/renewals';

const KEY = 'renewal-radar:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/radar', label: 'Radar' },
  { to: '/items', label: 'Everything' },
  { to: '/calendar', label: 'Calendar' },
];
const BADGE: Record<Status, string> = { expired: 'badge-err', 'act-now': 'badge-warn', plan: 'badge-plan', ok: 'badge-ok' };
const ORDER: Status[] = ['expired', 'act-now', 'plan', 'ok'];
const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0 });

interface Store {
  items: Item[];
}

export function demoItems(today: string): Item[] {
  const c = (...t: string[]) => t.map((text, i) => ({ id: `c${i}`, text, done: false }));
  const d = (id: string, p: Omit<Item, 'id' | 'checklist' | 'history' | 'demo' | 'notes'> & Partial<Item>): Item => ({ id: `demo-${id}`, checklist: [], history: [], notes: '', demo: true, ...p });
  return [
    d('passport-sam', { name: 'Passport', kind: 'Passport', owner: 'Sam', reference: 'P4821937', expires: addDays(today, 95), leadDays: 70, cost: 130, checklist: c('New photo (two copies)', 'Countersignatory details', 'Old passport to send'), history: [{ renewedOn: addMonths(today, -117), previousExpiry: addMonths(today, -117 + 1), newExpiry: addDays(today, 95), cost: 110 }] }),
    d('licence', { name: 'Driving licence', kind: 'Driving licence', owner: 'Sam', reference: 'SAMPL 704224 S99XY', expires: addDays(today, 30), leadDays: 42, cost: 14, checklist: c('Photo', 'Proof of address') }),
    d('car-ins', { name: 'Car insurance', kind: 'Insurance', owner: 'Household', reference: 'POL-55120-88', expires: addDays(today, 18), leadDays: 21, cost: 612, notes: 'Compare quotes before auto-renewal.' }),
    d('home-ins', { name: 'Home contents insurance', kind: 'Insurance', owner: 'Household', reference: 'HC-990213', expires: addDays(today, 210), leadDays: 21, cost: 186 }),
    d('gym', { name: 'Climbing gym membership', kind: 'Membership', owner: 'Robin', reference: 'M-3318', expires: addDays(today, -6), leadDays: 14, cost: 360 }),
    d('first-aid', { name: 'First aid at work certificate', kind: 'Certification', owner: 'Robin', reference: 'FA-2291-0', expires: addDays(today, 150), leadDays: 60, cost: 95, checklist: c('Book the two-day course', 'Ask manager for time off') }),
    d('visa', { name: 'Residence permit for Robin, including biometric enrolment appointment', kind: 'Visa or permit', owner: 'Robin', reference: 'RP-7745123', expires: addDays(today, 260), leadDays: 120, cost: 480 }),
    d('mot', { name: 'Vehicle safety inspection', kind: 'Vehicle', owner: 'Household', reference: '', expires: addDays(today, 64), leadDays: 30, cost: 55 }),
    d('domain', { name: 'Personal website domain', kind: 'Subscription', owner: 'Sam', reference: '', expires: addDays(today, 330), leadDays: 14, cost: 12 }),
    d('passport-robin', { name: 'Passport', kind: 'Passport', owner: 'Robin', reference: 'P5530018', expires: addMonths(today, 52), leadDays: 70, cost: 130 }),
  ];
}

export default function App() {
  const [route, navigate] = useRoute();
  const today = todayISO();
  const [store, setStore] = usePersistentState<Store>(KEY, () => ({ items: demoItems(today) }));
  const ctx = { store, setStore, today, navigate };
  const edit = route.match(/^\/item\/([^/]+)\/edit$/);
  const view = route.match(/^\/item\/([^/]+)$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/radar') page = <RadarPage {...ctx} />;
  else if (route === '/items') page = <Items {...ctx} />;
  else if (route === '/item/new') page = <ItemForm {...ctx} />;
  else if (edit) page = <ItemForm {...ctx} id={edit[1]} />;
  else if (view) page = <Detail {...ctx} id={view[1]} />;
  else if (route === '/calendar') page = <Calendar {...ctx} />;
  else page = <NotFound />;
  return (
    <Shell name="Renewal Radar" wordmark={['Renewal', 'Radar']} nav={NAV} route={route} cta={{ to: '/item/new', label: 'Add a renewal' }} footerNote="Reference numbers stay in this browser and are masked on screen. Check official sources for processing times.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; today: string; navigate: (to: string) => void };

/* ---------- Radar chart ---------- */
export function Radar({ items, today, size = 360, onPick }: { items: Item[]; today: string; size?: number; onPick?: (i: Item) => void }) {
  const [focus, setFocus] = useState<Item | null>(null);
  const R = 160, C = 180;
  const horizon = 365;
  const ring = (days: number) => 26 + Math.sqrt(Math.min(days, horizon) / horizon) * (R - 26); // square-root scale spreads out the near term
  const shown = items.filter((i) => daysBetween(today, startBy(i)) <= horizon);
  const later = items.length - shown.length;
  const sorted = [...shown].sort((a, b) => a.name.localeCompare(b.name) || a.owner.localeCompare(b.owner));
  return (
    <figure className="radar-fig">
      <svg viewBox="0 0 360 360" style={{ maxWidth: size }} className="radar" role="img" aria-label={`Radar of ${shown.length} renewals in the next 12 months. The closer to the centre, the sooner you need to start.`}>
        {[30, 90, 180, 365].map((d) => (
          <g key={d}>
            <circle cx={C} cy={C} r={ring(d)} className="radar-ring" />
            <text x={C + 4} y={C - ring(d) + 11} className="radar-lbl">{d === 365 ? '12 mo' : `${d / 30} mo`}</text>
          </g>
        ))}
        <line x1={C} y1={C - R} x2={C} y2={C + R} className="radar-axis" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} className="radar-axis" />
        <g className="radar-sweep"><path d={`M${C},${C} L${C},${C - R} A${R},${R} 0 0,1 ${C + R * Math.sin(Math.PI / 5)},${C - R * Math.cos(Math.PI / 5)} Z`} /></g>
        <circle cx={C} cy={C} r={12} className="radar-core" />
        <text x={C} y={C + 4} textAnchor="middle" className="radar-now">now</text>
        {sorted.map((i, n) => {
          const days = Math.max(0, daysBetween(today, startBy(i)));
          const angle = (n / Math.max(1, sorted.length)) * Math.PI * 2 + 0.4;
          const r = status(i, today) === 'expired' ? 20 : ring(days);
          const x = C + r * Math.sin(angle), y = C - r * Math.cos(angle);
          const s = status(i, today);
          const label = `${i.name}${i.owner ? ` (${i.owner})` : ''}: ${s === 'expired' ? 'expired' : `start ${relativeDays(daysBetween(today, startBy(i)))}`}`;
          return (
            <g key={i.id} className={`blip b-${s}`} transform={`translate(${x},${y})`} tabIndex={0} role="button" aria-label={label}
              onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(i)} onBlur={() => setFocus(null)}
              onClick={() => onPick?.(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick?.(i)} style={{ ['--i' as string]: n }}>
              <circle r={focus?.id === i.id ? 9 : 7} />
              <title>{label}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="stack-tight">
        <p className="legend"><span><i className="b-expired-k" />Expired</span><span><i className="b-act-now-k" />Start renewing now</span><span><i className="b-plan-k" />Start within 60 days</span><span><i className="b-ok-k" />Later</span></p>
        <p className="small muted" aria-live="polite">{focus ? `${focus.name}${focus.owner ? ` · ${focus.owner}` : ''} — start by ${formatDay(startBy(focus))}, expires ${formatDay(focus.expires)}` : `Rings show months until you should start. ${later ? `${later} item${later === 1 ? '' : 's'} beyond 12 months not shown.` : ''}`}</p>
      </figcaption>
    </figure>
  );
}

function HeroPreview() {
  const today = todayISO();
  return <div className="hero-rr"><Radar items={demoItems(today)} today={today} size={330} /></div>;
}

function Home() {
  return (
    <Landing
      eyebrow="Renewal tracker"
      title={<>Renew it <em>before it’s urgent.</em></>}
      lead="Passports, licences, permits, insurance and memberships all expire on different dates and take different amounts of time to renew. Renewal Radar works backwards from each expiry, so you know when to start, not just when it runs out."
      primary={{ href: '#/radar', label: 'Open the radar' }}
      secondary={{ href: '#/calendar', label: 'Export to your calendar' }}
      previewLabel="Next 12 months — demo household"
      preview={<HeroPreview />}
      steps={[
        { title: 'Add what expires', body: 'Name, type, owner, expiry date and how long renewal usually takes — with a suggested lead time per type.' },
        { title: 'Know when to start', body: 'Each item gets a “start renewing by” date. The radar shows what needs attention first.' },
        { title: 'Renew and record', body: 'Tick off the checklist, record the renewal and the new expiry is suggested from last time’s period.' },
      ]}
      stepsIntro="Renewal Radar opens with ten labelled demo items for a fictional household. Clear them when you’re ready."
      features={[
        { title: 'Lead times, not just dates', body: 'A passport that expires in three months may already be late to renew.' },
        { title: 'Masked references', body: 'Document numbers are hidden except the last four characters until you choose to reveal them.' },
        { title: 'Checklists', body: 'What you’ll need for each renewal — photo, proof of address — reset automatically after renewing.' },
        { title: 'Calendar export', body: 'Download an .ics file with “start renewing” and “expires” dates for any calendar app.' },
      ]}
      note="Processing times change. Check the issuing organisation’s current guidance before relying on a lead time."
      closing={{ title: <>Start with <em>your passport.</em></>, action: { href: '#/item/new', label: 'Add a renewal' } }}
    />
  );
}

/* ---------- Radar page ---------- */
function RadarPage({ store, setStore, today, navigate }: Ctx) {
  const counts = ORDER.map((s) => ({ s, n: store.items.filter((i) => status(i, today) === s).length }));
  const urgent = store.items.filter((i) => ['expired', 'act-now', 'plan'].includes(status(i, today))).sort((a, b) => startBy(a).localeCompare(startBy(b)));
  if (!store.items.length) return <EmptyState title="Nothing tracked yet" actions={<><a className="btn btn-primary" href="#/item/new">Add a renewal</a><button type="button" className="btn" onClick={() => setStore({ items: demoItems(today) })}>Load demo items</button></>}>Start with the document that would cause the most trouble if it lapsed.</EmptyState>;
  return (
    <div className="stack">
      <PageHead eyebrow="Radar" title={<>What needs <em>attention.</em></>} />
      <div className="stats">{counts.map(({ s, n }) => <div key={s} className="stat"><span className="stat-label">{STATUS_LABEL[s]}</span><span className="stat-value">{n}</span></div>)}</div>
      <div className="layout-main">
        <section className="card stack" aria-labelledby="todo-title">
          <h2 id="todo-title" className="h3">To act on</h2>
          {urgent.length === 0 ? <p className="muted">Nothing needs starting in the next 60 days.</p> : (
            <ul className="act-list">
              {urgent.map((i) => {
                const s = status(i, today);
                const open = i.checklist.filter((c) => !c.done).length;
                return (
                  <li key={i.id} className={`act s-${s}`}>
                    <div className="row-between"><a href={`#/item/${i.id}`} className="act-name">{i.name}{i.owner && <span className="muted"> · {i.owner}</span>}</a><span className={`badge ${BADGE[s]}`}>{STATUS_LABEL[s]}</span></div>
                    <span className="small muted">{s === 'expired' ? `Expired ${formatDay(i.expires)}` : `Start by ${formatDay(startBy(i))} (${relativeDays(daysBetween(today, startBy(i)))}) · expires ${formatDay(i.expires)}`}{open ? ` · ${open} checklist item${open === 1 ? '' : 's'} left` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="card"><Radar items={store.items} today={today} size={320} onPick={(i) => navigate(`/item/${i.id}`)} /></aside>
      </div>
    </div>
  );
}

/* ---------- Everything ---------- */
function Items({ store, setStore, today }: Ctx) {
  const [flash, setFlash] = useFlash();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [st, setSt] = useState('');
  const owners = [...new Set(store.items.map((i) => i.owner).filter(Boolean))].sort();
  const rows = useMemo(() => store.items.filter((i) => (!owner || i.owner === owner) && (!st || status(i, today) === st) && `${i.name} ${i.kind} ${i.notes}`.toLowerCase().includes(q.trim().toLowerCase())), [store, owner, st, q, today]);
  const columns: Column<Item>[] = [
    { key: 'name', label: 'Item', sort: (i) => i.name, render: (i) => <><a href={`#/item/${i.id}`}>{i.name}</a>{i.demo && <> <DemoTag /></>}<div className="small muted">{i.kind}{i.reference && <> · <span className="mono">{maskReference(i.reference)}</span></>}</div></> },
    { key: 'owner', label: 'For', sort: (i) => i.owner, render: (i) => i.owner || '—' },
    { key: 'start', label: 'Start by', sort: (i) => startBy(i), render: (i) => formatDay(startBy(i)) },
    { key: 'exp', label: 'Expires', sort: (i) => i.expires, render: (i) => formatDay(i.expires) },
    { key: 'lead', label: 'Lead time', num: true, sort: (i) => i.leadDays, render: (i) => `${i.leadDays} d` },
    { key: 'st', label: 'Status', sort: (i) => ORDER.indexOf(status(i, today)), render: (i) => <span className={`badge ${BADGE[status(i, today)]}`}>{STATUS_LABEL[status(i, today)]}</span> },
    { key: 'cost', label: 'Cost', num: true, sort: (i) => i.cost, render: (i) => (i.cost == null ? '—' : money(i.cost)) },
  ];
  const table = useTable(rows, columns, { initialSort: 'start' });
  return (
    <div className="stack">
      <PageHead eyebrow="Everything" title={<>Every expiry <em>in one list.</em></>} actions={<a className="btn btn-primary" href="#/item/new">Add renewal</a>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {store.items.length === 0 ? <EmptyState title="Nothing tracked yet" actions={<><a className="btn btn-primary" href="#/item/new">Add a renewal</a><button type="button" className="btn" onClick={() => setStore({ items: demoItems(today) })}>Load demo items</button></>} /> : (
        <div className="card stack">
          <div className="filters">
            <Field label="Search" className="grow">{(p) => <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, type or note" />}</Field>
            <Field label="For">{(p) => <select {...p} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Everyone</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>}</Field>
            <Field label="Status">{(p) => <select {...p} value={st} onChange={(e) => setSt(e.target.value)}><option value="">Any status</option>{ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>}</Field>
          </div>
          <DataTable caption="Renewals" columns={columns} table={table} rowKey={(i) => i.id} empty="Nothing matches these filters." />
          {store.items.some((i) => i.demo) && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStore({ items: store.items.filter((i) => !i.demo) }); setFlash({ kind: 'success', text: 'Demo items removed.' }); }}>Clear demo items</button></div>}
        </div>
      )}
    </div>
  );
}

function ItemForm({ store, setStore, today, navigate, id }: Ctx & { id?: string }) {
  const ex = id ? store.items.find((i) => i.id === id) : undefined;
  const [d, setD] = useState<ItemDraft>({ name: ex?.name ?? '', kind: ex?.kind ?? 'Passport', owner: ex?.owner ?? '', reference: ex?.reference ?? '', expires: ex?.expires ?? '', leadDays: String(ex?.leadDays ?? SUGGESTED_LEAD.Passport), cost: ex?.cost == null ? '' : String(ex.cost), notes: ex?.notes ?? '' });
  const [touchedLead, setTouchedLead] = useState(!!ex);
  const [submitted, setSubmitted] = useState(false);
  if (id && !ex) return <EmptyState title="Not found" actions={<a className="btn btn-primary" href="#/items">Back</a>} />;
  const errors = submitted ? validateItem(d) : {};
  const sb = !errors.expires && /^\d{4}-\d{2}-\d{2}$/.test(d.expires) && Number.isInteger(Number(d.leadDays)) ? startBy({ expires: d.expires, leadDays: Number(d.leadDays) }) : null;
  function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateItem(d)).length) return;
    const v = { name: d.name.trim(), kind: d.kind, owner: d.owner.trim(), reference: d.reference.trim(), expires: d.expires, leadDays: Number(d.leadDays), cost: d.cost.trim() ? Number(d.cost) : null, notes: d.notes.trim() };
    if (ex) { setStore({ items: store.items.map((i) => (i.id === ex.id ? { ...ex, ...v, demo: false } : i)) }); navigate(`/item/${ex.id}`); }
    else { const nid = uid('item'); setStore({ items: [...store.items, { ...v, id: nid, checklist: [], history: [] }] }); navigate(`/item/${nid}`); }
  }
  return (
    <div className="stack">
      <PageHead eyebrow={ex ? 'Edit' : 'New renewal'} title={ex ? <>Edit <em>{ex.name}</em></> : <>Add something <em>that expires.</em></>} />
      <form className="layout-main" onSubmit={save} noValidate>
        <div className="card stack">
          <div className="form-grid">
            <Field label="Name" error={errors.name}>{(p) => <input {...p} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Passport" />}</Field>
            <Field label="Type">{(p) => <select {...p} value={d.kind} onChange={(e) => { const k = e.target.value as Kind; setD({ ...d, kind: k, leadDays: touchedLead ? d.leadDays : String(SUGGESTED_LEAD[k]) }); }}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>}</Field>
            <Field label="Belongs to" hint="Optional">{(p) => <input {...p} value={d.owner} onChange={(e) => setD({ ...d, owner: e.target.value })} />}</Field>
            <Field label="Reference number" hint="Masked on screen">{(p) => <input {...p} className="mono" autoComplete="off" value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} />}</Field>
            <Field label="Expires" error={errors.expires}>{(p) => <input {...p} type="date" value={d.expires} onChange={(e) => setD({ ...d, expires: e.target.value })} />}</Field>
            <Field label="Start renewing this many days before" hint={`Suggested for ${d.kind}: ${SUGGESTED_LEAD[d.kind]} days`} error={errors.leadDays}>{(p) => <input {...p} inputMode="numeric" value={d.leadDays} onChange={(e) => { setTouchedLead(true); setD({ ...d, leadDays: e.target.value }); }} />}</Field>
            <Field label="Renewal cost (USD)" hint="Optional" error={errors.cost}>{(p) => <input {...p} inputMode="decimal" value={d.cost} onChange={(e) => setD({ ...d, cost: e.target.value })} />}</Field>
          </div>
          <Field label="Notes">{(p) => <textarea {...p} rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />}</Field>
          <div className="row"><button className="btn btn-primary" type="submit">{ex ? 'Save changes' : 'Save'}</button><a className="btn btn-ghost" href={ex ? `#/item/${ex.id}` : '#/items'}>Cancel</a></div>
        </div>
        <aside className="card stack" aria-live="polite">
          <p className="eyebrow">Start renewing by</p>
          {sb ? <><p className="display-num">{formatDay(sb)}</p><p className="small muted">{relativeDays(daysBetween(today, sb))} · expiry {relativeDays(daysBetween(today, d.expires))}</p>{sb < today && <Notice kind="warn">That start date has already passed — renew as soon as you can.</Notice>}</> : <p className="muted small">Enter an expiry date to see when to start.</p>}
        </aside>
      </form>
    </div>
  );
}

function Detail({ store, setStore, today, navigate, id }: Ctx & { id: string }) {
  const it = store.items.find((i) => i.id === id);
  const [reveal, setReveal] = useState(false);
  const [flash, setFlash] = useFlash();
  const [task, setTask] = useState('');
  const [rn, setRn] = useState<{ on: string; exp: string; cost: string } | null>(null);
  const [rnErr, setRnErr] = useState<string | null>(null);
  if (!it) return <EmptyState title="Not found" actions={<a className="btn btn-primary" href="#/items">Back to everything</a>}>It may have been deleted.</EmptyState>;
  const s = status(it, today);
  const update = (patch: Partial<Item>) => setStore({ items: store.items.map((i) => (i.id === it.id ? { ...i, ...patch } : i)) });
  const doneN = it.checklist.filter((c) => c.done).length;
  function doRenew(e: React.FormEvent) {
    e.preventDefault();
    const err = validateRenewal(it!, rn!.on, rn!.exp, rn!.cost, today);
    setRnErr(err);
    if (err) return;
    setStore({ items: store.items.map((i) => (i.id === it!.id ? renew(i, rn!.on, rn!.exp, rn!.cost.trim() ? Number(rn!.cost) : null) : i)) });
    setRn(null);
    setFlash({ kind: 'success', text: `Renewed — now expires ${formatDay(rn!.exp)}.` });
  }
  return (
    <div className="stack">
      <PageHead eyebrow={<><a href="#/items">Everything</a> / {it.kind}</>} title={<>{it.name}{it.owner && <em> · {it.owner}</em>}</>}
        actions={<><a className="btn" href={`#/item/${it.id}/edit`}>Edit</a><button type="button" className="btn btn-danger" onClick={() => { if (window.confirm(`Delete “${it.name}”?`)) { setStore({ items: store.items.filter((i) => i.id !== it.id) }); navigate('/items'); } }}>Delete</button></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {it.demo && <p><DemoTag /> <span className="small muted">Fictional demo item.</span></p>}
      <div className="stats">
        <div className="stat"><span className="stat-label">Status</span><span className="stat-value"><span className={`badge ${BADGE[s]}`}>{STATUS_LABEL[s]}</span></span></div>
        <div className="stat"><span className="stat-label">Start by</span><span className="stat-value" data-testid="start-by">{formatDay(startBy(it), { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        <div className="stat"><span className="stat-label">Expires</span><span className="stat-value">{formatDay(it.expires, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        <div className="stat"><span className="stat-label">Lead time</span><span className="stat-value">{it.leadDays} days</span></div>
      </div>
      <div className="layout-main">
        <section className="card stack" aria-labelledby="cl-title">
          <div className="card-title-row"><h2 id="cl-title" className="h3">Checklist</h2><span className="small muted">{doneN} of {it.checklist.length} done</span></div>
          {it.checklist.length > 0 && (
            <ul className="checks">
              {it.checklist.map((c) => (
                <li key={c.id}>
                  <label className="check"><input type="checkbox" checked={c.done} onChange={(e) => update({ checklist: it.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} /> <span className={c.done ? 'is-done' : ''}>{c.text}</span></label>
                  <button type="button" className="icon-btn" aria-label={`Remove “${c.text}”`} onClick={() => update({ checklist: it.checklist.filter((x) => x.id !== c.id) })}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <form className="filters" onSubmit={(e) => { e.preventDefault(); if (!task.trim()) return; update({ checklist: [...it.checklist, { id: uid('c'), text: task.trim(), done: false }] }); setTask(''); }}>
            <Field label="Add to checklist" className="grow">{(p) => <input {...p} value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Book appointment" />}</Field>
            <button className="btn" type="submit">Add</button>
          </form>
          <h2 className="h3">Renewal history</h2>
          {it.history.length === 0 ? <p className="muted small">No renewals recorded yet.</p> : (
            <div className="table-wrap"><table className="table"><caption className="sr-only">Renewal history</caption><thead><tr><th scope="col">Renewed</th><th scope="col">Was due</th><th scope="col">New expiry</th><th scope="col" className="num">Cost</th></tr></thead>
              <tbody>{[...it.history].reverse().map((h) => <tr key={h.renewedOn + h.newExpiry}><td>{formatDay(h.renewedOn)}</td><td>{formatDay(h.previousExpiry)}</td><td>{formatDay(h.newExpiry)}</td><td className="num">{h.cost == null ? '—' : money(h.cost)}</td></tr>)}</tbody></table></div>
          )}
        </section>
        <aside className="card stack">
          <h2 className="h3">Details</h2>
          <dl className="facts">
            <dt>Reference</dt>
            <dd>{it.reference ? <><span className="mono" data-testid="ref">{reveal ? it.reference : maskReference(it.reference)}</span> <button type="button" className="btn btn-ghost btn-sm" aria-pressed={reveal} onClick={() => setReveal(!reveal)}>{reveal ? 'Hide' : 'Show'}</button></> : '—'}</dd>
            <dt>Cost</dt><dd>{it.cost == null ? '—' : money(it.cost)}</dd>
            <dt>Notes</dt><dd>{it.notes || '—'}</dd>
          </dl>
          {rn ? (
            <form className="stack renew-form" onSubmit={doRenew} noValidate>
              <h3 className="label">Record a renewal</h3>
              <Field label="Renewed on">{(p) => <input {...p} type="date" max={today} value={rn.on} onChange={(e) => setRn({ ...rn, on: e.target.value })} />}</Field>
              <Field label="New expiry" hint="Suggested from the last renewal period" error={rnErr}>{(p) => <input {...p} type="date" value={rn.exp} onChange={(e) => setRn({ ...rn, exp: e.target.value })} />}</Field>
              <Field label="Cost paid (USD)">{(p) => <input {...p} inputMode="decimal" value={rn.cost} onChange={(e) => setRn({ ...rn, cost: e.target.value })} />}</Field>
              <div className="row"><button className="btn btn-primary" type="submit">Save renewal</button><button type="button" className="btn btn-ghost" onClick={() => setRn(null)}>Cancel</button></div>
            </form>
          ) : <button type="button" className="btn btn-primary" onClick={() => { setRnErr(null); setRn({ on: today, exp: suggestNextExpiry(it), cost: it.cost == null ? '' : String(it.cost) }); }}>I’ve renewed this</button>}
        </aside>
      </div>
    </div>
  );
}

/* ---------- Calendar ---------- */
function Calendar({ store, today }: Ctx) {
  const groups = byMonth(store.items, today, 12);
  const [flash, setFlash] = useFlash();
  function exportICS() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    downloadText('renewal-radar.ics', toICS(store.items, stamp), 'text/calendar');
    setFlash({ kind: 'success', text: `Downloaded ${store.items.length * 2} calendar events. Open the file to add them to your calendar.` });
  }
  return (
    <div className="stack">
      <PageHead eyebrow="Calendar" title={<>The year, <em>month by month.</em></>} description="Every “start renewing” and “expires” date in the next 12 months." actions={<button type="button" className="btn btn-primary" disabled={!store.items.length} onClick={exportICS}>Download .ics</button>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {groups.length === 0 ? <EmptyState title="Nothing in the next 12 months" actions={<a className="btn" href="#/items">See everything</a>} /> : (
        <ol className="months">
          {groups.map((g) => (
            <li key={g.month} className="card stack" data-reveal>
              <h2 className="h3">{fromISO(`${g.month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <ul className="list">
                {g.list.map((e) => (
                  <li key={e.item.id + e.what} className="row-between">
                    <span><span className={`kind-dot ${e.what}`} aria-hidden="true" /><a href={`#/item/${e.item.id}`}>{e.item.name}</a>{e.item.owner && <span className="muted"> · {e.item.owner}</span>}</span>
                    <span className="small">{e.what === 'start' ? 'Start renewing' : <strong>Expires</strong>} · {formatDay(e.date, { day: 'numeric', month: 'short' })} · {relativeDays(daysBetween(today, e.date))}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="legend"><span><i className="kind-dot start" />Start renewing</span><span><i className="kind-dot expires" />Expiry date</span><span className="muted">· through {formatDay(addMonths(today, 12))}</span></p>
      <p className="small muted">Last checked {formatDay(addDays(today, 0))}.</p>
    </div>
  );
}
