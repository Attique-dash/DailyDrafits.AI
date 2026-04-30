"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Article } from "@/app/types/article";
import Image from "next/image";
import logo from "../../public/Images/Logo.png";
import {
  Sparkles,
  Trash2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Zap,
  TrendingUp,
  BookOpen,
  AlertCircle,
  Loader2,
  Calendar,
  Hash,
  Send,
  Globe,
  Users,
  Heart,
  Square,
  ChevronUp,
  BarChart3,
  FileText,
  RefreshCw,
} from "lucide-react";

// ─── API helpers ────────────────────────────────────────────────────────────
const fetchArticles = async () => {
  const res = await fetch("/api/articles");
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.articles || [];
};

const createArticle = async (article: any) => {
  const res = await fetch("/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(article),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
};

const deleteArticle = async (id: string) => {
  const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
};

const fetchAnalyticsAPI = async () => {
  const res = await fetch("/api/analytics");
  const data = await res.json();
  return data.analytics || { totalPosts: 0, todayPosts: 0, thisWeekPosts: 0 };
};

const postAnalytics = async (payload: any) => {
  await fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface PendingEntry {
  post: Article;
  timer: number;
  timerId: ReturnType<typeof setInterval>;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Home() {
  const [posts, setPosts] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [stopMessage, setStopMessage] = useState("");
  const [pendingPosts, setPendingPosts] = useState<Map<string, PendingEntry>>(new Map());
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [analytics, setAnalytics] = useState({ totalPosts: 0, todayPosts: 0, thisWeekPosts: 0 });
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // ── Refs (never stale inside callbacks) ──────────────────────────────────
  const isAutoGeneratingRef = useRef(false);
  const autoTopicRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const lastClickTimeRef = useRef(0);
  const generatedTopicsRef = useRef<Record<string, number>>({});
  const cooldownRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep ref in sync with state
  const setAutoGenerating = (val: boolean) => {
    isAutoGeneratingRef.current = val;
    setIsAutoGenerating(val);
  };

  const COOLDOWN_SECONDS = 120;
  const postsPerPage = 6;

  const popularTopics = [
    "Artificial Intelligence", "Climate Change", "Space Exploration",
    "Web Development", "Digital Marketing", "Mental Health",
    "Sustainable Living", "Blockchain", "Renewable Energy",
  ];

  const categories = [
    { id: "all", name: "All Posts", icon: Globe },
    { id: "technology", name: "Technology", icon: Zap },
    { id: "science", name: "Science", icon: TrendingUp },
    { id: "business", name: "Business", icon: Users },
    { id: "health", name: "Health", icon: Heart },
  ];

  // ── Cooldown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((prev) => {
        const next = prev <= 1 ? 0 : prev - 1;
        cooldownRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Fetch on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const articles = await fetchArticles();
        const mapped: Article[] = articles.map((a: any) => ({
          ...a,
          id: a._id || a.id,
        }));
        setPosts(mapped.sort((a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ));
      } catch { /* silent */ }
    })();

    (async () => {
      try {
        const a = await fetchAnalyticsAPI();
        setAnalytics({ totalPosts: a.totalPosts || 0, todayPosts: a.todayPosts || 0, thisWeekPosts: a.thisWeekPosts || 0 });
      } catch { /* silent */ }
    })();
  }, []);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deletePost = async (id: string) => {
    if (!id) return;
    const pending = pendingPosts.get(id);
    if (pending) {
      clearInterval(pending.timerId);
      setPendingPosts((prev) => { const n = new Map(prev); n.delete(id); return n; });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } else {
      try {
        await deleteArticle(id);
        setPosts((prev) => prev.filter((p) => p.id !== id));
      } catch { setError("Failed to delete post"); }
    }
    setShowDeleteConfirm(false);
    setPostToDelete(null);
  };

  // ── Stop ───────────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAutoGenerating(false);
    setIsLoading(false);

    // Clear all pending timers and remove pending posts from UI
    setPendingPosts((prev) => {
      prev.forEach((entry) => {
        clearInterval(entry.timerId);
        setPosts((p) => p.filter((post) => post.id !== entry.post.id));
      });
      return new Map();
    });

    setStopMessage("Generation stopped");
    setTimeout(() => setStopMessage(""), 3000);
  }, []);

  // ── Validate ───────────────────────────────────────────────────────────────
  const validateTopic = async (topic: string): Promise<string | null> => {
    if (!topic) return "Please enter a topic";
    if (topic.length < 3) return "Topic must be at least 3 characters";
    if (topic.length > 50) return "Topic must be less than 50 characters";
    if (!/^[a-zA-Z0-9\s\-.,!?]+$/.test(topic)) return "Topic contains invalid characters";

    try {
      const res = await fetch("/api/validate-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!data.isValid) return data.message || "Please enter a valid topic";
    } catch {
      return null; // accept if validation service fails
    }
    return null;
  };

  // ── Core generate (called recursively for auto-gen) ────────────────────────
  const performGenerate = useCallback(async (topic: string, skipValidation = false) => {
    if (!topic) return;

    // ── Cooldown check (using ref so always fresh) ──
    const now = Date.now();
    const elapsed = now - lastClickTimeRef.current;
    if (elapsed < COOLDOWN_SECONDS * 1000) {
      const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      setError(`Please wait ${formatTime(remaining)} before generating again`);
      setCooldown(remaining);
      cooldownRef.current = remaining;
      setAutoGenerating(false);
      return;
    }

    // ── Duplicate topic check ──
    const topicKey = topic.toLowerCase().trim();
    const lastGen = generatedTopicsRef.current[topicKey];
    if (lastGen && (now - lastGen) < 2 * 60 * 1000) {
      const remaining = Math.ceil((2 * 60 * 1000 - (now - lastGen)) / 1000);
      setError(`Wait ${Math.ceil(remaining / 60)} min before generating the same topic again`);
      setAutoGenerating(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setStopMessage("");

    try {
      if (!skipValidation) {
        const validErr = await validateTopic(topic);
        if (validErr) {
          setError(validErr);
          setIsLoading(false);
          setAutoGenerating(false);
          return;
        }
      }

      abortRef.current = new AbortController();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate content");

      if (data.modelUsed) console.log("Model used:", data.modelUsed);

      const clean = (s: string) => s.replace(/\*\*|\*|`|#/g, "").trim();
      const newPost: Article = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: clean(data.title),
        description: clean(data.description),
        createdAt: new Date().toISOString(),
        topic,
        url: "",
        urlToImage: "",
        tags: [],
        publishedAt: new Date().toISOString(),
      };

      setPosts((prev) => [newPost, ...prev]);
      setIsLoading(false);

      // Track this topic as generated right away (prevents duplicate re-generation)
      generatedTopicsRef.current[topicKey] = Date.now();

      // ── 2-minute save timer ────────────────────────────────────────────────
      const postId = newPost.id;
      let remaining = 120;

      const timerId = setInterval(async () => {
        remaining--;

        // Update the visual countdown in the map
        setPendingPosts((prev) => {
          if (!prev.has(postId)) return prev;
          const n = new Map(prev);
          n.set(postId, { ...n.get(postId)!, timer: remaining });
          return n;
        });

        if (remaining > 0) return;

        // ── Timer elapsed → save ──
        clearInterval(timerId);

        try {
          await createArticle(newPost);
          console.log("Saved to MongoDB:", postId);

          // Remove from pending
          setPendingPosts((prev) => {
            const n = new Map(prev);
            n.delete(postId);
            return n;
          });

          // Update analytics
          const freshAnalytics = await fetchAnalyticsAPI();
          const now2 = new Date();
          const today = now2.toDateString();
          const lastUpdated = freshAnalytics.lastUpdated
            ? new Date(freshAnalytics.lastUpdated).toDateString()
            : null;
          const weekAgo = new Date(now2.getTime() - 7 * 24 * 60 * 60 * 1000);
          const isThisWeek = freshAnalytics.lastUpdated
            ? new Date(freshAnalytics.lastUpdated) > weekAgo
            : false;

          const updated = {
            totalPosts: (freshAnalytics.totalPosts || 0) + 1,
            todayPosts: lastUpdated === today ? (freshAnalytics.todayPosts || 0) + 1 : 1,
            thisWeekPosts: isThisWeek ? (freshAnalytics.thisWeekPosts || 0) + 1 : 1,
            generatedTopics: {
              ...(freshAnalytics.generatedTopics || {}),
              [topic]: now2.toISOString(),
            },
          };
          await postAnalytics(updated);
          setAnalytics({ totalPosts: updated.totalPosts, todayPosts: updated.todayPosts, thisWeekPosts: updated.thisWeekPosts });

          // Update cooldown (use ref so future calls see it immediately)
          lastClickTimeRef.current = Date.now();
          setCooldown(COOLDOWN_SECONDS);
          cooldownRef.current = COOLDOWN_SECONDS;

          // ── Auto-generate next post (use ref — never stale) ──
          if (isAutoGeneratingRef.current && autoTopicRef.current) {
            console.log("Auto-generating next for:", autoTopicRef.current);
            setTimeout(() => {
              performGenerate(autoTopicRef.current, true);
            }, 1500);
          }
        } catch (err) {
          console.error("Failed to save:", err);
          setError("Failed to save post. Stopped auto-generation.");
          setAutoGenerating(false);
          setPendingPosts((prev) => {
            const n = new Map(prev);
            n.delete(postId);
            return n;
          });
        }
      }, 1000);

      // Register pending entry
      setPendingPosts((prev) => {
        const n = new Map(prev);
        n.set(postId, { post: newPost, timer: remaining, timerId });
        return n;
      });

    } catch (err: any) {
      if (err.name === "AbortError") {
        // handled by handleStop
      } else {
        setError(err.message || "An error occurred");
        setAutoGenerating(false);
      }
      setIsLoading(false);
      abortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public generate trigger ────────────────────────────────────────────────
  const handleGenerate = () => {
    if (!currentTopic.trim()) { setError("Please enter a topic"); return; }
    setAutoGenerating(true);
    autoTopicRef.current = currentTopic.trim();
    performGenerate(currentTopic.trim(), false);
  };

  // ── Filtering & pagination ─────────────────────────────────────────────────
  const filteredPosts = posts.filter((p) => {
    const s = searchTerm.toLowerCase();
    const matchSearch = !s || p.title.toLowerCase().includes(s) || p.description.toLowerCase().includes(s);
    const t = (p.topic || "").toLowerCase();
    const matchCat =
      selectedCategory === "all" ||
      (selectedCategory === "technology" && /ai|tech|programming|web|digital/.test(t)) ||
      (selectedCategory === "science" && /science|space|climate|biology/.test(t)) ||
      (selectedCategory === "business" && /business|market|finance|economy/.test(t)) ||
      (selectedCategory === "health" && /health|mental|wellness|fitness/.test(t));
    return matchSearch && matchCat;
  });

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const currentPosts = filteredPosts.slice(
    (currentPage - 1) * postsPerPage,
    currentPage * postsPerPage
  );

  const toggleExpand = (id: string) =>
    setExpandedPosts((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // ── How many pending posts are still counting down ─────────────────────────
  const activePendingCount = pendingPosts.size;
  const lowestTimer = activePendingCount > 0
    ? Math.min(...Array.from(pendingPosts.values()).map((p) => p.timer))
    : 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans" style={{ fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif" }}>

      {/* ── Background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
      </div>

      {/* ── Delete Modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#13131a] border border-white/10 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-red-500/15">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold">Delete Post</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">Are you sure you want to delete this post? This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowDeleteConfirm(false); setPostToDelete(null); }}
                className="px-4 py-2 text-sm rounded-lg bg-white/8 hover:bg-white/12 transition-colors">
                Cancel
              </button>
              <button onClick={() => postToDelete && deletePost(postToDelete)}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 transition-colors font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-9 h-9">
              <Image src={logo} alt="Logo" fill className="object-contain brightness-0 invert" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                Daily Drafts AI
              </span>
              <div className="text-[10px] text-gray-500 tracking-widest uppercase">Content Generator</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAutoGenerating && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Auto-generating
              </div>
            )}
            <button onClick={() => setShowStats(!showStats)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${showStats ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-white/5 hover:bg-white/10 text-gray-400 border border-white/8"}`}>
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats Panel ── */}
      {showStats && (
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-4">
          <div className="grid grid-cols-3 gap-4 bg-[#13131a] border border-white/8 rounded-2xl p-6">
            {[
              { label: "Total Posts", value: analytics.totalPosts, color: "text-indigo-400" },
              { label: "Today", value: analytics.todayPosts, color: "text-emerald-400" },
              { label: "This Week", value: analytics.thisWeekPosts, color: "text-pink-400" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-4xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero / Input ── */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Content Generation
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-5 leading-[1.05]">
          <span className="text-white">Create </span>
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Brilliant
          </span>
          <br />
          <span className="text-white">Content Instantly</span>
        </h1>

        <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
          Enter any topic and let our AI craft unique, engaging articles — automatically, on repeat.
        </p>

        {/* Cooldown badge */}
        {cooldown > 0 && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm mb-6">
            <Clock className="w-4 h-4" />
            Cooldown: <span className="font-mono font-bold">{formatTime(cooldown)}</span>
          </div>
        )}

        {/* Pending save status bar */}
        {activePendingCount > 0 && (
          <div className="flex items-center justify-center gap-4 mb-6 flex-wrap">
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>
                {activePendingCount} post{activePendingCount > 1 ? "s" : ""} saving in{" "}
                <span className="font-mono font-bold">{formatTime(lowestTimer)}</span>
              </span>
            </div>
            <button onClick={handleStop}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm transition-all">
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          </div>
        )}

        {/* Input bar */}
        <div className="relative flex flex-col sm:flex-row gap-2 bg-[#13131a] border border-white/10 rounded-2xl p-2 mb-4 focus-within:border-indigo-500/50 transition-colors shadow-xl shadow-black/40">
          <input
            ref={inputRef}
            type="text"
            value={currentTopic}
            onChange={(e) => setCurrentTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && !cooldown && handleGenerate()}
            placeholder="e.g. Future of Artificial Intelligence"
            disabled={isLoading || activePendingCount > 0}
            className="flex-1 px-5 py-3.5 bg-transparent text-white placeholder-gray-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed text-base"
          />
          <button
            onClick={handleGenerate}
            disabled={!currentTopic.trim() || isLoading || cooldown > 0 || activePendingCount > 0}
            className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 font-semibold text-sm transition-all disabled:opacity-40 disabled:hover:from-indigo-500 disabled:cursor-not-allowed whitespace-nowrap shadow-lg shadow-indigo-500/20"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : activePendingCount > 0 ? (
              <><Clock className="w-4 h-4" /> Saving…</>
            ) : (
              <><Send className="w-4 h-4" /> Generate</>
            )}
          </button>
        </div>

        {/* Errors / messages */}
        {error && (
          <div className="flex items-center justify-center gap-2 text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-4 py-2.5 mb-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {stopMessage && (
          <div className="flex items-center justify-center gap-2 text-amber-400 bg-amber-400/8 border border-amber-400/20 rounded-xl px-4 py-2.5 mb-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {stopMessage}
          </div>
        )}

        {/* Popular topics */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <span className="text-gray-600 text-xs self-center">Try:</span>
          {popularTopics.map((t) => (
            <button key={t}
              onClick={() => { setCurrentTopic(t); if (inputRef.current) inputRef.current.value = t; }}
              className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/8 text-gray-400 hover:text-white text-xs transition-all">
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex flex-wrap gap-2">
            {categories.map(({ id, name, icon: Icon }) => (
              <button key={id}
                onClick={() => { setSelectedCategory(id); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${selectedCategory === id
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/8"}`}>
                <Icon className="w-3.5 h-3.5" />
                {name}
              </button>
            ))}
          </div>

          <div className="relative">
            <input type="text" placeholder="Search posts…" value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-56 pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/8 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Posts Grid ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        {isLoading && pendingPosts.size === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-gray-400 text-sm">Crafting your content…</p>
            <button onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm transition-all">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        )}

        {!isLoading && currentPosts.length === 0 && pendingPosts.size === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
              <FileText className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold text-white">No posts yet</h3>
            <p className="text-sm text-gray-500 text-center max-w-xs">
              {searchTerm || selectedCategory !== "all"
                ? "Try adjusting your filters or search"
                : "Enter a topic above to generate your first article"}
            </p>
          </div>
        )}

        {currentPosts.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentPosts.map((post, idx) => {
                const isPending = pendingPosts.has(post.id);
                const pendingTimer = pendingPosts.get(post.id)?.timer ?? 0;
                const isExpanded = expandedPosts.has(post.id);
                const isLong = post.description.length > 150;

                return (
                  <article
                    key={post.id}
                    className="group relative flex flex-col bg-[#13131a] border border-white/8 rounded-2xl overflow-hidden hover:border-white/15 transition-all duration-300 hover:shadow-xl hover:shadow-black/40"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    {/* Pending save indicator */}
                    {isPending && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500">
                        <div className="h-full bg-white/30 animate-pulse" />
                      </div>
                    )}

                    <div className="flex flex-col flex-1 p-5">
                      {/* Meta row */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            {new Date(post.createdAt ?? "").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                          {post.topic && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium max-w-[120px]">
                              <Hash className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{post.topic}</span>
                            </div>
                          )}
                        </div>

                        {/* Pending timer OR delete button */}
                        {isPending ? (
                          <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            <span className="font-mono">{formatTime(pendingTimer)}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setPostToDelete(post.id); setShowDeleteConfirm(true); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-semibold text-white mb-3 leading-snug group-hover:text-indigo-200 transition-colors">
                        {post.title}
                      </h2>

                      {/* Description */}
                      <div className="flex-1 relative">
                        <p className={`text-sm text-gray-400 leading-relaxed transition-all ${isExpanded ? "overflow-y-auto max-h-48 pr-1" : "line-clamp-4"}`}>
                          {post.description}
                        </p>
                        {!isExpanded && isLong && (
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#13131a] to-transparent pointer-events-none" />
                        )}
                      </div>

                      {/* Read more */}
                      {isLong && (
                        <button onClick={() => toggleExpand(post.id)}
                          className="mt-3 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors pt-3 border-t border-white/5">
                          {isExpanded
                            ? <><ChevronUp className="w-3 h-3" /> Show less</>
                            : <><ChevronRight className="w-3 h-3" /> Read more</>}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-10">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/8">
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pg = i + 1;
                  if (totalPages > 5) {
                    if (currentPage <= 3) pg = i + 1;
                    else if (currentPage >= totalPages - 2) pg = totalPages - 4 + i;
                    else pg = currentPage - 2 + i;
                  }
                  return (
                    <button key={pg} onClick={() => setCurrentPage(pg)}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${currentPage === pg
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/8"}`}>
                      {pg}
                    </button>
                  );
                })}

                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/8">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-gray-600">© 2026 Daily Drafts AI. All rights reserved.</span>
          <div className="flex gap-5 text-xs text-gray-600">
            {["About", "Privacy", "Terms"].map((l) => (
              <a key={l} href="#" className="hover:text-gray-300 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}