import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Gamepad2,
  Home,
  Lightbulb,
  LockKeyhole,
  MessageCircleHeart,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon
} from "lucide-react";

type KidsView = "home" | "lessons" | "activities" | "prayer" | "games" | "reading";
type Progress = {
  completedLessons: string[];
  completedActivities: string[];
  completedPrayers: string[];
  completedGames: string[];
  completedReading: string[];
  stars: number;
  childName: string;
};

type Lesson = { id: string; title: string; story: string; verse: string; takeaway: string; emoji: string; color: string; question: string; answers: string[]; correct: number };
type Activity = { id: string; title: string; description: string; duration: string; emoji: string; color: string };
type Prayer = { id: string; title: string; body: string; emoji: string };

const storageKey = "christianKids.progress";

const lessons: Lesson[] = [
  { id: "creation", title: "God Made Everything", story: "In the beginning, God made the sky, the sea, the land, and every living thing. God made you too, and He knows you by name.", verse: "God saw everything he had made, and it was very good.", takeaway: "You are wonderfully made and deeply loved.", emoji: "🌈", color: "lavender", question: "Who made the whole world?", answers: ["God", "A rainbow", "A star"], correct: 0 },
  { id: "kind-samaritan", title: "The Kind Helper", story: "A traveler was hurt on the road. A kind Samaritan stopped, cared for him, and helped him get better. Jesus teaches us to love our neighbors.", verse: "Love your neighbor as yourself.", takeaway: "Kindness is love in action.", emoji: "🧡", color: "peach", question: "What did the Samaritan do?", answers: ["He hurried past", "He helped the traveler", "He hid"], correct: 1 },
  { id: "calm-storm", title: "Jesus Calms the Storm", story: "The disciples were scared when a big storm shook their boat. Jesus spoke, and the wind became calm. We can trust Jesus when we feel afraid.", verse: "Do not be afraid. I am with you.", takeaway: "Jesus is with you in every storm.", emoji: "⛵", color: "sky", question: "How did the disciples feel?", answers: ["Sleepy", "Scared", "Hungry"], correct: 1 }
];

const activities: Activity[] = [
  { id: "kind-note", title: "Make a Kindness Note", description: "Draw a happy picture or write kind words for someone in your family.", duration: "10 min", emoji: "💌", color: "peach" },
  { id: "gratitude-walk", title: "Thankful Walk", description: "Look around you and name five things God made that you are thankful for.", duration: "5 min", emoji: "🌼", color: "mint" },
  { id: "help-home", title: "Little Helper", description: "Choose one helpful job at home and do it with a happy heart.", duration: "15 min", emoji: "🧺", color: "butter" }
];

const prayers: Prayer[] = [
  { id: "morning", title: "Good Morning, God", body: "Dear God, thank You for this new day. Please help me learn, listen, and show kindness. Amen.", emoji: "☀️" },
  { id: "brave", title: "A Prayer for Courage", body: "Dear Jesus, when I feel worried, help me remember that You are near. Give me a brave and peaceful heart. Amen.", emoji: "🦁" },
  { id: "thankful", title: "Thank You Prayer", body: "God, thank You for my family, my friends, and the wonderful world You made. Help me share Your love today. Amen.", emoji: "💛" }
];

const readingChallenges = [
  { id: "read-creation", title: "Read: God Made Everything", detail: "Read the story card aloud with a grown-up.", minutes: 5, emoji: "📖" },
  { id: "read-kindness", title: "Read: The Kind Helper", detail: "Read the kindness story and tell someone what you learned.", minutes: 7, emoji: "🧡" },
  { id: "read-verse", title: "Practice a Memory Verse", detail: "Say a verse three times, then teach it to someone else.", minutes: 3, emoji: "✨" }
];

const navItems: Array<{ view: KidsView; label: string; icon: LucideIcon }> = [
  { view: "home", label: "Home", icon: Home },
  { view: "lessons", label: "Learn", icon: BookOpen },
  { view: "activities", label: "Do", icon: Lightbulb },
  { view: "prayer", label: "Pray", icon: MessageCircleHeart },
  { view: "games", label: "Play", icon: Gamepad2 },
  { view: "reading", label: "Read", icon: Trophy }
];

const defaultProgress: Progress = { completedLessons: [], completedActivities: [], completedPrayers: [], completedGames: [], completedReading: [], stars: 3, childName: "Sunny" };

function loadProgress(): Progress {
  try { return { ...defaultProgress, ...JSON.parse(localStorage.getItem(storageKey) || "{}")} as Progress; } catch { return defaultProgress; }
}

