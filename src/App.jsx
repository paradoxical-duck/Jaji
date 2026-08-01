import { Component, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Copy,
  FileImage,
  FileText,
  Flag,
  Flame,
  GraduationCap,
  Hash,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  castVote,
  createAnnouncement,
  createAssignment,
  createClassroom,
  createScheduleEvent,
  finalizeClassAwards,
  getMyVote,
  joinClassroom,
  removeAssignment,
  removeAnnouncement,
  removeMember,
  removeMessage,
  removeScheduleEvent,
  reportAssignment,
  requestContributor,
  reviewContributorRequest,
  sendMessage,
  subscribeAnnouncements,
  subscribeAssignments,
  subscribeContributorRequests,
  subscribeMember,
  subscribeMembers,
  subscribeMessages,
  subscribeNotifications,
  subscribeSchedule,
  subscribeUserClassrooms,
  updateMemberRole,
  updateUserProfile
} from './data';
import { uploadAssignmentFiles, uploadProfilePhoto } from './drive';
import {
  firebaseMessage,
  initials,
  isAnnouncementActive,
  normalizeClassCode,
  roleLabel,
  timeAgo,
  verificationState,
  currentWeekKey,
  currentStreak,
  xpProgress
} from './utils';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'assignments', label: 'Assignments', icon: BookOpen },
  { id: 'threads', label: 'Threads', icon: MessageCircle },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'timetable', label: 'Timetable', icon: CalendarDays },
  { id: 'people', label: 'People', icon: Users },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'inbox', label: 'Inbox', icon: Inbox }
];

const EMAIL_LINK_KEY = 'jaji_email_for_sign_in';
const PENDING_PROFILE_KEY = 'jaji_pending_profile';
const AWAITING_2FA_KEY = 'jaji_awaiting_2fa';
const AUTH_EMAIL_ENDPOINT = import.meta.env.VITE_AUTH_EMAIL_ENDPOINT || 'https://jaji-auth.netlify.app/.netlify/functions/send-email-sign-in-link';

async function sendEmailLink(payload, idToken) {
  const response = await fetch(AUTH_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The email service could not send your link. Try again shortly.');
  return result;
}

async function completeEmailLink(email) {
  const credential = await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
  const pending = JSON.parse(localStorage.getItem(PENDING_PROFILE_KEY) || '{}');
  const displayName = pending.name?.trim() || credential.user.displayName || email.split('@')[0];
  if (credential.user.displayName !== displayName) {
    await updateProfile(credential.user, { displayName });
  }

  const userRef = doc(db, 'users', credential.user.uid);
  const existingProfile = await getDoc(userRef);
  await setDoc(userRef, {
    displayName,
    email: credential.user.email,
    lastSeenAt: serverTimestamp(),
    ...(!existingProfile.exists() ? { createdAt: serverTimestamp() } : {})
  }, { merge: true });

  if (pending.code) {
    try {
      await joinClassroom({ ...credential.user, displayName }, pending.code);
    } catch (error) {
      sessionStorage.setItem('jaji_onboarding_notice', error.message);
    }
  }

  localStorage.removeItem(EMAIL_LINK_KEY);
  localStorage.removeItem(PENDING_PROFILE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  return { ...credential.user, displayName };
}

function AppContent() {
  const [user, setUser] = useState(undefined);
  const hasEmailLink = isSignInWithEmailLink(auth, window.location.href);
  const [linkState, setLinkState] = useState(hasEmailLink ? 'completing' : 'idle');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      const startedAt = Number(sessionStorage.getItem(AWAITING_2FA_KEY) || 0);
      const activelyVerifying = startedAt && Date.now() - startedAt < 120_000;
      if (startedAt && !activelyVerifying) sessionStorage.removeItem(AWAITING_2FA_KEY);
      setUser(activelyVerifying ? null : nextUser);
    });
    if (hasEmailLink) {
      const savedEmail = localStorage.getItem(EMAIL_LINK_KEY);
      if (!savedEmail) {
        setLinkState('needs-email');
      } else {
        completeEmailLink(savedEmail)
          .then((signedInUser) => {
            setUser(signedInUser);
            setLinkState('idle');
          })
          .catch((error) => {
            setLinkError(firebaseMessage(error));
            setLinkState('needs-email');
          });
      }
    }
    return unsubscribe;
  }, [hasEmailLink]);

  async function finishOnAnotherDevice(email) {
    setLinkState('completing');
    setLinkError('');
    try {
      const signedInUser = await completeEmailLink(email);
      setUser(signedInUser);
      setLinkState('idle');
    } catch (error) {
      setLinkError(firebaseMessage(error));
      setLinkState('needs-email');
    }
  }

  if (linkState === 'completing' || user === undefined) return <FullPageLoader label="Signing you in…" />;
  if (linkState === 'needs-email') return <CompleteEmailLinkScreen error={linkError} onComplete={finishOnAnotherDevice} />;
  if (!user) return <AuthScreen />;
  return <Workspace user={user} />;
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Jaji recovered from a render error', error);
  }
  render() {
    if (this.state.failed) {
      return <LoadFailure message="A part of Jaji stopped responding." onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}

class FeatureErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error('Jaji isolated a page error', error);
  }
  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }
  render() {
    if (this.state.failed) {
      return <div className="feature-failure"><CircleAlert size={25} /><p className="eyebrow">This page hit a problem</p><h2>The rest of Jaji is still working.</h2><p>Return home, then try this page again. Your class data is safe.</p><button className="primary-button" onClick={this.props.onReset}>Return home</button></div>;
    }
    return this.props.children;
  }
}

function App() {
  return <AppErrorBoundary><AppContent /></AppErrorBoundary>;
}

function FullPageLoader({ label = 'Loading Jaji…' }) {
  return (
    <div className="full-loader" aria-label="Loading Jaji">
      <BrandMark />
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

function BrandMark({ light = false }) {
  return (
    <div className={`brand-mark ${light ? 'brand-mark--light' : ''}`} aria-label="Jaji">
      <span className="brand-glyph"><BookOpen size={19} strokeWidth={2.3} /></span>
      <span>jaji<span className="brand-dot">.</span></span>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('signup');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' });

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup' && form.name.trim().length < 2) throw new Error('Enter the name your classmates will recognize.');
      if (form.password.length < 8) throw new Error('Use at least 8 characters for your password.');
      const email = form.email.trim().toLowerCase();
      sessionStorage.setItem(AWAITING_2FA_KEY, String(Date.now()));
      localStorage.setItem(EMAIL_LINK_KEY, email);
      localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify({
        name: mode === 'signup' ? form.name.trim() : '',
        code: mode === 'signup' ? form.code.trim() : '',
        mode
      }));
      const credential = mode === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, form.password)
        : await signInWithEmailAndPassword(auth, email, form.password);
      if (mode === 'signup') await updateProfile(credential.user, { displayName: form.name.trim() });
      const idToken = await credential.user.getIdToken();
      await sendEmailLink({
        email,
        name: mode === 'signup' ? form.name.trim() : ''
      }, idToken);
      await signOut(auth);
      sessionStorage.removeItem(AWAITING_2FA_KEY);
      setSentTo(email);
    } catch (error) {
      if (auth.currentUser) await signOut(auth).catch(() => {});
      sessionStorage.removeItem(AWAITING_2FA_KEY);
      setMessage(firebaseMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-story__top">
          <BrandMark light />
          <span className="quiet-chip"><ShieldCheck size={14} /> Built for your class, not the whole internet</span>
        </div>
        <div className="auth-thesis">
          <span className="auth-kicker">The shared class desk</span>
          <h1>Know which work<br /><em>actually checks out.</em></h1>
          <p>Assignments, reminders, and the conversation around them—organized in one place and verified by the people in your class.</p>
        </div>
        <div className="desk-preview" aria-hidden="true">
          <div className="desk-note desk-note--back"><span>MATHS · HOMEWORK</span><strong>Quadratic equations</strong></div>
          <div className="desk-note desk-note--front">
            <span className="preview-status"><CheckCheck size={14} /> COMMUNITY VERIFIED</span>
            <strong>Trigonometry exercise 7.2</strong>
            <div className="preview-meta"><span>12 found this correct</span><span>8 replies</span></div>
          </div>
          <div className="desk-pin"><Sparkles size={18} /></div>
        </div>
        <p className="auth-footnote">Private classroom membership · Community verification · Real-time discussion</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand"><BrandMark /></div>
          <p className="eyebrow">{sentTo ? 'Check your inbox' : mode === 'signup' ? 'Your desk is ready' : 'Welcome back'}</p>
          <h2>{sentTo ? 'Your sign-in link is on its way' : mode === 'signup' ? 'Create your account' : 'Sign in to Jaji'}</h2>
          <p className="auth-intro">
            {sentTo ? <>We sent it to <strong>{sentTo}</strong>. Click the link and you’ll land in Jaji already signed in.</> : mode === 'signup' ? 'Create a password, then confirm the email we send. The link signs you straight in.' : 'Enter your password, then use the email link as your second sign-in step.'}
          </p>

          {!sentTo && (
            <div className="segmented" role="tablist" aria-label="Account action">
              <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage(''); }} type="button">Sign up</button>
              <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMessage(''); }} type="button">Sign in</button>
            </div>
          )}

          {sentTo ? (
            <div className="email-sent-panel">
              <div className="mail-orbit"><Mail size={32} /><span><ArrowRight size={14} /></span></div>
              <p>The link expires automatically. You can close this tab—clicking the email is the only step left.</p>
              <button className="text-button" type="button" onClick={() => { setSentTo(''); setMessage(''); }}>Use a different email</button>
            </div>
          ) : <form onSubmit={handleSubmit} className="stack-form">
            {mode === 'signup' && (
              <Field label="Your name" icon={Users}>
                <input value={form.name} onChange={update('name')} autoComplete="name" placeholder="Aarav Sharma" required />
              </Field>
            )}
            <Field label="Email address" icon={Mail}>
              <input value={form.email} onChange={update('email')} type="email" autoComplete="email" placeholder="you@school.edu" required />
            </Field>
            <Field label="Password" icon={KeyRound}>
              <input value={form.password} onChange={update('password')} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" minLength={8} required />
            </Field>
            {mode === 'signup' && (
              <Field label="Class code" icon={Hash} hint="Optional">
                <input className="code-input" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: normalizeClassCode(event.target.value) }))} placeholder="ABC123" maxLength={6} />
              </Field>
            )}

            {message && <div className={message.includes('sent') ? 'form-message success' : 'form-message'}><CircleAlert size={16} /> {message}</div>}

            <button className="primary-button primary-button--large" disabled={busy} type="submit">
              {busy ? <LoaderCircle className="spin" size={18} /> : mode === 'signup' ? 'Create account & email code' : 'Continue with email verification'}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>}

          {!sentTo && mode === 'signup' && <p className="legal-copy">By creating an account, you agree to use Jaji respectfully and only share work you have permission to distribute.</p>}
        </div>
      </section>
    </main>
  );
}

