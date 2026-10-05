import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Check,
  CircleHelp, Clock3, Compass, Heart, History, Leaf, LogOut, Menu, Moon,
  ShieldCheck, Sparkles, UserRound, Waves, X,
} from 'lucide-react';
import {
  getGetMyProfileQueryKey, useGetMyProfile, useSaveMyProfile,
} from '@workspace/api-client-react';
import type { Profile, ProfileInput } from '@workspace/api-client-react';
import { Route, Switch, Redirect, Link, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Form } from '@/components/ui/form';
import { WellnessDashboard, WellnessPage, type WellnessPageId } from '@/components/wellness/WellnessPages';
import { canAccessCycleTracking } from '@/lib/wellness-metrics';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#326d5d',
    colorForeground: '#203c35',
    colorMutedForeground: '#718780',
    colorDanger: '#b9514c',
    colorBackground: '#fbfdfb',
    colorInput: '#f3f8f5',
    colorInputForeground: '#203c35',
    colorNeutral: '#d9e5de',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfdfb] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-[0_24px_70px_rgba(30,65,54,.1)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203c35] font-semibold tracking-tight',
    headerSubtitle: 'text-[#718780]',
    socialButtonsBlockButtonText: 'text-[#294a41] font-medium',
    formFieldLabel: 'text-[#294a41] font-medium',
    footerActionLink: 'text-[#326d5d] font-semibold',
    footerActionText: 'text-[#718780]',
    dividerText: 'text-[#718780]',
    identityPreviewEditButton: 'text-[#326d5d]',
    formFieldSuccessText: 'text-[#326d5d]',
    alertText: 'text-[#8d4541]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#d9e5de] bg-white hover:bg-[#f3f8f5]',
    formButtonPrimary: 'bg-[#326d5d] hover:bg-[#285b4e] text-white',
    formFieldInput: 'bg-[#f3f8f5] border-[#d9e5de] text-[#203c35]',
    footerAction: 'text-[#718780]',
    dividerLine: 'bg-[#d9e5de]',
    alert: 'bg-[#fff4f1] border-[#f0d4cf]',
    otpCodeFieldInput: 'border-[#d9e5de] bg-[#f3f8f5]',
    formFieldRow: 'text-[#294a41]',
    main: 'text-[#203c35]',
  },
};

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Please add your name.').max(80, 'Keep your name under 80 characters.'),
  age: z.number().min(13, 'You must be at least 13.').max(120, 'Please enter a valid age.'),
  sex: z.enum(['male', 'female'], { required_error: 'Choose an option to continue.' }),
  heightCm: z.number().min(90, 'Enter a height of at least 90 cm.').max(250, 'Enter a height below 250 cm.'),
  weightKg: z.number().min(25, 'Enter a weight of at least 25 kg.').max(350, 'Enter a weight below 350 kg.'),
  goal: z.enum(['lose-weight', 'maintain-weight', 'gain-weight', 'improve-wellness']),
  activityLevel: z.enum(['sedentary', 'lightly-active', 'moderately-active', 'very-active']),
});
type ProfileValues = z.infer<typeof profileSchema>;
const defaults: Partial<ProfileValues> = { name: '' };

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`brand ${inverse ? 'brand-inverse' : ''}`} data-testid="link-brand">
    <span className="brand-mark"><Waves size={19} strokeWidth={2.2} /></span>
    <span className="display brand-name">future<span>me</span></span>
  </Link>;
}

function Button({
  children, variant = 'primary', type = 'button', onClick, disabled, className = '', testId,
}: {
  children: ReactNode; variant?: 'primary' | 'quiet' | 'outline' | 'text';
  type?: 'button' | 'submit'; onClick?: () => void; disabled?: boolean; className?: string; testId?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled}
    data-testid={testId} className={`button button-${variant} ${className}`}>
    {children}
  </button>;
}

