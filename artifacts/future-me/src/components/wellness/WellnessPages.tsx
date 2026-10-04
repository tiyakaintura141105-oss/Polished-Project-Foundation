import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'wouter';
import {
  Activity, ArrowRight, ArrowUpRight, BedDouble, CalendarDays, Check,
  Clock3, Compass, Dumbbell, Footprints, Heart, History,
  Moon, Plus, Sparkles, Sun, Trash2, Waves, X,
} from 'lucide-react';
import type { FeelingWellnessData, Profile, WellnessEntry, WellnessEntryInput } from '@workspace/api-client-react';
import { useWellness } from './use-wellness';
import './wellness.css';

export type WellnessPageId = 'dashboard' | 'future-me' | 'experiments' | 'sleep' | 'five-minute' | 'feelings' | 'periods' | 'history' | 'insights';
type WellnessData = Record<string, unknown>;
type ExperimentData = {
  title: string; goal: string; durationDays: number; metrics: string[]; notes?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled'; startedAt: string; endedAt?: string;
};
type CheckinData = { experimentKey: string; completed: boolean; rating: number; note?: string };
type SleepData = { bedtime: string; wakeTime: string; durationMinutes: number; quality: number; napMinutes?: number };
type FeelingData = { feeling: string; intensity: number; note?: string };
type EnergyData = { level: 10 | 30 | 50 | 70 | 90; action: string; completed: boolean };
type PeriodData = { startDate: string; endDate?: string; cycleLength?: number; flow?: string; symptoms?: string[]; mood?: string; notes?: string };

const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateOffset = (iso: string, amount: number) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const fmtDate = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => {
  if (!date) return 'Date not recorded';
  return new Intl.DateTimeFormat('en', options).format(new Date(`${date}T12:00:00`));
};
const dateKey = (kind: string, date = todayISO()) => `${kind}-${date}`;
const makeInput = (key: string, kind: WellnessEntryInput['kind'], date: string, data: WellnessEntryInput['data']): WellnessEntryInput => ({ key, kind, date, data });
const readData = <T,>(entry: WellnessEntry | undefined): T | undefined => entry?.data as unknown as T | undefined;
const sortNewest = (entries: WellnessEntry[]) => [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
const titleCase = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const getEntry = (entries: WellnessEntry[], kind: WellnessEntry['kind'], date = todayISO()) => entries.find((entry) => entry.kind === kind && entry.date === date);
const withinDays = (entries: WellnessEntry[], days: number) => {
  const end = todayISO();
  const start = dateOffset(end, -(days - 1));
  return entries.filter((entry) => entry.date >= start && entry.date <= end);
};

function PageHeading({ eyebrow, title, copy, date = false }: { eyebrow: string; title: ReactNode; copy: string; date?: boolean }) {
  return <header className="well-head">
    <div><span className="well-eyebrow">{eyebrow}</span><h1 className="well-title">{title}</h1><p className="well-subtitle">{copy}</p></div>
    {date && <div className="well-date" aria-label={fmtDate(todayISO(), { weekday: 'long', month: 'long', day: 'numeric' })}><b>{todayISO().slice(-2)}</b>{fmtDate(todayISO(), { weekday: 'short', month: 'short' })}</div>}
  </header>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`well-card ${className}`}>{children}</section>;
}
function CardHeading({ label, icon }: { label: string; icon?: ReactNode }) {
  return <div className="well-card-head"><span className="well-overline">{label}</span>{icon && <span className="well-icon">{icon}</span>}</div>;
}
function Feedback({ message, error }: { message: string; error: string }) {
  return <>{message && <div className="well-toast" role="status" data-testid="status-wellness-saved">{message}</div>}{error && <div className="well-error" role="alert" data-testid="status-wellness-error">{error}</div>}</>;
}
function LoadingState() {
  return <div className="well-grid two" aria-label="Loading your wellness entries" aria-busy="true"><div className="well-skeleton" /><div className="well-skeleton" /><div className="well-skeleton" /><div className="well-skeleton" /></div>;
}
function Empty({ title, copy, icon = <Waves size={19} /> }: { title: string; copy: string; icon?: ReactNode }) {
  return <div className="well-empty"><span className="well-empty-icon">{icon}</span><strong>{title}</strong><p>{copy}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="well-field"><label>{label}</label>{children}</div>;
}
function PeriodSwitch({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="well-period-switch" aria-label="Choose time range">
    {[7, 30].map((day) => <button type="button" key={day} aria-pressed={day === value} onClick={() => onChange(day)} data-testid={`button-period-${day}`}>{day} days</button>)}
  </div>;
}
function Chart({ entries, days }: { entries: WellnessEntry[]; days: number }) {
  const data = Array.from({ length: days }, (_, index) => {
    const date = dateOffset(todayISO(), index - (days - 1));
    return { date, count: entries.filter((entry) => entry.date === date).length };
  });
  const max = Math.max(1, ...data.map((item) => item.count));
  const labelsEvery = days === 7 ? 1 : 5;
  return <div className="well-chart" role="img" aria-label={`Number of personal check-ins recorded each day over ${days} days`}>
    {data.map((item, index) => <div className="well-chart-col" key={item.date} title={`${fmtDate(item.date)}: ${item.count} ${item.count === 1 ? 'entry' : 'entries'}`}>
      <b>{item.count || ''}</b><span className="well-chart-bar" style={{ height: `${Math.max(item.count ? 12 : 3, (item.count / max) * 100)}%` }} />
      {(days === 7 || index % labelsEvery === 0 || index === days - 1) && <small>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(`${item.date}T12:00:00`))}</small>}
    </div>)}
  </div>;
}
function Frame({ children }: { children: ReactNode }) {
  return <main className="wellness"><div className="well-shell">
    {children}
    <footer className="well-disclaimer">A personal record, not a medical assessment. Only the moments you choose to log appear here.</footer>
  </div></main>;
}
function QueryState({ retry }: { retry: () => void }) {
  return <div className="well-error" role="alert"><strong>We couldn’t open your wellbeing entries.</strong><p>Your space is still here. Please try again.</p><button className="well-btn secondary" onClick={retry} data-testid="button-wellness-retry">Try again <ArrowRight size={14} /></button></div>;
}

function WellBody({ pageId, profile, wellness }: { pageId: WellnessPageId; profile: Profile; wellness: ReturnType<typeof useWellness> }) {
  if (wellness.query.isLoading) return <Frame><LoadingState /></Frame>;
  if (wellness.query.isError) return <Frame><QueryState retry={() => wellness.query.refetch()} /></Frame>;
  const common = <Feedback message={wellness.message} error={wellness.mutationError} />;
  let content: ReactNode;
  switch (pageId) {
    case 'dashboard': content = <DashboardPage profile={profile} {...wellness} />; break;
    case 'future-me': content = <FuturePage {...wellness} />; break;
    case 'experiments': content = <ExperimentsPage {...wellness} />; break;
    case 'sleep': content = <SleepPage {...wellness} />; break;
    case 'five-minute': content = <FiveMinutePage {...wellness} />; break;
    case 'feelings': content = <FeelingsPage {...wellness} />; break;
    case 'periods': content = <PeriodsPage {...wellness} />; break;
    case 'history': content = <HistoryPage {...wellness} />; break;
    case 'insights': content = <InsightsPage {...wellness} />; break;
    default: content = <DashboardPage profile={profile} {...wellness} />;
  }
  return <Frame>{common}{content}</Frame>;
}