function Field({ label, icon: Icon, hint, children }) {
  return (
    <label className="field-label">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <div className="field-control"><Icon size={17} />{children}</div>
    </label>
  );
}

function CompleteEmailLinkScreen({ error, onComplete }) {
  const [email, setEmail] = useState('');
  return (
    <main className="verification-shell">
      <BrandMark />
      <section className="verification-card">
        <div className="mail-orbit"><Mail size={32} /><span><Check size={14} /></span></div>
        <p className="eyebrow">Finish secure sign-in</p>
        <h1>Confirm your email</h1>
        <p>You opened this link on a different browser or device. Enter the email address the link was sent to.</p>
        <form className="stack-form" onSubmit={(event) => { event.preventDefault(); onComplete(email); }}>
          <Field label="Email address" icon={Mail}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@school.edu" required autoFocus />
          </Field>
          {error && <div className="form-message"><CircleAlert size={16} /> {error}</div>}
          <button className="primary-button primary-button--large" type="submit">Continue to Jaji <ArrowRight size={18} /></button>
        </form>
      </section>
    </main>
  );
}

function Workspace({ user }) {
  const [classes, setClasses] = useState([]);
  const [classesReady, setClassesReady] = useState(false);
  const [classesError, setClassesError] = useState('');
  const [classLoadAttempt, setClassLoadAttempt] = useState(0);
  const [selectedClassId, setSelectedClassId] = useState(localStorage.getItem('jaji_active_class') || '');
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [page, setPage] = useState('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [toast, setToast] = useState('');
  const readKey = `jaji_read_items_${user.uid}_${selectedClassId}`;
  const [readIds, setReadIds] = useState(() => new Set());

  const activeClass = classes.find((item) => item.id === selectedClassId) || null;
  const isContributor = ['owner', 'contributor'].includes(membership?.role);
  const isOwner = membership?.role === 'owner';

  useEffect(() => subscribeUserClassrooms(user.uid, (items) => {
    setClassesError('');
    setClasses(items);
    setClassesReady(true);
    setSelectedClassId((current) => {
      if (items.some((item) => item.id === current)) return current;
      return items[0]?.id || '';
    });
  }, (error) => {
    setClassesError(firebaseMessage(error));
    setClassesReady(true);
  }), [user.uid, classLoadAttempt]);

  useEffect(() => {
    if (!classesError || classes.length || classLoadAttempt >= 2) return undefined;
    const timer = window.setTimeout(() => {
      setClassesError('');
      setClassesReady(false);
      setClassLoadAttempt((attempt) => attempt + 1);
    }, 700 * (classLoadAttempt + 1));
    return () => window.clearTimeout(timer);
  }, [classesError, classes.length, classLoadAttempt]);

  useEffect(() => {
    if (!selectedClassId) return undefined;
    localStorage.setItem('jaji_active_class', selectedClassId);
    setPage('home');
    const unsubs = [
      subscribeMember(selectedClassId, user.uid, setMembership, (error) => setToast(firebaseMessage(error))),
      subscribeMembers(selectedClassId, setMembers, (error) => setToast(firebaseMessage(error))),
      subscribeAssignments(selectedClassId, setAssignments, (error) => setToast(firebaseMessage(error))),
      subscribeAnnouncements(selectedClassId, setAnnouncements, (error) => setToast(firebaseMessage(error))),
      subscribeSchedule(selectedClassId, setSchedule, (error) => setToast(firebaseMessage(error))),
      subscribeNotifications(selectedClassId, user.uid, setNotifications, (error) => setToast(firebaseMessage(error)))
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe?.());
  }, [selectedClassId, user.uid]);

  useEffect(() => {
    try {
      setReadIds(new Set(JSON.parse(localStorage.getItem(readKey) || '[]')));
    } catch {
      setReadIds(new Set());
    }
  }, [readKey]);

  useEffect(() => {
    if (!selectedClassId || !membership) return undefined;
    return subscribeContributorRequests(selectedClassId, user.uid, membership.role === 'owner', setRequests, (error) => setToast(firebaseMessage(error)));
  }, [selectedClassId, user.uid, membership]);

  useEffect(() => {
    if (!selectedClassId || !isOwner || !members.length) return;
    finalizeClassAwards(selectedClassId, members).catch((error) => setToast(firebaseMessage(error)));
  }, [selectedClassId, isOwner, members]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeAnnouncements = useMemo(() => announcements.filter((item) => isAnnouncementActive(item)), [announcements]);
  const inboxItems = useMemo(
    () => buildInbox(assignments, activeAnnouncements, requests, notifications, isOwner, user.uid),
    [assignments, activeAnnouncements, requests, notifications, isOwner, user.uid]
  );
  const unreadCount = inboxItems.filter((item) => !readIds.has(item.id)).length;

  function markRead(id) {
    setReadIds((current) => {
      const next = new Set(current);
      next.add(id);
      localStorage.setItem(readKey, JSON.stringify([...next]));
      return next;
    });
  }

  function markAllRead() {
    const next = new Set(inboxItems.map((item) => item.id));
    setReadIds(next);
    localStorage.setItem(readKey, JSON.stringify([...next]));
    setToast('Inbox marked as read.');
  }

  function openAssignment(assignment) {
    markRead(`assignment-${assignment.id}`);
    setSelectedAssignment(assignment);
  }

  function selectClass(classId) {
    setSelectedClassId(classId);
    setMobileNav(false);
  }

  function showNotice(message) {
    setToast(message);
  }

  if (!classesReady) return <FullPageLoader />;
  if (classesError && !classes.length) {
    return <LoadFailure message={classesError} onRetry={() => {
      setClassesError('');
      setClassesReady(false);
      setClassLoadAttempt((attempt) => attempt + 1);
    }} />;
  }
  if (!classes.length) {
    return <ClassroomLobby user={user} onDone={(item) => { setSelectedClassId(item.id); setToast(`Welcome to ${item.name}.`); }} />;
  }
  if (!activeClass) return <FullPageLoader />;

  const pageProps = { activeClass, membership, members, assignments, announcements: activeAnnouncements, schedule, requests, user, isContributor, isOwner, setModal, setPage, setSelectedAssignment: openAssignment, showNotice };

  return (
    <div className="workspace">
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="sidebar-top">
          <BrandMark light />
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <ClassSwitcher classes={classes} activeClass={activeClass} onSelect={selectClass} onAdd={() => setModal('classActions')} />
        <nav className="main-nav" aria-label="Main navigation">
          <span className="nav-label">Classroom</span>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); setMobileNav(false); }}>
              <Icon size={18} /><span>{label}</span>
              {id === 'inbox' && unreadCount > 0 && <b>{unreadCount > 9 ? '9+' : unreadCount}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-profile">
            <Avatar name={membership?.name || user.displayName} photoURL={membership?.photoURL} profileEmoji={membership?.profileEmoji} badge={membership?.equippedBadge} />
            <div><strong>{membership?.name || user.displayName}</strong><span>{roleLabel(membership?.role)}</span></div>
            <button className="icon-button icon-button--dark" onClick={() => setModal('settings')} aria-label="Profile settings"><Settings size={17} /></button>
            <button className="icon-button icon-button--dark" onClick={() => signOut(auth)} aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <div className="workspace-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="topbar-class">
            <span>{activeClass?.subject || 'Classroom'}</span>
            <strong>{activeClass?.name}</strong>
          </div>
          <div className="topbar-actions">
            {isContributor && <button className="streak-pill" onClick={() => setPage('leaderboard')} aria-label={`${currentStreak(membership)} day contribution streak`}><span className="streak-pill__flame"><Flame size={18} /></span><strong>{currentStreak(membership)}</strong><span><b>day streak</b><small>{membership?.lastAwardBonus ? `last bonus +${membership.lastAwardBonus} XP` : 'post daily to grow it'}</small></span></button>}
            <button className="inbox-button" onClick={() => setPage('inbox')} aria-label={`${unreadCount} unread inbox items`}><Inbox size={19} />{unreadCount > 0 && <span>{unreadCount}</span>}</button>
            <button className="topbar-profile" onClick={() => setModal('settings')} aria-label="Open profile settings"><Avatar name={membership?.name || user.displayName} photoURL={membership?.photoURL} profileEmoji={membership?.profileEmoji} badge={membership?.equippedBadge} small /></button>
          </div>
        </header>

        <main className="page-stage">
          <FeatureErrorBoundary resetKey={`${selectedClassId}-${page}`} onReset={() => setPage('home')}>
            {page === 'home' && <Dashboard {...pageProps} />}
            {page === 'assignments' && <AssignmentsPage {...pageProps} />}
            {page === 'threads' && <ThreadsPage {...pageProps} />}
            {page === 'reminders' && <RemindersPage {...pageProps} />}
            {page === 'timetable' && <TimetablePage {...pageProps} />}
            {page === 'people' && <PeoplePage {...pageProps} />}
            {page === 'leaderboard' && <LeaderboardPage members={members} />}
            {page === 'inbox' && <InboxPage items={inboxItems} readIds={readIds} onRead={markRead} onReadAll={markAllRead} onOpen={(item) => { markRead(item.id); if (item.assignment) openAssignment(item.assignment); else if (item.type === 'request') setPage('people'); else setPage('reminders'); }} />}
          </FeatureErrorBoundary>
        </main>
      </div>

      {modal === 'classActions' && <ClassActionsModal user={user} onClose={() => setModal(null)} onDone={(item) => { setModal(null); selectClass(item.id); showNotice(`Welcome to ${item.name}.`); }} />}
      {modal === 'assignment' && <AssignmentFormModal activeClass={activeClass} user={user} onClose={() => setModal(null)} onDone={() => { setModal(null); showNotice('Assignment published to your class.'); }} />}
      {modal === 'announcement' && <AnnouncementFormModal activeClass={activeClass} user={user} onClose={() => setModal(null)} onDone={() => { setModal(null); showNotice('Reminder posted to the class.'); }} />}
      {(modal === 'schedule' || modal?.type === 'schedule') && <ScheduleEventModal activeClass={activeClass} user={user} initial={modal?.slot} onClose={() => setModal(null)} onDone={() => { setModal(null); showNotice('Timetable updated.'); }} />}
      {modal === 'contributor' && <ContributorRequestModal activeClass={activeClass} user={user} existing={requests[0]} onClose={() => setModal(null)} onDone={() => { setModal(null); showNotice('Request sent to the class creator.'); }} />}
      {modal === 'settings' && <ProfileSettingsModal user={user} membership={membership} classIds={classes.map((item) => item.id)} onClose={() => setModal(null)} onDone={() => { setModal(null); showNotice('Profile updated.'); }} />}
      {selectedAssignment && <AssignmentDetail assignment={selectedAssignment} activeClass={activeClass} user={user} isOwner={isOwner} onClose={() => setSelectedAssignment(null)} onDeleted={() => setSelectedAssignment(null)} showNotice={showNotice} />}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  );
}