function Character({ mood = "happy" }: { mood?: "happy" | "pray" | "read" }) {
  return <div className={`kids-character character-${mood}`} aria-hidden="true"><div className="character-hair" /><div className="character-face"><span className="character-eye left" /><span className="character-eye right" /><span className="character-smile">⌣</span></div><div className="character-body" /><span className="character-star">✦</span></div>;
}

function KidsApp() {
  const [view, setView] = useState<KidsView>("home");
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameChoice, setGameChoice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(progress)); }, [progress]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const completedCount = progress.completedLessons.length + progress.completedActivities.length + progress.completedPrayers.length + progress.completedGames.length + progress.completedReading.length;
  const setCompleted = (key: keyof Pick<Progress, "completedLessons" | "completedActivities" | "completedPrayers" | "completedGames" | "completedReading">, id: string, message: string) => {
    if (progress[key].includes(id)) return;
    setProgress((current) => ({ ...current, [key]: [...current[key], id], stars: current.stars + 1 }));
    setToast(message);
  };

  const startLesson = (lesson: Lesson) => { setSelectedLesson(lesson); setQuizChoice(null); };
  const closeLesson = () => { setSelectedLesson(null); setQuizChoice(null); };
  const totalSteps = lessons.length + activities.length + prayers.length + readingChallenges.length + 1;
  const progressPercent = Math.min(100, Math.round((completedCount / totalSteps) * 100));

  return <div className="kids-app">
    <header className="kids-header"><a className="kids-brand" href="/kids" aria-label="Sunny's Bible Club home"><span className="brand-sun">☀</span><span>Sunny's<br /><strong>Bible Club</strong></span></a><div className="kids-header-actions"><span className="star-count"><Star size={18} fill="currentColor" /> {progress.stars}</span><button className="avatar-button" type="button" aria-label="Change profile" onClick={() => setToast("Hi Sunny! Keep learning and growing 🌱")}>S</button></div></header>
    <main className="kids-main">
      {view === "home" && <HomeView progress={progress} progressPercent={progressPercent} onNavigate={setView} onLesson={startLesson} onComplete={(key, id, message) => setCompleted(key, id, message)} />}
      {view === "lessons" && <LessonsView progress={progress} onLesson={startLesson} />}
      {view === "activities" && <ActivitiesView progress={progress} onComplete={(id) => setCompleted("completedActivities", id, "Activity complete! You made the world kinder 💛")} />}
      {view === "prayer" && <PrayerView progress={progress} onComplete={(id) => setCompleted("completedPrayers", id, "Prayer time complete. God hears you 🙏")} />}
      {view === "games" && <GamesView progress={progress} started={gameStarted} choice={gameChoice} onStart={() => { setGameStarted(true); setGameChoice(null); }} onChoice={(choice) => { setGameChoice(choice); if (choice === "kind") setCompleted("completedGames", "kindness-match", "You found the match! Great job ⭐"); }} />}
      {view === "reading" && <ReadingView progress={progress} onComplete={(id) => setCompleted("completedReading", id, "Reading star earned! Keep going 📚")} />}
    </main>
    <nav className="kids-nav" aria-label="Kids app navigation">{navItems.map(({ view: itemView, label, icon: Icon }) => <button key={itemView} type="button" className={view === itemView ? "active" : ""} onClick={() => { setView(itemView); closeLesson(); }}><Icon size={23} strokeWidth={view === itemView ? 2.5 : 2} /><span>{label}</span></button>)}</nav>
    {selectedLesson && <LessonModal lesson={selectedLesson} choice={quizChoice} isComplete={progress.completedLessons.includes(selectedLesson.id)} onChoice={setQuizChoice} onClose={closeLesson} onComplete={() => { setCompleted("completedLessons", selectedLesson.id, "Lesson complete! One more star for you ✨"); closeLesson(); }} />}
    {toast && <div className="kids-toast" role="status"><Sparkles size={19} /> {toast}</div>}
  </div>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) { return <div className="kids-section-heading"><div><p className="kids-eyebrow">{eyebrow}</p><h1>{title}</h1></div>{action && <button className="text-action" type="button" onClick={onAction}>{action}<ArrowRight size={17} /></button>}</div>; }
function ProgressPill({ label, done }: { label: string; done: boolean }) { return <span className={`progress-pill ${done ? "done" : ""}`}>{done ? <Check size={14} /> : <span className="pill-dot" />}{label}</span>; }

