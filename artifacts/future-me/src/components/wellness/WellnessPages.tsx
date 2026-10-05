import { useEffect, useState } from 'react';
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
  canAccessCycleTracking, cycleEntryKey, cycleSummary, energyAction, feelingPatternSummary, futureMeProjection, localDay, loggingConsistency, sleepSummary, stepProgress, visibleEntriesForProfile,
} from '@/lib/wellness-metrics';
import { buildWellnessInsights, type InsightPoint } from '@/lib/wellness-insights';
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
function Field({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return <div className="well-field"><label htmlFor={id}>{label}</label>{children}</div>;
}
function PeriodSwitch({ value, onChange }: { value: number; onChange: (value: 7 | 30) => void }) {
  return <div className="well-period-switch" aria-label="Choose time range">
    {([7, 30] as const).map((day) => <button type="button" key={day} aria-pressed={day === value} onClick={() => onChange(day)} data-testid={`button-period-${day}`}>{day} days</button>)}
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
  const visibleWellness = {
    ...wellness,
    entries: visibleEntriesForProfile(wellness.entries, profile.sex),
  };
  const common = <Feedback message={visibleWellness.message} error={visibleWellness.mutationError} />;
  let content: ReactNode;
  switch (pageId) {
    case 'dashboard': content = <DashboardPage profile={profile} {...visibleWellness} />; break;
    case 'future-me': content = <FuturePage {...visibleWellness} />; break;
    case 'experiments': content = <ExperimentsPage {...visibleWellness} />; break;
    case 'sleep': content = <SleepPage profile={profile} {...visibleWellness} />; break;
    case 'five-minute': content = <FiveMinutePage {...visibleWellness} />; break;
    case 'feelings': content = <FeelingsPage profile={profile} {...visibleWellness} />; break;
    case 'periods': content = <PeriodsPage {...visibleWellness} />; break;
    case 'history': content = <HistoryPage profile={profile} {...visibleWellness} />; break;
    case 'insights': content = <InsightsPage profile={profile} {...visibleWellness} />; break;
    default: content = <DashboardPage profile={profile} {...visibleWellness} />;
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
  const generalWellnessEntries = entries.filter((entry) => entry.kind !== 'period');
  const recent = withinDays(generalWellnessEntries, 7);
  const loggedDays = new Set(recent.map((entry) => entry.date)).size;
  const weekSteps = dailySeries(entries, 'steps', 7);
  const future = futureMeProjection(generalWellnessEntries, today, 7);
  const todayFeeling = readData<FeelingData>(entryForDay(entries, 'feeling', today))?.feeling;
  const todayRecords = entries.filter((entry) => entry.date === today && entry.kind !== 'period');
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
  const dashboardInsights = buildWellnessInsights(generalWellnessEntries, 7, today, false);
  const nextStep = todayRecords.length === 0
    ? { title: 'Start with one small note', detail: 'Choose the detail that feels easiest to remember today.', href: '/five-minute', action: 'Check in with your energy' }
    : dashboardInsights.recommendedFocus;
  return <>
    <PageHeading eyebrow="YOUR DAILY SPACE" title={<>Good to see you,<br /><em>{profile.name.split(' ')[0]}.</em></>} copy="A few useful things to notice today. No score to chase, just your own rhythm." date />
    <section className="dashboard-state" data-testid="panel-today-state">
      <div className="dashboard-state-mark"><Sun size={18} /></div>
      <div><span className="well-overline">TODAY, AS IT IS</span><h2>{todayRecords.length ? 'A few things have made it into your record.' : 'There is room for today to unfold.'}</h2><p>{todayRecords.length ? `${todayRecords.length} ${todayRecords.length === 1 ? 'moment' : 'moments'} noted${todayFeeling ? ` · feeling ${titleCase(todayFeeling)}` : ''}.` : 'No notes yet today. That is simply a blank page, not a missed day.'}</p></div>
      <div className="dashboard-state-date"><span>{fmtDate(today, { weekday: 'short' })}</span><strong>{fmtDate(today, { day: 'numeric' })}</strong></div>
    </section>
    <section className="dashboard-progress-section">
      <div className="well-section-head"><div><span className="well-eyebrow">TODAY’S PROGRESS</span><h2>Notice what you’ve logged</h2></div><span className="dashboard-progress-caption">Your own pace, no score to chase</span></div>
      <div className="dashboard-progress-grid">
        <Card className="movement-card">
          <CardHeading label="Movement · steps" icon={<Footprints size={17} />} />
          <div className="well-steps-title"><div className="well-stat" data-testid="text-steps-today">{steps === undefined ? '—' : steps.toLocaleString()}</div><small>steps noted</small></div>
          <div className="steps-stage" aria-live="polite">{steps === undefined ? 'Whenever it feels useful' : stepState.message}</div>
          <div className="well-progress step-progress" role="progressbar" aria-label="Steps toward personalized estimated reference" aria-valuemin={0} aria-valuemax={stepTarget} aria-valuenow={Math.min(steps ?? 0, stepTarget)}><span style={{ width: `${stepState.percent}%` }} /></div>
          <div className="well-progress-caption"><span>Profile-based reference · {stepTarget.toLocaleString()}</span><span>{steps === undefined ? '—' : `${stepState.percent}%`}</span></div>
          <div className="step-remaining">{steps === undefined ? 'An estimate, never a requirement.' : stepState.remaining > 0 ? `${stepState.remaining.toLocaleString()} to the reference` : 'You reached the estimated reference today.'}</div>
          <form className="well-form" onSubmit={(event) => record(event, 'steps', stepValue)} style={{ marginTop: 15 }}>
            <div className="well-form-row"><Field label={steps === undefined ? 'Add today’s steps' : 'Update today’s steps'}><input type="number" min="0" max="150000" step="1" inputMode="numeric" placeholder="e.g. 4,250" value={stepValue} onChange={(event) => { setStepValue(event.target.value); setStepError(''); }} required data-testid="input-steps-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn" type="submit" disabled={isSaving || !stepValue} data-testid="button-log-steps">{isSaving ? 'Saving…' : steps === undefined ? 'Save steps' : 'Update steps'}</button></div></div>
            {stepError && <span className="field-error" role="alert">{stepError}</span>}
          </form>
          <details className="well-estimate-details"><summary>How this estimate is shaped</summary><p>It starts at 7,000 steps, then adjusts in small increments for your profile and is rounded to the nearest 500 between 4,000 and 12,000. It is a product heuristic, not medical advice.</p></details>
        </Card>
        <Card className="calorie-card dashboard-calorie-card">
          <CardHeading label="Nutrition · calorie totals" icon={<Activity size={17} />} />
          {calorieTarget === null
            ? <div className="well-no-target" data-testid="text-calorie-no-target"><strong>No target shown</strong><div className="well-no-target-today">{calories === undefined ? 'Nothing logged today' : `${calories.toLocaleString()} kcal logged today`}</div><p>Your profile does not support an estimate here. You can still record a daily total, if useful.</p></div>
            : <><span className="well-overline">Estimated daily reference</span><div className="well-stat calorie-stat">{calorieTarget.toLocaleString()} <small>kcal / day</small></div><div className="well-progress calorie-progress" role="progressbar" aria-label="Calories logged compared with estimated reference" aria-valuemin={0} aria-valuemax={calorieTarget} aria-valuenow={Math.min(calories ?? 0, calorieTarget)}><span style={{ width: `${caloriePercent}%` }} /></div><div className="well-progress-caption"><span>{calories === undefined ? 'Nothing logged today' : `${calories.toLocaleString()} kcal logged`}</span><span>{calories === undefined ? '—' : `${caloriePercent}%`}</span></div><p className="well-note">{calories === undefined ? 'Your total appears here when you choose to log it.' : `${remainingCalories?.toLocaleString()} kcal to the estimated reference.`}</p></>}
          <form className="well-form" onSubmit={(event) => record(event, 'calories', calorieValue)} style={{ marginTop: 13 }}>
            <div className="well-form-row"><Field label={calories === undefined ? 'Log today’s calorie total' : 'Update today’s total'}><input type="number" min="0" max="20000" step="1" inputMode="numeric" placeholder="kcal, if useful" value={calorieValue} onChange={(event) => { setCalorieValue(event.target.value); setCalorieError(''); }} required data-testid="input-calories-count" /></Field><div className="well-field"><label aria-hidden="true">&nbsp;</label><button className="well-btn calorie-button" type="submit" disabled={isSaving || !calorieValue} data-testid="button-log-calories">{isSaving ? 'Saving…' : calories === undefined ? 'Save total' : 'Update total'}</button></div></div>
            {calorieError && <span className="field-error" role="alert">{calorieError}</span>}
          </form>
          <p className="well-note">Calories are optional daily totals—not meal logs or nutrition advice.</p>
          <details className="well-estimate-details calorie-estimate-details"><summary>About this estimate</summary><p>The profile-based estimate is a rough reference, not exact, medically optimal, or advice. Logging does not need to match a target.</p></details>
        </Card>
      </div>
    </section>
    <Card className="dashboard-future-card dark">
      <div className="well-dark-copy">
        <CardHeading label="FUTURE ME · FROM YOUR OWN NOTES" icon={<Sparkles size={17} />} />
        {future.steps.projectedSteps30 !== null
          ? <><h2>{future.steps.average!.toLocaleString()} steps per logged day.</h2><p>At the same recorded pace, your step notes add up to about {future.steps.projectedSteps30!.toLocaleString()} steps in 30 days. Arithmetic from your behavior, not a health forecast.</p></>
          : <><h2>Your next chapter is taking shape.</h2><p>Three step-log days in the last week are needed for a simple continuation example. Nothing is filled in for the days you left blank.</p></>}
      </div>
      <div className="well-actions dashboard-future-action"><Link className="well-btn secondary" href="/future-me">Explore Future Me <ArrowRight size={14} /></Link></div>
    </Card>
    <section className="dashboard-next-step" data-testid="panel-personalized-action">
      <div><span className="well-overline">A PERSONAL NEXT STEP</span><h2>{nextStep.title}</h2><p>{'detail' in nextStep ? nextStep.detail : `A small invitation based on your recent notes. ${dashboardInsights.biggestOpportunity}`}</p></div>
      <Link href={nextStep.href} className="well-btn">{'action' in nextStep ? nextStep.action : nextStep.actionLabel}<ArrowRight size={15} /></Link>
    </section>
    <section className="dashboard-shortcuts-section">
      <div className="well-section-head"><div><span className="well-eyebrow">PICK UP WHERE YOU ARE</span><h2>Ways to check in</h2></div></div>
      <div className="dashboard-shortcuts">
        <Link className="dashboard-shortcut" href="/sleep"><span><Moon size={17} /></span><strong>Sleep</strong><small>Note last night</small><ArrowUpRight size={15} /></Link>
        <Link className="dashboard-shortcut" href="/five-minute"><span><Clock3 size={17} /></span><strong>Five minutes</strong><small>Meet your energy</small><ArrowUpRight size={15} /></Link>
        <Link className="dashboard-shortcut" href="/feelings"><span><Heart size={17} /></span><strong>Feelings</strong><small>Name what’s here</small><ArrowUpRight size={15} /></Link>
        <Link className="dashboard-shortcut" href="/experiments"><span><Sparkles size={17} /></span><strong>Experiments</strong><small>Notice something new</small><ArrowUpRight size={15} /></Link>
      </div>
    </section>
    <section className="dashboard-recent-insights" data-testid="panel-recent-insights">
      <div className="well-section-head"><div><span className="well-eyebrow">THE LAST SEVEN DAYS</span><h2>A little perspective</h2></div><Link className="well-link" href="/insights">See all insights <ArrowRight size={14} /></Link></div>
      <div className="dashboard-insight-columns">
        <div><span>YOUR MOST CONSISTENT THREAD</span><p>{dashboardInsights.mostConsistentHabit}</p></div>
        <div><span>AN OBSERVATION</span><p>{dashboardInsights.strongestPositive}</p></div>
        <div className="dashboard-week-number"><strong>{loggedDays}<small> / 7</small></strong><span>days with a note</span></div>
      </div>
      <p className="well-note">Empty days are not zero data; these notes use only what you chose to record.</p>
    </section>
    <section className="dashboard-trends">
      <div className="well-section-head"><div><span className="well-eyebrow">LOOKING BACK</span><h2>Your recent totals</h2></div><PeriodSwitch value={historyDays} onChange={(value) => setHistoryDays(value as 7 | 30)} /></div>
      <div className="well-grid two">
        <Card className="steps-history-card"><CardHeading label="Step totals" icon={<Footprints size={17} />} /><NumericTrend entries={entries} kind="steps" days={historyDays} label={`${historyDays}-day step history`} /><p className="well-note">{weekSteps.some((day) => day.value !== null) ? 'Bars appear only on dates with a saved total.' : 'No step totals have been recorded this week. Blank days stay blank.'}</p></Card>
        <Card className="calorie-card"><CardHeading label="Calorie totals" icon={<Activity size={17} />} /><NumericTrend entries={entries} kind="calories" days={historyDays} label={`${historyDays}-day calorie history`} /><p className="well-note">Calorie totals reflect only daily values you chose to save.</p></Card>
      </div>
    </section>
  </>;
}

function FuturePage({ entries }: ReturnType<typeof useWellness>) {
  const [days, setDays] = useState(7);
  const today = todayISO();
  const generalWellnessEntries = entries.filter((entry) => entry.kind !== 'period');
  const scoped = withinDays(generalWellnessEntries, days);
  const projection = futureMeProjection(generalWellnessEntries, today, days);
  const checked = projection.observedDays;
  const kinds = [...new Set(scoped.map((entry) => entry.kind))];
  const feelings = scoped.filter((entry) => entry.kind === 'feeling');
  const experimentEntries = scoped.filter((entry) => entry.kind === 'experiment-checkin');
  const experimentDays = new Set(experimentEntries.map((entry) => entry.date)).size;
  const hasEnoughMovement = projection.steps.projectedSteps7 !== null &&
    projection.steps.projectedSteps30 !== null;
  const nextAction = projection.steps.loggedDays === 0 ? 'Add a steps total on a day you want to remember.' :
    projection.sleep.loggedDays === 0 ? 'A sleep note would add another useful part of your own picture.' :
    !experimentEntries.length ? 'If you have an active experiment, add one check-in to record what you notice.' :
    projection.energy.completedActionDays === 0 ? 'If useful, complete one small action that fits your energy today.' :
    'Keep logging whichever daily detail feels useful to you.';
  const strongestPatterns = [
    { label: 'step totals', days: projection.steps.loggedDays },
    { label: 'calorie totals', days: projection.calories.loggedDays },
    { label: 'sleep notes', days: projection.sleep.loggedDays },
    { label: 'completed energy actions', days: projection.energy.completedActionDays },
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
            <div className="well-metric-box"><span>Completed energy actions</span><strong>{projection.energy.completedActions}</strong><small>{projection.energy.completedActionDays} logged days</small></div>
            <div className="well-metric-box"><span>Experiment check-ins</span><strong>{projection.experiments.checkins ? `${projection.experiments.completed} / ${projection.experiments.checkins} tried` : '—'}</strong><small>{projection.experiments.averageRating === null ? 'No rating recorded' : `Mean rating ${projection.experiments.averageRating} / 5`}</small></div>
            <div className="well-metric-box"><span>Feeling notes</span><strong>{projection.feelings.loggedDays}</strong><small>days with a saved feeling note</small></div>
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
    case 'experiment': {
      const details = [
        `${String(data.title ?? 'Personal experiment')} · ${titleCase(String(data.status ?? 'active'))}`,
        typeof data.goal === 'string' ? `Aim: ${data.goal}` : '',
        typeof data.durationDays === 'number' ? `${data.durationDays} days` : '',
        Array.isArray(data.metrics) && data.metrics.length ? `Noticing: ${data.metrics.join(', ')}` : '',
        typeof data.notes === 'string' && data.notes ? `Note: ${data.notes}` : '',
      ].filter(Boolean);
      return details.join(' · ');
    }
    case 'experiment-checkin': {
      const details = [
        'Experiment check-in',
        typeof data.phase === 'string' ? titleCase(data.phase) : '',
        typeof data.completed === 'boolean' ? data.completed ? 'Completed' : 'Not completed' : '',
        typeof data.rating === 'number' ? `Rating ${data.rating}/5` : '',
        typeof data.note === 'string' && data.note ? `Note: ${data.note}` : '',
      ].filter(Boolean);
      return details.join(' · ');
    }
    case 'period': {
      const startDate = typeof data.startDate === 'string' ? data.startDate : entry.date;
      const details = [
        `Started ${fmtDate(startDate)}`,
        typeof data.endDate === 'string' ? `Ended ${fmtDate(data.endDate)}` : '',
        typeof data.cycleLength === 'number' ? `${data.cycleLength}-day cycle length noted` : '',
        typeof data.flow === 'string' && data.flow ? `Flow: ${data.flow}` : '',
        Array.isArray(data.symptoms) && data.symptoms.length ? `Symptoms: ${data.symptoms.join(', ')}` : '',
        typeof data.mood === 'string' && data.mood ? `Mood: ${data.mood}` : '',
        typeof data.notes === 'string' && data.notes ? `Note: ${data.notes}` : '',
      ].filter(Boolean);
      return details.join(' · ');
    }
    default: return 'Personal moment logged';
  }
}

function HistoryPage({ profile, entries, deleteEntry, isSaving }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const [days, setDays] = useState<7 | 30>(7);
  const records = sortNewest(withinDays(
    visibleEntriesForProfile(entries, profile.sex),
    days,
  ));
  const grouped = records.reduce<{ date: string; entries: WellnessEntry[] }[]>((groups, entry) => {
    const latestGroup = groups[groups.length - 1];
    if (latestGroup?.date === entry.date) latestGroup.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
    return groups;
  }, []);
  return <>
    <PageHeading eyebrow="YOUR OWN STORY" title={<>History,<br /><em>as it happened.</em></>} copy="A dated record of the moments you chose to keep. Each entry stays in its own category, and the quiet days remain blank." />
    <div className="history-overview">
      <div><span className="well-overline">YOUR RECORD · {days} DAYS</span><strong data-testid="text-history-count">{records.length}</strong><span>{records.length === 1 ? 'saved moment' : 'saved moments'} across {grouped.length} {grouped.length === 1 ? 'day' : 'days'}</span></div>
      <PeriodSwitch value={days} onChange={setDays} />
    </div>
    <p className="history-quiet-note"><CalendarDays size={15} /> Empty days are not zero data. Only the moments you chose to log appear here.</p>
    {grouped.length ? <div className="history-day-groups" data-testid="list-history-records">
      {grouped.map((group) => <section className="history-day-group" key={group.date} aria-label={fmtDate(group.date)}>
        <div className="history-day-label"><time dateTime={group.date}>{fmtDate(group.date, { weekday: 'long', month: 'long', day: 'numeric' })}</time><span>{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}</span></div>
        <div className="well-record-list">{group.entries.map((entry) => <RecordRow key={`${entry.key}-${entry.id}`} entry={entry} onDelete={() => { if (window.confirm('Remove this entry from your history?')) deleteEntry(entry.key); }} disabled={isSaving} />)}</div>
      </section>)}
    </div> : <Empty title="Nothing recorded in this window" copy="Choose a wider time range or add a note when you feel ready. An empty stretch is still yours." icon={<History size={19} />} />}
  </>;
}
function RecordRow({ entry, onDelete, disabled }: { entry: WellnessEntry; onDelete: () => void; disabled: boolean }) {
  const icons: Record<string, ReactNode> = { steps: <Footprints size={15} />, calories: <Activity size={15} />, sleep: <Moon size={15} />, feeling: <Heart size={15} />, energy: <Clock3 size={15} />, experiment: <Sparkles size={15} />, 'experiment-checkin': <Check size={15} />, period: <Waves size={15} /> };
  return <div className="well-record" data-testid={`row-history-${entry.id}`}>
    <div className="well-record-main"><span className="well-record-icon">{icons[entry.kind] ?? <Waves size={15} />}</span><div className="history-record-copy"><div className="well-record-title">{titleCase(entry.kind)}</div><div className="well-record-meta">{entrySummary(entry)}</div></div></div>
    <button className="well-btn ghost small" type="button" onClick={onDelete} disabled={disabled} aria-label={`Delete ${entry.kind} entry from ${fmtDate(entry.date)}`} data-testid={`button-delete-entry-${entry.id}`}><Trash2 size={13} /> Remove</button>
  </div>;
}

function formatInsightValue(value: number | null, metric: string) {
  if (value === null) return 'No entry';
  if (metric === 'sleep') return `${Math.floor(value / 60)}h ${value % 60}m`;
  if (metric === 'steps') return `${Math.round(value).toLocaleString()} steps`;
  if (metric === 'nutrition') return `${Math.round(value).toLocaleString()} kcal`;
  if (metric === 'energy') return `${Math.round(value)}%`;
  if (metric === 'feelings') return `${Math.round(value)}/10`;
  if (metric === 'period') return `${value} ${value === 1 ? 'period note' : 'period notes'}`;
  return `${value} ${value === 1 ? 'check-in' : 'check-ins'}`;
}

function InsightChart({ points, metric, days }: { points: InsightPoint[]; metric: string; days: 7 | 30 }) {
  const present = points.flatMap((point) => point.value === null ? [] : [point.value]);
  const max = Math.max(1, ...present);
  const accessibleValues = points.flatMap((point) => point.value === null
    ? []
    : [`${fmtDate(point.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${formatInsightValue(point.value, metric)}`]);
  const accessibleSummary = accessibleValues.length
    ? `${accessibleValues.length} logged days. ${accessibleValues.join('; ')}`
    : `No valid entries in this ${days}-day window.`;
  return <div className={`insight-chart insight-chart-${days}`} role="img" aria-label={`${metric} entries by day for ${days} days. ${accessibleSummary} Blank days have no saved entry.`}>
    {points.map((point, index) => {
      const value = point.value;
      const label = new Intl.DateTimeFormat('en', { weekday: days === 7 ? 'short' : undefined, day: days === 30 ? 'numeric' : undefined }).format(new Date(`${point.date}T12:00:00`));
      const showLabel = days === 7 || index === 0 || index === points.length - 1 || index % 5 === 0;
      return <div className={`insight-chart-day ${value === null ? 'is-empty' : ''}`} key={point.date} title={`${fmtDate(point.date)}: ${formatInsightValue(value, metric)}`}>
        <span className="insight-chart-value">{days === 7 && value !== null ? formatInsightValue(value, metric) : ''}</span>
        <span className="insight-chart-rail"><i style={{ transform: `scaleY(${value === null ? 0 : Math.max(.08, value / max)})` }} /></span>
        <small>{showLabel ? label : ''}</small>
      </div>;
    })}
  </div>;
}

function InsightsPage({ profile, entries }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const [days, setDays] = useState<7 | 30>(7);
  const visibleEntries = visibleEntriesForProfile(entries, profile.sex);
  const insights = buildWellnessInsights(visibleEntries, days, todayISO(), canAccessCycleTracking(profile.sex));
  const allSeries = [
    { id: 'activity', title: 'Everyday movement', kicker: 'ACTIVITY', value: insights.activity.averageSteps === null ? null : `${insights.activity.averageSteps.toLocaleString()} steps`, detail: `${insights.activity.loggedDays} of ${days} days with a step total`, metric: 'steps', series: insights.series.activity, icon: <Footprints size={17} />, note: 'Step totals recorded on days you chose to track.' },
    { id: 'nutrition', title: 'Calorie totals', kicker: 'NUTRITION LOGS', value: insights.nutrition.averageCalories === null ? null : `${insights.nutrition.averageCalories.toLocaleString()} kcal`, detail: `${insights.nutrition.loggedDays} of ${days} days with a calorie total`, metric: 'nutrition', series: insights.series.nutrition, icon: <Activity size={17} />, note: 'These are calorie totals, not meal or food logs.' },
    { id: 'sleep', title: 'Sleep notes', kicker: 'SLEEP', value: insights.sleep.averageMinutes === null ? null : `${Math.floor(insights.sleep.averageMinutes / 60)}h ${insights.sleep.averageMinutes % 60}m`, detail: `${insights.sleep.loggedDays} of ${days} days with sleep recorded`, metric: 'sleep', series: insights.series.sleep, icon: <Moon size={17} />, note: insights.sleep.bedtimeVariationMinutes === null ? 'Bedtime timing needs at least two valid notes to compare.' : `Bedtimes varied by about ${Math.floor(insights.sleep.bedtimeVariationMinutes / 60)}h ${insights.sleep.bedtimeVariationMinutes % 60}m in this window.` },
    { id: 'energy', title: 'Energy check-ins', kicker: 'ENERGY', value: insights.energy.averageLevel === null ? null : `${insights.energy.averageLevel}%`, detail: `${insights.energy.loggedDays} of ${days} days with an energy note`, metric: 'energy', series: insights.series.energy, icon: <Sun size={17} />, note: 'An average of your recorded energy levels only.' },
    { id: 'feelings', title: 'Feelings you named', kicker: 'FEELINGS', value: insights.feelings.mostLogged ? titleCase(insights.feelings.mostLogged) : null, detail: `${insights.feelings.loggedDays} of ${days} days with a feeling note`, metric: 'feelings', series: insights.series.feelings, icon: <Heart size={17} />, note: insights.feelings.counts.length ? `Most often noted: ${insights.feelings.counts.map((item) => `${titleCase(item.label)} (${item.count})`).join(' · ')}.` : 'Intensity averages and named feelings use only valid saved notes.' },
    { id: 'experiments', title: 'Experiments in practice', kicker: 'EXPERIMENTS', value: insights.experiments.checkins ? `${insights.experiments.checkins} check-ins` : insights.experiments.activeExperiments.length ? `${insights.experiments.activeExperiments.length} active` : null, detail: `${insights.experiments.checkinDays} days with check-ins · ${insights.experiments.activeExperiments.length} active experiments`, metric: 'experiments', series: insights.series.experiments, icon: <Sparkles size={17} />, note: insights.experiments.activeExperiments.length ? `Currently active: ${insights.experiments.activeExperiments.map((experiment) => experiment.title).join(', ')}.${insights.experiments.averageRating === null ? '' : ` Average check-in rating: ${insights.experiments.averageRating} of 5.`}` : insights.experiments.averageRating === null ? 'Ratings will appear here after experiment check-ins.' : `Average check-in rating: ${insights.experiments.averageRating} of 5.` },
  ];
  const periodSeries = canAccessCycleTracking(profile.sex) && insights.period ? {
    id: 'period', title: 'Cycle notes', kicker: 'OPTIONAL PERIOD LOG', value: insights.period.loggedStarts ? `${insights.period.loggedStarts} ${insights.period.loggedStarts === 1 ? 'note' : 'notes'}` : null,
    detail: `${insights.period.loggedStarts} period ${insights.period.loggedStarts === 1 ? 'entry' : 'entries'} recorded in this window`,
    metric: 'period', series: insights.period.series, icon: <Waves size={17} />,
    note: insights.period.symptoms.length ? `Symptoms noted: ${insights.period.symptoms.map((item) => `${item.label} (${item.count})`).join(' · ')}.` : 'Only cycle details you chose to record are included.',
  } : null;
  const areas = periodSeries ? [...allSeries, periodSeries] : allSeries;
  const dataPoints = areas.reduce((sum, area) => sum + area.series.filter((point) => point.value !== null).length, 0);
  return <>
    <PageHeading eyebrow="A WIDER VIEW" title={<>Your patterns,<br /><em>in context.</em></>} copy="A thoughtful read of the details you have chosen to log. These notes describe what appears in your record, never what caused it." />
    <div className="insight-window-bar">
      <div><span className="well-overline">A WINDOW INTO YOUR RECORD</span><strong data-testid="text-insights-window">{days} days</strong><span>{insights.window.start} <span aria-hidden="true">—</span> {insights.window.end}</span></div>
      <PeriodSwitch value={days} onChange={setDays} />
    </div>
    <section className="insight-reading" aria-label="A few things to notice">
      <div className="insight-reading-heading"><span className="insight-reading-mark"><Compass size={18} /></span><div><span className="well-overline">A FEW THINGS TO NOTICE</span><h2>What your notes are showing</h2></div></div>
    <div className="insight-reading-grid">
        <article><span>Strongest positive change</span><p data-testid="text-insight-positive">{insights.strongestPositive}</p></article>
        <article><span>Biggest opportunity</span><p data-testid="text-insight-opportunity">{insights.biggestOpportunity}</p></article>
        <article><span>Most consistent habit</span><p data-testid="text-insight-consistency">{insights.mostConsistentHabit}</p></article>
      </div>
      {insights.sleep.comparison && <p className="insight-caveat" data-testid="text-insight-sleep-pattern">{insights.sleep.comparison}</p>}
    </section>
    {dataPoints === 0 && <div className="insight-empty-banner" role="status" data-testid="empty-insights-window"><span><Compass size={17} /></span><div><strong>No daily patterns to compare just yet.</strong><p>These measures need valid entries in this {days}-day window. An unlogged day is not a zero, and it does not count against you.</p></div></div>}
    <div className="insight-section-head"><div><span className="well-eyebrow">AREAS OF YOUR RECORD</span><h2>One view, many rhythms</h2><p>{dataPoints} valid daily values across the areas you chose to log.</p></div></div>
    <div className="insight-area-grid" data-testid="grid-insight-areas">
      {areas.map((area, index) => <article className={`insight-area insight-area-${area.id} ${index === 0 ? 'insight-area-featured' : ''}`} key={area.id} data-testid={`card-insight-${area.id}`}>
        <div className="insight-area-top"><span className="insight-area-icon">{area.icon}</span><span className="well-overline">{area.kicker}</span></div>
        <h3>{area.title}</h3>
        <div className="insight-area-stat" data-testid={`text-insight-value-${area.id}`}>{area.value ?? 'No notes yet'}</div>
        <p className="insight-area-detail">{area.detail}</p>
        <InsightChart points={area.series} metric={area.metric} days={days} />
        <p className="insight-area-note">{area.note}</p>
        {area.series.every((point) => point.value === null) && <span className="insight-no-data">No valid entries in this window</span>}
      </article>)}
    </div>
    <p className="insight-data-note"><span className="insight-note-stamp">A NOTE ON THE DATA</span> Empty days are not zero data. Charts leave them blank, and summaries use only valid saved entries. These patterns are observations—not explanations, predictions, or medical advice.</p>
    <section className="insight-focus" data-testid="card-recommended-focus">
      <div><span className="well-overline">NEXT WEEK’S FOCUS</span><h2>{insights.recommendedFocus.title}</h2><p>Choose this only if it feels useful. Your record is here to support curiosity, not create a new obligation.</p></div>
      <Link href={insights.recommendedFocus.href} className="well-btn">{insights.recommendedFocus.actionLabel}<ArrowRight size={15} /></Link>
    </section>
  </>;
}

function SleepPage({ profile, entries, save, isSaving }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const [bedtime, setBedtime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('06:30');
  const [duration, setDuration] = useState('480');
  const [quality, setQuality] = useState(3);
  const [nap, setNap] = useState('0');
  const [referenceHours, setReferenceHours] = useState(() => {
    if (typeof window === 'undefined') return 8;
    let stored = NaN;
    try {
      stored = Number(window.localStorage.getItem(`future-me-sleep-reference-hours:${profile.id}`));
    } catch {
      stored = NaN;
    }
    return Number.isFinite(stored) && stored >= 4 && stored <= 12 ? stored : 8;
  });
  const recent = sortNewest(withinDays(entries.filter((entry) => entry.kind === 'sleep'), 14));
  const targetMinutes = referenceHours * 60;
  const summary = sleepSummary(entries, 7, todayISO(), targetMinutes);
  const averageMinutes = summary.averageMinutes;
  const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const updateDurationFromTimes = (nextBedtime: string, nextWakeTime: string) => {
    const minutes = (timeToMinutes(nextWakeTime) - timeToMinutes(nextBedtime) + 1440) % 1440;
    setDuration(String(minutes));
  };
  const logSleep = (event: FormEvent) => {
    event.preventDefault();
    const durationMinutes = Number(duration);
    const napMinutes = nap === '' ? undefined : Number(nap);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return;
    if (napMinutes !== undefined && (!Number.isInteger(napMinutes) || napMinutes < 0 || napMinutes > 600)) return;
    save(makeInput(dateKey('sleep'), 'sleep', todayISO(), {
      bedtime, wakeTime, durationMinutes, quality, napMinutes, referenceTargetMinutes: targetMinutes,
    }), 'Sleep note saved. Your rest belongs to your own record.');
  };
  const updateTarget = (value: number) => {
    setReferenceHours(value);
    try {
      window.localStorage.setItem(`future-me-sleep-reference-hours:${profile.id}`, String(value));
    } catch {
      // The selected reference still applies for this session when storage is unavailable.
    }
  };
  const trendMaximum = Math.max(1, targetMinutes, ...summary.trend.map((point) => point.value ?? 0));
  const shortfallCopy = summary.loggedNights
    ? summary.estimatedDebtMinutes > 0
      ? `${formatDuration(summary.estimatedDebtMinutes)} estimated shortfall across ${summary.loggedNights} logged ${summary.loggedNights === 1 ? 'night' : 'nights'}.`
      : `No estimated shortfall against your reference across ${summary.loggedNights} logged ${summary.loggedNights === 1 ? 'night' : 'nights'}.`
    : 'A shortfall estimate will appear after you save a sleep note.';
  return <>
    <PageHeading eyebrow="REST & RHYTHM" title={<>Sleep,<br /><em>in your own words.</em></>} copy="Record the shape of your rest and notice your rhythms. Any estimate is based only on details you choose to save." />
    <div className="well-grid two sleep-top-grid">
      <Card>
        <CardHeading label="A sleep note for last night" icon={<Moon size={17} />} />
        <form className="well-form" onSubmit={logSleep}>
          <div className="well-form-row">
            <Field label="Bedtime"><input type="time" value={bedtime} onChange={(event) => { setBedtime(event.target.value); updateDurationFromTimes(event.target.value, wakeTime); }} required data-testid="input-sleep-bedtime" /></Field>
            <Field label="Wake time"><input type="time" value={wakeTime} onChange={(event) => { setWakeTime(event.target.value); updateDurationFromTimes(bedtime, event.target.value); }} required data-testid="input-sleep-wake" /></Field>
          </div>
          <div className="well-form-row">
            <Field label="Total sleep duration (minutes)"><input type="number" min="1" max="1440" step="1" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} required data-testid="input-sleep-duration" /></Field>
            <Field label="How rested did it feel?">
              <select value={quality} onChange={(event) => setQuality(Number(event.target.value))} data-testid="select-sleep-quality">
                {[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number} — {['Not rested', 'A little rested', 'Somewhat rested', 'Rested', 'Very rested'][number - 1]}</option>)}
              </select>
            </Field>
          </div>
          <div className="well-form-row">
            <Field label="Nap, if any (minutes)"><input type="number" min="0" max="600" value={nap} onChange={(event) => setNap(event.target.value)} data-testid="input-sleep-nap" /></Field>
          </div>
          <p className="well-inline-note">Duration starts from your bedtime and wake time, and you can adjust it to match your own estimate. Nap minutes stay separate.</p>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={isSaving} data-testid="button-save-sleep"><Check size={14} /> Save sleep note</button></div>
        </form>
      </Card>
      <Card>
        <CardHeading label="Your recent sleep" icon={<BedDouble size={17} />} />
        {averageMinutes === null ? <Empty title="No sleep notes yet" copy="A few nights of your own notes will make these summaries useful." icon={<Moon size={18} />} /> : <>
          <div className="sleep-summary-lead" data-testid="text-sleep-shortfall"><span>Estimated sleep shortfall</span><strong>{shortfallCopy}</strong></div>
          <div className="well-data-grid sleep-data-grid">
            <div className="well-data-cell"><span>Average across logged nights</span><strong data-testid="text-sleep-average">{formatDuration(averageMinutes)}</strong></div>
            <div className="well-data-cell"><span>Your reference</span><strong>{formatDuration(summary.referenceTargetMinutes)}</strong></div>
            <div className="well-data-cell"><span>Logged nights</span><strong>{summary.loggedNights} of 7</strong></div>
          </div>
          <p className="well-note">{summary.bedtimeVariationMinutes === null
            ? 'Bedtime consistency needs at least two logged nights.'
            : `Bedtimes varied by about ${formatDuration(summary.bedtimeVariationMinutes)} across your logged nights in this seven-day sample.`}</p>
        </>}
        <div style={{ marginTop: 15 }}>
          <Field label="Your own reference (hours)">
            <select value={referenceHours} onChange={(event) => updateTarget(Number(event.target.value))} data-testid="select-sleep-reference">
              {Array.from({ length: 17 }, (_, index) => 4 + index * .5).map((hour) => <option key={hour} value={hour}>{hour} hours</option>)}
            </select>
          </Field>
        </div>
        <p className="well-note">This is an estimate from your saved sleep duration, optional nap, and chosen reference. It is not a medical measurement.</p>
      </Card>
    </div>
    <section className="well-section sleep-trend-section">
      <div className="well-section-head"><div><span className="well-eyebrow">SEVEN-DAY VIEW</span><h2>Your recovery trend</h2></div></div>
      <Card className="sleep-trend-card">
        <div className="sleep-trend-chart" role="img" aria-label="Seven-day sleep duration trend. Blank columns are nights without a saved sleep note." data-testid="chart-sleep-trend">
          {summary.trend.map((point) => {
            const height = point.value === null ? 0 : Math.max(7, Math.round((point.value / trendMaximum) * 100));
            return <div className={`sleep-trend-day ${point.value === null ? 'is-blank' : ''}`} key={point.date} data-testid={`sleep-trend-day-${point.date}`} title={`${fmtDate(point.date)}: ${point.value === null ? 'not logged' : formatDuration(point.value)}`}>
              <span className="sleep-trend-value">{point.value === null ? '' : formatDuration(point.value)}</span>
              <span className="sleep-trend-track"><i style={{ height: `${height}%` }} /></span>
              <small>{new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${point.date}T12:00:00`))}</small>
            </div>;
          })}
        </div>
        <p className="well-note">Each mark is a saved duration. Missing nights stay blank, not zero.</p>
      </Card>
    </section>
    <section className="well-section sleep-goal-section">
      <div className="well-section-head"><div><span className="well-eyebrow">A GENTLE POSSIBILITY</span><h2>Tonight&apos;s small goal</h2></div></div>
      <div className="well-grid two">
        <Card className="sleep-goal-card">
          <CardHeading label="Choose what feels kind" icon={<Moon size={17} />} />
          <p className="sleep-goal-intro" data-testid="text-sleep-goal">{summary.estimatedDebtMinutes > 0
            ? 'If it suits your evening, try making room for rest a little earlier — even 10 minutes is a small start.'
            : 'A calm wind-down or a wake time that feels familiar may be enough for tonight.'}</p>
          <ul className="sleep-suggestion-list">
            <li>Move bedtime earlier by 10–15 minutes, only if it feels workable.</li>
            <li>Keep a wake time that feels steady for your life.</li>
            <li>A short daytime rest can be an option when you need one.</li>
            <li>If late caffeine seems relevant to you, consider having it a little earlier.</li>
            <li>Try a brief wind-down that helps you shift out of the day.</li>
          </ul>
          <p className="well-note">No perfect schedule is expected. These are small options, not instructions.</p>
        </Card>
        <Card>
          <CardHeading label="Recent nights" icon={<History size={17} />} />
          {recent.length ? <div className="well-record-list">{recent.slice(0, 7).map((entry) => {
            const sleep = readData<SleepData>(entry)!;
            return <div className="well-record" key={entry.key} data-testid={`sleep-record-${entry.date}`}>
              <div className="well-record-main"><span className="well-record-icon"><Moon size={15} /></span><div><div className="well-record-title">{fmtDate(entry.date)}</div><div className="well-record-meta">{sleep.bedtime} to {sleep.wakeTime} · quality {sleep.quality}/5{sleep.napMinutes ? ` · ${sleep.napMinutes}m nap` : ''}</div></div></div>
              <strong className="well-record-value">{formatDuration(sleep.durationMinutes)}</strong>
            </div>;
          })}</div> : <Empty title="Your first sleep note will live here" copy="Nothing is prefilled. Start with last night whenever you are ready." icon={<Moon size={18} />} />}
        </Card>
      </div>
      <p className="sleep-disclaimer" data-testid="text-sleep-estimate-disclaimer">Sleep shortfall and bedtime patterns are personal estimates from saved entries, not medical measurements or advice.</p>
    </section>
  </>;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function FiveMinutePage({ entries, save, isSaving }: ReturnType<typeof useWellness>) {
  const [level, setLevel] = useState<EnergyData['level'] | null>(null);
  const action = level === null ? '' : energyAction(level);
  const energyEntries = sortNewest(entries.filter((entry) => entry.kind === 'energy'));
  const history = energyEntries.slice(0, 10);
  const consistency = loggingConsistency(entries, 7, todayISO());
  const completeAction = () => {
    if (level === null) return;
    save(makeInput(`energy-${todayISO()}-${Date.now()}`, 'energy', todayISO(), { level, action, completed: true }), 'Your action is saved in your personal record.');
  };
  return <>
    <PageHeading eyebrow="A MOMENT THAT FITS" title={<>Five minutes,<br /><em>at your pace.</em></>} copy="Do what matches your energy today. Choose one small option, adapt it, or leave it for later." />
    <div className="well-grid two">
      <Card>
        <CardHeading label="How much energy do you have today?" icon={<Sun size={17} />} />
        <h2 className="energy-question">How much energy do you have today?</h2>
        <div className="well-energy-actions" role="group" aria-label="Choose current energy level">
          {([10, 30, 50, 70, 90] as const).map((value) => <button type="button" key={value} aria-pressed={level === value} onClick={() => setLevel(value)} data-testid={`button-energy-${value}`}><span>{value}%</span><small>{value < 30 ? 'Very low' : value < 50 ? 'Low' : value < 70 ? 'Steady' : value < 90 ? 'Good' : 'Plenty'}</small></button>)}
        </div>
        {level !== null ? <div className="well-action-panel" style={{ marginTop: 17 }} aria-live="polite" data-testid="text-energy-matched-action"><span className="well-overline">ONE PRACTICAL OPTION · {level}%</span><strong style={{ marginTop: 7 }}>{action}</strong><p>Only a suggestion. Keep it, adapt it, or leave it for later.</p></div> : <div className="well-callout" style={{ marginTop: 17 }}>There is no ideal answer. Choose the number that feels closest today.</div>}
        <p className="energy-philosophy">Do what matches your energy today.</p>
        <div className="well-actions" style={{ marginTop: 16 }}><button type="button" className="well-btn" onClick={completeAction} disabled={level === null || isSaving} data-testid="button-complete-five-minute"><Check size={14} /> {isSaving ? 'Saving…' : 'Mark this complete'}</button><button type="button" className="well-btn ghost" onClick={() => setLevel(null)} disabled={level === null || isSaving} data-testid="button-reset-energy">Choose again</button></div>
      </Card>
      <Card>
        <CardHeading label="Seven-day consistency" icon={<CalendarDays size={17} />} />
        <div className="energy-consistency" data-testid="text-energy-consistency"><strong>{consistency.loggedDays} of 7</strong><span>days with a saved wellness note or completed action</span></div>
        <div className="energy-week" role="img" aria-label={`${consistency.loggedDays} of 7 days with a saved note or completed energy action`}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = dateOffset(todayISO(), index - 6);
            const hasRecord = entries.some((entry) => entry.date === date && (entry.kind !== 'energy' || readData<EnergyData>(entry)?.completed === true));
            return <div className={`energy-week-day ${hasRecord ? 'is-logged' : ''}`} key={date} data-testid={`energy-consistency-day-${date}`}><span>{hasRecord ? <Check size={12} /> : null}</span><small>{new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${date}T12:00:00`))}</small></div>;
          })}
        </div>
        <p className="well-note">A day counts when you saved a wellness note or marked an energy action complete. Quiet days are not a problem.</p>
      </Card>
    </div>
    <section className="well-section energy-history-section">
      <div className="well-section-head"><div><span className="well-eyebrow">YOUR SAVED RECORD</span><h2>Daily history</h2></div></div>
      <Card>
        <CardHeading label="Recent moments" icon={<Clock3 size={17} />} />
        {history.length ? <div className="well-timeline">{history.map((entry) => {
          const data = readData<EnergyData>(entry)!;
          return <div className="well-timeline-item" key={entry.key} data-testid={`energy-history-${entry.key}`}><time>{fmtDate(entry.date, { month: 'short', day: 'numeric' })} · {data.level}% energy</time><strong>{data.action}</strong><p>{data.completed ? 'Completed and saved' : 'Saved as an option, not counted as a logged day'}</p></div>;
        })}</div> : <Empty title="No moments to look back on" copy="Completed actions you choose to save will appear here." icon={<Clock3 size={18} />} />}
      </Card>
    </section>
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
  { value: 'other', title: 'Other' },
];
function FeelingsPage({ profile, entries, save, isSaving }: ReturnType<typeof useWellness> & { profile: Profile }) {
  const [feeling, setFeeling] = useState<FeelingWellnessData['feeling'] | ''>('');
  const [intensity, setIntensity] = useState(5);
  const [note, setNote] = useState('');
  const [selectedFeeling, setSelectedFeeling] = useState('');
  const summary = feelingPatternSummary(entries, selectedFeeling || undefined, todayISO(), 7);
  const loggedFeelings = sortNewest(entries.filter((entry) => entry.kind === 'feeling'));
  const recentFeelings = loggedFeelings.slice(0, 8);
  const savedFeelingLabels = [...new Set(loggedFeelings.map((entry) => String(readData<FeelingData>(entry)?.feeling ?? '')))]
    .filter((value) => feelingOptions.some((option) => option.value === value));
  const inspectedFeeling = summary.feeling;
  const selectedHistory = selectedFeeling || inspectedFeeling || '';
  const reportedToday = !!inspectedFeeling && loggedFeelings.some((entry) =>
    entry.date === todayISO() && readData<FeelingData>(entry)?.feeling === inspectedFeeling,
  );
  const recentFeelingReport = inspectedFeeling
    ? reportedToday
      ? `You reported feeling ${inspectedFeeling} today.`
      : `You reported feeling ${inspectedFeeling} on ${summary.feelingDays} ${summary.feelingDays === 1 ? 'day' : 'days'} in the last seven days.`
    : 'Save a check-in to compare it with your recent notes.';
  const saveFeeling = (event: FormEvent) => {
    event.preventDefault();
    if (!feeling) return;
    const savedFeeling = feeling;
    save(
      makeInput(dateKey(`feeling-${Date.now()}`), 'feeling', todayISO(), { feeling: savedFeeling, intensity, note: note.trim() || undefined }),
      'Your check-in has been added to your personal record.',
      () => {
        setSelectedFeeling(savedFeeling);
        setNote('');
      },
    );
  };
  const metricSummary = (label: string, metric: typeof summary.sleep, unit: string) => {
    if (metric.matchedDays < 2 || metric.belowAverageDays === null || metric.recentAverage === null) return null;
    const average = unit === 'minutes'
      ? `${Math.floor(Math.round(metric.recentAverage) / 60)}h ${Math.round(metric.recentAverage) % 60}m`
      : Math.round(metric.recentAverage).toLocaleString();
    const observation = label === 'sleep'
      ? `On ${metric.belowAverageDays} of ${metric.matchedDays} days you reported ${inspectedFeeling}, your logged sleep duration was below your recent average (${average}).`
      : label === 'step totals'
        ? `On ${metric.belowAverageDays} of ${metric.matchedDays} days you reported ${inspectedFeeling}, your step total was below your recent average (${average}).`
        : `On ${metric.belowAverageDays} of ${metric.matchedDays} days you reported ${inspectedFeeling}, your selected energy level was below your recent average (${average}).`;
    return <div className="feeling-pattern-line" key={label} data-testid={`text-feeling-pattern-${label.replaceAll(' ', '-')}`}>
      <strong>{label}</strong><span>{observation}</span>
    </div>;
  };
  const repeatedOverlap = (days: number, label: string) => days >= 2
    ? <div className="feeling-pattern-line" key={label} data-testid={`text-feeling-overlap-${label.replaceAll(' ', '-')}`}>
        <strong>{label}</strong><span>These entries were saved on {days} of the {summary.feelingDays} days you reported feeling {inspectedFeeling}.</span>
      </div>
    : null;
  return <>
    <PageHeading eyebrow="A CHECK-IN WITH YOURSELF" title={<>Why Do I Feel<br /><em>Like This?</em></>} copy="A private place to notice what is here, and what your own recent notes share the page with. Patterns are observations, never explanations." />
    <div className="well-grid two feelings-top-grid">
      <Card className="feeling-checkin-card">
        <CardHeading label="A note for today" icon={<Heart size={17} />} />
        <h2 className="feeling-question">How are you feeling?</h2>
        <form className="well-form" onSubmit={saveFeeling}>
          <span className="well-label">Choose the words that fit best</span>
          <div className="well-choice-row feeling-choice-grid" role="group" aria-label="Choose one feeling">
            {feelingOptions.map((option) => <button type="button" key={option.value} className="well-choice" aria-pressed={feeling === option.value} onClick={() => setFeeling(option.value)} data-testid={`button-feeling-${option.value.replaceAll(' ', '-')}`}>{option.title}</button>)}
          </div>
          <Field label="Intensity, from 1 to 10"><div className="feeling-intensity-control"><input id="input-feeling-intensity" className="well-range" type="range" min="1" max="10" step="1" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} aria-label="Feeling intensity from 1 to 10" aria-valuetext={`${intensity} out of 10`} data-testid="input-feeling-intensity" /><output htmlFor="input-feeling-intensity" data-testid="text-feeling-intensity">{intensity}<small> / 10</small></output></div></Field>
          <Field label="A private note (optional)"><textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything you want to remember about this moment…" data-testid="input-feeling-note" /></Field>
          <div className="well-actions"><button className="well-btn" type="submit" disabled={!feeling || isSaving} data-testid="button-save-feeling"><Check size={14} /> {isSaving ? 'Saving your note…' : 'Save this check-in'}</button><span className="feeling-private-note">Only what you choose to record appears here.</span></div>
        </form>
      </Card>
      <Card className="feeling-history-card">
        <CardHeading label="Saved feeling history" icon={<History size={17} />} />
        {recentFeelings.length ? <div className="well-record-list feeling-history-list">
          {recentFeelings.map((entry) => {
            const data = readData<FeelingData>(entry);
            if (!data) return null;
            const active = selectedHistory === data.feeling;
            return <button className={`well-record feeling-history-row ${active ? 'is-selected' : ''}`} type="button" key={entry.key} aria-pressed={active} aria-label={`Inspect ${titleCase(data.feeling)} pattern recorded ${fmtDate(entry.date)}`} onClick={() => setSelectedFeeling(data.feeling)} data-testid={`button-inspect-feeling-${entry.id}`}>
              <span className="well-record-main"><span className="well-record-icon"><Heart size={15} /></span><span><span className="well-record-title">{titleCase(data.feeling)} · {data.intensity}/10</span><span className="well-record-meta">{fmtDate(entry.date)}{data.note ? ` · ${data.note}` : ''}</span></span></span><ArrowRight size={15} />
            </button>;
          })}
        </div> : <Empty title="Your first note can start here" copy="Saved check-ins will gather here in your private record." icon={<Heart size={18} />} />}
        {savedFeelingLabels.length > 1 && <div className="feeling-history-filter"><label htmlFor="feeling-pattern-select">Inspect a saved feeling</label><select id="feeling-pattern-select" value={selectedHistory} onChange={(event) => setSelectedFeeling(event.target.value)} data-testid="select-feeling-pattern">
          {savedFeelingLabels.map((label) => <option key={label} value={label}>{titleCase(label)}</option>)}
        </select></div>}
      </Card>
    </div>
    <section className="well-section feeling-pattern-section">
      <div className="well-section-head"><div><span className="well-eyebrow">A LOOK AT YOUR OWN NOTES</span><h2>{inspectedFeeling ? `${titleCase(inspectedFeeling)} · recent pattern` : 'Your recent pattern'}</h2></div><span className="feeling-window-label">LAST SEVEN DAYS</span></div>
      <p className="feeling-current-report" data-testid="text-feeling-current-report">{recentFeelingReport}</p>
      <div className="well-grid two feeling-insights-grid">
        <Card className="feeling-trend-card">
          <CardHeading label="Intensity over seven days" icon={<Activity size={17} />} />
          <div className="feeling-trend-chart" role="img" aria-label={`Seven-day intensity trend for ${inspectedFeeling ? titleCase(inspectedFeeling) : 'your selected feeling'}. Blank days mean no matching feeling was saved.`} data-testid="chart-feeling-intensity">
            {summary.trend.map((point) => <div key={point.date} className={`feeling-trend-day ${point.value === null ? 'is-blank' : ''}`} title={`${fmtDate(point.date)}: ${point.value === null ? 'no matching entry' : `${point.value.toFixed(1).replace(/\.0$/, '')} out of 10`}`} data-testid={`feeling-trend-day-${point.date}`}>
              <span className="feeling-trend-value">{point.value === null ? '' : point.value.toFixed(1).replace(/\.0$/, '')}</span>
              <span className="feeling-trend-track"><i style={{ height: point.value === null ? '0%' : `${point.value * 10}%` }} /></span>
              <small>{new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${point.date}T12:00:00`))}</small>
            </div>)}
          </div>
          <div className="feeling-average-row"><span>Average intensity on {summary.feelingDays} {summary.feelingDays === 1 ? 'day' : 'days'} recorded</span><strong>{summary.averageIntensity === null ? '—' : `${summary.averageIntensity}/10`}</strong></div>
          <p className="well-note">Only saved entries appear as marks. Missing days stay blank, not zero.</p>
        </Card>
        <Card className="feeling-observations-card">
          <CardHeading label="What these notes share the page with" icon={<Compass size={17} />} />
          <div className="feeling-summary-stats" data-testid="summary-feeling-coverage">
            <div><span>Feeling days</span><strong>{summary.feelingDays} / 7</strong></div>
            <div><span>Days with any saved log</span><strong>{summary.loggingConsistency.loggedDays} / 7</strong></div>
            <div><span>Selected feeling</span><strong>{inspectedFeeling ? titleCase(inspectedFeeling) : '—'}</strong></div>
          </div>
          {summary.enoughData ? <div className="feeling-pattern-copy" data-testid="summary-feeling-patterns">
            {summary.possiblePatterns.length > 0 && <strong className="feeling-pattern-kicker">Possible pattern to watch</strong>}
            <div className="feeling-patterns-list">
              {summary.possiblePatterns.map((pattern, index) => <p className="well-callout" key={`${index}-${pattern}`} data-testid={`text-possible-pattern-${index}`}>{pattern}</p>)}
              {metricSummary('sleep', summary.sleep, 'minutes')}
              {metricSummary('step totals', summary.steps, 'steps')}
              {metricSummary('logged energy levels', summary.energy, 'levels')}
              {repeatedOverlap(summary.calories.feelingDaysLogged, 'calorie logging')}
              {repeatedOverlap(summary.experiments.feelingDaysLogged, 'experiment check-ins')}
              {profile.sex === 'female' && repeatedOverlap(summary.period.feelingDaysLogged, 'cycle dates')}
              {!summary.possiblePatterns.length && summary.sleep.matchedDays < 2 && summary.steps.matchedDays < 2 && summary.energy.matchedDays < 2 && summary.calories.feelingDaysLogged < 2 && summary.experiments.feelingDaysLogged < 2 && (profile.sex !== 'female' || summary.period.feelingDaysLogged < 2) &&
                <p className="feeling-neutral-observation" data-testid="text-feeling-neutral-summary">Your saved entries do not show a repeated overlap to describe in this window.</p>}
            </div>
            <div className="feeling-log-coverage" data-testid="summary-feeling-log-coverage">
              <strong>Saved notes in this window</strong>
              <span>Sleep recorded alongside this feeling on {summary.sleep.matchedDays} days · recent logged average {summary.sleep.recentAverage === null ? 'not available' : `${Math.round(summary.sleep.recentAverage).toLocaleString()} minutes`}</span>
              <span>Step totals alongside this feeling on {summary.steps.matchedDays} days · recent logged average {summary.steps.recentAverage === null ? 'not available' : Math.round(summary.steps.recentAverage).toLocaleString()}</span>
              <span>Energy levels alongside this feeling on {summary.energy.matchedDays} days · recent logged average {summary.energy.recentAverage === null ? 'not available' : `${summary.energy.recentAverage}/100`}</span>
              <span>Calorie totals logged on {summary.calories.daysLogged} days · present on {summary.calories.feelingDaysLogged} selected-feeling days</span>
              <span>Experiment check-ins on {summary.experiments.daysLogged} days · present on {summary.experiments.feelingDaysLogged} selected-feeling days</span>
              {profile.sex === 'female' && <span>Logged cycle dates overlap {summary.period.feelingDaysLogged} selected-feeling days</span>}
            </div>
            <p className="feeling-caution">Your logs cannot establish a cause. This is only a record of dates you chose to note.</p>
            {profile.sex === 'female' && <Link className="well-link feeling-cycle-link" href="/periods">View your private cycle notes <ArrowRight size={13} /></Link>}
          </div> : <div className="feeling-insufficient" role="note" data-testid="text-feeling-insufficient">Keep logging for a few more days and we'll look for patterns.</div>}
        </Card>
      </div>
      <div className="well-grid two feeling-connection-row">
        <p className="feeling-private-note">Logged amounts are shown as record coverage only, without a target or judgement.</p>
        <div className="feeling-shortcuts" aria-label="Continue exploring your personal notes">
          <Link href="/sleep" className="well-shortcut"><Moon size={18} /><span>Sleep Debt Recovery</span><ArrowUpRight size={14} /></Link>
          <Link href="/five-minute" className="well-shortcut"><Clock3 size={18} /><span>5-Minute Version of Me</span><ArrowUpRight size={14} /></Link>
          <Link href="/experiments" className="well-shortcut"><Sparkles size={18} /><span>Wellness Experiments</span><ArrowUpRight size={14} /></Link>
          <Link href="/future-me" className="well-shortcut"><Compass size={18} /><span>Future Me</span><ArrowUpRight size={14} /></Link>
        </div>
      </div>
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
  const [editingKey, setEditingKey] = useState('');
  const [formError, setFormError] = useState('');
  const cycle = cycleSummary(entries, todayISO());
  const cycleData = cycle.history.map((entry) => ({
    entry,
    data: {
      ...(readData<PeriodData>(entry) ?? { startDate: entry.date }),
      startDate: readData<PeriodData>(entry)?.startDate || entry.date,
    },
  }));
  const latest = cycleData[0];
  const intervalRange = cycle.recentStartIntervals.filter((length) => length >= 15 && length <= 90);
  const symptomCounts = new Map<string, number>();
  cycleData.forEach(({ data }) => (data.symptoms ?? []).forEach((symptom) =>
    symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1),
  ));
  const symptomHistory = cycleData.filter(({ data }) =>
    (data.symptoms?.length ?? 0) > 0 || Boolean(data.mood),
  );
  const resetForm = () => {
    setStartDate(todayISO());
    setEndDate('');
    setCycleLength('');
    setFlow('');
    setSymptoms([]);
    setMood('');
    setNotes('');
    setEditingKey('');
    setFormError('');
  };
  const toggleSymptom = (item: string) => setSymptoms((current) => {
    if (item === 'No symptoms') return current.includes(item) ? [] : [item];
    const withoutNoSymptoms = current.filter((value) => value !== 'No symptoms');
    return withoutNoSymptoms.includes(item)
      ? withoutNoSymptoms.filter((value) => value !== item)
      : [...withoutNoSymptoms, item];
  });
  const editCycle = (entry: WellnessEntry, data: PeriodData) => {
    setEditingKey(entry.key);
    setStartDate(data.startDate || entry.date);
    setEndDate(data.endDate ?? '');
    setCycleLength(data.cycleLength === undefined ? '' : String(data.cycleLength));
    setFlow(data.flow ?? '');
    setSymptoms(Array.isArray(data.symptoms) ? data.symptoms : []);
    setMood(data.mood ?? '');
    setNotes(data.notes ?? '');
    setFormError('');
  };
  const logCycle = (event: FormEvent) => {
    event.preventDefault();
    if (!startDate || startDate > todayISO()) {
      setFormError('Choose a start date that is today or earlier.');
      return;
    }
    if (endDate && (endDate < startDate || endDate > todayISO())) {
      setFormError('Choose an end date between the start date and today.');
      return;
    }
    const parsedCycleLength = cycleLength === '' ? undefined : Number(cycleLength);
    if (parsedCycleLength !== undefined &&
      (!Number.isInteger(parsedCycleLength) || parsedCycleLength < 1 || parsedCycleLength > 365)) {
      setFormError('Enter a whole cycle length from 1 to 365 days, or leave it blank.');
      return;
    }
    if (flow.length > 120 || mood.length > 80 || notes.length > 1000 || symptoms.length > 20) {
      setFormError('Keep flow notes under 120 characters, mood under 80, notes under 1,000, and symptoms to 20.');
      return;
    }
    const duplicateStart = cycleData.some(({ entry }) =>
      entry.key !== editingKey && entry.date === startDate,
    );
    if (duplicateStart) {
      setFormError('You already have a cycle note for that start date. Edit that note instead.');
      return;
    }
    setFormError('');
    const data: PeriodData = {
      startDate, endDate: endDate || undefined, cycleLength: parsedCycleLength,
      flow: flow || undefined, symptoms: symptoms.length ? symptoms : undefined, mood: mood || undefined, notes: notes.trim() || undefined,
    };
    const key = cycleEntryKey(startDate, editingKey);
    save(
      makeInput(key, 'period', startDate, data),
      editingKey ? 'Your cycle note has been updated.' : 'Cycle note saved. Dates remain yours to interpret.',
      resetForm,
    );
  };
  return <>
    <PageHeading eyebrow="YOUR BODY, YOUR RHYTHM" title={<>Periods,<br /><em>simply recorded.</em></>} copy="A private place for cycle dates and notes. Any date ahead is an estimate based only on your own logs." />
    <div className="well-grid two">
      <Card>
        <CardHeading label={editingKey ? 'Edit a cycle note' : 'Add a cycle note'} icon={<Waves size={17} />} />
        {editingKey && <p className="well-callout cycle-editing-note">You’re editing a saved cycle note. The original entry will be updated.</p>}
        <form className="well-form" onSubmit={logCycle}>
          <div className="well-form-row">
            <Field label="Period start date" id="input-period-start"><input id="input-period-start" type="date" max={todayISO()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required data-testid="input-period-start" /></Field>
            <Field label="Period end date (optional)" id="input-period-end"><input id="input-period-end" type="date" min={startDate} max={todayISO()} value={endDate} onChange={(event) => setEndDate(event.target.value)} data-testid="input-period-end" /></Field>
          </div>
          <div className="well-form-row">
            <Field label="Cycle length in days (optional)" id="input-period-length"><input id="input-period-length" type="number" min="1" max="365" step="1" inputMode="numeric" placeholder="Days" value={cycleLength} onChange={(event) => setCycleLength(event.target.value)} data-testid="input-period-length" /></Field>
            <Field label="Flow notes (optional)" id="input-period-flow"><input id="input-period-flow" maxLength={120} value={flow} onChange={(event) => setFlow(event.target.value)} placeholder="Anything you want to note" data-testid="input-period-flow" /></Field>
          </div>
          <p className="well-inline-note">Your values stay in your history. Estimates use recorded lengths or recent start-to-start intervals from 15 to 90 days; wider values won’t drive an estimate.</p>
          <div className="well-field"><span className="well-label">Symptoms, if you want to note them</span><div className="well-check-row">{cycleSymptoms.map((item) => <label key={item}><input type="checkbox" checked={symptoms.includes(item)} onChange={() => toggleSymptom(item)} data-testid={`checkbox-period-symptom-${item.toLowerCase().replaceAll(' ', '-')}`} />{item}</label>)}</div></div>
          <div className="well-form-row">
            <Field label="Mood (optional)" id="input-period-mood"><input id="input-period-mood" maxLength={80} value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Your words" data-testid="input-period-mood" /></Field>
            <Field label="Other notes (optional)" id="input-period-notes"><textarea id="input-period-notes" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything you want to remember" data-testid="input-period-notes" /></Field>
          </div>
          {formError && <div className="well-error" role="alert" data-testid="error-period-form">{formError}</div>}
          <div className="well-actions">
            <button className="well-btn" type="submit" disabled={isSaving} data-testid="button-save-period"><Check size={14} /> {isSaving ? 'Saving…' : editingKey ? 'Update cycle note' : 'Save cycle note'}</button>
            {editingKey && <button className="well-btn ghost" type="button" onClick={resetForm} disabled={isSaving} data-testid="button-cancel-period-edit">Cancel edit</button>}
          </div>
        </form>
      </Card>
      <Card className="cycle-snapshot-card">
        <CardHeading label="Your cycle, from your notes" icon={<CalendarDays size={17} />} />
        <div className="cycle-snapshot-grid">
          <div className="well-metric-box"><span>Current cycle day</span><strong data-testid="text-current-cycle-day">{cycle.cycleDay ?? '—'}</strong><small>{latest ? `From ${fmtDate(latest.data.startDate)}` : 'Add a start date to begin'}</small></div>
          <div className="well-metric-box cycle-estimate-box"><span>Estimated next period</span>
            <strong data-testid="text-estimated-next-period">{cycle.estimatedNextPeriod ? fmtDate(cycle.estimatedNextPeriod, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</strong>
            <small>Estimate only</small>
          </div>
        </div>
        {cycle.estimatedNextPeriod
          ? <p className="well-note">{cycle.estimateSource === 'recorded'
              ? `Based on the ${cycle.estimatedCycleLength}-day length you recorded most recently.`
              : `Based on the median of your recent logged intervals (${cycle.estimatedCycleLength} days).`}
            {intervalRange.length > 1 ? ` Recent recorded intervals range from ${Math.min(...intervalRange)} to ${Math.max(...intervalRange)} days.` : ''} This may not match what happens.
          </p>
          : cycle.estimateIsPast
            ? <p className="well-note" data-testid="text-cycle-estimate-past">The previous estimate has passed based on the dates saved. Add a new start date for an updated estimate.</p>
            : latest
              ? <p className="well-note">There isn’t enough recent information for an estimate yet. A single start date alone is not used to project one.</p>
              : <p className="well-note">Your current cycle day and any next-period date will appear after you choose to log a start date.</p>}
        <div className="well-callout cycle-privacy-note"><strong>Private to your signed-in account.</strong> Dates ahead are estimates, not medical predictions. This record does not diagnose or infer a condition.</div>
      </Card>
    </div>
    <section className="well-section cycle-history-section"><div className="well-section-head"><div><span className="well-eyebrow">YOUR OWN RECORD</span><h2>Cycle history</h2></div><span className="well-inline-note">{cycleData.length} {cycleData.length === 1 ? 'start logged' : 'starts logged'}</span></div>
      {cycleData.length ? <div className="well-record-list">{cycleData.map(({ entry, data }) => <div className="well-record cycle-history-row" key={entry.key} data-testid={`row-cycle-history-${entry.id}`}>
        <div className="well-record-main"><span className="well-record-icon"><Waves size={15} /></span><div>
          <div className="well-record-title">Started {fmtDate(data.startDate)}</div>
          <div className="well-record-meta">
            {data.endDate ? `Ended ${fmtDate(data.endDate)}` : 'End date not recorded'}
            {data.cycleLength !== undefined ? ` · ${data.cycleLength}-day length noted` : ''}
            {data.flow ? ` · Flow: ${data.flow}` : ''}
            {data.symptoms?.length ? ` · ${data.symptoms.join(', ')}` : ''}
            {data.mood ? ` · Mood: ${data.mood}` : ''}
            {data.notes ? ` · ${data.notes}` : ''}
          </div>
        </div></div>
        <div className="well-actions cycle-row-actions">
          <button type="button" className="well-btn secondary small" disabled={isSaving} onClick={() => editCycle(entry, data)} aria-label={`Edit cycle note from ${fmtDate(data.startDate)}`} data-testid={`button-edit-period-${entry.id}`}>Edit</button>
          <button type="button" className="well-btn ghost small" disabled={isSaving} onClick={() => { if (window.confirm('Remove this cycle note from your private record?')) deleteEntry(entry.key, () => { if (editingKey === entry.key) resetForm(); }); }} aria-label={`Delete cycle note from ${fmtDate(data.startDate)}`} data-testid={`button-delete-period-${entry.id}`}><Trash2 size={13} /> Remove</button>
        </div>
      </div>)}</div> : <Empty title="Your cycle history starts with you" copy="No dates are filled in. Add a note only when you choose." icon={<Waves size={18} />} />}
    </section>
    <section className="well-section symptom-history-section">
      <div className="well-section-head"><div><span className="well-eyebrow">ONLY WHAT YOU CHOSE TO NOTE</span><h2>Symptom history</h2></div></div>
      {symptomHistory.length ? <>
        {symptomCounts.size > 0 && <div className="cycle-symptom-counts" aria-label="Counts of symptoms you recorded">
          {[...symptomCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([symptom, count]) =>
            <span className="well-tag" key={symptom}>{symptom} · {count} {count === 1 ? 'note' : 'notes'}</span>,
          )}
        </div>}
        <div className="well-record-list">{symptomHistory.map(({ entry, data }) => <div className="well-record symptom-history-row" key={entry.key}>
          <span className="well-record-main"><span className="well-record-icon"><Heart size={15} /></span><span>
            <span className="well-record-title">{fmtDate(data.startDate)}</span>
            <span className="well-record-meta">{data.symptoms?.length ? data.symptoms.join(', ') : 'No symptoms noted'}{data.mood ? ` · Mood: ${data.mood}` : ''}</span>
          </span></span>
        </div>)}</div>
      </> : <Empty title="No symptom notes yet" copy="Symptoms and mood are optional. Only details you choose to add will appear here." icon={<Heart size={18} />} />}
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