function LoadFailure({ message, onRetry }) {
  return (
    <main className="load-failure">
      <BrandMark />
      <div className="load-failure__card">
        <span><CircleAlert size={24} /></span>
        <p className="eyebrow">Connection interrupted</p>
        <h1>Jaji couldn’t finish loading.</h1>
        <p>{message}</p>
        <button className="primary-button primary-button--large" onClick={onRetry}>Try again <ArrowRight size={18} /></button>
      </div>
    </main>
  );
}

function ClassroomLobby({ user, onDone }) {
  const [mode, setMode] = useState('join');
  return (
    <main className="lobby-shell">
      <div className="lobby-top"><BrandMark /><button className="text-button" onClick={() => signOut(auth)}><LogOut size={16} /> Sign out</button></div>
      <section className="lobby-copy">
        <p className="eyebrow">Welcome, {user.displayName?.split(' ')[0]}</p>
        <h1>Pull up a chair.</h1>
        <p>Join an existing classroom with its six-character code, or create the first one for your class.</p>
      </section>
      <section className="lobby-card">
        <div className="segmented"><button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Join a class</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create a class</button></div>
        {mode === 'join' ? <JoinClassForm user={user} onDone={onDone} /> : <CreateClassForm user={user} onDone={onDone} />}
      </section>
    </main>
  );
}

function ClassSwitcher({ classes, activeClass, onSelect, onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="class-switcher">
      <button className="class-switcher__current" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="class-monogram">{initials(activeClass?.name)}</span>
        <span><small>Current class</small><strong>{activeClass?.name}</strong></span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="class-menu">
          {classes.map((item) => <button key={item.id} className={item.id === activeClass?.id ? 'active' : ''} onClick={() => { onSelect(item.id); setOpen(false); }}><span>{initials(item.name)}</span><div><strong>{item.name}</strong><small>{item.subject}</small></div>{item.id === activeClass?.id && <Check size={15} />}</button>)}
          <button className="class-menu__add" onClick={() => { onAdd(); setOpen(false); }}><Plus size={16} /> Join or create class</button>
        </div>
      )}
    </div>
  );
}