export function WellnessDashboard({ profile }: { profile: Profile }) {
  const wellness = useWellness();
  return <WellBody pageId="dashboard" profile={profile} wellness={wellness} />;
}

export function WellnessPage({ pageId, profile }: { pageId: WellnessPageId; profile: Profile }) {
  const wellness = useWellness();
  return <WellBody pageId={pageId} profile={profile} wellness={wellness} />;
}

function DashboardPage({ profile, entries, save, isSaving }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const today = todayISO();
  const stepsEntry = getEntry(entries, 'steps');
  const caloriesEntry = getEntry(entries, 'calories');
  const steps = readData<{ count: number }>(stepsEntry)?.count;
  const calories = readData<{ count: number }>(caloriesEntry)?.count;
  const activityTargets = { sedentary: 3500, 'lightly-active': 5500, 'moderately-active': 7500, 'very-active': 9000 };
  const stepTarget = activityTargets[profile.activityLevel];
  const activityMultiplier = { sedentary: 1.2, 'lightly-active': 1.375, 'moderately-active': 1.55, 'very-active': 1.725 }[profile.activityLevel];
  const baseEnergy = profile.sex === 'male'
    ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
    : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;
  const goalNudge = profile.goal === 'lose-weight' ? -250 : profile.goal === 'gain-weight' ? 200 : 0;
  const calorieTarget = Math.max(1200, Math.round((baseEnergy * activityMultiplier + goalNudge) / 50) * 50);
  const [stepValue, setStepValue] = useState('');
  const [calorieValue, setCalorieValue] = useState('');
  const recent = withinDays(entries, 7);
  const loggedDays = new Set(recent.map((entry) => entry.date)).size;
  const latestFeeling = sortNewest(entries.filter((entry) => entry.kind === 'feeling'))[0];
  const feel = readData<FeelingData>(latestFeeling)?.feeling;
  const record = (event: FormEvent, kind: 'steps' | 'calories', value: string) => {
    event.preventDefault();
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return;
    save(makeInput(dateKey(kind), kind, today, { count: Math.round(count) }), `${kind === 'steps' ? 'Movement' : 'Nutrition'} note saved for today.`);
    if (kind === 'steps') setStepValue('');
    else setCalorieValue('');
  };
  return <>
    <PageHeading eyebrow="YOUR DAILY SPACE" title={<>Good to see you,<br /><em>{profile.name.split(' ')[0]}.</em></>} copy="A few useful things to notice today. No score to chase, just your own rhythm." date />
    <div className="well-grid dashboard-grid">
      <Card>
        <CardHeading label="Your movement today" icon={<Footprints size={17} />} />
        <div className="well-steps-title"><div className="well-stat">{steps === undefined ? '—' : steps.toLocaleString()}</div><small>steps logged</small></div>
        <div className="well-progress" aria-label={`${steps ?? 0} of ${stepTarget} personal movement reference`}><span style={{ width: `${Math.min(100, ((steps ?? 0) / stepTarget) * 100)}%` }} /></div>
        <div className="well-progress-caption"><span>Personal reference · {stepTarget.toLocaleString()}</span><span>{steps === undefined ? 'No log yet' : `${Math.min(100, Math.round((steps / stepTarget) * 100))}%`}</span></div>
        <form className="well-form" onSubmit={(event) => record(event, 'steps', stepValue)} style={{ marginTop: 17 }}>
          <div className="well-form-row"><Field label="Add today’s steps"><input type="number" min="0" max="150000" inputMode="numeric" placeholder="e.g. 4,250" value={stepValue} onChange={(event) => setStepValue(event.target.value)} required data-testid="input-steps-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn" type="submit" disabled={isSaving} data-testid="button-log-steps"><Plus size={14} /> Log movement</button></div></div>
        </form>
      </Card>
      <Card className="dark">
        <div className="well-dark-copy">
          <CardHeading label="A thought for today" icon={<Sparkles size={17} />} />
          <h2>{loggedDays > 0 ? 'You showed up for yourself.' : 'Small things still count.'}</h2>
          <p>{loggedDays > 0 ? `You’ve left a note on ${loggedDays} of the last 7 days. That’s a useful beginning, exactly as it is.` : 'Start with whatever feels manageable. A single note is enough to begin seeing your own patterns.'}</p>
        </div>
        <div className="well-actions" style={{ position: 'relative', zIndex: 1, marginTop: 23 }}>
          <Link className="well-btn secondary" href="/feelings">Check in with yourself <ArrowRight size={14} /></Link>
        </div>
      </Card>
    </div>

    <div className="well-grid two well-section">
      <Card>
        <CardHeading label="A gentle nutrition reference" icon={<Activity size={17} />} />
        <div className="well-stat">{calorieTarget.toLocaleString()} <small>kcal / day</small></div>
        <p className="well-note">A broad estimate shaped by your profile and usual activity. It is a reference, not a prescription.</p>
        <div className="well-progress"><span style={{ width: `${Math.min(100, ((calories ?? 0) / calorieTarget) * 100)}%` }} /></div>
        <div className="well-progress-caption"><span>{calories === undefined ? 'No intake logged today' : `${calories.toLocaleString()} kcal noted`}</span><span>{calorieTarget.toLocaleString()} reference</span></div>
        <form className="well-form" onSubmit={(event) => record(event, 'calories', calorieValue)} style={{ marginTop: 15 }}>
          <div className="well-form-row"><Field label="Add a daily total"><input type="number" min="0" max="20000" inputMode="numeric" placeholder="kcal, if useful" value={calorieValue} onChange={(event) => setCalorieValue(event.target.value)} required data-testid="input-calories-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn secondary" type="submit" disabled={isSaving} data-testid="button-log-calories">Log total <ArrowRight size={14} /></button></div></div>
        </form>
      </Card>
      <Card>
        <CardHeading label="Your week, so far" icon={<CalendarDays size={17} />} />
        <div className="well-data-grid">
          <div className="well-data-cell"><span>Days with a note</span><strong>{loggedDays} / 7</strong></div>
          <div className="well-data-cell"><span>Recent check-in</span><strong>{feel ? titleCase(feel) : '—'}</strong></div>
          <div className="well-data-cell"><span>Entries this week</span><strong>{recent.length}</strong></div>
        </div>
        <p className="well-note">Your record only reflects what you’ve chosen to add. An empty day is simply an unrecorded day.</p>
      </Card>
    </div>

    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">A SMALL NEXT STEP</span><h2>Pick up where you are.</h2></div><Link className="well-link" href="/future-me">See your patterns <ArrowUpRight size={14} /></Link></div>
      <div className="well-shortcuts">
        <Link className="well-shortcut" href="/sleep"><Moon size={18} /><span>Note your sleep</span></Link>
        <Link className="well-shortcut" href="/five-minute"><Clock3 size={18} /><span>Find a five-minute action</span></Link>
        <Link className="well-shortcut" href="/experiments"><Sparkles size={18} /><span>Try a small experiment</span></Link>
        <Link className="well-shortcut" href="/history"><History size={18} /><span>Look back gently</span></Link>
      </div>
    </section>
  </>;
}

