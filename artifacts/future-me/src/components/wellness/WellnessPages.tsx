import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'wouter';
import {
  Activity, ArrowRight, ArrowUpRight, BedDouble, CalendarDays, Check,
  Clock3, Compass, Dumbbell, Footprints, Heart, History,
  Moon, Plus, Sparkles, Sun, Trash2, Waves, X,
} from 'lucide-react';
import type { FeelingWellnessData, Profile, WellnessEntry, WellnessEntryInput } from '@workspace/api-client-react';
import { useWellness } from './use-wellness';
import {
  calculateCalorieTarget, calculateStepGoal, dailySeries, entryForDay,
  futureMeProjection, localDay, stepProgress,
} from '@/lib/wellness-metrics';
import './wellness.css';

export type WellnessPageId = 'dashboard' | 'future-me' | 'experiments' | 'sleep' | 'five-minute' | 'feelings' | 'periods' | 'history' | 'insights';
type WellnessData = Record<string, unknown>;
type ExperimentData = {
  title: string; goal: string; durationDays: number; metrics: string[]; notes?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled'; startedAt: string; endedAt?: string;
  baselineRating?: number; checkinMetric?: string; pausedAt?: string; pausedDays?: number;
};
type CheckinData = { experimentKey: string; completed: boolean; rating: number; note?: string; phase?: 'before' | 'during'; metric?: string };
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

function NumericTrend({ entries, kind, days, label }: { entries: WellnessEntry[]; kind: 'steps' | 'calories'; days: number; label: string }) {
  const series = dailySeries(entries, kind, days);
  const logged = series.filter((day) => day.value !== null);
  const max = Math.max(1, ...logged.map((day) => day.value ?? 0));
  return <div className={`well-numeric-trend ${kind}-trend`} role="img" aria-label={`${label}, ${logged.length} logged days out of ${days}`}>
    {series.map((day) => <div className="well-numeric-day" key={day.date} title={`${fmtDate(day.date)}: ${day.value === null ? 'not logged' : day.value.toLocaleString()}`}>
      <span className="well-numeric-value">{day.value === null ? '' : day.value.toLocaleString()}</span>
      <span className="well-numeric-track"><i style={{ transform: `scaleY(${day.value === null ? 0.025 : Math.max(.05, (day.value / max))})` }} /></span>
      <small>{new Intl.DateTimeFormat('en', { weekday: days === 7 ? 'narrow' : undefined, day: days === 30 ? 'numeric' : undefined }).format(new Date(`${day.date}T12:00:00`))}</small>
    </div>)}
  </div>;
}