function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard" />;
  return <main className="landing page-enter">
    <div className="landing-nav">
      <Brand />
      <div className="landing-nav-actions">
        <Link href="/sign-in" className="nav-signin" data-testid="link-sign-in">Sign in</Link>
        <Link href="/sign-up" className="button button-primary nav-cta" data-testid="link-create-account">Create your space <ArrowRight size={16} /></Link>
      </div>
    </div>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> A little closer to how you want to feel</div>
        <h1 className="display">Wellbeing,<br /><em>in your own</em><br />direction.</h1>
        <p className="hero-description">A quieter way to understand your everyday habits — and make choices that feel right for the person you’re becoming.</p>
        <div className="hero-actions">
          <Link href="/sign-up" className="button button-primary button-large" data-testid="link-start-wellness">
            Begin with yourself <ArrowRight size={18} />
          </Link>
          <span className="privacy-note"><ShieldCheck size={15} /> Private by nature. Yours to explore.</span>
        </div>
      </div>
      <div className="hero-art" aria-label="Abstract overlapping organic shapes suggesting a horizon">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="sun-disc" />
        <div className="horizon-shape horizon-back" />
        <div className="horizon-shape horizon-front" />
        <div className="art-caption"><span>01 / A more personal kind of progress</span><span>YOUR NEXT CHAPTER</span></div>
        <div className="floating-note"><span className="note-icon"><Sparkles size={15} /></span><div><strong>Small things add up</strong><small>Start with what matters to you.</small></div></div>
      </div>
    </section>
    <section className="landing-principles">
      <div className="principles-intro"><span className="section-kicker">A softer kind of clarity</span><h2 className="display">Know yourself.<br /><span>Choose gently.</span></h2></div>
      <div className="principle-list">
        <div className="principle"><span className="principle-no">01</span><div><h3>Notice, without judgement</h3><p>Make space for the daily rhythms that shape how you feel.</p></div><Compass size={20} /></div>
        <div className="principle"><span className="principle-no">02</span><div><h3>Build a picture over time</h3><p>Your own context helps turn everyday moments into useful perspective.</p></div><Activity size={20} /></div>
        <div className="principle"><span className="principle-no">03</span><div><h3>Keep the future human</h3><p>Thoughtful guidance, grounded in your goals and your pace.</p></div><Heart size={20} /></div>
      </div>
    </section>
    <section className="landing-final">
      <div className="final-orb"><span /><span /><span /></div>
      <div><span className="section-kicker">A good place to begin</span><h2 className="display">The next version of you<br />starts with a small step.</h2></div>
      <Link href="/sign-up" className="button button-light" data-testid="link-signup-footer">Make it yours <ArrowUpRight size={17} /></Link>
    </section>
    <footer className="landing-footer"><Brand /><span>© {new Date().getFullYear()} Future Me. A personal space for wellbeing.</span><span>Not medical advice. Just a little more perspective.</span></footer>
  </main>;
}

function SignInPage() {
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
}
function SignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="auth-frame"><div className="auth-left"><Brand /><div className="auth-art"><div className="auth-moon" /><div className="auth-wave a" /><div className="auth-wave b" /><div className="auth-wave c" /></div><p className="auth-quote display">“A little attention can change the shape of a day.”</p><span className="auth-footnote">A space to meet yourself where you are.</span></div><div className="auth-right"><div className="auth-back"><Link href="/" data-testid="link-auth-home"><ArrowLeft size={15} /> Back to Future Me</Link></div>{children}</div></main>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  useEffect(() => {
    let previous: string | null | undefined;
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previous !== undefined && previous !== userId) client.clear();
      previous = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function ProtectedGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen label="Opening your space" />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <>{children}</>;
}