function FuturePage({ entries }: ReturnType<typeof useWellness>) {
  const [days, setDays] = useState(7);
  const scoped = withinDays(entries, days);
  const activeDates = new Set(scoped.map((entry) => entry.date));
  const checked = activeDates.size;
  const estimatedDays = Math.round((checked / days) * (days === 7 ? 7 : 30));
  const kinds = [...new Set(scoped.map((entry) => entry.kind))];
  const values = scoped.filter((entry) => entry.kind === 'steps').map((entry) => Number((entry.data as WellnessData).count)).filter(Number.isFinite);
  const avgSteps = values.length ? Math.round(values.reduce((sum, count) => sum + count, 0) / values.length) : null;
  const timeline = sortNewest(scoped).slice(0, 8);
  const projectedSpan = days === 7 ? 'the next 7 days' : 'the next 30 days';
  return <>
    <PageHeading eyebrow="A VIEW AHEAD" title={<>Future Me,<br /><em>with context.</em></>} copy="A small, explainable look at what your recent habits might look like if they continue. It is a reflection of your logs, not a promise." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="Your recent rhythm" icon={<Compass size={17} />} />
        <PeriodSwitch value={days} onChange={setDays} />
        {scoped.length ? <>
          <div className="well-grid two" style={{ marginTop: 17 }}>
            <div className="well-metric-box"><span>Days with a record</span><strong>{checked} of {days}</strong></div>
            <div className="well-metric-box"><span>Types of moments noted</span><strong>{kinds.length}</strong></div>
          </div>
          {avgSteps !== null && <p className="well-note">Across {values.length} movement {values.length === 1 ? 'log' : 'logs'}, your mean was {avgSteps.toLocaleString()} steps per logged day.</p>}
        </> : <div style={{ marginTop: 16 }}><Empty title="A little more time will help" copy={`There are no entries in this ${days}-day window yet. Add a few moments and a pattern can begin to take shape.`} /></div>}
      </Card>
      <Card className="dark">
        <div className="well-dark-copy">
          <CardHeading label="A behavior-only projection" icon={<Sparkles size={17} />} />
          {scoped.length ? <>
            <h2>At your current pace, around {estimatedDays} {estimatedDays === 1 ? 'day' : 'days'} with a note.</h2>
            <p>If the same logging rhythm continued into {projectedSpan}, you might add roughly this many recorded days. This is an arithmetic illustration, not a forecast of health or outcomes.</p>
          </> : <><h2>Your future is not filled in for you.</h2><p>There is not enough of your own activity here to make a projection. Nothing is assumed while you are getting started.</p></>}
        </div>
      </Card>
    </div>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">WHAT THE NOTES SHOW</span><h2>Recent moments</h2></div></div>
      {timeline.length ? <div className="well-timeline">{timeline.map((entry) => <div className="well-timeline-item" key={entry.key}><time>{fmtDate(entry.date)}</time><strong>{titleCase(entry.kind)}</strong><p>{entrySummary(entry)}</p></div>)}</div> : <Empty title="Your timeline starts here" copy="Your saved entries will appear in date order, without filling in the gaps." icon={<History size={19} />} />}
    </section>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">PATTERN, THEN POSSIBILITY</span><h2>Your own next step</h2></div></div>
      <div className="well-callout"><strong>{scoped.length ? 'One thing worth noticing: ' : 'When you are ready: '}</strong>{scoped.length ? `you have recorded ${kinds.length} ${kinds.length === 1 ? 'kind' : 'kinds'} of wellbeing moment${kinds.length === 1 ? '' : 's'} in this window. You could keep noticing whichever one feels most useful.` : 'choose one small habit to note for a few days. A pattern should come from your experience, not an assumption.'}</div>
    </section>
  </>;
}

function entrySummary(entry: WellnessEntry) {
  const data = entry.data as WellnessData;
  switch (entry.kind) {
    case 'steps': return `${Number(data.count).toLocaleString()} steps noted`;
    case 'calories': return `${Number(data.count).toLocaleString()} kcal noted`;
    case 'sleep': return `${Math.floor(Number(data.durationMinutes) / 60)}h ${Number(data.durationMinutes) % 60}m sleep noted`;
    case 'energy': return `${Number(data.level)}% energy · ${String(data.action ?? 'action selected')}${data.completed ? ' · completed' : ''}`;
    case 'feeling': return `${titleCase(String(data.feeling))} · intensity ${data.intensity}/10`;
    case 'experiment': return `${String(data.title)} · ${titleCase(String(data.status))}`;
    case 'experiment-checkin': return `Experiment check-in · rating ${data.rating}/5`;
    case 'period': return `Cycle start logged · ${fmtDate(String(data.startDate))}`;
    default: return 'Personal moment logged';
  }
}

function HistoryPage({ entries, deleteEntry, isSaving }: ReturnType<typeof useWellness>) {
  const [days, setDays] = useState(7);
  const records = sortNewest(withinDays(entries, days));
  return <>
    <PageHeading eyebrow="YOUR OWN STORY" title={<>History,<br /><em>without judgement.</em></>} copy="A chronological record of the moments you decided to keep. No entries are added for days you left blank." />
    <div className="well-section-head"><div><span className="well-eyebrow">YOUR RECORD</span><h2>{records.length} {records.length === 1 ? 'entry' : 'entries'}</h2></div><PeriodSwitch value={days} onChange={setDays} /></div>
    {records.length ? <div className="well-record-list">{records.map((entry) => <RecordRow key={entry.key} entry={entry} onDelete={() => { if (window.confirm('Remove this entry from your history?')) deleteEntry(entry.key); }} disabled={isSaving} />)}</div> : <Empty title="Nothing recorded in this window" copy="Choose a wider time range or add a note when you feel ready. An empty stretch is still yours." icon={<History size={19} />} />}
  </>;
}
function RecordRow({ entry, onDelete, disabled }: { entry: WellnessEntry; onDelete: () => void; disabled: boolean }) {
  const icons: Record<string, ReactNode> = { steps: <Footprints size={15} />, calories: <Activity size={15} />, sleep: <Moon size={15} />, feeling: <Heart size={15} />, energy: <Clock3 size={15} />, experiment: <Sparkles size={15} />, 'experiment-checkin': <Check size={15} />, period: <Waves size={15} /> };
  return <div className="well-record" data-testid={`row-history-${entry.id}`}>
    <div className="well-record-main"><span className="well-record-icon">{icons[entry.kind] ?? <Waves size={15} />}</span><div><div className="well-record-title">{titleCase(entry.kind)} <span className="well-record-meta">· {fmtDate(entry.date)}</span></div><div className="well-record-meta">{entrySummary(entry)}</div></div></div>
    <button className="well-btn ghost small" type="button" onClick={onDelete} disabled={disabled} aria-label={`Delete ${entry.kind} entry from ${fmtDate(entry.date)}`} data-testid={`button-delete-entry-${entry.id}`}><Trash2 size={13} /> Remove</button>
  </div>;
}