function Dashboard(props) {
  const { activeClass, membership, members, assignments, announcements, requests, user, isContributor, isOwner, setModal, setPage, setSelectedAssignment, showNotice } = props;
  const topAssignments = [...assignments].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  const latestAnnouncement = announcements[0];
  const pendingRequest = requests.find((item) => item.status === 'pending');
  return (
    <div className="dashboard page-enter">
      <section className="welcome-strip">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>Good to see you, {user.displayName?.split(' ')[0]}.</h1>
          <p>{assignments.length ? `${assignments.length} pieces of class work are ready to browse and verify.` : 'This desk is clear. Add the first piece of class work when you’re ready.'}</p>
        </div>
        {isContributor ? (
          <button className="primary-button" onClick={() => setModal('assignment')}><PenLine size={17} /> Publish class work</button>
        ) : pendingRequest ? (
          <span className="status-pill pending"><Clock3 size={15} /> Contributor request pending</span>
        ) : (
          <button className="secondary-button" onClick={() => setModal('contributor')}><UserPlus size={17} /> Request to contribute</button>
        )}
      </section>

      {isContributor && <XpProgressCard member={membership} members={members} onLeaderboard={() => setPage('leaderboard')} />}

      <div className="dashboard-grid">
        <div className="dashboard-primary">
          {latestAnnouncement && (
            <button className={`announcement-banner tone-${latestAnnouncement.tone || 'info'}`} onClick={() => setPage('reminders')}>
              <span className="announcement-banner__icon"><Bell size={20} /></span>
              <span><small>Class reminder · {timeAgo(latestAnnouncement.createdAt)}</small><strong>{latestAnnouncement.title}</strong><p>{latestAnnouncement.body}</p></span>
              <ArrowRight size={19} />
            </button>
          )}
          <SectionHeading eyebrow="Checked by your class" title="Most trusted work" action="View all" onAction={() => setPage('assignments')} />
          {topAssignments.length ? (
            <div className="assignment-grid">{topAssignments.map((assignment, index) => <AssignmentCard key={assignment.id} assignment={assignment} rank={index + 1} activeClass={activeClass} user={user} showNotice={showNotice} onOpen={() => setSelectedAssignment(assignment)} />)}</div>
          ) : (
            <EmptyState icon={ClipboardCheck} title="No work has landed yet" body={isContributor ? 'Publish the first assignment and give your class a place to begin.' : 'A contributor will publish class work here.'} action={isContributor ? 'Add class work' : null} onAction={() => setModal('assignment')} />
          )}
          <SectionHeading eyebrow="The room" title="Class activity" />
          <div className="activity-cards">
            <ActivityCard icon={Users} tone="coral" value={members.length} label="People" hint="See roles & access" onClick={() => setPage('people')} />
            <ActivityCard icon={MessageCircle} tone="blue" value={assignments.length} label="Threads" hint="Discuss class work" onClick={() => setPage('threads')} />
            <ActivityCard icon={Bell} tone="yellow" value={announcements.length} label="Reminders" hint="Class-wide notices" onClick={() => setPage('reminders')} />
          </div>
        </div>

        <aside className="dashboard-rail">
          <div className="rail-card class-pass">
            <div className="rail-card__heading"><div><span>Class pass</span><strong>{activeClass.name}</strong></div><KeyRound size={20} /></div>
            <p>Share this code with classmates you want to invite.</p>
            <CopyCode code={activeClass.code} />
            <div className="class-pass__meta"><span>{activeClass.subject}</span>{activeClass.section && <span>{activeClass.section}</span>}<span>{roleLabel(membership?.role)}</span></div>
          </div>
          {isOwner && requests.filter((item) => item.status === 'pending').length > 0 && (
            <button className="rail-card request-alert" onClick={() => setPage('people')}>
              <span><UserCheck size={19} /></span><div><small>Needs your attention</small><strong>{requests.filter((item) => item.status === 'pending').length} contributor request{requests.filter((item) => item.status === 'pending').length === 1 ? '' : 's'}</strong></div><ArrowRight size={17} />
            </button>
          )}
          <div className="rail-card roster-peek">
            <div className="rail-title"><strong>People here</strong><button onClick={() => setPage('people')}>See all</button></div>
            <div className="avatar-stack">{members.slice(0, 5).map((member) => <Avatar key={member.id} name={member.name} photoURL={member.photoURL} profileEmoji={member.profileEmoji} badge={member.equippedBadge} title={member.name} />)}{members.length > 5 && <span>+{members.length - 5}</span>}</div>
            <p>{members.filter((member) => ['owner', 'contributor'].includes(member.role)).length} people can publish work and reminders.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ActivityCard({ icon: Icon, tone, value, label, hint, onClick }) {
  return <button className="activity-card" onClick={onClick}><span className={`activity-icon ${tone}`}><Icon size={21} /></span><span className="activity-card__copy"><span><strong>{value}</strong><b>{label}</b></span><small>{hint}</small></span><span className="activity-card__go"><ArrowRight size={17} /></span></button>;
}

function AssignmentsPage({ assignments, isContributor, activeClass, user, showNotice, setModal, setSelectedAssignment }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('top');
  const visible = useMemo(() => {
    const filtered = assignments.filter((item) => `${item.title} ${item.subject} ${item.authorName}`.toLowerCase().includes(search.toLowerCase()));
    return [...filtered].sort((a, b) => {
      if (sort === 'top') return (b.score || 0) - (a.score || 0);
      const difference = (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      return sort === 'old' ? -difference : difference;
    });
  }, [assignments, search, sort]);
  return (
    <div className="page-enter">
      <PageHeading eyebrow="Class library" title="Assignments" body="Browse the work your class has shared. Top-rated, community-verified answers rise first.">
        {isContributor && <button className="primary-button" onClick={() => setModal('assignment')}><Plus size={17} /> Add work</button>}
      </PageHeading>
      <div className="toolbar">
        <label className="search-control"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, subject, or contributor" /></label>
        <div className="sort-control"><button className={sort === 'top' ? 'active' : ''} onClick={() => setSort('top')}>Top verified</button><button className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>Newest</button><button className={sort === 'old' ? 'active' : ''} onClick={() => setSort('old')}>Oldest</button></div>
      </div>
      {visible.length ? <div className="assignment-grid assignment-grid--wide">{visible.map((assignment, index) => <AssignmentCard key={assignment.id} assignment={assignment} rank={sort === 'top' ? index + 1 : null} activeClass={activeClass} user={user} showNotice={showNotice} onOpen={() => setSelectedAssignment(assignment)} />)}</div> : <EmptyState icon={Archive} title="No assignments match" body="Try a different search, or publish new class work." />}
    </div>
  );
}

function attachmentThumbnail(attachment) {
  if (!attachment?.type?.startsWith('image/')) return '';
  if (attachment.driveFileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(attachment.driveFileId)}&sz=w800`;
  return /drive\.google\.com\/file\//.test(attachment.url || '') ? '' : attachment.url;
}

function AssignmentCard({ assignment, rank, activeClass, user, showNotice, onOpen }) {
  const state = verificationState(assignment.upvotes, assignment.downvotes);
  const attachment = assignment.attachments?.[0];
  const preview = attachmentThumbnail(attachment);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [vote, setVote] = useState(0);
  const [counts, setCounts] = useState({ up: assignment.upvotes || 0, down: assignment.downvotes || 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (activeClass?.id && user?.uid) getMyVote(activeClass.id, assignment.id, user.uid).then(setVote).catch(() => {}); }, [activeClass?.id, assignment.id, user?.uid]);
  useEffect(() => setCounts({ up: assignment.upvotes || 0, down: assignment.downvotes || 0 }), [assignment.upvotes, assignment.downvotes]);
  async function voteFor(value) {
    if (busy) return;
    setBusy(true);
    try {
      const previous = vote;
      const next = await castVote(activeClass.id, assignment.id, user, value);
      setVote(next);
      setCounts((current) => ({ up: Math.max(0, current.up - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0)), down: Math.max(0, current.down - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0)) }));
    } catch (error) { showNotice(firebaseMessage(error)); }
    finally { setBusy(false); }
  }
  return (
    <article className="assignment-card">
      <button className={`assignment-card__cover cover-${assignment.kind?.toLowerCase() || 'work'}`} onClick={onOpen} aria-label={`Open ${assignment.title}`}>
        <span className="subject-stamp">{assignment.subject}</span>
        {rank && <span className="rank-stamp">#{rank}</span>}
        {preview && !previewFailed ? <img src={preview} alt="" onError={() => setPreviewFailed(true)} /> : <div className="assignment-cover-art"><FileText size={34} /><span>{assignment.kind || 'Class work'}</span></div>}
      </button>
      <div className="assignment-card__body">
        {assignment.reported && <div className="reported-chip"><Flag size={12} /> Reported · check carefully</div>}
        <div className={`verification-badge ${state.key}`}>{state.key === 'verified' ? <CheckCheck size={14} /> : state.key === 'review' ? <CircleAlert size={14} /> : <Clock3 size={14} />}{state.label}</div>
        <h3>{assignment.title}</h3>
        <p>by {assignment.authorName} · {timeAgo(assignment.createdAt)}</p>
        <div className="card-votes"><button className={vote === 1 ? 'active good' : ''} onClick={() => voteFor(1)} disabled={busy} aria-label="Mark correct"><ThumbsUp size={16} /><span>{counts.up}</span></button><button className={vote === -1 ? 'active bad' : ''} onClick={() => voteFor(-1)} disabled={busy} aria-label="Mark needs review"><ThumbsDown size={16} /><span>{counts.down}</span></button></div>
        <button className="card-open" onClick={onOpen}>Open work <ArrowRight size={16} /></button>
      </div>
    </article>
  );
}

function ThreadsPage({ assignments, activeClass, user, isOwner, setSelectedAssignment, showNotice }) {
  const [activeId, setActiveId] = useState(assignments[0]?.id || '');
  const active = assignments.find((item) => item.id === activeId) || assignments[0] || null;
  useEffect(() => {
    if (!assignments.length) setActiveId('');
    else if (!assignments.some((item) => item.id === activeId)) setActiveId(assignments[0].id);
  }, [assignments, activeId]);
  return (
    <div className="page-enter">
      <PageHeading eyebrow="Ask, explain, improve" title="Assignment threads" body="Keep questions attached to the work they’re about, so answers stay useful later." />
      {assignments.length ? (
        <div className="thread-layout">
          <div className="thread-list">
            <div className="thread-list__label">Choose a discussion</div>
            {assignments.map((item) => <button key={item.id} className={active?.id === item.id ? 'active' : ''} onClick={() => setActiveId(item.id)}><span className="thread-file"><FileText size={18} /></span><div><strong>{item.title}</strong><small>{item.subject} · by {item.authorName}</small></div><ChevronDown size={16} /></button>)}
          </div>
          <ThreadRoom assignment={active} activeClass={activeClass} user={user} isOwner={isOwner} showNotice={showNotice} onOpenWork={() => setSelectedAssignment(active)} />
        </div>
      ) : <EmptyState icon={MessageCircle} title="Threads begin with an assignment" body="Once a contributor publishes work, everyone in class can discuss it here." />}
    </div>
  );
}

function ThreadRoom({ assignment, activeClass, user, isOwner = false, showNotice = () => {}, onOpenWork, compact = false }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [threadError, setThreadError] = useState('');
  const bottomRef = useRef(null);
  useEffect(() => {
    if (!assignment?.id) return undefined;
    setMessages([]);
    setThreadError('');
    return subscribeMessages(
      activeClass.id,
      assignment.id,
      setMessages,
      (error) => setThreadError(firebaseMessage(error))
    );
  }, [activeClass.id, assignment?.id]);
  useEffect(() => {
    const target = bottomRef.current;
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);
  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await sendMessage(activeClass.id, assignment.id, user, body);
      setBody('');
      setThreadError('');
    } catch (error) {
      const message = firebaseMessage(error);
      setThreadError(message);
      showNotice(message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteMessage(message) {
    if (!window.confirm('Delete this message?')) return;
    try {
      await removeMessage(activeClass.id, assignment.id, message.id);
      showNotice('Message deleted.');
    } catch (error) {
      showNotice(firebaseMessage(error));
    }
  }
  if (!assignment) return null;
  return (
    <section className={`thread-room ${compact ? 'thread-room--compact' : ''}`}>
      <header><div><span>Discussion</span><strong>{assignment.title}</strong></div>{onOpenWork && <button className="text-button" onClick={onOpenWork}>View work <ArrowRight size={15} /></button>}</header>
      <div className="message-stream">
        {threadError && <div className="thread-error" role="alert"><CircleAlert size={18} /><div><strong>Discussion unavailable</strong><p>{threadError}</p></div></div>}
        {!messages.length && <div className="thread-empty"><MessageCircle size={24} /><strong>Start the conversation</strong><p>Ask a question, explain a step, or flag something that needs another look.</p></div>}
        {messages.map((message) => <div className={`message ${message.authorId === user.uid ? 'message--mine' : ''}`} key={message.id}><Avatar name={message.authorName} small /><div><span><strong>{message.authorName}</strong><time>{timeAgo(message.createdAt)}</time>{(isOwner || message.authorId === user.uid) && <button className="message-delete" onClick={() => deleteMessage(message)} aria-label={`Delete message from ${message.authorName}`}><Trash2 size={13} /></button>}</span><p>{message.body}</p></div></div>)}
        <div ref={bottomRef} />
      </div>
      <form className="message-composer" onSubmit={submit}><Avatar name={user.displayName} small /><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a helpful reply…" maxLength={800} /><button disabled={busy || !body.trim()} aria-label="Send reply">{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></form>
    </section>
  );
}

function RemindersPage({ announcements, isContributor, isOwner, activeClass, user, setModal, showNotice }) {
  async function remove(item) {
    if (!window.confirm(`Remove “${item.title}”?`)) return;
    try { await removeAnnouncement(activeClass.id, item.id); showNotice('Reminder removed.'); } catch (error) { showNotice(firebaseMessage(error)); }
  }
  return (
    <div className="page-enter">
      <PageHeading eyebrow="Class-wide notices" title="Reminders" body="Announcements from your class creator and contributors, kept clear of assignment discussions.">
        {isContributor && <button className="primary-button" onClick={() => setModal('announcement')}><Plus size={17} /> Post reminder</button>}
      </PageHeading>
      {announcements.length ? <div className="reminder-list">{announcements.map((item) => <article className={`reminder-card tone-${item.tone || 'info'}`} key={item.id}><span className="reminder-card__icon">{item.tone === 'urgent' ? <CircleAlert size={21} /> : item.tone === 'celebrate' ? <Sparkles size={21} /> : <Bell size={21} />}</span><div><div className="reminder-meta"><span>{item.pinned && 'PINNED · '}{timeAgo(item.createdAt)}{item.expiresOn && ` · through ${new Date(`${item.expiresOn}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}</span>{(isOwner || item.authorId === user.uid) && <button className="icon-button" onClick={() => remove(item)} aria-label="Remove reminder"><Trash2 size={16} /></button>}</div><h3>{item.title}</h3><p>{item.body}</p><small>Posted by {item.authorName}</small></div></article>)}</div> : <EmptyState icon={Bell} title="No reminders right now" body={isContributor ? 'Post a class-wide reminder for deadlines, materials, or a change of plan.' : 'Class-wide announcements will appear here.'} action={isContributor ? 'Post a reminder' : null} onAction={() => setModal('announcement')} />}
    </div>
  );
}

function TimetablePage({ schedule, assignments, announcements, isContributor, isOwner, user, setModal, setSelectedAssignment }) {
  const days = [{ key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }];
  const periods = Array.from({ length: 12 }, (_, index) => index + 1);
  const deadlines = [
    ...assignments.filter((item) => item.dueDate).map((item) => ({ ...item, date: item.dueDate, source: 'assignment' })),
    ...announcements.filter((item) => item.expiresOn).map((item) => ({ ...item, date: item.expiresOn, source: 'reminder' }))
  ].filter((item) => item.date >= dateKey(new Date())).sort((a, b) => itemDate(a).localeCompare(itemDate(b))).slice(0, 6);
  function slotFor(day, period) { return schedule.find((item) => item.day === day && Number(item.period) === period) || schedule.find((item) => item.day === 'all' && Number(item.period) === period); }
  function canEdit(slot) { return isContributor && (!slot || isOwner || slot.authorId === user.uid); }
  function openSlot(day, period) {
    const slot = slotFor(day, period);
    if (canEdit(slot)) setModal({ type: 'schedule', slot: { ...slot, day: slot?.day || day, period } });
  }
  return <div className="page-enter"><PageHeading eyebrow="Monday to Friday, at a glance" title="Class timetable" body="A shared weekly plan with up to twelve periods, precise timings, rooms, and breaks.">{isContributor && <button className="primary-button" onClick={() => setModal({ type: 'schedule', slot: { day: 'mon', period: 1 } })}><Plus size={17} />Add a period</button>}</PageHeading><section className="weekly-board"><div className="weekly-board__intro"><span><CalendarDays size={20} /></span><div><strong>Weekly class plan</strong><small>{isContributor ? 'Select any cell to add or edit a period.' : 'Your contributors keep this timetable up to date.'}</small></div><div className="timetable-key"><i className="class" />Class<i className="break" />Break</div></div><div className="weekly-grid"><div className="weekly-grid__corner"><b>Period</b><small>Time</small></div>{days.map((day) => <div className="weekly-grid__day" key={day.key}><b>{day.label.slice(0, 3)}</b><span>{day.label}</span></div>)}{periods.map((period) => { const rowSlots = days.map((day) => slotFor(day.key, period)); const timing = rowSlots.find((slot) => slot?.startTime || slot?.endTime); return <div className="weekly-grid__row" key={period}><div className="weekly-grid__period"><strong>{period}</strong><span>{timing?.startTime ? `${timing.startTime}${timing.endTime ? `–${timing.endTime}` : ''}` : 'Set time'}</span></div>{days.map((day) => { const slot = slotFor(day.key, period); return <button key={day.key} className={`weekly-slot ${slot ? `filled type-${slot.type}` : ''}`} onClick={() => openSlot(day.key, period)} disabled={!canEdit(slot)}><span className="weekly-slot__accent" />{slot ? <><strong>{slot.title}</strong><small>{slot.details || (slot.type === 'break' ? 'Class break' : slot.authorName)}</small>{canEdit(slot) && <span className="weekly-slot__edit"><PenLine size={12} /></span>}</> : <><Plus size={15} /><small>{isContributor ? 'Add' : 'Free'}</small></>}</button>; })}</div>; })}</div></section><section className="deadline-strip"><div className="deadline-strip__heading"><div><p className="eyebrow">Dates that matter</p><h2>Upcoming deadlines</h2></div><span>{deadlines.length} ahead</span></div>{deadlines.length ? <div className="deadline-list">{deadlines.map((item) => <button key={`${item.source}-${item.id}`} onClick={() => item.source === 'assignment' && setSelectedAssignment(item)}><time><b>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { day: '2-digit' })}</b><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></time><div><small>{item.source === 'assignment' ? 'Assignment due' : 'Reminder ends'}</small><strong>{item.title}</strong></div><ArrowRight size={16} /></button>)}</div> : <p className="muted-copy">No assignment due dates or reminder deadlines are coming up.</p>}</section></div>;
}

function itemDate(item) { return String(item.date || ''); }

function PeoplePage({ members, requests, isOwner, activeClass, user, showNotice }) {
  const [menuFor, setMenuFor] = useState('');
  const groups = [
    ['Class creator', members.filter((item) => item.role === 'owner')],
    ['Contributors', members.filter((item) => item.role === 'contributor')],
    ['Members', members.filter((item) => item.role === 'member')]
  ];
  async function review(request, approved) {
    try { await reviewContributorRequest(activeClass.id, request, approved); showNotice(approved ? `${request.requesterName} can now contribute.` : 'Request declined.'); } catch (error) { showNotice(firebaseMessage(error)); }
  }
  async function changeRole(member, role) {
    try {
      await updateMemberRole(activeClass.id, member.id, role);
      setMenuFor('');
      showNotice(`${member.name} is now ${role === 'contributor' ? 'a contributor' : 'a member'}.`);
    } catch (error) { showNotice(firebaseMessage(error)); }
  }
  async function removePerson(member) {
    if (!window.confirm(`Remove ${member.name} from this class?`)) return;
    try {
      await removeMember(activeClass.id, member.id);
      setMenuFor('');
      showNotice(`${member.name} was removed from the class.`);
    } catch (error) { showNotice(firebaseMessage(error)); }
  }
  const pending = requests.filter((item) => item.status === 'pending');
  return (
    <div className="page-enter">
      <PageHeading eyebrow={`${members.length} people`} title="People in this class" body="See who can publish work and who is here as a member." />
      {isOwner && pending.length > 0 && <section className="request-queue"><div className="request-queue__heading"><span><UserCheck size={20} /></span><div><p className="eyebrow">Creator review</p><h2>Contributor requests</h2></div></div>{pending.map((request) => <div className="request-row" key={request.id}><Avatar name={request.requesterName} /><div><strong>{request.requesterName}</strong><span>{request.requesterEmail}</span>{request.note && <p>“{request.note}”</p>}</div><div><button className="secondary-button" onClick={() => review(request, false)}>Decline</button><button className="primary-button" onClick={() => review(request, true)}><Check size={16} /> Approve</button></div></div>)}</section>}
      <div className="people-groups">{groups.map(([label, items]) => items.length > 0 && <section key={label}><div className="group-heading"><h2>{label}</h2><span>{items.length}</span></div><div className="people-list">{items.map((member) => <div className="person-row" key={member.id}><Avatar name={member.name} photoURL={member.photoURL} profileEmoji={member.profileEmoji} badge={member.equippedBadge} /><div><strong>{member.name}</strong><span>{member.email}</span></div><span className={`role-chip ${member.role}`}>{member.role === 'owner' ? <ShieldCheck size={14} /> : member.role === 'contributor' ? <PenLine size={14} /> : <Users size={14} />}{roleLabel(member.role)}</span>{isOwner && member.role !== 'owner' && member.id !== user.uid && <div className="person-actions"><button className="icon-button" onClick={() => setMenuFor((current) => current === member.id ? '' : member.id)} aria-expanded={menuFor === member.id} aria-label={`More actions for ${member.name}`}><MoreHorizontal size={18} /></button>{menuFor === member.id && <div className="person-menu"><button onClick={() => changeRole(member, member.role === 'contributor' ? 'member' : 'contributor')}>{member.role === 'contributor' ? <Users size={15} /> : <PenLine size={15} />}{member.role === 'contributor' ? 'Make member' : 'Make contributor'}</button><button className="danger" onClick={() => removePerson(member)}><Trash2 size={15} />Remove from class</button></div>}</div>}</div>)}</div></section>)}</div>
    </div>
  );
}

function InboxPage({ items, readIds, onRead, onReadAll, onOpen }) {
  const [filter, setFilter] = useState('all');
  const visible = items.filter((item) => filter === 'all' || item.type === filter || (filter === 'feedback' && item.type === 'report'));
  return (
    <div className="page-enter">
      <PageHeading eyebrow="Everything that changed" title="Inbox" body="A single summary of new assignments, announcements, and contributor decisions.">
        <button className="secondary-button" onClick={onReadAll}><CheckCheck size={17} /> Mark all read</button>
      </PageHeading>
      <div className="inbox-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'assignment' ? 'active' : ''} onClick={() => setFilter('assignment')}>Assignments</button><button className={filter === 'feedback' ? 'active' : ''} onClick={() => setFilter('feedback')}>Feedback</button><button className={filter === 'reminder' ? 'active' : ''} onClick={() => setFilter('reminder')}>Reminders</button><button className={filter === 'request' ? 'active' : ''} onClick={() => setFilter('request')}>Requests</button></div>
      {visible.length ? <div className="inbox-list">{visible.map((item) => { const unread = !readIds.has(item.id); return <div key={item.id} className={`inbox-row ${unread ? 'unread' : ''}`}><button className="inbox-row__open" onClick={() => onOpen(item)}><span className={`inbox-type ${item.type}`}>{item.type === 'assignment' ? <BookOpen size={19} /> : item.type === 'reminder' ? <Bell size={19} /> : item.type === 'feedback' ? <MessageCircle size={19} /> : item.type === 'report' ? <Flag size={19} /> : <UserCheck size={19} />}</span><div><span>{item.kicker}</span><strong>{item.title}</strong><p>{item.body}</p></div><time>{timeAgo(item.date)}</time>{unread && <i />}</button>{unread && <button className="inbox-read" onClick={() => onRead(item.id)} aria-label={`Mark ${item.title} as read`}><Check size={15} /></button>}</div>; })}</div> : <EmptyState icon={Inbox} title="You’re all caught up" body="New work, reminders, feedback, and requests will collect here." />}
    </div>
  );
}

function buildInbox(assignments, announcements, requests, notifications, isOwner, userId) {
  const items = [
    ...assignments.filter((item) => item.authorId !== userId).map((item) => ({ id: `assignment-${item.id}`, type: 'assignment', kicker: `${item.subject} · new work`, title: item.title, body: `${item.authorName} shared an assignment.`, date: item.createdAt?.toDate?.() || null, assignment: item })),
    ...announcements.filter((item) => item.authorId !== userId).map((item) => ({ id: `reminder-${item.id}`, type: 'reminder', kicker: 'Class reminder', title: item.title, body: item.body, date: item.createdAt?.toDate?.() || null })),
    ...requests.filter((item) => isOwner ? item.status === 'pending' : item.status !== 'pending').map((item) => ({ id: `request-${item.id}-${item.status}`, type: 'request', kicker: isOwner ? 'Contributor request' : 'Request update', title: isOwner ? `${item.requesterName} wants to contribute` : `Your request was ${item.status}`, body: isOwner ? item.note || 'Review their request to publish work and reminders.' : `The class creator ${item.status} your contributor request.`, date: (item.reviewedAt || item.createdAt)?.toDate?.() || null })),
    ...notifications.map((item) => {
      const assignment = assignments.find((work) => work.id === item.assignmentId);
      return {
        id: `feedback-${item.id}`,
        type: item.type === 'report' ? 'report' : 'feedback',
        kicker: item.type === 'report' ? 'Work reported' : 'Feedback on your work',
        title: item.assignmentTitle || 'Assignment feedback',
        body: `${item.senderName || 'A classmate'} ${item.body || 'left feedback.'}`,
        date: item.createdAt?.toDate?.() || null,
        assignment
      };
    })
  ];
  return items.sort((a, b) => (b.date || 0) - (a.date || 0));
}

function RankBadge({ level, small = false }) {
  return <span className={`rank-badge rank-badge--${level.key} ${small ? 'rank-badge--small' : ''}`} title={`${level.name}: ${level.title}`}><img src={level.image} alt="" /><span>{level.name}</span></span>;
}

const ACHIEVEMENT_BADGES = [
  { key: 'week', name: 'Spark of the week', detail: 'Finished a week as top contributor', emoji: '⚡' },
  { key: 'month', name: 'Moon scholar', detail: 'Finished a month as top contributor', emoji: '🌙' },
  { key: 'year', name: 'Crown laureate', detail: 'Finished a year as top contributor', emoji: '👑' }
];

function earnedBadges(member) {
  if (!member) return [];
  return ACHIEVEMENT_BADGES.filter((badge) => (member.earnedBadgeTypes || []).includes(badge.key));
}

function AchievementBadge({ badge, selected = false, small = false }) {
  if (!badge) return null;
  return <span className={`achievement-badge achievement-badge--${badge.key} ${selected ? 'selected' : ''} ${small ? 'achievement-badge--small' : ''}`} title={badge.detail}><b aria-hidden="true">{badge.emoji}</b>{!small && <span>{badge.name}</span>}</span>;
}

function XpProgressCard({ member, onLeaderboard }) {
  const progress = xpProgress(member?.xp || 0);
  const badges = earnedBadges(member);
  return (
    <button className="xp-hero" onClick={onLeaderboard}>
      <div className="xp-hero__rank"><RankBadge level={progress.level} /><span><small>Your gemstone tier</small><strong>{progress.level.name}</strong><em>{progress.level.title}</em></span></div>
      <div className="xp-hero__progress"><span><strong>{member?.xp || 0} XP</strong><em>{progress.remaining ? `${progress.remaining} to ${xpProgress(progress.level.next).level.name}` : 'Highest level reached'}</em></span><span className="xp-track"><i style={{ width: `${progress.percent}%` }} /></span></div>
      <div className="xp-hero__badges">{badges.slice(0, 2).map((badge) => <AchievementBadge key={badge.key} badge={badge} small />)}{!badges.length && <span>Take the weekly lead to earn a badge</span>}</div>
      <ArrowRight size={18} />
    </button>
  );
}

function LeaderboardPage({ members }) {
  const week = currentWeekKey();
  const contributors = members
    .filter((member) => ['owner', 'contributor'].includes(member.role))
    .map((member) => ({ ...member, currentWeeklyXp: member.xpWeek === week ? Number(member.weeklyXp || 0) : 0 }))
    .filter((member) => member.currentWeeklyXp > 0)
    .sort((a, b) => b.currentWeeklyXp - a.currentWeeklyXp || Number(b.xp || 0) - Number(a.xp || 0));
  return (
    <div className="page-enter">
      <PageHeading eyebrow="Fresh every Monday" title="Weekly contributor leaderboard" body="Assignments earn 20 XP and reminders earn 8 XP. Keep the class useful; the week’s momentum matters more than lifetime totals." />
      {contributors.length ? <div className="leaderboard-list">{contributors.map((member, index) => { const progress = xpProgress(member.xp || 0); return <article className={index < 3 ? `leaderboard-row podium-${index + 1}` : 'leaderboard-row'} key={member.id}><span className="leaderboard-position">{index + 1}</span><Avatar name={member.name} photoURL={member.photoURL} profileEmoji={member.profileEmoji} badge={member.equippedBadge} /><div className="leaderboard-identity"><strong>{member.name}</strong><span>{roleLabel(member.role)} · {progress.level.title}</span><span className="leaderboard-mini-track"><i style={{ width: `${progress.percent}%` }} /></span></div><RankBadge level={progress.level} small /><div className="leaderboard-score"><strong>{member.currentWeeklyXp}</strong><span>XP this week</span></div><small>{member.xp || 0} lifetime XP</small></article>; })}</div> : <EmptyState icon={Trophy} title="The board is wide open" body="No one has earned XP this week. Post useful work or a class reminder to claim the first spot." />}
    </div>
  );
}

function PageHeading({ eyebrow, title, body, children }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{body}</p></div>{children && <div>{children}</div>}</header>;
}

function SectionHeading({ eyebrow, title, action, onAction }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <ArrowRight size={16} /></button>}</div>;
}

function EmptyState({ icon: Icon, title, body, action, onAction }) {
  return <div className="empty-state"><span><Icon size={27} /></span><h3>{title}</h3><p>{body}</p>{action && <button className="secondary-button" onClick={onAction}><Plus size={16} /> {action}</button>}</div>;
}

function Avatar({ name, photoURL = '', profileEmoji = '', badge = '', small = false, ...props }) {
  const palette = ['navy', 'coral', 'aqua', 'gold', 'violet'];
  const safeName = String(name || 'Class member');
  const index = [...safeName].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  const flair = ACHIEVEMENT_BADGES.find((item) => item.key === badge);
  return <span className={`avatar-cluster ${small ? 'avatar-cluster--small' : ''}`} {...props}><span className={`avatar avatar--${palette[index]} ${small ? 'avatar--small' : ''}`}>{profileEmoji ? <b className="avatar-emoji">{profileEmoji}</b> : photoURL ? <img src={photoURL} alt="" /> : initials(safeName)}</span>{flair && <AchievementBadge badge={flair} small />}</span>;
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button className="copy-code" onClick={copy}><strong>{code}</strong><span>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}</span></button>;
}

function Modal({ title, eyebrow, onClose, children, size = '' }) {
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal-card ${size}`} role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>{children}</section></div>;
}

function ClassActionsModal({ user, onClose, onDone }) {
  const [mode, setMode] = useState('join');
  return <Modal title={mode === 'join' ? 'Join a classroom' : 'Create a classroom'} eyebrow="Switch desks" onClose={onClose}><div className="segmented modal-segmented"><button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Join with code</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create new</button></div>{mode === 'join' ? <JoinClassForm user={user} onDone={onDone} /> : <CreateClassForm user={user} onDone={onDone} />}</Modal>;
}

function JoinClassForm({ user, onDone }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onDone(await joinClassroom(user, code)); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }
  return <form className="stack-form class-form" onSubmit={submit}><div className="join-code-field"><label htmlFor="join-code">Six-character class code</label><input id="join-code" autoFocus className="code-input" value={code} onChange={(event) => setCode(normalizeClassCode(event.target.value))} placeholder="ABC123" maxLength={6} required /></div><p className="form-help">Ask the class creator for the code shown on their Jaji home screen.</p>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<button className="primary-button primary-button--large" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />} Join classroom</button></form>;
}

function CreateClassForm({ user, onDone }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onDone(await createClassroom(user, { name })); } catch (err) { setError(firebaseMessage(err)); } finally { setBusy(false); }
  }
  return <form className="stack-form class-form" onSubmit={submit}><Field label="Class name" icon={GraduationCap}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="10B Study Room" maxLength={80} required autoFocus /></Field><p className="form-help">That’s all you need. Jaji will generate the private join code automatically.</p>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<button className="primary-button primary-button--large" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} Create classroom</button></form>;
}