function HomeView({ progress, progressPercent, onNavigate, onLesson, onComplete }: { progress: Progress; progressPercent: number; onNavigate: (view: KidsView) => void; onLesson: (lesson: Lesson) => void; onComplete: (key: keyof Pick<Progress, "completedLessons" | "completedActivities" | "completedPrayers" | "completedGames" | "completedReading">, id: string, message: string) => void }) {
  const featuredLesson = lessons.find((lesson) => !progress.completedLessons.includes(lesson.id)) || lessons[0];
  return <div className="kids-page home-page"><section className="welcome-card"><div><p className="kids-eyebrow">Good morning, Sunny!</p><h1>Let’s grow in<br /><span>God’s love.</span></h1><p className="welcome-copy">Learn, play, pray, and do something kind today.</p><button className="primary-kids-button" type="button" onClick={() => onLesson(featuredLesson)}><Play size={17} fill="currentColor" /> Start today’s lesson</button></div><Character /></section><section className="streak-card"><div className="streak-icon">🔥</div><div><strong>3 day streak!</strong><span>You’re doing great. Come back tomorrow.</span></div><div className="streak-dots"><span className="filled" /><span className="filled" /><span className="filled" /><span /><span /></div></section><SectionHeading eyebrow="Your adventure" title="Today’s path" action="See all" onAction={() => onNavigate("lessons")} /><div className="path-card"><div className="path-track"><div className="path-line" style={{ width: `${progressPercent}%` }} /></div><div className="path-steps"><div><span className="path-bubble active">📖</span><strong>Learn</strong><small>{progress.completedLessons.length}/{lessons.length}</small></div><div><span className="path-bubble">💛</span><strong>Do</strong><small>{progress.completedActivities.length}/{activities.length}</small></div><div><span className="path-bubble">🙏</span><strong>Pray</strong><small>{progress.completedPrayers.length}/{prayers.length}</small></div><div><span className="path-bubble">🏆</span><strong>Play</strong><small>{progress.completedGames.length}/1</small></div></div></div><div className="quick-grid"><button type="button" className="quick-card mint" onClick={() => onNavigate("activities")}><span>🌼</span><strong>Kindness activity</strong><small>Make someone smile</small></button><button type="button" className="quick-card lavender" onClick={() => onNavigate("prayer")}><span>🙏</span><strong>Prayer time</strong><small>Talk with God</small></button></div></div>;
}

function LessonsView({ progress, onLesson }: { progress: Progress; onLesson: (lesson: Lesson) => void }) { return <div className="kids-page"><SectionHeading eyebrow="Bible stories" title="Let’s learn!" /><p className="section-intro">Choose a story and discover what God’s love can teach us.</p><div className="lesson-list">{lessons.map((lesson, index) => <button key={lesson.id} type="button" className={`lesson-card ${lesson.color}`} onClick={() => onLesson(lesson)}><span className="lesson-number">{index + 1}</span><span className="lesson-emoji">{lesson.emoji}</span><span className="lesson-info"><strong>{lesson.title}</strong><small>{lesson.takeaway}</small><ProgressPill label={progress.completedLessons.includes(lesson.id) ? "Finished" : "5 min lesson"} done={progress.completedLessons.includes(lesson.id)} /></span><ChevronLeft className="lesson-arrow" size={21} /></button>)}</div><div className="tip-card"><Lightbulb size={22} /><span><strong>Learning tip:</strong> Tell someone one thing you learned today!</span></div></div>; }

function ActivitiesView({ progress, onComplete }: { progress: Progress; onComplete: (id: string) => void }) { return <div className="kids-page"><SectionHeading eyebrow="Tiny acts, big love" title="Let’s do it!" /><p className="section-intro">God gives us chances to show kindness every day.</p><div className="activity-list">{activities.map((activity) => { const done = progress.completedActivities.includes(activity.id); return <article className={`activity-card ${activity.color}`} key={activity.id}><span className="activity-emoji">{activity.emoji}</span><div><span className="activity-time">{activity.duration}</span><h2>{activity.title}</h2><p>{activity.description}</p><button className={`complete-button ${done ? "completed" : ""}`} type="button" disabled={done} onClick={() => onComplete(activity.id)}>{done ? <><Check size={17} /> Done!</> : "Mark complete"}</button></div></article>; })}</div></div>; }

function PrayerView({ progress, onComplete }: { progress: Progress; onComplete: (id: string) => void }) { return <div className="kids-page prayer-page"><SectionHeading eyebrow="A quiet moment" title="Let’s pray." /><p className="section-intro">You can talk to God anytime. He is always listening.</p><div className="prayer-hero"><Character mood="pray" /><div><strong>Dear God,</strong><p>Thank You for loving me every day.</p></div></div><div className="prayer-list">{prayers.map((prayer) => { const done = progress.completedPrayers.includes(prayer.id); return <article className="prayer-card" key={prayer.id}><span>{prayer.emoji}</span><div><h2>{prayer.title}</h2><p>{prayer.body}</p><button type="button" className={`prayer-button ${done ? "completed" : ""}`} disabled={done} onClick={() => onComplete(prayer.id)}>{done ? "Prayer complete" : "I prayed this"}</button></div></article>; })}</div></div>; }