const navItems = [
  { href: '/dashboard', label: 'Today', icon: Compass, femaleOnly: false },
  { href: '/future-me', label: 'Future Me', icon: Sparkles, femaleOnly: false },
  { href: '/experiments', label: 'Experiments', icon: Activity, femaleOnly: false },
  { href: '/sleep', label: 'Sleep', icon: Moon, femaleOnly: false },
  { href: '/five-minute', label: 'Five minutes', icon: Clock3, femaleOnly: false },
  { href: '/feelings', label: 'Feelings', icon: Heart, femaleOnly: false },
  { href: '/periods', label: 'Periods', icon: Waves, femaleOnly: true },
  { href: '/insights', label: 'Insights', icon: Sparkles, femaleOnly: false },
  { href: '/history', label: 'History', icon: History, femaleOnly: false },
  { href: '/profile', label: 'Your profile', icon: UserRound, femaleOnly: false },
];
function AppFrame({ children, active, showPeriods = false }: { children: ReactNode; active: string; showPeriods?: boolean }) {
  const { signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><Brand /><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="side-caption">YOUR SPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navItems.filter((item) => !item.femaleOnly || showPeriods).map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`side-link ${active === href ? 'side-link-active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{active === href && <span className="side-indicator" />}
        </Link>)}
      </nav>
      <div className="sidebar-lower"><div className="side-note"><span className="side-note-icon"><Leaf size={17} /></span><p>Progress is personal.<br /><strong>Take it at your pace.</strong></p></div>
        <button className="logout-link" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-logout"><LogOut size={17} /> Sign out</button>
      </div>
    </aside>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <div className="main-column"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation" data-testid="button-open-menu"><Menu size={19} /></button><span className="topbar-context">A personal space for your wellbeing</span><span className="topbar-mark"><span className="status-pulse" /> YOUR SPACE</span></header><div className="content-wrap page-enter">{children}</div></div>
    <div className="noise" />
  </div>;
}

function LoadingScreen({ label = 'Getting things ready' }: { label?: string }) {
  return <div className="loading-screen"><div className="loading-mark"><Waves size={23} /></div><div className="loading-lines"><span /><span /><span /></div><p>{label}</p></div>;
}

function QueryError({ retry }: { retry: () => void }) {
  return <div className="notice-card error-card"><span className="notice-symbol"><CircleHelp size={22} /></span><h3>We couldn’t open this just now</h3><p>Your space is still here. Give it another try in a moment.</p><Button variant="outline" onClick={retry} testId="button-retry">Try again <ArrowRight size={15} /></Button></div>;
}

function Dashboard() {
  const profileQuery = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  if (profileQuery.isLoading) return <AppFrame active="/dashboard"><LoadingScreen label="Getting your space ready" /></AppFrame>;
  if (profileQuery.isError) return <AppFrame active="/dashboard"><QueryError retry={() => profileQuery.refetch()} /></AppFrame>;
  const profile = profileQuery.data?.profile;
  if (!profileQuery.data?.completed || !profile) return <Redirect to="/onboarding" />;
  return <AppFrame active="/dashboard" showPeriods={canAccessCycleTracking(profile.sex)}>
    <WellnessDashboard profile={profile} />
  </AppFrame>;
}

function WellnessRoute({ pageId }: { pageId: WellnessPageId }) {
  const profileQuery = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  const active = `/${pageId}`;
  if (profileQuery.isLoading) return <AppFrame active={active}><LoadingScreen label="Opening your personal space" /></AppFrame>;
  if (profileQuery.isError) return <AppFrame active={active}><QueryError retry={() => profileQuery.refetch()} /></AppFrame>;
  const profile = profileQuery.data?.profile;
  if (!profileQuery.data?.completed || !profile) return <Redirect to="/onboarding" />;
  if (pageId === 'periods' && !canAccessCycleTracking(profile.sex)) return <Redirect to="/dashboard" />;
  return <AppFrame active={active} showPeriods={canAccessCycleTracking(profile.sex)}>
    <WellnessPage pageId={pageId} profile={profile} />
  </AppFrame>;
}

const steps = [
  { title: 'A little about you', blurb: 'Let’s start with what you’d like us to call you.' },
  { title: 'Your starting point', blurb: 'A little context helps make this space feel like yours.' },
  { title: 'What matters to you?', blurb: 'There’s no right answer. Choose the direction that feels useful.' },
  { title: 'Your everyday rhythm', blurb: 'A final detail, so we can meet you where you are.' },
];
function ProfileSetup({ mode = 'onboarding', initial }: { mode?: 'onboarding' | 'profile'; initial?: Profile | null }) {
  const isEditing = mode === 'profile';
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const mutation = useSaveMyProfile();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial ? { name: initial.name, age: initial.age, sex: initial.sex, heightCm: initial.heightCm, weightKg: initial.weightKg, goal: initial.goal, activityLevel: initial.activityLevel } : defaults,
    mode: 'onTouched',
  });
  const onSubmit = (values: ProfileValues) => {
    setSaveError('');
    setSaved(false);
    mutation.mutate({ data: values }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        setSaved(true);
        if (!isEditing) setLocation('/dashboard');
      },
      onError: () => setSaveError('We couldn’t save your details right now. Please try again.'),
    });
  };
  const fieldsByStep: (keyof ProfileValues)[][] = [
    ['name', 'age'], ['sex', 'heightCm', 'weightKg'], ['goal'], ['activityLevel'],
  ];
  const next = async () => {
    const valid = await form.trigger(fieldsByStep[step]);
    if (valid) setStep((current) => Math.min(3, current + 1));
  };
  const values = form.watch();
  return <AppFrame active={isEditing ? '/profile' : ''} showPeriods={initial ? canAccessCycleTracking(initial.sex) : false}>
    <div className={`setup-layout ${isEditing ? 'profile-edit-layout' : ''}`}>
      <div className="setup-main">
        <div className="setup-topline"><span className="section-kicker">{isEditing ? 'YOUR DETAILS' : 'YOUR PERSONAL STARTING POINT'}</span><span className="setup-count">{isEditing ? 'PROFILE' : `STEP ${String(step + 1).padStart(2, '0')} / 04`}</span></div>
        {!isEditing && <div className="step-track" aria-label={`Step ${step + 1} of 4`}>{steps.map((item, i) => <div key={item.title} className={`step-segment ${i <= step ? 'step-segment-done' : ''}`} />)}</div>}
        <h1 className="display setup-title">{isEditing ? 'Your profile.' : steps[step].title}</h1>
        <p className="setup-blurb">{isEditing ? 'Update your details whenever life changes. Your space should keep up.' : steps[step].blurb}</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="setup-form">
            {isEditing || step === 0 ? <div className="form-grid">
              <Field label="Name" id="name" error={form.formState.errors.name?.message}><input id="name" autoComplete="name" placeholder="What should we call you?" {...form.register('name')} data-testid="input-profile-name" /></Field>
              <Field label="Age" id="age" suffix="years" error={form.formState.errors.age?.message}><input id="age" type="number" min="13" max="120" {...form.register('age', { valueAsNumber: true })} data-testid="input-profile-age" /></Field>
            </div> : null}
            {isEditing || step === 1 ? <>
              <div className="field-block"><span className="field-label">Sex</span><div className="choice-grid two" role="radiogroup" aria-label="Sex">
                <Choice value="female" selected={values.sex === 'female'} onSelect={() => form.setValue('sex', 'female', { shouldValidate: true })} title="Female" detail="Includes the optional Periods feature" testId="choice-sex-female" />
                <Choice value="male" selected={values.sex === 'male'} onSelect={() => form.setValue('sex', 'male', { shouldValidate: true })} title="Male" detail="Periods feature stays hidden" testId="choice-sex-male" />
              </div>{form.formState.errors.sex && <span className="field-error">{form.formState.errors.sex.message}</span>}<p className="unit-note"><ShieldCheck size={14} /> This setting only controls whether the optional Periods feature appears.</p></div>
              <div className="form-grid">
                <Field label="Height" id="heightCm" suffix="cm" error={form.formState.errors.heightCm?.message}><input id="heightCm" type="number" min="90" max="250" {...form.register('heightCm', { valueAsNumber: true })} data-testid="input-profile-height" /></Field>
                <Field label="Weight" id="weightKg" suffix="kg" error={form.formState.errors.weightKg?.message}><input id="weightKg" type="number" min="25" max="350" step="0.1" {...form.register('weightKg', { valueAsNumber: true })} data-testid="input-profile-weight" /></Field>
              </div><p className="unit-note"><ShieldCheck size={14} /> Your measurements stay private and metric.</p>
            </> : null}
            {isEditing || step === 2 ? <div className="field-block"><span className="field-label">What feels like the right focus?</span><div className="option-stack">
              <Choice value="improve-wellness" selected={values.goal === 'improve-wellness'} onSelect={() => form.setValue('goal', 'improve-wellness', { shouldValidate: true })} title="Feel well, overall" detail="Build a more thoughtful everyday rhythm" testId="choice-goal-wellness" />
              <Choice value="lose-weight" selected={values.goal === 'lose-weight'} onSelect={() => form.setValue('goal', 'lose-weight', { shouldValidate: true })} title="Feel lighter" detail="Move toward a weight that feels right for me" testId="choice-goal-lose" />
              <Choice value="maintain-weight" selected={values.goal === 'maintain-weight'} onSelect={() => form.setValue('goal', 'maintain-weight', { shouldValidate: true })} title="Maintain balance" detail="Support the place I’m at today" testId="choice-goal-maintain" />
              <Choice value="gain-weight" selected={values.goal === 'gain-weight'} onSelect={() => form.setValue('goal', 'gain-weight', { shouldValidate: true })} title="Build strength" detail="Work toward a stronger, steadier me" testId="choice-goal-gain" />
            </div><p className="unit-note"><Heart size={14} /> This is your personal direction, not a measure of success.</p></div> : null}
            {isEditing || step === 3 ? <div className="field-block"><span className="field-label">How active are most of your days?</span><div className="option-stack">
              <Choice value="sedentary" selected={values.activityLevel === 'sedentary'} onSelect={() => form.setValue('activityLevel', 'sedentary', { shouldValidate: true })} title="Mostly at rest" detail="My day is usually seated or still" testId="choice-activity-sedentary" />
              <Choice value="lightly-active" selected={values.activityLevel === 'lightly-active'} onSelect={() => form.setValue('activityLevel', 'lightly-active', { shouldValidate: true })} title="A little movement" detail="Some walking or light activity" testId="choice-activity-light" />
              <Choice value="moderately-active" selected={values.activityLevel === 'moderately-active'} onSelect={() => form.setValue('activityLevel', 'moderately-active', { shouldValidate: true })} title="Steady movement" detail="Regular activity is part of my routine" testId="choice-activity-moderate" />
              <Choice value="very-active" selected={values.activityLevel === 'very-active'} onSelect={() => form.setValue('activityLevel', 'very-active', { shouldValidate: true })} title="Lots of movement" detail="My days are often physically active" testId="choice-activity-high" />
            </div></div> : null}
            {saveError && <div className="form-error-banner" role="alert" data-testid="status-profile-error">{saveError}</div>}
            {saved && isEditing && <div className="form-success-banner" role="status" data-testid="status-profile-saved"><Check size={16} /> Your profile is up to date.</div>}
            <div className="setup-actions">
              {!isEditing && <Button variant="quiet" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} testId="button-onboarding-back"><ArrowLeft size={16} /> Back</Button>}
              {isEditing ? <div className="edit-actions"><Button variant="outline" onClick={() => setLocation('/dashboard')} testId="button-profile-cancel">Cancel</Button><Button type="submit" disabled={mutation.isPending} testId="button-profile-save">{mutation.isPending ? 'Saving…' : 'Save changes'} {!mutation.isPending && <Check size={16} />}</Button></div>
                : step < 3 ? <Button onClick={next} testId="button-onboarding-continue">Continue <ArrowRight size={16} /></Button>
                  : <Button type="submit" disabled={mutation.isPending} testId="button-onboarding-save">{mutation.isPending ? 'Saving your space…' : 'Save and continue'} {!mutation.isPending && <ArrowRight size={16} />}</Button>}
            </div>
          </form>
        </Form>
      </div>
      {!isEditing && <aside className="setup-aside"><div className="setup-aside-art"><div className="aside-orbit orbit-a" /><div className="aside-orbit orbit-b" /><div className="aside-sun" /><span className="aside-mark"><Waves size={27} /></span></div><span className="section-kicker">A NOTE FOR THE JOURNEY</span><p className="display">“You don’t have to become someone else. Just a little more yourself.”</p><span className="aside-caption">THIS SPACE IS YOURS TO SHAPE</span></aside>}
    </div>
  </AppFrame>;
}

function Field({ label, id, suffix, error, children }: { label: string; id: string; suffix?: string; error?: string; children: ReactNode }) {
  return <div className="field-block"><label htmlFor={id} className="field-label">{label}</label><div className="input-shell">{children}{suffix && <span className="input-suffix">{suffix}</span>}</div>{error && <span className="field-error">{error}</span>}</div>;
}
function Choice({ value, selected, onSelect, title, detail, testId }: { value: string; selected: boolean; onSelect: () => void; title: string; detail: string; testId: string }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect} data-testid={testId} className={`choice-card ${selected ? 'choice-selected' : ''}`} data-choice={value}>
    <span className="choice-radio">{selected && <span />}</span><span className="choice-copy"><strong>{title}</strong><small>{detail}</small></span>{selected && <Check className="choice-check" size={16} />}
  </button>;
}

function Onboarding() {
  const query = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  if (query.isLoading) return <AppFrame active=""><LoadingScreen label="Preparing your starting point" /></AppFrame>;
  if (query.isError) return <AppFrame active=""><QueryError retry={() => query.refetch()} /></AppFrame>;
  if (query.data?.completed && query.data.profile) return <Redirect to="/dashboard" />;
  return <ProfileSetup />;
}
function ProfilePage() {
  const query = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  if (query.isLoading) return <AppFrame active="/profile"><LoadingScreen label="Opening your profile" /></AppFrame>;
  if (query.isError) return <AppFrame active="/profile"><QueryError retry={() => query.refetch()} /></AppFrame>;
  if (!query.data?.completed || !query.data.profile) return <Redirect to="/onboarding" />;
  return <ProfileSetup mode="profile" initial={query.data.profile} />;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <Home />;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRoute} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/onboarding">{() => <ProtectedGate><Onboarding /></ProtectedGate>}</Route>
    <Route path="/dashboard">{() => <ProtectedGate><Dashboard /></ProtectedGate>}</Route>
    <Route path="/future-me">{() => <ProtectedGate><WellnessRoute pageId="future-me" /></ProtectedGate>}</Route>
    <Route path="/experiments">{() => <ProtectedGate><WellnessRoute pageId="experiments" /></ProtectedGate>}</Route>
    <Route path="/sleep">{() => <ProtectedGate><WellnessRoute pageId="sleep" /></ProtectedGate>}</Route>
    <Route path="/five-minute">{() => <ProtectedGate><WellnessRoute pageId="five-minute" /></ProtectedGate>}</Route>
    <Route path="/feelings">{() => <ProtectedGate><WellnessRoute pageId="feelings" /></ProtectedGate>}</Route>
    <Route path="/periods">{() => <ProtectedGate><WellnessRoute pageId="periods" /></ProtectedGate>}</Route>
    <Route path="/insights">{() => <ProtectedGate><WellnessRoute pageId="insights" /></ProtectedGate>}</Route>
    <Route path="/history">{() => <ProtectedGate><WellnessRoute pageId="history" /></ProtectedGate>}</Route>
    <Route path="/profile">{() => <ProtectedGate><ProfilePage /></ProtectedGate>}</Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Return to your own space for wellbeing.' } },
      signUp: { start: { title: 'Make space for yourself', subtitle: 'A thoughtful beginning, at your own pace.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider><ClerkQueryClientCacheInvalidator /><Router /><Toaster /></TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;