function InsightsPage({ entries }: ReturnType<typeof useWellness>) {
  const [days, setDays] = useState(7);
  const scoped = withinDays(entries, days);
  const daily = new Set(scoped.map((entry) => entry.date)).size;
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    scoped.forEach((entry) => counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);
  const sleepEntries = scoped.filter((entry) => entry.kind === 'sleep');
  const meanSleep = sleepEntries.length
    ? Math.round(sleepEntries.reduce((sum, entry) => sum + Number((entry.data as WellnessData).durationMinutes || 0), 0) / sleepEntries.length)
    : null;
  const stepEntries = scoped.filter((entry) => entry.kind === 'steps');
  const meanSteps = stepEntries.length
    ? Math.round(stepEntries.reduce((sum, entry) => sum + Number((entry.data as WellnessData).count || 0), 0) / stepEntries.length)
    : null;
  return <>
    <PageHeading eyebrow="A WIDER VIEW" title={<>Insights,<br /><em>shaped by you.</em></>} copy="Simple summaries of the notes you have chosen to keep. They describe what was logged, not why it happened." />
    <div className="well-section-head"><div><span className="well-eyebrow">YOUR WINDOW</span><h2>{days} days of your record</h2></div><PeriodSwitch value={days} onChange={setDays} /></div>
    {scoped.length ? <>
      <div className="well-grid two">
        <Card><CardHeading label="A rhythm of check-ins" icon={<Activity size={17} />} /><div className="well-stat">{daily} <small>days with entries</small></div><Chart entries={scoped} days={days} /><p className="well-note">Bars count your saved entries each day. They do not indicate a score or a goal.</p></Card>
        <Card><CardHeading label="What you chose to track" icon={<Compass size={17} />} />
          <div className="well-meter-list">{kindCounts.map(([kind, count]) => <div className="well-meter" key={kind}><span>{titleCase(kind)}</span><div className="well-progress"><span style={{ width: `${Math.max(5, (count / Math.max(...kindCounts.map((item) => item[1]))) * 100)}%` }} /></div><strong>{count}</strong></div>)}</div>
          <p className="well-note">A count of your own entries, not a comparison to anyone else.</p>
        </Card>
      </div>
      <section className="well-section"><div className="well-section-head"><div><span className="well-eyebrow">PLAIN-LANGUAGE SUMMARY</span><h2>What is in the record</h2></div></div>
        <div className="well-grid three">
          <div className="well-metric-box"><span>Entries noted</span><strong>{scoped.length}</strong></div>
          <div className="well-metric-box"><span>Average steps per movement log</span><strong>{meanSteps === null ? '—' : meanSteps.toLocaleString()}</strong></div>
          <div className="well-metric-box"><span>Average sleep per sleep log</span><strong>{meanSleep === null ? '—' : `${Math.floor(meanSleep / 60)}h ${meanSleep % 60}m`}</strong></div>
        </div>
        <p className="well-note" style={{ marginTop: 12 }}>{meanSleep === null && meanSteps === null ? 'No movement or sleep averages can be shown from this window yet.' : 'Averages use only the matching entries you logged in this window. They do not establish cause or effect.'}</p>
      </section>
    </> : <Empty title="Your insights need your own notes" copy="Once you have saved a few moments, this space will summarize only the patterns that are actually present in your record." icon={<Sparkles size={19} />} />}
  </>;
}

function SleepPage({ entries, save, isSaving }: ReturnType<typeof useWellness>) {
  const [bedtime, setBedtime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [quality, setQuality] = useState(3);
  const [nap, setNap] = useState('0');
  const [referenceHours, setReferenceHours] = useState(() => {
    if (typeof window === 'undefined') return 8;
    const stored = Number(window.localStorage.getItem('future-me-sleep-reference-hours'));
    return Number.isFinite(stored) && stored >= 4 && stored <= 12 ? stored : 8;
  });
  const recent = sortNewest(withinDays(entries.filter((entry) => entry.kind === 'sleep'), 14));
  const targetMinutes = referenceHours * 60;
  const sleepData = recent.map((entry) => readData<SleepData>(entry)).filter((item): item is SleepData => !!item);
  const averageMinutes = sleepData.length ? Math.round(sleepData.reduce((sum, item) => sum + item.durationMinutes, 0) / sleepData.length) : null;
  const bedtimeTimes = sleepData.map((item) => timeToMinutes(item.bedtime));
  const bedtimeSpan = bedtimeTimes.length >= 2 ? Math.max(...bedtimeTimes) - Math.min(...bedtimeTimes) : null;
  const consistency = bedtimeSpan === null ? null : Math.min(bedtimeSpan, 1440 - bedtimeSpan);
  const logSleep = (event: FormEvent) => {
    event.preventDefault();
    const start = timeToMinutes(bedtime);
    const end = timeToMinutes(wakeTime);
    const durationMinutes = (end - start + 1440) % 1440;
    if (durationMinutes < 1) return;
    save(makeInput(dateKey('sleep'), 'sleep', todayISO(), {
      bedtime, wakeTime, durationMinutes, quality, napMinutes: Math.max(0, Math.min(600, Number(nap) || 0)),
    }), 'Sleep note saved. Your rest belongs to your own record.');
  };
  const updateTarget = (value: number) => {
    setReferenceHours(value);
    window.localStorage.setItem('future-me-sleep-reference-hours', String(value));
  };
  return <>
    <PageHeading eyebrow="REST & RHYTHM" title={<>Sleep,<br /><em>in your own words.</em></>} copy="Record the shape of your rest and notice your rhythms. Estimates are based only on the details you choose to log." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="A sleep note for last night" icon={<Moon size={17} />} />
        <form className="well-form" onSubmit={logSleep}>
          <div className="well-form-row">
            <Field label="Bedtime"><input type="time" value={bedtime} onChange={(event) => setBedtime(event.target.value)} required data-testid="input-sleep-bedtime" /></Field>
            <Field label="Wake time"><input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} required data-testid="input-sleep-wake" /></Field>
          </div>
          <div className="well-form-row">
            <Field label="How rested did it feel?">
              <select value={quality} onChange={(event) => setQuality(Number(event.target.value))} data-testid="select-sleep-quality">
                {[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number} — {['Not rested', 'A little rested', 'Somewhat rested', 'Rested', 'Very rested'][number - 1]}</option>)}
              </select>
            </Field>
            <Field label="Nap, if any (minutes)"><input type="number" min="0" max="600" value={nap} onChange={(event) => setNap(event.target.value)} data-testid="input-sleep-nap" /></Field>
          </div>
          <p className="well-inline-note">A sleep span crossing midnight is calculated automatically. Nap minutes are kept separately.</p>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={isSaving} data-testid="button-save-sleep"><Check size={14} /> Save sleep note</button></div>
        </form>
      </Card>
      <Card>
        <CardHeading label="Your recent rest" icon={<BedDouble size={17} />} />
        {averageMinutes === null ? <Empty title="No sleep notes yet" copy="A few nights of your own notes will make these summaries useful." icon={<Moon size={18} />} /> : <>
          <div className="well-data-grid">
            <div className="well-data-cell"><span>Recent average</span><strong>{Math.floor(averageMinutes / 60)}h {averageMinutes % 60}m</strong></div>
            <div className="well-data-cell"><span>Personal reference</span><strong>{referenceHours}h</strong></div>
            <div className="well-data-cell"><span>Difference from reference</span><strong>{averageMinutes < targetMinutes ? `−${Math.floor((targetMinutes - averageMinutes) / 60)}h ${(targetMinutes - averageMinutes) % 60}m` : 'At or above'}</strong></div>
          </div>
          <p className="well-note">{consistency === null ? 'Log at least two nights to compare your bedtime range.' : `Your logged bedtimes span about ${Math.floor(consistency / 60)}h ${consistency % 60}m in this recent sample.`}</p>
        </>}
        <div style={{ marginTop: 15 }}>
          <Field label="Your own reference target (hours)">
            <select value={referenceHours} onChange={(event) => updateTarget(Number(event.target.value))} data-testid="select-sleep-reference">
              {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((hour) => <option key={hour} value={hour}>{hour} hours</option>)}
            </select>
          </Field>
        </div>
        {averageMinutes !== null && averageMinutes < targetMinutes && <div className="well-callout" style={{ marginTop: 14 }}><strong>A gentle option: </strong>if it suits your day, you could make a little more room for rest tonight. This is a comparison with your chosen reference, not a health assessment.</div>}
      </Card>
    </div>
    <section className="well-section"><div className="well-section-head"><div><span className="well-eyebrow">RECENT NIGHTS</span><h2>What you’ve noted</h2></div></div>
      {recent.length ? <div className="well-record-list">{recent.slice(0, 7).map((entry) => {
        const sleep = readData<SleepData>(entry)!;
        return <div className="well-record" key={entry.key}><div className="well-record-main"><span className="well-record-icon"><Moon size={15} /></span><div><div className="well-record-title">{fmtDate(entry.date)}</div><div className="well-record-meta">{sleep.bedtime} to {sleep.wakeTime} · quality {sleep.quality}/5{sleep.napMinutes ? ` · ${sleep.napMinutes}m nap` : ''}</div></div></div><strong className="well-record-value">{Math.floor(sleep.durationMinutes / 60)}h {sleep.durationMinutes % 60}m</strong></div>;
      })}</div> : <Empty title="Your first sleep note will live here" copy="Nothing is prefilled. Start with last night whenever you are ready." icon={<Moon size={18} />} />}
    </section>
  </>;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