const PROFILE_EMOJIS = ['😀', '😎', '🤓', '🥳', '🫡', '🧠', '🦊', '🐼', '🐯', '🐸', '🐙', '🦋', '🌻', '🌈', '⚡', '🔥', '🪐', '🚀', '🎨', '🎧', '📚', '✏️', '🧪', '🔭', '💎', '🧿', '🍄', '🪩', '🛸', '🏆'];

function ProfileSettingsModal({ user, membership, classIds, onClose, onDone }) {
  const [displayName, setDisplayName] = useState(membership?.name || user.displayName || '');
  const [photoURL, setPhotoURL] = useState(membership?.photoURL || user.photoURL || '');
  const [profileEmoji, setProfileEmoji] = useState(membership?.profileEmoji || '');
  const [equippedBadge, setEquippedBadge] = useState(membership?.equippedBadge || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const badges = earnedBadges(membership);

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setError('Choose an image under 8 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setPhotoURL(await uploadProfilePhoto(file));
      setProfileEmoji('');
    } catch (uploadError) {
      setError(firebaseMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setError('Use a display name with at least 2 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const values = { displayName: displayName.trim(), photoURL, profileEmoji, equippedBadge };
      await updateProfile(user, { displayName: values.displayName, photoURL: values.photoURL || null });
      await updateUserProfile(user, classIds, values);
      onDone();
    } catch (saveError) {
      setError(firebaseMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Make your profile yours" eyebrow="Identity & flair" onClose={onClose} size="modal-card--wide"><form className="profile-settings" onSubmit={submit}><section className="profile-photo-editor"><div className="profile-photo-preview"><Avatar name={displayName} photoURL={photoURL} profileEmoji={profileEmoji} badge={equippedBadge} /><div><button type="button" className="text-button" onClick={() => { setProfileEmoji(''); setPhotoURL(''); }}>Use initials</button><label><Camera size={16} /><span>{busy ? 'Uploading…' : 'Upload photo'}</span><input type="file" accept="image/*" onChange={choosePhoto} disabled={busy} /></label></div></div><Field label="Display name" icon={UserCheck}><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required /></Field></section><section className="emoji-studio"><div><p className="eyebrow">Emoji avatar studio</p><h3>Pick your classroom face</h3><p>Choose one below or paste any emoji you like.</p></div><label className="emoji-custom"><span>Any emoji</span><input value={profileEmoji} onChange={(event) => { setProfileEmoji(Array.from(event.target.value).slice(0, 2).join('')); setPhotoURL(''); }} placeholder="✨" /></label><div className="emoji-grid">{PROFILE_EMOJIS.map((emoji) => <button type="button" key={emoji} className={profileEmoji === emoji ? 'selected' : ''} onClick={() => { setProfileEmoji(emoji); setPhotoURL(''); }}>{emoji}</button>)}</div></section><section className="badge-wardrobe"><div><p className="eyebrow">Badge wardrobe</p><h3>Wear an achievement</h3><p>Earned pins sit proudly beside your profile—not on top of it.</p></div><div className="badge-options"><button type="button" className={!equippedBadge ? 'selected' : ''} onClick={() => setEquippedBadge('')}><span>None</span><small>Clean profile</small></button>{ACHIEVEMENT_BADGES.map((badge) => { const earned = badges.some((item) => item.key === badge.key); return <button type="button" key={badge.key} disabled={!earned} className={equippedBadge === badge.key ? 'selected' : ''} onClick={() => earned && setEquippedBadge(badge.key)}><AchievementBadge badge={badge} /><small>{earned ? badge.detail : 'Keep contributing to unlock'}</small></button>; })}</div></section>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={17} />}Save profile</button></div></form></Modal>;
}

function ContributorRequestModal({ activeClass, user, existing, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (existing?.status === 'pending') return <Modal title="Request already sent" eyebrow="Contributor access" onClose={onClose}><div className="modal-note"><Clock3 size={24} /><p>The class creator has your request. You’ll see their decision in your inbox.</p></div></Modal>;
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { await requestContributor(activeClass.id, user, note); onDone(); } catch (err) { setError(firebaseMessage(err)); setBusy(false); }
  }
  return <Modal title="Request contributor access" eyebrow={activeClass.name} onClose={onClose}><p className="modal-intro">Contributors can publish assignments and class-wide reminders. The class creator will review your request.</p><form className="stack-form" onSubmit={submit}><label className="plain-field"><span>Why would you like to contribute? <small>Optional</small></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="I can upload our maths notes and homework answers…" /></label>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<button className="primary-button primary-button--large" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />} Send request</button></form></Modal>;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function CustomDatePicker({ label, value, onChange, min = '', required = false }) {
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected || new Date());
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstOffset + 1;
    return day > 0 && day <= daysInMonth ? new Date(year, month, day) : null;
  });
  function moveMonth(amount) {
    setView(new Date(year, month + amount, 1));
  }
  return <div className="custom-date-field"><span>{label}{required && ' *'}</span><button type="button" className={`date-trigger ${open ? 'active' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-required={required}><CalendarDays size={17} /><strong>{selected ? selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose a date'}</strong><ChevronDown size={16} /></button>{open && <div className="calendar-popover"><header><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><strong>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button></header><div className="calendar-weekdays">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{cells.map((date, index) => date ? <button type="button" key={dateKey(date)} disabled={Boolean(min && dateKey(date) < min)} className={`${dateKey(date) === value ? 'selected' : ''} ${dateKey(date) === dateKey(new Date()) ? 'today' : ''}`} onClick={() => { onChange(dateKey(date)); setOpen(false); }}>{date.getDate()}</button> : <span key={`blank-${index}`} />)}</div><footer><button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button><button type="button" onClick={() => { const today = new Date(); setView(today); if (!min || dateKey(today) >= min) { onChange(dateKey(today)); setOpen(false); } }}>Today</button></footer></div>}</div>;
}

function AssignmentFormModal({ activeClass, user, onClose, onDone }) {
  const [values, setValues] = useState({ title: '', subject: '', kind: 'Homework', dueDate: '', description: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      setBusyLabel(files.length ? 'Connecting to Drive…' : 'Publishing…');
      const attachments = await uploadAssignmentFiles(activeClass, files);
      setBusyLabel('Publishing…');
      await createAssignment(activeClass.id, user, values, attachments);
      onDone();
    } catch (err) {
      setError(firebaseMessage(err)); setBusy(false); setBusyLabel('');
    }
  }
  function chooseFiles(event) {
    const picked = [...event.target.files];
    const invalid = picked.find((file) => file.size > 25 * 1024 * 1024 || (!file.type.startsWith('image/') && file.type !== 'application/pdf'));
    if (invalid) { setError('Upload images or PDFs up to 25 MB each.'); return; }
    setFiles(picked.slice(0, 5)); setError('');
  }
  return <Modal title="Publish class work" eyebrow={activeClass.name} onClose={onClose} size="modal-card--wide"><form className="stack-form" onSubmit={submit}><Field label="Assignment title" icon={FileText}><input value={values.title} onChange={update('title')} placeholder="Trigonometry exercise 7.2" maxLength={100} required /></Field><div className="form-row"><Field label="Subject" icon={BookOpen}><input value={values.subject} onChange={update('subject')} placeholder="Mathematics" required /></Field><label className="plain-field"><span>Work type</span><select value={values.kind} onChange={update('kind')}><option>Homework</option><option>Classwork</option><option>Notes</option><option>Study guide</option><option>Answer key</option></select></label></div><CustomDatePicker label="Due date (optional)" value={values.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(dueDate) => setValues((current) => ({ ...current, dueDate }))} /><label className="plain-field"><span>What should classmates know? <small>Optional</small></span><textarea value={values.description} onChange={update('description')} placeholder="Mention the chapter, questions covered, or anything that still needs checking." maxLength={1000} /></label><label className="upload-zone"><input type="file" accept="image/*,.pdf,application/pdf" multiple onChange={chooseFiles} disabled={busy} /><span><Paperclip size={22} /></span><strong>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready` : 'Attach images or PDFs'}</strong><small>{files.length ? files.map((file) => file.name).join(', ') : 'Saved to your Google Drive · up to 5 files, 25 MB each'}</small></label>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <PenLine size={17} />} {busy ? busyLabel : 'Publish work'}</button></div></form></Modal>;
}

function AnnouncementFormModal({ activeClass, user, onClose, onDone }) {
  const [values, setValues] = useState({ title: '', body: '', tone: 'info', pinned: false, expiresOn: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (!values.expiresOn) { setError('Choose the final day for this reminder.'); return; }
    setBusy(true);
    try { await createAnnouncement(activeClass.id, user, values); onDone(); } catch (err) { setError(firebaseMessage(err)); setBusy(false); }
  }
  return <Modal title="Post a class reminder" eyebrow={activeClass.name} onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="Headline" icon={Bell}><input value={values.title} onChange={update('title')} placeholder="Bring graph paper tomorrow" maxLength={100} required /></Field><label className="plain-field"><span>Details</span><textarea value={values.body} onChange={update('body')} placeholder="Keep it useful and specific…" maxLength={800} required /></label><div className="form-row"><CustomDatePicker label="Visible through" value={values.expiresOn} min={new Date().toISOString().slice(0, 10)} required onChange={(expiresOn) => setValues((current) => ({ ...current, expiresOn }))} /><label className="plain-field"><span>Style</span><select value={values.tone} onChange={update('tone')}><option value="info">General information</option><option value="urgent">Deadline or urgent</option><option value="celebrate">Good news</option></select></label></div><p className="form-help">The reminder disappears automatically after this date.</p><label className="check-field"><input type="checkbox" checked={values.pinned} onChange={(event) => setValues((current) => ({ ...current, pinned: event.target.checked }))} /><span><strong>Pin this reminder</strong><small>Keep it visually prominent for the class.</small></span></label>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={17} />} Post reminder</button></div></form></Modal>;
}

function ScheduleEventModal({ activeClass, user, initial = {}, onClose, onDone }) {
  const [values, setValues] = useState({ title: initial.title || '', details: initial.details || '', day: initial.day || 'mon', period: initial.period || 1, startTime: initial.startTime || '', endTime: initial.endTime || '', type: initial.type || 'class' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createScheduleEvent(activeClass.id, user, values);
      onDone();
    } catch (saveError) {
      setError(firebaseMessage(saveError));
      setBusy(false);
    }
  }
  async function deleteSlot() {
    if (!window.confirm(`Remove “${initial.title}” from the weekly timetable?`)) return;
    setBusy(true);
    try { await removeScheduleEvent(activeClass.id, initial.id); onDone(); } catch (deleteError) { setError(firebaseMessage(deleteError)); setBusy(false); }
  }
  const canDelete = initial.id && (initial.authorId === user.uid || activeClass.ownerId === user.uid);
  return <Modal title={initial.id ? 'Edit timetable slot' : 'Add a timetable slot'} eyebrow={activeClass.name} onClose={onClose}><form className="stack-form timetable-form" onSubmit={submit}><div className="form-row"><label className="plain-field"><span>Day</span><select value={values.day} onChange={update('day')} disabled={Boolean(initial.id)}><option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thu">Thursday</option><option value="fri">Friday</option><option value="all">Every weekday</option></select></label><label className="plain-field"><span>Period</span><select value={values.period} onChange={update('period')} disabled={Boolean(initial.id)}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>Period {index + 1}</option>)}</select></label></div><Field label={values.type === 'break' ? 'Break name' : 'Subject'} icon={BookOpen}><input value={values.title} onChange={update('title')} placeholder={values.type === 'break' ? 'Lunch break' : 'Mathematics'} maxLength={100} required /></Field><div className="form-row"><label className="plain-field"><span>Starts</span><input type="time" value={values.startTime} onChange={update('startTime')} /></label><label className="plain-field"><span>Ends</span><input type="time" value={values.endTime} onChange={update('endTime')} /></label></div><label className="plain-field"><span>Slot type</span><select value={values.type} onChange={update('type')}><option value="class">Class period</option><option value="break">Break</option><option value="study">Study hall</option><option value="exam">Exam period</option></select></label><label className="plain-field"><span>Room or note <small>Optional</small></span><input value={values.details} onChange={update('details')} placeholder="Room 204 · bring lab notebook" maxLength={120} /></label>{error && <div className="form-message"><CircleAlert size={16} />{error}</div>}<div className="modal-actions">{canDelete && <button type="button" className="danger-text-button timetable-delete" onClick={deleteSlot} disabled={busy}><Trash2 size={15} />Remove slot</button>}<button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={17} />}{initial.id ? 'Save changes' : 'Add period'}</button></div></form></Modal>;
}

function AssignmentDetail({ assignment, activeClass, user, isOwner, onClose, onDeleted, showNotice }) {
  const [vote, setVote] = useState(0);
  const [working, setWorking] = useState(false);
  const [localAssignment, setLocalAssignment] = useState(assignment);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  useEffect(() => { getMyVote(activeClass.id, assignment.id, user.uid).then(setVote); }, [activeClass.id, assignment.id, user.uid]);
  async function voteFor(value) {
    if (working) return;
    setWorking(true);
    try {
      const previous = vote;
      const next = await castVote(activeClass.id, assignment.id, user, value);
      setVote(next);
      setLocalAssignment((current) => ({ ...current, upvotes: Math.max(0, (current.upvotes || 0) - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0)), downvotes: Math.max(0, (current.downvotes || 0) - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0)) }));
    } catch (error) { showNotice(firebaseMessage(error)); }
    setWorking(false);
  }
  async function deleteWork() {
    if (!window.confirm(`Delete “${assignment.title}” and its discussion?`)) return;
    setWorking(true);
    try { await removeAssignment(activeClass.id, assignment.id); showNotice('Assignment deleted.'); onDeleted(); }
    catch (error) { showNotice(firebaseMessage(error)); setWorking(false); }
  }
  async function submitReport(event) {
    event.preventDefault();
    if (reportReason.trim().length < 8) { showNotice('Describe the serious problem before reporting.'); return; }
    setWorking(true);
    try {
      await reportAssignment(activeClass.id, assignment, user, reportReason.trim());
      setLocalAssignment((current) => ({ ...current, reported: true, reportCount: Number(current.reportCount || 0) + 1 }));
      setReporting(false); setReportReason(''); showNotice('Report shared with the class and the contributor.');
    } catch (error) { showNotice(firebaseMessage(error)); }
    finally { setWorking(false); }
  }
  const state = verificationState(localAssignment.upvotes, localAssignment.downvotes);
  const canDelete = isOwner || assignment.authorId === user.uid;
  return (
    <Modal title={assignment.title} eyebrow={`${assignment.subject} · ${assignment.kind}`} onClose={onClose} size="modal-card--detail">
      <div className="assignment-detail">
        <section className="assignment-detail__main">
          <div className="detail-toolbar"><div><span>Shared by {assignment.authorName}</span>{assignment.dueDate && <strong><CalendarDays size={14} /> Due {new Date(`${assignment.dueDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</strong>}</div>{canDelete && <div className="detail-actions"><button className="icon-button" onClick={() => setActionsOpen((current) => !current)} aria-label="Assignment actions"><MoreHorizontal size={18} /></button>{actionsOpen && <div className="detail-actions__menu"><button onClick={deleteWork} disabled={working}><Trash2 size={15} />Delete assignment</button></div>}</div>}</div>
          {localAssignment.reported && <div className="report-banner"><Flag size={18} /><div><strong>Reported by the class</strong><p>{localAssignment.reportCount || 1} classmate{localAssignment.reportCount === 1 ? '' : 's'} flagged a serious problem. Check this upload carefully.</p></div></div>}
          <div className={`detail-verification ${state.key}`}><span>{state.key === 'verified' ? <CheckCheck size={21} /> : state.key === 'review' ? <CircleAlert size={21} /> : <Clock3 size={21} />}</span><div><strong>{state.label}</strong><p>{state.key === 'verified' ? 'At least two classmates checked this and most agree it is correct.' : state.key === 'review' ? 'Classmates found something that may need another look.' : 'Open the attachment, check the work, then cast your vote.'}</p></div></div>
          {assignment.description && <div className="detail-description"><h3>Contributor note</h3><p>{assignment.description}</p></div>}
          <div className="attachment-list"><div className="detail-section-heading"><div><p className="eyebrow">Files</p><h3>Attached work</h3></div><span>{assignment.attachments?.length || 0} file{assignment.attachments?.length === 1 ? '' : 's'}</span></div>{assignment.attachments?.length ? assignment.attachments.map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.url}><span>{file.type?.startsWith('image/') ? <FileImage size={19} /> : <FileText size={19} />}</span><div><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB · Opens in Google Drive</small></div><span className="attachment-open">Open <ArrowRight size={15} /></span></a>) : <div className="attachment-empty"><FileText size={22} /><span><strong>No file attached</strong><small>The contributor shared assignment details only.</small></span></div>}</div>
          <div className="vote-box"><div><p className="eyebrow">Community check</p><h3>Does this look correct?</h3><p>Your vote can be changed any time.</p></div><div><button className={vote === 1 ? 'active good' : ''} onClick={() => voteFor(1)} disabled={working}><ThumbsUp size={19} /><span>Looks correct</span><b>{localAssignment.upvotes || 0}</b></button><button className={vote === -1 ? 'active bad' : ''} onClick={() => voteFor(-1)} disabled={working}><ThumbsDown size={19} /><span>Needs review</span><b>{localAssignment.downvotes || 0}</b></button></div></div>
          {assignment.authorId !== user.uid && <div className="report-work"><button className="danger-text-button" onClick={() => setReporting((current) => !current)}><Flag size={15} />Report a serious problem</button>{reporting && <form onSubmit={submitReport}><label htmlFor="report-reason">What is seriously wrong with this upload?</label><textarea id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={400} placeholder="For example: the uploaded file contains unrelated or unsafe material." autoFocus /><div><button type="button" className="secondary-button" onClick={() => setReporting(false)}>Cancel</button><button className="danger-button" disabled={working || reportReason.trim().length < 8}>Send report</button></div></form>}</div>}
        </section>
        <aside className="assignment-detail__thread"><ThreadRoom compact assignment={assignment} activeClass={activeClass} user={user} isOwner={isOwner} showNotice={showNotice} /></aside>
      </div>
    </Modal>
  );
}

export default App;

export { Avatar, CustomDatePicker, ThreadsPage, TimetablePage };