function CountUpValue({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    let started: number | undefined;
    const animate = (time: number) => {
      started ??= time;
      const progress = Math.min(1, (time - started) / 500);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

function DashboardPage({ profile, entries, save, isSaving }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const today = localDay();
  const steps = readData<{ count: number }>(entryForDay(entries, 'steps', today))?.count;
  const calories = readData<{ count: number }>(entryForDay(entries, 'calories', today))?.count;
  const stepTarget = calculateStepGoal(profile);
  const calorieTarget = calculateCalorieTarget(profile);
  const stepState = stepProgress(steps ?? 0, stepTarget);
  const [stepValue, setStepValue] = useState(steps === undefined ? '' : String(steps));
  const [calorieValue, setCalorieValue] = useState(calories === undefined ? '' : String(calories));
  const [historyDays, setHistoryDays] = useState<7 | 30>(7);
  const [stepError, setStepError] = useState('');
  const [calorieError, setCalorieError] = useState('');
  const recent = withinDays(entries, 7);
  const loggedDays = new Set(recent.map((entry) => entry.date)).size;
  const weekSteps = dailySeries(entries, 'steps', 7);
  const future = futureMeProjection(entries, today, 7);
  const latestFeeling = sortNewest(entries.filter((entry) => entry.kind === 'feeling'))[0];
  const feel = readData<FeelingData>(latestFeeling)?.feeling;
  const record = (event: FormEvent, kind: 'steps' | 'calories', value: string) => {
    event.preventDefault();
    const count = Number(value);
    const maximum = kind === 'steps' ? 150000 : 20000;
    if (!Number.isInteger(count) || count < 0 || count > maximum) {
      (kind === 'steps' ? setStepError : setCalorieError)(`Enter a whole number from 0 to ${maximum.toLocaleString()}.`);
      return;
    }
    (kind === 'steps' ? setStepError : setCalorieError)('');
    save(makeInput(dateKey(kind, today), kind, today, { count }), `${kind === 'steps' ? 'Steps' : 'Calorie total'} saved for today.`);
  };
  const remainingCalories = calorieTarget === null || calories === undefined ? null : Math.max(0, calorieTarget - calories);
  const caloriePercent = calorieTarget === null ? 0 : Math.min(100, Math.round(((calories ?? 0) / calorieTarget) * 100));
  return <>
    <PageHeading eyebrow="YOUR DAILY SPACE" title={<>Good to see you,<br /><em>{profile.name.split(' ')[0]}.</em></>} copy="A few useful things to notice today. No score to chase, just your own rhythm." date />
    <div className="well-grid dashboard-grid">
      <Card className="movement-card">
        <CardHeading label="Steps · today" icon={<Footprints size={17} />} />
        <div className="well-steps-title"><div className="well-stat" data-testid="text-steps-today">{steps === undefined ? '—' : steps.toLocaleString()}</div><small>steps logged</small></div>
        <div className="steps-stage" aria-live="polite">{stepState.message}</div>
        <div className="well-progress step-progress" role="progressbar" aria-label="Steps toward personalized estimated target" aria-valuemin={0} aria-valuemax={stepTarget} aria-valuenow={Math.min(steps ?? 0, stepTarget)}><span style={{ width: `${stepState.percent}%` }} /></div>
        <div className="well-progress-caption"><span>Personalized estimate · {stepTarget.toLocaleString()}</span><span>{stepState.percent}%</span></div>
        <div className="step-remaining">{steps === undefined ? 'Log today when it suits you.' : stepState.remaining > 0 ? `${stepState.remaining.toLocaleString()} to the estimated target` : 'You reached the estimated target today.'}</div>
        <details className="well-estimate-details">
          <summary>How this estimate is shaped</summary>
          <p>It starts at 7,000 steps, then adjusts in small increments for your activity level, age band, height, weight, sex, and goal. Activity adjustments range from −500 to +1,000; age, height, weight, sex, and goal also adjust the estimate. It is rounded to the nearest 500 and kept between 4,000 and 12,000 steps. This is a product heuristic, not a medical recommendation.</p>
        </details>
        <form className="well-form" onSubmit={(event) => record(event, 'steps', stepValue)} style={{ marginTop: 15 }}>
          <div className="well-form-row"><Field label={steps === undefined ? 'Add today’s steps' : 'Update today’s steps'}><input type="number" min="0" max="150000" step="1" inputMode="numeric" placeholder="e.g. 4,250" value={stepValue} onChange={(event) => { setStepValue(event.target.value); setStepError(''); }} required data-testid="input-steps-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn" type="submit" disabled={isSaving || !stepValue} data-testid="button-log-steps">{isSaving ? 'Saving…' : steps === undefined ? 'Save steps' : 'Update steps'}</button></div></div>
          {stepError && <span className="field-error" role="alert">{stepError}</span>}
        </form>
        <p className="well-note">This profile-based reference is an estimate, not a medically optimal goal or advice.</p>
      </Card>
      <Card className="dark">
        <div className="well-dark-copy">
          <CardHeading label="Future Me · from your own notes" icon={<Sparkles size={17} />} />
          {future.steps.projectedSteps30 !== null
            ? <><h2>{future.steps.average!.toLocaleString()} steps per logged day.</h2><p>At the same logged-day pace, your step notes add up to about {future.steps.projectedSteps30!.toLocaleString()} steps in 30 days. This is arithmetic from recorded behavior, not a health forecast.</p></>
            : <><h2>Your Future Me becomes smarter as you log more.</h2><p>Three step-log days in the last week are needed for a simple continuation example. No missing days are filled in.</p></>}
        </div>
        <div className="well-actions" style={{ position: 'relative', zIndex: 1, marginTop: 23 }}><Link className="well-btn secondary" href="/future-me">Explore Future Me <ArrowRight size={14} /></Link></div>
      </Card>
    </div>
    <div className="well-grid two well-section">
      <Card className="steps-history-card">
        <CardHeading label="Your last seven days of steps" icon={<CalendarDays size={17} />} />
        <NumericTrend entries={entries} kind="steps" days={7} label="Daily steps" />
        <div className="well-record-list compact-daily-list">{weekSteps.filter((day) => day.value !== null).slice().reverse().map((day) => <div className="well-record" key={day.date}><span className="well-record-title">{fmtDate(day.date)}</span><strong className="well-record-value">{day.value?.toLocaleString()} steps</strong></div>)}</div>
        {!weekSteps.some((day) => day.value !== null) && <p className="well-note">No step totals have been recorded in this seven-day window. Blank days stay blank.</p>}
      </Card>
      <Card className="calorie-card">
        <CardHeading label="Calories · today" icon={<Activity size={17} />} />
        <span className="well-overline">Estimated daily calorie target</span>
        {calorieTarget === null
          ? <div className="well-no-target" data-testid="text-calorie-no-target"><strong>No target shown</strong><div className="well-no-target-today">{calories === undefined ? 'Nothing logged today' : `${calories.toLocaleString()} kcal logged today`}</div><p>Your profile does not support a responsible estimate here. Since there is no target, remaining and progress are not calculated. You can still record a daily total.</p></div>
          : <><div className="well-stat calorie-stat">{calorieTarget.toLocaleString()} <small>kcal / day</small></div><div className="well-progress calorie-progress" role="progressbar" aria-label="Calories logged compared with estimated target" aria-valuemin={0} aria-valuemax={calorieTarget} aria-valuenow={Math.min(calories ?? 0, calorieTarget)}><span style={{ width: `${caloriePercent}%` }} /></div><div className="well-progress-caption"><span>{calories === undefined ? 'Nothing logged today' : `${calories.toLocaleString()} kcal logged`}</span><span>{calories === undefined ? '—' : `${caloriePercent}%`}</span></div><p className="well-note">{calories === undefined ? 'Remaining appears after you log today.' : `${remainingCalories?.toLocaleString()} kcal to the estimated reference.`}</p></>}
        <form className="well-form" onSubmit={(event) => record(event, 'calories', calorieValue)} style={{ marginTop: 13 }}>
          <div className="well-form-row"><Field label={calories === undefined ? 'Log today’s total' : 'Update today’s total'}><input type="number" min="0" max="20000" step="1" inputMode="numeric" placeholder="kcal, if useful" value={calorieValue} onChange={(event) => { setCalorieValue(event.target.value); setCalorieError(''); }} required data-testid="input-calories-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn calorie-button" type="submit" disabled={isSaving || !calorieValue} data-testid="button-log-calories">{isSaving ? 'Saving…' : calories === undefined ? 'Save total' : 'Update total'}</button></div></div>
          {calorieError && <span className="field-error" role="alert">{calorieError}</span>}
        </form>
        <p className="well-note">This estimate uses your profile age, body measurements, sex, usual activity, and personal focus. It is not exact, medically optimal, or advice. Logging is optional and does not need to match a target.</p>
        <details className="well-estimate-details calorie-estimate-details">
          <summary>How this estimate is shaped</summary>
          <p>A resting-energy estimate uses your age, height, weight, and sex profile, then an activity multiplier (1.2–1.725) and a small goal adjustment (−200, +200, or 0 kcal). The result is rounded to 50 kcal. For adults only, the app shows it when the result is within its supported 1,200–5,500 kcal range; otherwise, no target is displayed. It is a rough reference, not nutrition advice or an exact requirement.</p>
        </details>
        <div className="history-switch-row"><span className="well-overline">CALORIE LOG HISTORY</span><PeriodSwitch value={historyDays} onChange={(value) => setHistoryDays(value as 7 | 30)} /></div>
        <NumericTrend entries={entries} kind="calories" days={historyDays} label={`${historyDays}-day calorie history`} />
      </Card>
    </div>
    <div className="well-grid two well-section">
      <Card><CardHeading label="Your week, so far" icon={<CalendarDays size={17} />} /><div className="well-data-grid"><div className="well-data-cell"><span>Days with a note</span><strong>{loggedDays} / 7</strong></div><div className="well-data-cell"><span>Recent check-in</span><strong>{feel ? titleCase(feel) : '—'}</strong></div><div className="well-data-cell"><span>Entries this week</span><strong>{recent.length}</strong></div></div><p className="well-note">Your record only reflects what you’ve chosen to add. An empty day is simply an unrecorded day.</p></Card>
      <Card><CardHeading label="A small next step" icon={<Compass size={17} />} /><p className="well-note">Pick up where you are. Any one note is enough to build a more personal picture over time.</p><div className="well-shortcuts compact-shortcuts"><Link className="well-shortcut" href="/sleep"><Moon size={18} /><span>Note your sleep</span></Link><Link className="well-shortcut" href="/experiments"><Sparkles size={18} /><span>Try an experiment</span></Link><Link className="well-shortcut" href="/future-me"><ArrowUpRight size={18} /><span>See your patterns</span></Link><Link className="well-shortcut" href="/history"><History size={18} /><span>Look back gently</span></Link></div></Card>
    </div>
  </>;
}

function FuturePage({ entries }: ReturnType<typeof useWellness>) {
  const [days, setDays] = useState(7);
  const today = todayISO();
  const scoped = withinDays(entries, days);
  const projection = futureMeProjection(entries, today, days);
  const checked = projection.observedDays;
  const kinds = [...new Set(scoped.map((entry) => entry.kind))];
  const feelings = scoped.filter((entry) => entry.kind === 'feeling');
  const experimentEntries = scoped.filter((entry) => entry.kind === 'experiment-checkin');
  const periods = scoped.filter((entry) => entry.kind === 'period');
  const experimentDays = new Set(experimentEntries.map((entry) => entry.date)).size;
  const hasEnoughMovement = projection.steps.projectedSteps7 !== null &&
    projection.steps.projectedSteps30 !== null;
  const nextAction = projection.steps.loggedDays === 0 ? 'Add a steps total on a day you want to remember.' :
    projection.sleep.loggedDays === 0 ? 'A sleep note would add another useful part of your own picture.' :
    !experimentEntries.length ? 'If you have an active experiment, add one check-in to record what you notice.' :
    projection.energy.loggedDays === 0 ? 'If useful, add one brief energy note on a day you want to remember.' :
    'Keep logging whichever daily detail feels useful to you.';
  const strongestPatterns = [
    { label: 'step totals', days: projection.steps.loggedDays },
    { label: 'calorie totals', days: projection.calories.loggedDays },
    { label: 'sleep notes', days: projection.sleep.loggedDays },
    { label: 'energy notes', days: projection.energy.loggedDays },
    { label: 'feeling notes', days: projection.feelings.loggedDays },
    { label: 'experiment check-ins', days: experimentDays },
  ].filter((pattern) => pattern.days > 0)
    .sort((left, right) => right.days - left.days || left.label.localeCompare(right.label));
  const leadingPattern = strongestPatterns[0];
  const positivePattern = !leadingPattern
    ? 'No repeated pattern is visible in this window yet. Any notes you choose to add can begin your own record.'
    : leadingPattern.days > 1
      ? `Your most frequently logged item is ${leadingPattern.label}, on ${leadingPattern.days} of ${days} days. This describes logging frequency, not an outcome.`
      : `You have started recording ${leadingPattern.label}. One logged day is a beginning, not a trend.`;
  const biggestOpportunity = projection.sleep.loggedDays === 0
    ? 'Sleep is not represented in this window, so sleep consistency cannot be described. That is missing data, not a health judgement.'
    : projection.steps.loggedDays === 0
      ? 'There are no step totals in this window. The activity summary will become useful if and when you choose to log them.'
      : !experimentEntries.length
        ? 'There are no experiment check-ins in this window, so there is nothing to compare before and during.'
        : 'No single unlogged area stands out in this window. You can keep noticing whichever detail is useful.';
  const timeline = sortNewest(scoped).slice(0, 8);
  const averageSleep = projection.sleep.average;
  const averageSleepLabel = averageSleep === null
    ? '—'
    : `${Math.floor(averageSleep / 60)}h ${averageSleep % 60}m`;
  const todayStepEntry = entryForDay(entries, 'steps', today);
  const todayStepCount = readData<{ count: number }>(todayStepEntry)?.count;
  const safeTodaySteps = typeof todayStepCount === 'number' &&
    Number.isInteger(todayStepCount) && todayStepCount >= 0 && todayStepCount <= 150_000
    ? todayStepCount
    : null;
  const projectedSleepDays7 = Math.round((projection.sleep.loggedDays / days) * 7);
  const projectedSleepDays30 = Math.round((projection.sleep.loggedDays / days) * 30);
  return <>
    <PageHeading eyebrow="A VIEW AHEAD" title={<>Future Me,<br /><em>with context.</em></>} copy="A practical reflection of your recorded habits and rhythms. Every number comes from your notes; nothing fills in a blank day or predicts a health outcome." />
    {!projection.enoughData && <div className="future-insufficient" role="note">
      <span className="future-insufficient-mark"><Sparkles size={17} /></span>
      <div><strong>Your Future Me becomes smarter as you log more.</strong><p>There are {scoped.length} recorded {scoped.length === 1 ? 'moment' : 'moments'} in this window. A useful next step: {nextAction}</p></div>
    </div>}
    <div className="well-grid two">
      <Card>
        <CardHeading label="What your recent entries show" icon={<Compass size={17} />} />
        <PeriodSwitch value={days} onChange={setDays} />
        {scoped.length ? <>
          <div className="well-grid two" style={{ marginTop: 17 }}>
            <div className="well-metric-box"><span>Days with a record</span><strong>{checked} of {days}</strong></div>
            <div className="well-metric-box"><span>Different kinds logged</span><strong>{kinds.length}</strong></div>
          </div>
          <div className="well-grid three future-stat-grid">
            <div className="well-metric-box"><span>Mean steps per logged day</span><strong>{projection.steps.average === null ? '—' : projection.steps.average.toLocaleString()}</strong><small>{projection.steps.loggedDays} step {projection.steps.loggedDays === 1 ? 'day' : 'days'}</small></div>
            <div className="well-metric-box"><span>Calorie logging</span><strong>{projection.calories.loggedDays} of {days} days</strong><small>Only saved daily totals count</small></div>
            <div className="well-metric-box"><span>Sleep notes</span><strong>{averageSleepLabel}</strong><small>{projection.sleep.loggedDays} logged nights</small></div>
            <div className="well-metric-box"><span>Energy notes</span><strong>{projection.energy.average === null ? '—' : `${projection.energy.average}%`}</strong><small>{projection.energy.loggedDays} entries</small></div>
            <div className="well-metric-box"><span>Experiment check-ins</span><strong>{projection.experiments.checkins ? `${projection.experiments.completed} / ${projection.experiments.checkins} tried` : '—'}</strong><small>{projection.experiments.averageRating === null ? 'No rating recorded' : `Mean rating ${projection.experiments.averageRating} / 5`}</small></div>
            <div className="well-metric-box"><span>Feelings and periods</span><strong>{projection.feelings.loggedDays} · {periods.length}</strong><small>feeling days · period notes</small></div>
          </div>
          {feelings.length > 0 && projection.feelings.mostLogged && <p className="well-note">You logged a feeling on {projection.feelings.loggedDays} {projection.feelings.loggedDays === 1 ? 'day' : 'days'} in this window. Most frequently named: {titleCase(projection.feelings.mostLogged)}. This counts entries without interpreting them.</p>}
        </> : <div style={{ marginTop: 16 }}><Empty title="A little more time will help" copy={`There are no entries in this ${days}-day window yet. Add a few moments and a pattern can begin to take shape.`} /></div>}
      </Card>
      <Card className="dark">
        <div className="well-dark-copy">
          <CardHeading label="A behavior-only continuation" icon={<Sparkles size={17} />} />
          {hasEnoughMovement ? <>
            <h2>{projection.steps.average!.toLocaleString()} steps per logged day.</h2>
            <p>Across {projection.steps.loggedDays} step {projection.steps.loggedDays === 1 ? 'day' : 'days'} in this {days}-day window. If the same movement-day pace and average continued, the arithmetic total would be about {projection.steps.projectedSteps7!.toLocaleString()} steps over seven days and {projection.steps.projectedSteps30!.toLocaleString()} over thirty days.</p>
            <div className="projection-ruler" aria-label={`Seven-day illustration ${projection.steps.projectedSteps7!.toLocaleString()} steps, 30-day illustration ${projection.steps.projectedSteps30!.toLocaleString()} steps`}><span style={{ transform: `scaleX(${Math.min(1, projection.steps.average! / 12000)})` }} /></div>
            <p className="projection-foot">A simple continuation scenario from logged days only. It is not a forecast, target, or statement about health.</p>
          </> : <><h2>Your future is not filled in for you.</h2><p>Three movement-day logs in this {days}-day window are needed for a continuation illustration. No missing dates are treated as zero.</p><p className="projection-foot">{nextAction}</p></>}
        </div>
      </Card>
    </div>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">A SIMPLE CONTINUATION SCENARIO</span><h2>Your Future Me timeline</h2></div></div>
      <div className="future-timeline" aria-label="Today, 7-day and 30-day behavior continuation">
        <article className="future-milestone">
          <span className="future-milestone-label">TODAY</span>
          <div><h3>{safeTodaySteps === null ? 'No step total logged today' : <><CountUpValue value={safeTodaySteps} /> steps logged</>}</h3><p>This is today’s saved step total, if you chose to record one.</p></div>
        </article>
        <div className="future-timeline-arrow" aria-hidden="true">↓</div>
        <article className="future-milestone">
          <span className="future-milestone-label">7 DAYS</span>
          <div>
            <h3>{projection.steps.projectedSteps7 === null ? 'More step logs will make this estimate useful' : <>~<CountUpValue value={projection.steps.projectedSteps7} /> steps</>}</h3>
            <p>At the logged-day pace in this {days}-day sample, about {projection.projectedRecordDays7} days with any note and {projection.sleep.loggedDays ? `about ${projectedSleepDays7} sleep-note days` : 'no sleep-note estimate yet'}.</p>
          </div>
        </article>
        <div className="future-timeline-arrow" aria-hidden="true">↓</div>
        <article className="future-milestone">
          <span className="future-milestone-label">30 DAYS</span>
          <div>
            <h3>{projection.steps.projectedSteps30 === null ? 'More step logs will make this estimate useful' : <>~<CountUpValue value={projection.steps.projectedSteps30} /> steps</>}</h3>
            <p>At the same logged-day pace, about {projection.projectedRecordDays30} days with any note and {projection.sleep.loggedDays ? `about ${projectedSleepDays30} sleep-note days` : 'no sleep-note estimate yet'}.</p>
          </div>
        </article>
      </div>
      <p className="well-note">The 7- and 30-day illustrations use only this window’s recorded averages and logging frequency. Blank days are not counted as zero, and these are not health predictions.</p>
    </section>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">WHAT IS SHAPING YOUR FUTURE ME?</span><h2>Patterns from your notes</h2></div></div>
      <div className="well-grid three future-pattern-grid">
        <Card><span className="well-overline">POSITIVE PATTERN</span><p>{positivePattern}</p></Card>
        <Card><span className="well-overline">BIGGEST OPPORTUNITY</span><p>{biggestOpportunity}</p></Card>
        <Card><span className="well-overline">ONE SMALL ACTION FOR TOMORROW</span><p>{nextAction}</p></Card>
      </div>
    </section>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">WHAT THE NOTES SHOW</span><h2>Recent moments</h2></div></div>
      {timeline.length ? <div className="well-timeline">{timeline.map((entry) => <div className="well-timeline-item" key={entry.key}><time>{fmtDate(entry.date)}</time><strong>{titleCase(entry.kind)}</strong><p>{entrySummary(entry)}</p></div>)}</div> : <Empty title="Your timeline starts here" copy="Your saved entries will appear in date order, without filling in the gaps." icon={<History size={19} />} />}
    </section>
    <section className="well-section">
      <div className="well-section-head"><div><span className="well-eyebrow">PATTERN, THEN POSSIBILITY</span><h2>Your own next step</h2></div></div>
      <div className="well-callout"><strong>{scoped.length ? 'One thing worth noticing: ' : 'When you are ready: '}</strong>{scoped.length ? `you have recorded ${kinds.length} ${kinds.length === 1 ? 'kind' : 'kinds'} of wellbeing moment${kinds.length === 1 ? '' : 's'} in this window. You could keep noticing whichever one feels most useful.` : nextAction}</div>
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
  const [checkinMetric, setCheckinMetric] = useState('');
  const [baselineRating, setBaselineRating] = useState('');
  const [experimentNotes, setExperimentNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [checkinFor, setCheckinFor] = useState('');
  const experiments = sortNewest(entries.filter((entry) => entry.kind === 'experiment'));
  const checkins = sortNewest(entries.filter((entry) => entry.kind === 'experiment-checkin'));
  const parsedMetrics = metrics.split(',').map((item) => item.trim()).filter(Boolean);
  const clearForm = () => { setTemplate(''); setTitle(''); setGoal(''); setDuration('7'); setMetrics(''); setCheckinMetric(''); setBaselineRating(''); setExperimentNotes(''); setFormError(''); };
  const applyTemplate = (value: string) => {
    setTemplate(value);
    const selected = experimentTemplates[Number(value)];
    if (selected) {
      setTitle(selected.title); setGoal(selected.goal); setDuration(String(selected.duration)); setMetrics(selected.metrics);
      setCheckinMetric(selected.metrics.split(',')[0].trim());
    } else clearForm();
  };
  const createExperiment = (event: FormEvent) => {
    event.preventDefault();
    const days = Number(duration);
    const metricList = parsedMetrics;
    if (!title.trim() || title.trim().length > 120) return setFormError('Give your experiment a name under 120 characters.');
    if (!goal.trim() || goal.trim().length > 500) return setFormError('Add a goal in 500 characters or fewer.');
    if (!Number.isInteger(days) || days < 1 || days > 90) return setFormError('Choose a duration from 1 to 90 days.');
    if (metricList.length < 1 || metricList.length > 8 || metricList.some((metric) => metric.length > 80)) return setFormError('Choose 1 to 8 measures, each 80 characters or fewer.');
    if (!metricList.includes(checkinMetric)) return setFormError('Choose one of your measures for the daily check-in.');
    const startingRating = baselineRating === '' ? undefined : Number(baselineRating);
    if (startingRating !== undefined && (!Number.isInteger(startingRating) || startingRating < 1 || startingRating > 5)) return setFormError('A starting rating must be from 1 to 5.');
    if (experimentNotes.length > 1000) return setFormError('Keep your optional notes under 1,000 characters.');
    const key = `experiment-${todayISO()}-${Math.random().toString(36).slice(2, 9)}`;
    const data: ExperimentData = {
      title: title.trim(), goal: goal.trim(), durationDays: days, metrics: metricList,
      notes: experimentNotes.trim() || undefined, baselineRating: startingRating,
      checkinMetric, status: 'active', startedAt: todayISO(),
    };
    save(
      makeInput(key, 'experiment', todayISO(), data),
      'Your experiment is ready. Keep it small and see what you notice.',
      () => { setOpenCreate(false); clearForm(); },
    );
  };
  const changeStatus = (entry: WellnessEntry, data: ExperimentData, status: ExperimentData['status']) => {
    if (status === 'cancelled' && !window.confirm(`Cancel “${data.title}”? Its notes will stay in your history.`)) return;
    const updated: ExperimentData = { ...data, status, endedAt: status === 'completed' || status === 'cancelled' ? todayISO() : undefined };
    if (status === 'paused') updated.pausedAt = todayISO();
    if ((status === 'active' || status === 'completed' || status === 'cancelled') &&
      data.status === 'paused' && data.pausedAt) {
      const pauseLength = Math.max(0, Math.floor((new Date(`${todayISO()}T12:00:00`).getTime() - new Date(`${data.pausedAt}T12:00:00`).getTime()) / 86400000));
      updated.pausedDays = (data.pausedDays ?? 0) + pauseLength;
      updated.pausedAt = undefined;
    }
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
        const duringRatings = related
          .map((item) => readData<CheckinData>(item))
          .filter((check): check is CheckinData =>
            !!check && check.phase !== 'before' && Number.isInteger(check.rating) && check.rating >= 1 && check.rating <= 5,
          )
          .map((check) => check.rating);
        const averageRating = duringRatings.length
          ? (duringRatings.reduce((sum, rating) => sum + rating, 0) / duringRatings.length).toFixed(1)
          : null;
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
          <div className="well-form-row"><Field label="Duration (days)"><input type="number" min="1" max="90" required value={duration} onChange={(event) => setDuration(event.target.value)} data-testid="input-experiment-duration" /></Field><Field label="Measures (comma separated, 1–8)"><input maxLength={700} required value={metrics} onChange={(event) => { const next = event.target.value.split(',').map((item) => item.trim()).filter(Boolean); setMetrics(event.target.value); if (!next.includes(checkinMetric)) setCheckinMetric(next[0] ?? ''); }} placeholder="energy, ease" data-testid="input-experiment-metrics" /></Field></div>
          <Field label="Daily check-in measure"><select required value={checkinMetric} onChange={(event) => setCheckinMetric(event.target.value)} data-testid="select-experiment-metric"><option value="">Choose a measure</option>{parsedMetrics.map((metric, index) => <option value={metric} key={`${metric}-${index}`}>{metric}</option>)}</select></Field>
          <div className="well-form-row"><Field label="Optional before rating (1–5)"><select value={baselineRating} onChange={(event) => setBaselineRating(event.target.value)} data-testid="select-experiment-baseline-rating"><option value="">No rating</option>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value} of 5</option>)}</select></Field><Field label="Starting notes (optional)"><textarea maxLength={1000} value={experimentNotes} onChange={(event) => setExperimentNotes(event.target.value)} placeholder="Anything useful to remember…" data-testid="input-experiment-notes" /></Field></div>
          <p className="well-inline-note">Ratings are personal observations. A before-and-during difference is an association in your notes, never evidence of cause.</p>
          {formError && <div className="well-error" role="alert">{formError}</div>}
          <div className="well-actions"><button className="well-btn" type="submit" disabled={isSaving} data-testid="button-save-experiment"><Check size={14} /> Begin gently</button><button className="well-btn ghost" type="button" onClick={() => { setOpenCreate(false); clearForm(); }}>Not now</button></div>
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
  const todayCheckin = checkins.find((item) =>
    item.date === todayISO() && readData<CheckinData>(item)?.phase !== 'before',
  );
  const todayData = readData<CheckinData>(todayCheckin);
  const duringCheckins = checkins.filter((item) =>
    readData<CheckinData>(item)?.phase !== 'before',
  );
  const [rating, setRating] = useState(todayData?.rating ?? 3);
  const [completed, setCompleted] = useState(todayData?.completed ?? true);
  const [note, setNote] = useState(todayData?.note ?? '');
  const [checkinError, setCheckinError] = useState('');
  const recordCheckin = (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || note.length > 1000) {
      setCheckinError('Choose a rating from 1 to 5 and keep notes under 1,000 characters.');
      return;
    }
    setCheckinError('');
    const metric = data.checkinMetric || data.metrics?.[0] || 'daily measure';
    const checkin: CheckinData = { experimentKey: entry.key, completed, rating, note: note.trim() || undefined, phase: 'during', metric };
    save(
      makeInput(`${entry.key}-checkin-${todayISO()}`, 'experiment-checkin', todayISO(), checkin),
      'Your check-in has been saved.',
      () => setNote(''),
    );
  };
  const status = data.status || 'active';
  const safeMetrics = Array.isArray(data.metrics) ? data.metrics : [];
  const durationDays = Number.isInteger(data.durationDays) && data.durationDays > 0 ? data.durationDays : 7;
  const startedAt = data.startedAt || entry.date;
  const dayThrough = status === 'paused' && data.pausedAt ? data.pausedAt : (status === 'completed' || status === 'cancelled') && data.endedAt ? data.endedAt : todayISO();
  const elapsed = Math.max(1, Math.floor((new Date(`${dayThrough}T12:00:00`).getTime() - new Date(`${startedAt}T12:00:00`).getTime()) / 86400000) + 1 - (data.pausedDays ?? 0));
  const dayNumber = Math.min(durationDays, elapsed);
  const triedCount = duringCheckins.filter((item) => readData<CheckinData>(item)?.completed === true).length;
  const completionRate = duringCheckins.length ? Math.round((triedCount / duringCheckins.length) * 100) : null;
  const validRatings = duringCheckins
    .map((item) => ({ entry: item, data: readData<CheckinData>(item) }))
    .filter((item): item is { entry: WellnessEntry; data: CheckinData } => {
      const rating = item.data?.rating;
      return typeof rating === 'number' &&
        Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= 5;
    });
  const beforeAndDuring = data.baselineRating && averageRating
    ? `Your starting rating was ${data.baselineRating}/5; your mean during rating is ${averageRating}/5. That difference is an association in your notes, not evidence that the experiment caused a change.`
    : data.baselineRating ? `Starting rating: ${data.baselineRating}/5. Add check-ins for a during average; any comparison will remain an association, not cause.` :
      averageRating ? `During check-in mean: ${averageRating}/5. No before rating was recorded, so there is no before-and-during comparison.` : 'Add an optional before rating and daily check-ins to see a simple association in your own notes.';
  return <Card>
    <div className="well-card-head"><span className={`well-status ${status}`}>{status}</span><span className="well-record-meta">Started {fmtDate(startedAt)}</span></div>
    <h3 style={{ margin: '0 0 6px', color: '#385b48', font: '600 20px var(--app-font-display,sans-serif)', letterSpacing: '-.035em' }}>{data.title || 'Personal experiment'}</h3>
    <p className="well-note" style={{ marginTop: 0 }}>{data.goal}</p>
    <div className="well-actions" style={{ margin: '12px 0' }}>{safeMetrics.map((metric, index) => <span className="well-tag" key={`${metric}-${index}`}>{metric}</span>)}<span className="well-tag">{durationDays} days</span><span className="well-tag day-progress">Day {dayNumber} of {durationDays}</span></div>
    <div className="well-grid two">
      <div className="well-metric-box"><span>Check-in completion</span><strong>{completionRate === null ? '—' : `${completionRate}%`}</strong><small>{triedCount} tried of {duringCheckins.length} during check-ins</small></div>
      <div className="well-metric-box"><span>{data.checkinMetric || safeMetrics[0] || 'During'} · mean rating</span><strong>{averageRating ?? '—'}{averageRating && <small style={{ color: '#8c9a8f', fontSize: 10 }}> / 5</small>}</strong></div>
    </div>
    <div className="experiment-association"><strong>Before and during</strong><p>{beforeAndDuring}</p>{data.notes && <p className="experiment-user-notes"><span>Your notes</span>{data.notes}</p>}</div>
    {validRatings.length > 0 && <div className="experiment-rating-chart" role="img" aria-label={`Rating history for ${data.checkinMetric || safeMetrics[0] || 'experiment measure'}`}>
      <div className="well-overline">RATING TREND · {data.checkinMetric || safeMetrics[0] || 'YOUR MEASURE'}</div>
      <div className="experiment-rating-bars">{validRatings.slice().reverse().slice(-8).map(({ entry: item, data: check }) => <div className="experiment-rating-point" key={item.key} title={`${fmtDate(item.date)}: ${check.rating} of 5`}><span className="experiment-rating-value">{check.rating}</span><i style={{ transform: `scaleY(${Number(check.rating) / 5})` }} /><small>{new Intl.DateTimeFormat('en', { month: 'numeric', day: 'numeric' }).format(new Date(`${item.date}T12:00:00`))}</small></div>)}</div>
    </div>}
    {duringCheckins.length > 0 && <div className="well-record-list" style={{ marginTop: 11 }}>{duringCheckins.slice(0, 5).map((item) => {
      const check = readData<CheckinData>(item);
      return <div className="well-record" key={item.key}><div><strong className="well-record-title">{fmtDate(item.date)}</strong><div className="well-record-meta">{check?.completed ? 'Tried' : 'Not completed'} · {check?.metric || data.checkinMetric || safeMetrics[0] || 'rating'} {Number.isFinite(Number(check?.rating)) ? `· rating ${check?.rating}/5` : ''}{check?.note ? ` · ${check.note}` : ''}</div></div></div>;
    })}</div>}
    {checkinOpen && status === 'active' && <form className="well-form" onSubmit={recordCheckin} style={{ marginTop: 15, padding: 13, borderRadius: 13, background: '#f3f7f0' }}>
      <span className="well-label">Today · {data.checkinMetric || safeMetrics[0] || 'your chosen measure'}</span>
      <div className="well-rating" role="group" aria-label="Rate today's experiment check-in">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={rating === value} onClick={() => setRating(value)} data-testid={`button-checkin-rating-${value}`}>{value}</button>)}</div>
      <div className="well-check-row"><label><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} data-testid={`checkbox-checkin-completed-${entry.id}`} />I tried it today</label></div>
      <Field label="A short observation (optional)"><textarea maxLength={1000} value={note} onChange={(event) => { setNote(event.target.value); setCheckinError(''); }} placeholder="What did you notice?" data-testid={`input-checkin-note-${entry.id}`} /></Field>
      {checkinError && <span className="field-error" role="alert">{checkinError}</span>}
      <div className="well-actions"><button type="submit" className="well-btn small" disabled={isSaving} data-testid={`button-save-checkin-${entry.id}`}>Save check-in</button><button type="button" className="well-btn ghost small" onClick={setCheckinOpen}>Close</button></div>
    </form>}
    <div className="well-actions" style={{ marginTop: 15 }}>
      {status === 'active' && <><button className="well-btn secondary small" type="button" onClick={setCheckinOpen} data-testid={`button-checkin-${entry.id}`}>Daily check-in <Plus size={12} /></button><button className="well-btn ghost small" type="button" onClick={() => changeStatus(entry, data, 'paused')} disabled={isSaving} data-testid={`button-pause-${entry.id}`}>Pause</button><button className="well-btn ghost small" type="button" onClick={() => changeStatus(entry, data, 'completed')} disabled={isSaving} data-testid={`button-complete-experiment-${entry.id}`}>Complete</button><button className="well-btn danger small" type="button" onClick={() => changeStatus(entry, data, 'cancelled')} disabled={isSaving} data-testid={`button-cancel-experiment-${entry.id}`}>Cancel</button></>}
      {status === 'paused' && <><button className="well-btn secondary small" type="button" onClick={() => changeStatus(entry, data, 'active')} disabled={isSaving} data-testid={`button-resume-${entry.id}`}>Resume</button><button className="well-btn danger small" type="button" onClick={() => changeStatus(entry, data, 'cancelled')} disabled={isSaving} data-testid={`button-cancel-experiment-${entry.id}`}>Cancel</button></>}
    </div>
  </Card>;
}