const energyActions: Record<EnergyData['level'], string> = {
  10: 'Take a slow breath, then let one thing wait.',
  30: 'Step away from your screen for a quiet moment.',
  50: 'Stretch your shoulders and take a short walk.',
  70: 'Choose one small task and give it five focused minutes.',
  90: 'Use a little of this energy on something you enjoy.',
};
function FiveMinutePage({ entries, save, isSaving }: ReturnType<typeof useWellness>) {
  const [level, setLevel] = useState<EnergyData['level'] | null>(null);
  const action = level === null ? '' : energyActions[level];
  const history = sortNewest(entries.filter((entry) => entry.kind === 'energy')).slice(0, 8);
  const completeAction = () => {
    if (level === null) return;
    save(makeInput(`energy-${todayISO()}-${Date.now()}`, 'energy', todayISO(), { level, action, completed: true }), 'Your five-minute moment is saved. Well done for choosing it.');
  };
  return <>
    <PageHeading eyebrow="A MOMENT THAT FITS" title={<>Five minutes,<br /><em>at your pace.</em></>} copy="Choose how much energy you have right now. We’ll offer one small option to match; you can change your mind at any time." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="How much energy is here?" icon={<Sun size={17} />} />
        <div className="well-energy-actions" role="group" aria-label="Choose current energy level">
          {([10, 30, 50, 70, 90] as const).map((value) => <button type="button" key={value} aria-pressed={level === value} onClick={() => setLevel(value)} data-testid={`button-energy-${value}`}><span>{value}%</span><small>{value < 30 ? 'Very low' : value < 50 ? 'Low' : value < 70 ? 'Steady' : value < 90 ? 'Good' : 'Plenty'}</small></button>)}
        </div>
        {level !== null ? <div className="well-action-panel" style={{ marginTop: 17 }} aria-live="polite"><span className="well-overline">A MATCHED FIVE-MINUTE OPTION</span><strong style={{ marginTop: 7 }}>{action}</strong><p>Only a suggestion. Keep it, adapt it, or leave it for later.</p></div> : <div className="well-callout" style={{ marginTop: 17 }}>There is no ideal answer. Choose the number that feels closest in this moment.</div>}
        <div className="well-actions" style={{ marginTop: 16 }}><button type="button" className="well-btn" onClick={completeAction} disabled={level === null || isSaving} data-testid="button-complete-five-minute"><Check size={14} /> I did this</button><button type="button" className="well-btn ghost" onClick={() => setLevel(null)} disabled={level === null} data-testid="button-reset-energy">Start over</button></div>
      </Card>
      <Card>
        <CardHeading label="Your recent moments" icon={<Clock3 size={17} />} />
        {history.length ? <div className="well-timeline">{history.map((entry) => {
          const data = readData<EnergyData>(entry)!;
          return <div className="well-timeline-item" key={entry.key}><time>{fmtDate(entry.date, { month: 'short', day: 'numeric' })} · {data.level}% energy</time><strong>{data.action}</strong><p>{data.completed ? 'Marked as completed' : 'Saved as an option'}</p></div>;
        })}</div> : <Empty title="No moments to look back on" copy="Completed actions you choose to save will appear here." icon={<Clock3 size={18} />} />}
      </Card>
    </div>
  </>;
}