function GamesView({ progress, started, choice, onStart, onChoice }: { progress: Progress; started: boolean; choice: string | null; onStart: () => void; onChoice: (choice: string) => void }) { const done = progress.completedGames.includes("kindness-match"); return <div className="kids-page"><SectionHeading eyebrow="Play and remember" title="Let’s play!" /><p className="section-intro">Games help us remember God’s good lessons.</p>{!started ? <div className="game-hero"><div className="game-icon">🧩</div><div><span className="game-tag">Mini game · 2 min</span><h2>Match the kind heart</h2><p>Which picture shows loving your neighbor?</p><button className="primary-kids-button" type="button" onClick={onStart}><Play size={17} fill="currentColor" /> Play now</button></div></div> : <div className="game-board"><div className="game-topline"><span>Match the kind heart</span><span><Star size={16} fill="currentColor" /> +1 star</span></div><h2>Which one shows kindness?</h2><div className="game-options"><button type="button" className={choice === "kind" ? "correct" : ""} onClick={() => onChoice("kind")}><span>🤝</span><strong>Helping a friend</strong>{choice === "kind" && <CheckCircle2 size={20} />}</button><button type="button" className={choice === "angry" ? "wrong" : ""} onClick={() => onChoice("angry")}><span>😤</span><strong>Walking away</strong>{choice === "angry" && <span>Try again</span>}</button></div>{choice && <p className={`game-feedback ${choice === "kind" ? "good" : "try"}`}>{choice === "kind" ? "Wonderful! Kindness is love in action." : "Think about what a loving neighbor would do."}</p>}<button type="button" className="reset-game" onClick={onStart}><RotateCcw size={16} /> Play again</button></div>}<div className="coming-card"><LockKeyhole size={20} /><div><strong>More games are coming!</strong><span>Finish lessons to unlock new adventures.</span></div><span className="unlock-count">{done ? "1/3" : "0/3"}</span></div></div>; }

function ReadingView({ progress, onComplete }: { progress: Progress; onComplete: (id: string) => void }) { return <div className="kids-page"><SectionHeading eyebrow="Build your reading muscles" title="Reading stars" /><p className="section-intro">Read a little each day and collect stars as you grow.</p><div className="reading-banner"><Character mood="read" /><div><strong>{progress.completedReading.length} of {readingChallenges.length} complete</strong><p>Every page helps your faith grow.</p></div><div className="reading-trophy">🏆</div></div><div className="reading-list">{readingChallenges.map((challenge) => { const done = progress.completedReading.includes(challenge.id); return <button key={challenge.id} className={`reading-card ${done ? "done" : ""}`} type="button" onClick={() => onComplete(challenge.id)} disabled={done}><span className="reading-emoji">{challenge.emoji}</span><span><strong>{challenge.title}</strong><small>{challenge.detail}</small><em>{challenge.minutes} minutes</em></span><span className="reading-check">{done ? <CheckCircle2 size={23} /> : <Star size={22} />}</span></button>; })}</div></div>; }

function LessonModal({ lesson, choice, isComplete, onChoice, onClose, onComplete }: { lesson: Lesson; choice: number | null; isComplete: boolean; onChoice: (choice: number) => void; onClose: () => void; onComplete: () => void }) { const correct = choice === lesson.correct; return <div className="kids-modal-backdrop" role="presentation" onClick={onClose}><section className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={onClose} aria-label="Close lesson">×</button><div className={`modal-story ${lesson.color}`}><span>{lesson.emoji}</span><p>Story time</p><h2 id="lesson-title">{lesson.title}</h2></div><div className="modal-content"><p>{lesson.story}</p><blockquote>“{lesson.verse}”</blockquote><div className="takeaway"><Sparkles size={18} /><span><strong>Remember:</strong> {lesson.takeaway}</span></div><div className="quiz"><p><strong>Quick question:</strong> {lesson.question}</p><div className="answer-list">{lesson.answers.map((answer, index) => <button key={answer} type="button" className={choice === index ? index === lesson.correct ? "answer correct" : "answer wrong" : "answer"} onClick={() => onChoice(index)}>{answer}{choice === index && (index === lesson.correct ? <Check size={18} /> : <span>↺</span>)}</button>)}</div>{choice !== null && <p className={`quiz-feedback ${correct ? "good" : "try"}`}>{correct ? "You got it! Great remembering." : "Almost! Try another answer."}</p>}</div><button className="primary-kids-button full-button" type="button" disabled={!correct && !isComplete} onClick={onComplete}>{isComplete ? <><Check size={18} /> Lesson complete</> : <>Finish lesson <ArrowRight size={18} /></>}</button></div></section></div>; }

export default KidsApp;