const feelingOptions: { value: FeelingWellnessData['feeling']; title: string }[] = [
  { value: 'tired', title: 'Tired' },
  { value: 'stressed', title: 'Stressed' },
  { value: 'low mood', title: 'Low mood' },
  { value: 'energetic', title: 'Energetic' },
  { value: 'bloated', title: 'Bloated' },
  { value: 'headache', title: 'Headache' },
  { value: 'poor focus', title: 'Poor focus' },
  { value: 'good', title: 'Good' },
  { value: 'other', title: 'Something else' },
];
function FeelingsPage({ entries, save, isSaving }: ReturnType<typeof useWellness>) {
  const [feeling, setFeeling] = useState<FeelingWellnessData['feeling'] | ''>('');
  const [intensity, setIntensity] = useState(5);
  const [note, setNote] = useState('');
  const saveFeeling = (event: FormEvent) => {
    event.preventDefault();
    if (!feeling) return;
    save(makeInput(dateKey(`feeling-${Date.now()}`), 'feeling', todayISO(), { feeling, intensity, note: note.trim() || undefined }), 'Your check-in has been added to your personal record.');
    setNote('');
  };
  const loggedFeelings = sortNewest(entries.filter((entry) => entry.kind === 'feeling'));
  const sortedCounts = new Map<string, number>();
  loggedFeelings.forEach((entry) => {
    const value = String((entry.data as WellnessData).feeling);
    sortedCounts.set(value, (sortedCounts.get(value) ?? 0) + 1);
  });
  const mostLogged = [...sortedCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const feelingDates = new Set(loggedFeelings.map((entry) => entry.date));
  const sleepDays = new Set(entries.filter((entry) => entry.kind === 'sleep').map((entry) => entry.date));
  const sharedDays = [...feelingDates].filter((date) => sleepDays.has(date)).length;
  const recent = loggedFeelings.slice(0, 6);
  return <>
    <PageHeading eyebrow="A CHECK-IN WITH YOURSELF" title={<>How are you,<br /><em>right now?</em></>} copy="Name what is present without needing to explain it. Your notes belong to you, and an association is only a coincidence worth noticing." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="Make a feelings note" icon={<Heart size={17} />} />
        <form className="well-form" onSubmit={saveFeeling}>
          <span className="well-label">What feels closest today?</span>
          <div className="well-choice-row" role="group" aria-label="Choose a feeling">
            {feelingOptions.map((option) => <button type="button" key={option.value} className="well-choice" aria-pressed={feeling === option.value} onClick={() => setFeeling(option.value)} data-testid={`button-feeling-${option.value.replaceAll(' ', '-')}`}>{option.title}</button>)}
          </div>
          <Field label={`Intensity · ${intensity} of 10`}><input className="well-range" type="range" min="1" max="10" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} aria-label={`Feeling intensity ${intensity} of 10`} data-testid="input-feeling-intensity" /></Field>
          <Field label="A note for yourself (optional)"><textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything you want to remember about this moment…" data-testid="input-feeling-note" /></Field>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={!feeling || isSaving} data-testid="button-save-feeling"><Check size={14} /> Save this check-in</button></div>
        </form>
      </Card>
      <Card>
        <CardHeading label="Your own patterns" icon={<Compass size={17} />} />
        {loggedFeelings.length < 3 ? <div className="well-callout"><strong>A low-data space. </strong>After a few check-ins, you can notice what else was happening on the same days. We won’t infer a cause from too little information.</div> : <>
          <div className="well-metric-box"><span>Most noted in your {loggedFeelings.length} feeling logs</span><strong>{mostLogged ? titleCase(mostLogged[0]) : '—'}{mostLogged && <small style={{ fontSize: 11, color: '#819388' }}> · {mostLogged[1]} times</small>}</strong></div>
          {sharedDays >= 3
            ? <div className="well-callout" style={{ marginTop: 13 }}><strong>Just an association: </strong>you logged both sleep and a feeling on {sharedDays} of the same days. This overlap does not tell us whether one affected the other.</div>
            : <div className="well-callout" style={{ marginTop: 13 }}>There are not yet three days with both a sleep and feeling note. We’ll keep the interpretation open.</div>}
        </>}
        <p className="well-note">Feeling counts show only what you chose to name. They are not a diagnosis, score, or judgement.</p>
      </Card>
    </div>
    <section className="well-section"><div className="well-section-head"><div><span className="well-eyebrow">RECENT CHECK-INS</span><h2>What you named</h2></div></div>
      {recent.length ? <div className="well-record-list">{recent.map((entry) => {
        const data = readData<FeelingData>(entry)!;
        return <div className="well-record" key={entry.key}><div className="well-record-main"><span className="well-record-icon"><Heart size={15} /></span><div><div className="well-record-title">{titleCase(data.feeling)} · {data.intensity}/10</div><div className="well-record-meta">{fmtDate(entry.date)}{data.note ? ` · ${data.note}` : ''}</div></div></div></div>;
      })}</div> : <Empty title="A place to begin, whenever you like" copy="Your check-ins will stay in your own words. Nothing is assumed before your first note." icon={<Heart size={18} />} />}
    </section>
  </>;
}

const cycleSymptoms = ['Cramps', 'Tenderness', 'Bloating', 'Headache', 'Low energy', 'No symptoms'];
function PeriodsPage({ entries, save, isSaving, deleteEntry }: ReturnType<typeof useWellness>) {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [cycleLength, setCycleLength] = useState('');
  const [flow, setFlow] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [mood, setMood] = useState('');
  const [notes, setNotes] = useState('');
  const cycles = sortNewest(entries.filter((entry) => entry.kind === 'period'));
  const cycleData = cycles.map((entry) => ({ entry, data: readData<PeriodData>(entry)! }));
  const mostRecent = cycleData[0];
  const averageCycle = (() => {
    if (mostRecent?.data.cycleLength) return mostRecent.data.cycleLength;
    if (cycleData.length >= 2) {
      const gaps = cycleData.slice(0, -1).map((cycle, index) => Math.abs(Math.round((new Date(`${cycleData[index + 1].data.startDate}T12:00:00`).getTime() - new Date(`${cycle.data.startDate}T12:00:00`).getTime()) / 86400000))).filter((gap) => gap >= 15 && gap <= 90);
      return gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null;
    }
    return null;
  })();
  const estimatedStart = mostRecent && averageCycle ? dateOffset(mostRecent.data.startDate, averageCycle) : null;
  const toggleSymptom = (item: string) => setSymptoms((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  const logCycle = (event: FormEvent) => {
    event.preventDefault();
    if (endDate && endDate < startDate) return;
    const data: PeriodData = {
      startDate, endDate: endDate || undefined, cycleLength: cycleLength ? Number(cycleLength) : undefined,
      flow: flow || undefined, symptoms: symptoms.length ? symptoms : undefined, mood: mood || undefined, notes: notes.trim() || undefined,
    };
    save(makeInput(dateKey('period', startDate), 'period', startDate, data), 'Cycle note saved. Dates remain yours to interpret.');
    setEndDate(''); setCycleLength(''); setFlow(''); setSymptoms([]); setMood(''); setNotes('');
  };
  return <>
    <PageHeading eyebrow="YOUR BODY, YOUR RHYTHM" title={<>Periods,<br /><em>simply recorded.</em></>} copy="A private place to keep cycle dates and notes. Dates ahead are estimates from your own logs, never a diagnosis." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="Add a cycle note" icon={<Waves size={17} />} />
        <form className="well-form" onSubmit={logCycle}>
          <div className="well-form-row"><Field label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required data-testid="input-period-start" /></Field><Field label="End date (optional)"><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} data-testid="input-period-end" /></Field></div>
          <div className="well-form-row"><Field label="Cycle length (optional)"><input type="number" min="15" max="90" placeholder="Days" value={cycleLength} onChange={(event) => setCycleLength(event.target.value)} data-testid="input-period-length" /></Field><Field label="Flow (optional)"><select value={flow} onChange={(event) => setFlow(event.target.value)} data-testid="select-period-flow"><option value="">Choose if useful</option>{['Light', 'Medium', 'Heavy', 'Spotting', 'Prefer not to say'].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div>
          <div className="well-field"><span className="well-label">Symptoms, if you want to note them</span><div className="well-check-row">{cycleSymptoms.map((item) => <label key={item}><input type="checkbox" checked={symptoms.includes(item)} onChange={() => toggleSymptom(item)} data-testid={`checkbox-period-symptom-${item.toLowerCase().replaceAll(' ', '-')}`} />{item}</label>)}</div></div>
          <div className="well-form-row"><Field label="Mood (optional)"><input maxLength={80} value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Your words" data-testid="input-period-mood" /></Field><Field label="A note (optional)"><input maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything to remember" data-testid="input-period-notes" /></Field></div>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={isSaving} data-testid="button-save-period"><Check size={14} /> Save cycle note</button></div>
        </form>
      </Card>
      <Card>
        <CardHeading label="A date, clearly estimated" icon={<CalendarDays size={17} />} />
        {estimatedStart ? <>
          <span className="well-overline">POSSIBLE NEXT START · ESTIMATE</span>
          <div className="well-stat" style={{ marginTop: 10 }}>{fmtDate(estimatedStart, { month: 'long', day: 'numeric' })}</div>
          <p className="well-note">Based on a {averageCycle}-day interval from your own recorded cycle. Bodies vary; this date may not match what happens.</p>
        </> : <Empty title="Not enough cycle history yet" copy="Log a cycle length or another start date before an estimate can be shown. Nothing is predicted from a single unmeasured date." icon={<CalendarDays size={18} />} />}
        <div className="well-callout" style={{ marginTop: 15 }}>Cycle dates can vary. This tool only organizes the information you add and cannot assess symptoms or health.</div>
      </Card>
    </div>
    <section className="well-section"><div className="well-section-head"><div><span className="well-eyebrow">YOUR CYCLE LOG</span><h2>{cycles.length} {cycles.length === 1 ? 'cycle note' : 'cycle notes'}</h2></div></div>
      {cycleData.length ? <div className="well-record-list">{cycleData.map(({ entry, data }) => <div className="well-record" key={entry.key}><div className="well-record-main"><span className="well-record-icon"><Waves size={15} /></span><div><div className="well-record-title">Started {fmtDate(data.startDate)}</div><div className="well-record-meta">{data.endDate ? `Ended ${fmtDate(data.endDate)}` : 'End date not recorded'}{data.flow ? ` · ${data.flow} flow` : ''}{data.symptoms?.length ? ` · ${data.symptoms.join(', ')}` : ''}{data.mood ? ` · ${data.mood}` : ''}</div></div></div><button type="button" className="well-btn ghost small" disabled={isSaving} onClick={() => { if (window.confirm('Remove this cycle note from your personal record?')) deleteEntry(entry.key); }} aria-label={`Delete cycle note from ${fmtDate(data.startDate)}`}><Trash2 size={13} /> Remove</button></div>)}</div> : <Empty title="Your cycle history starts with you" copy="No dates are filled in. Add a note only when you choose." icon={<Waves size={18} />} />}
    </section>
  </>;
}

const experimentTemplates = [
  { title: 'A short walk after lunch', goal: 'Notice how a brief walk fits into my afternoon.', duration: 7, metrics: 'energy, mood, ease' },
  { title: 'A softer evening wind-down', goal: 'Notice what helps me make a little room before bed.', duration: 14, metrics: 'ease, bedtime, rest' },
  { title: 'A water reminder', goal: 'See whether a gentle reminder fits naturally into my day.', duration: 7, metrics: 'focus, energy, ease' },
];
function ExperimentsPage({ entries, save, isSaving }: ReturnType<typeof useWellness>) {
  const [openCreate, setOpenCreate] = useState(false);
  const [template, setTemplate] = useState('');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [duration, setDuration] = useState('7');
  const [metrics, setMetrics] = useState('');
  const [baseline, setBaseline] = useState('');
  const [checkinFor, setCheckinFor] = useState('');
  const experiments = sortNewest(entries.filter((entry) => entry.kind === 'experiment'));
  const checkins = sortNewest(entries.filter((entry) => entry.kind === 'experiment-checkin'));
  const clearForm = () => { setTemplate(''); setTitle(''); setGoal(''); setDuration('7'); setMetrics(''); setBaseline(''); };
  const applyTemplate = (value: string) => {
    setTemplate(value);
    const selected = experimentTemplates[Number(value)];
    if (selected) {
      setTitle(selected.title); setGoal(selected.goal); setDuration(String(selected.duration)); setMetrics(selected.metrics);
    } else clearForm();
  };
  const createExperiment = (event: FormEvent) => {
    event.preventDefault();
    const key = `experiment-${todayISO()}-${Math.random().toString(36).slice(2, 9)}`;
    const notes = baseline.trim() ? `Starting observation: ${baseline.trim()}` : undefined;
    const data: ExperimentData = {
      title: title.trim(), goal: goal.trim(), durationDays: Number(duration),
      metrics: metrics.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8),
      notes, status: 'active', startedAt: todayISO(),
    };
    save(makeInput(key, 'experiment', todayISO(), data), 'Your experiment is ready. Keep it small and see what you notice.');
    setOpenCreate(false);
    clearForm();
  };
  const changeStatus = (entry: WellnessEntry, data: ExperimentData, status: ExperimentData['status']) => {
    if (status === 'cancelled' && !window.confirm(`Cancel “${data.title}”? Its notes will stay in your history.`)) return;
    const updated: ExperimentData = { ...data, status, endedAt: status === 'completed' || status === 'cancelled' ? todayISO() : undefined };
    save(makeInput(entry.key, 'experiment', entry.date, updated), status === 'paused' ? 'Experiment paused. You can resume it whenever you like.' : status === 'active' ? 'Experiment resumed.' : `Experiment marked ${status}.`);
  };
  return <>
    <PageHeading eyebrow="A SMALL EXPERIMENT" title={<>Try something,<br /><em>learn gently.</em></>} copy="Choose one small thing to explore for a few days. Notice what you experience, without treating it like a test you can pass or fail." />
    <div className="well-grid two">
      <Card className="dark"><div className="well-dark-copy"><CardHeading label="Curiosity, not a challenge" icon={<Sparkles size={17} />} /><h2>Keep the question gentle.</h2><p>Experiments are observations about your own days. They do not prove what caused a change, and you can pause or stop at any time.</p></div>
        <div className="well-actions" style={{ position: 'relative', zIndex: 1, marginTop: 20 }}><button className="well-btn secondary" type="button" onClick={() => { clearForm(); setOpenCreate(true); }} data-testid="button-new-experiment"><Plus size={14} /> Start an experiment</button></div>
      </Card>
      <Card><CardHeading label="A few ways to begin" icon={<Dumbbell size={17} />} />
        <div className="well-record-list">{experimentTemplates.map((item) => <div className="well-record" key={item.title}><div><div className="well-record-title">{item.title}</div><div className="well-record-meta">{item.duration} days · notice {item.metrics}</div></div><button className="well-btn ghost small" onClick={() => { applyTemplate(String(experimentTemplates.indexOf(item))); setOpenCreate(true); }} type="button" data-testid={`button-template-${experimentTemplates.indexOf(item)}`}>Try this <ArrowRight size={12} /></button></div>)}</div>
      </Card>
    </div>
    <section className="well-section"><div className="well-section-head"><div><span className="well-eyebrow">YOUR PERSONAL EXPERIMENTS</span><h2>{experiments.length} {experiments.length === 1 ? 'experiment' : 'experiments'}</h2></div></div>
      {experiments.length ? <div className="well-grid two">{experiments.map((entry) => {
        const data = readData<ExperimentData>(entry)!;
        const related = checkins.filter((item) => (item.data as unknown as CheckinData).experimentKey === entry.key);
        const averageRating = related.length ? (related.reduce((sum, item) => sum + Number((item.data as unknown as CheckinData).rating), 0) / related.length).toFixed(1) : null;
        return <ExperimentCard key={entry.key} entry={entry} data={data} checkins={related} averageRating={averageRating} isSaving={isSaving} checkinOpen={checkinFor === entry.key} setCheckinOpen={() => setCheckinFor(checkinFor === entry.key ? '' : entry.key)} save={save} changeStatus={changeStatus} />;
      })}</div> : <Empty title="Nothing to experiment with yet" copy="Start with a template or make your own gentle question. You choose the pace." icon={<Sparkles size={19} />} />}
    </section>
    {openCreate && <div className="well-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpenCreate(false); clearForm(); } }}>
      <section className="well-dialog" role="dialog" aria-modal="true" aria-labelledby="well-exp-title">
        <div className="well-dialog-head"><div><span className="well-eyebrow">START SMALL</span><h2 id="well-exp-title">Set up an experiment</h2></div><button className="well-close" type="button" aria-label="Close experiment form" onClick={() => { setOpenCreate(false); clearForm(); }} data-testid="button-close-experiment"><X size={16} /></button></div>
        <form className="well-form" onSubmit={createExperiment}>
          <Field label="Start with a template (optional)"><select value={template} onChange={(event) => applyTemplate(event.target.value)} data-testid="select-experiment-template"><option value="">Make my own</option>{experimentTemplates.map((item, index) => <option value={index} key={item.title}>{item.title}</option>)}</select></Field>
          <Field label="What will you try?"><input maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A short walk after lunch" data-testid="input-experiment-title" /></Field>
          <Field label="What would you like to notice?"><textarea maxLength={500} required value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Keep the question open and kind." data-testid="input-experiment-goal" /></Field>
          <div className="well-form-row"><Field label="Duration (days)"><input type="number" min="1" max="90" required value={duration} onChange={(event) => setDuration(event.target.value)} data-testid="input-experiment-duration" /></Field><Field label="Things to notice (comma separated)"><input maxLength={400} required value={metrics} onChange={(event) => setMetrics(event.target.value)} placeholder="energy, ease" data-testid="input-experiment-metrics" /></Field></div>
          <Field label="Starting observation (optional)"><textarea maxLength={1000} value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="What is your starting point, in your own words?" data-testid="input-experiment-baseline" /></Field>
          <p className="well-inline-note">This starting note and your later check-ins are observations, not a controlled comparison.</p>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={isSaving || !metrics.split(',').some((metric) => metric.trim())} data-testid="button-save-experiment"><Check size={14} /> Begin gently</button><button className="well-btn ghost" type="button" onClick={() => { setOpenCreate(false); clearForm(); }}>Not now</button></div>
        </form>
      </section>
    </div>}
  </>;
}

function ExperimentCard({ entry, data, checkins, averageRating, isSaving, checkinOpen, setCheckinOpen, save, changeStatus }: {
  entry: WellnessEntry; data: ExperimentData; checkins: WellnessEntry[]; averageRating: string | null; isSaving: boolean;
  checkinOpen: boolean; setCheckinOpen: () => void;
  save: ReturnType<typeof useWellness>['save'];
  changeStatus: (entry: WellnessEntry, data: ExperimentData, status: ExperimentData['status']) => void;
}) {
  const [rating, setRating] = useState(3);
  const [completed, setCompleted] = useState(true);
  const [note, setNote] = useState('');
  const recordCheckin = (event: FormEvent) => {
    event.preventDefault();
    const checkin: CheckinData = { experimentKey: entry.key, completed, rating, note: note.trim() || undefined };
    save(makeInput(`${entry.key}-checkin-${todayISO()}`, 'experiment-checkin', todayISO(), checkin), 'Your check-in has been saved.');
    setNote('');
  };
  const status = data.status || 'active';
  return <Card>
    <div className="well-card-head"><span className={`well-status ${status}`}>{status}</span><span className="well-record-meta">Started {fmtDate(data.startedAt)}</span></div>
    <h3 style={{ margin: '0 0 6px', color: '#385b48', font: '600 20px var(--app-font-display,sans-serif)', letterSpacing: '-.035em' }}>{data.title}</h3>
    <p className="well-note" style={{ marginTop: 0 }}>{data.goal}</p>
    <div className="well-actions" style={{ margin: '12px 0' }}>{data.metrics.map((metric) => <span className="well-tag" key={metric}>{metric}</span>)}<span className="well-tag">{data.durationDays} days</span></div>
    <div className="well-grid two">
      <div className="well-metric-box"><span>Starting observation</span><strong style={{ fontSize: 12 }}>{data.notes?.replace(/^Starting observation:\s*/, '') || 'Not recorded'}</strong></div>
      <div className="well-metric-box"><span>During check-ins · average rating</span><strong>{averageRating ?? '—'}{averageRating && <small style={{ color: '#8c9a8f', fontSize: 10 }}> / 5</small>}</strong></div>
    </div>
    <p className="well-inline-note" style={{ marginTop: 9 }}>A simple before-and-during view from your notes; no cause is inferred.</p>
    {checkins.length > 0 && <div className="well-record-list" style={{ marginTop: 11 }}>{checkins.slice(0, 3).map((item) => {
      const check = readData<CheckinData>(item)!;
      return <div className="well-record" key={item.key}><div><strong className="well-record-title">{fmtDate(item.date)}</strong><div className="well-record-meta">{check.completed ? 'Done' : 'Skipped'} · rating {check.rating}/5{check.note ? ` · ${check.note}` : ''}</div></div></div>;
    })}</div>}
    {checkinOpen && status === 'active' && <form className="well-form" onSubmit={recordCheckin} style={{ marginTop: 15, padding: 13, borderRadius: 13, background: '#f3f7f0' }}>
      <span className="well-label">How did today’s attempt go?</span>
      <div className="well-rating" role="group" aria-label="Rate today's experiment check-in">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={rating === value} onClick={() => setRating(value)} data-testid={`button-checkin-rating-${value}`}>{value}</button>)}</div>
      <div className="well-check-row"><label><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} data-testid={`checkbox-checkin-completed-${entry.id}`} />I tried it today</label></div>
      <Field label="A short observation (optional)"><textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you notice?" /></Field>
      <div className="well-actions"><button type="submit" className="well-btn small" disabled={isSaving} data-testid={`button-save-checkin-${entry.id}`}>Save check-in</button><button type="button" className="well-btn ghost small" onClick={setCheckinOpen}>Close</button></div>
    </form>}
    <div className="well-actions" style={{ marginTop: 15 }}>
      {status === 'active' && <><button className="well-btn secondary small" type="button" onClick={setCheckinOpen} data-testid={`button-checkin-${entry.id}`}>Daily check-in <Plus size={12} /></button><button className="well-btn ghost small" type="button" onClick={() => changeStatus(entry, data, 'paused')} disabled={isSaving} data-testid={`button-pause-${entry.id}`}>Pause</button><button className="well-btn ghost small" type="button" onClick={() => changeStatus(entry, data, 'completed')} disabled={isSaving} data-testid={`button-complete-experiment-${entry.id}`}>Complete</button><button className="well-btn danger small" type="button" onClick={() => changeStatus(entry, data, 'cancelled')} disabled={isSaving} data-testid={`button-cancel-experiment-${entry.id}`}>Cancel</button></>}
      {status === 'paused' && <><button className="well-btn secondary small" type="button" onClick={() => changeStatus(entry, data, 'active')} disabled={isSaving} data-testid={`button-resume-${entry.id}`}>Resume</button><button className="well-btn danger small" type="button" onClick={() => changeStatus(entry, data, 'cancelled')} disabled={isSaving} data-testid={`button-cancel-experiment-${entry.id}`}>Cancel</button></>}
    </div>
  </Card>;
}