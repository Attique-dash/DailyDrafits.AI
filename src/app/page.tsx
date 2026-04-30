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
  ChevronDown,
  BarChart3,
  FileText,
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────
const apiFetchArticles = async (): Promise<Article[]> => {
  const res = await fetch("/api/articles");
  if (!res.ok) throw new Error("Failed to fetch articles");
  const data = await res.json();
  return (data.articles || []).map((a: any) => ({ ...a, id: a._id || a.id }));
};

const apiCreateArticle = async (article: Omit<Article, "id">) => {
  const res = await fetch("/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(article),
  });
  if (!res.ok) throw new Error("Failed to create article");
  return res.json();
};

const apiDeleteArticle = async (id: string) => {
  const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete article");
  return res.json();
};

const apiGetAnalytics = async () => {
  const res = await fetch("/api/analytics");
  const data = await res.json();
  return data.analytics || {
    totalPosts: 0,
    todayPosts: 0,
    thisWeekPosts: 0,
    lastUpdated: null,
  };
};

const apiPostAnalytics = async (payload: Record<string, unknown>) => {
  await fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

const apiValidateTopic = async (
  topic: string
): Promise<{ isValid: boolean; message?: string }> => {
  const res = await fetch("/api/validate-topic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  return res.json();
};

const apiGenerate = async (
  topic: string,
  signal: AbortSignal
): Promise<{ title: string; description: string; modelUsed?: string }> => {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate content");
  return data;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const cleanText = (s: string) => s.replace(/\*\*|\*|`|#+/g, "").trim();

const COOLDOWN_SEC = 120;   // 2 min between generations
const SAVE_DELAY_SEC = 120; // 2 min before persisting to MongoDB
const POSTS_PER_PAGE = 6;

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  // UI state
  const [posts, setPosts] = useState<Article[]>([]);
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveCountdown, setSaveCountdown] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [analytics, setAnalytics] = useState({
    totalPosts: 0,
    todayPosts: 0,
    thisWeekPosts: 0,
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingPostId, setPendingPostId] = useState<string | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // Refs — always fresh inside async callbacks / intervals
  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPostIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoTopicRef = useRef<string>("");
  const isAutoRef = useRef(false);

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetchArticles()
      .then((articles) =>
        setPosts(
          articles.sort(
            (a, b) =>
              new Date(b.createdAt || 0).getTime() -
              new Date(a.createdAt || 0).getTime()
          )
        )
      )
      .catch(() => {});

    apiGetAnalytics()
      .then((a) =>
        setAnalytics({
          totalPosts: a.totalPosts || 0,
          todayPosts: a.todayPosts || 0,
          thisWeekPosts: a.thisWeekPosts || 0,
        })
      )
      .catch(() => {});

    // Restore cooldown timer from localStorage on page load
    const storedCooldownEnd = localStorage.getItem("cooldownEnd");
    if (storedCooldownEnd) {
      const endTime = parseInt(storedCooldownEnd, 10);
      const now = Date.now();
      const remainingSeconds = Math.ceil((endTime - now) / 1000);

      if (remainingSeconds > 0) {
        startCooldown(remainingSeconds);
      } else {
        localStorage.removeItem("cooldownEnd");
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  // ── Cooldown ticker ──────────────────────────────────────────────────────────
  // Using a ref-based timer so it never goes stale
  const startCooldown = useCallback((seconds: number) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);

    // Store cooldown end time in localStorage
    const endTime = Date.now() + seconds * 1000;
    localStorage.setItem("cooldownEnd", endTime.toString());

    let remaining = seconds;
    setCooldown(remaining);
    cooldownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCooldown(remaining);
      if (remaining <= 0) {
        clearInterval(cooldownTimerRef.current!);
        cooldownTimerRef.current = null;
        localStorage.removeItem("cooldownEnd");
      }
    }, 1000);
  }, []);

  // ── Save-delay ticker ────────────────────────────────────────────────────────
  const startSaveTimer = useCallback(
    (post: Article) => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);

      pendingPostIdRef.current = post.id;
      setPendingPostId(post.id);
      setIsSaving(true);
      setSaveCountdown(SAVE_DELAY_SEC);

      let remaining = SAVE_DELAY_SEC;

      saveTimerRef.current = setInterval(async () => {
        remaining -= 1;
        setSaveCountdown(remaining);

        if (remaining > 0) return;

        // Timer done → save to MongoDB
        clearInterval(saveTimerRef.current!);
        saveTimerRef.current = null;

        const savedPost = post; // captured in closure — always fresh
        pendingPostIdRef.current = null;
        setPendingPostId(null);
        setIsSaving(false);
        setSaveCountdown(0);

        try {
          await apiCreateArticle(savedPost);

          // Fresh analytics from DB, then increment
          const fresh = await apiGetAnalytics();
          const now = new Date();
          const today = now.toDateString();
          const isToday = fresh.lastUpdated
            ? new Date(fresh.lastUpdated).toDateString() === today
            : false;
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const isThisWeek = fresh.lastUpdated
            ? new Date(fresh.lastUpdated) > weekAgo
            : false;

          const updated = {
            totalPosts: (fresh.totalPosts || 0) + 1,
            todayPosts: isToday ? (fresh.todayPosts || 0) + 1 : 1,
            thisWeekPosts: isThisWeek ? (fresh.thisWeekPosts || 0) + 1 : 1,
            generatedTopics: {
              ...(fresh.generatedTopics || {}),
              [savedPost.topic || ""]: now.toISOString(),
            },
          };

          await apiPostAnalytics(updated);
          setAnalytics({
            totalPosts: updated.totalPosts,
            todayPosts: updated.todayPosts,
            thisWeekPosts: updated.thisWeekPosts,
          });

          setStatusMsg("Article ready!");
          setTimeout(() => setStatusMsg(null), 3000);

          // Start cooldown AFTER successful save
          startCooldown(COOLDOWN_SEC);

          // If auto-generating, trigger next generation after cooldown starts
          if (isAutoRef.current && autoTopicRef.current) {
            setTimeout(() => {
              if (isAutoRef.current) {
                console.log("Auto-generating next article for topic:", autoTopicRef.current);
                performGenerate(autoTopicRef.current, true);
              }
            }, 1000);
          }
        } catch {
          setError("Failed to create article.");
          setIsAutoGenerating(false);
          isAutoRef.current = false;
          setPosts((prev) => prev.filter((p) => p.id !== savedPost.id));
        }
      }, 1000);
    },
    [startCooldown]
  );

  // ── Stop / cancel ────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    // Stop auto-generation
    setIsAutoGenerating(false);
    isAutoRef.current = false;
    autoTopicRef.current = "";

    abortRef.current?.abort();
    abortRef.current = null;

    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    // Remove pending (unsaved) post from UI
    if (pendingPostIdRef.current) {
      const id = pendingPostIdRef.current;
      setPosts((prev) => prev.filter((p) => p.id !== id));
      pendingPostIdRef.current = null;
      setPendingPostId(null);
    }

    setIsLoading(false);
    setIsSaving(false);
    setSaveCountdown(0);
    setError(null);
    setStatusMsg("Generation stopped.");
    setTimeout(() => setStatusMsg(null), 3000);
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      setDeleteTarget(null);

      // If it's the pending post, cancel the save instead of DB delete
      if (pendingPostIdRef.current === id) {
        handleStop();
        return;
      }

      try {
        await apiDeleteArticle(id);
        setPosts((prev) => prev.filter((p) => p.id !== id));
      } catch {
        setError("Failed to delete article.");
      }
    },
    [handleStop]
  );

  // ── Generate ─────────────────────────────────────────────────────────────────
  // Separate performGenerate for auto-generation (can skip validation)
  const performGenerate = useCallback(async (generateTopic: string, skipValidation = false) => {
    if (!generateTopic) return;
    if (isLoading || isSaving) return;
    if (cooldown > 0) {
      setError(`Please wait ${formatTime(cooldown)} before generating again.`);
      // Stop auto-generation on cooldown
      if (isAutoRef.current) {
        setIsAutoGenerating(false);
        isAutoRef.current = false;
        setStatusMsg("Stopped - Cooldown active");
        setTimeout(() => setStatusMsg(null), 3000);
      }
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Validate only on first manual generation
      if (!skipValidation) {
        let valid: { isValid: boolean; message?: string };
        try {
          valid = await apiValidateTopic(generateTopic);
        } catch {
          valid = { isValid: true };
        }

        if (!valid.isValid) {
          setError(valid.message || "Please enter a valid topic.");
          setIsLoading(false);
          setIsAutoGenerating(false);
          isAutoRef.current = false;
          return;
        }
      }

      // Generate
      abortRef.current = new AbortController();
      const data = await apiGenerate(generateTopic, abortRef.current.signal);

      if (data.modelUsed) console.log("Model used:", data.modelUsed);

      const newPost: Article = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: cleanText(data.title),
        description: cleanText(data.description),
        topic: generateTopic,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        url: "",
        urlToImage: "",
        tags: [],
      };

      // Add to UI immediately (optimistic)
      setPosts((prev) => [newPost, ...prev]);
      setIsLoading(false);
      abortRef.current = null;

      // Start 2-min save timer
      startSaveTimer(newPost);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // silently handled by handleStop
      } else {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        // Stop auto-generation on error
        setIsAutoGenerating(false);
        isAutoRef.current = false;
      }
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, isSaving, cooldown, startSaveTimer]);

  // Main handleGenerate - starts auto-generation mode
  const handleGenerate = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      setError("Please enter a topic.");
      return;
    }

    // Enable auto-generation mode
    setIsAutoGenerating(true);
    isAutoRef.current = true;
    autoTopicRef.current = trimmed;
    setStatusMsg("Auto-generation started. Click Stop to cancel.");
    setTimeout(() => setStatusMsg(null), 3000);

    // Perform first generation (with validation)
    await performGenerate(trimmed, false);
  }, [topic, performGenerate]);

  // ── Filtering + pagination ───────────────────────────────────────────────────
  const filteredPosts = posts.filter((p) => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      !s ||
      p.title.toLowerCase().includes(s) ||
      p.description.toLowerCase().includes(s);
    const t = (p.topic || "").toLowerCase();
    const matchCat =
      selectedCategory === "all" ||
      (selectedCategory === "technology" &&
        /ai|tech|programming|web|digital|software|code/.test(t)) ||
      (selectedCategory === "science" &&
        /science|space|climate|biology|physics/.test(t)) ||
      (selectedCategory === "business" &&
        /business|market|finance|economy|startup/.test(t)) ||
      (selectedCategory === "health" &&
        /health|mental|wellness|fitness|medicine/.test(t));
    return matchSearch && matchCat;
  });

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const currentPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  const toggleExpand = (id: string) =>
    setExpandedPosts((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const categories = [
    { id: "all", name: "All", icon: Globe },
    { id: "technology", name: "Technology", icon: Zap },
    { id: "science", name: "Science", icon: TrendingUp },
    { id: "business", name: "Business", icon: Users },
    { id: "health", name: "Health", icon: Heart },
  ];

  const popularTopics = [
    "Artificial Intelligence",
    "Climate Change",
    "Space Exploration",
    "Web Development",
    "Digital Marketing",
    "Mental Health",
    "Blockchain",
    "Renewable Energy",
  ];

  const isBlocked = isLoading || isSaving || cooldown > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen text-slate-800"
      style={{
        background: "linear-gradient(180deg, #fafbfc 0%, #f0f4f8 100%)",
        fontFamily:
          "'Sora', 'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* ── Ambient background ── */}
      <div
        className="fixed inset-0 pointer-events-none select-none overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -top-40 left-0 w-[800px] h-[800px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(14,165,233,0.06) 0%, transparent 60%)",
          }}
        />
      </div>

      {/* ── Delete modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div
            className="w-full max-w-sm mx-4 rounded-2xl p-7 shadow-2xl"
            style={{
              background: "white",
              border: "1px solid rgba(226, 232, 240, 0.8)",
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="p-2 rounded-xl"
                style={{ background: "rgba(239,68,68,0.1)" }}
              >
                <Trash2 className="w-5 h-5 text-red-500" />
              </span>
              <h3 className="text-base font-semibold text-slate-800">
                Delete Article
              </h3>
            </div>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: "#64748b" }}
            >
              This will permanently remove the article. This action cannot be
              undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded-xl transition-colors hover:bg-slate-100"
                style={{
                  background: "rgba(241, 245, 249, 0.8)",
                  color: "#475569",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 text-sm rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header
        className="relative z-10 sticky top-0"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(226, 232, 240, 0.6)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex-shrink-0">
              <Image
                src={logo}
                alt="Daily Drafts AI"
                fill
                className="object-contain opacity-90"
              />
            </div>
            <div>
              <div
                className="text-[15px] font-bold tracking-tight"
                style={{
                  background:
                    "linear-gradient(120deg, #6366f1 0%, #0ea5e9 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Daily Drafts AI
              </div>
              <div
                className="text-[9px] tracking-widest uppercase mt-[-1px]"
                style={{ color: "#94a3b8" }}
              >
                Content Generator
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSaving && (
              <div
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  color: "#6366f1",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "#6366f1" }}
                />
                Next Article in {formatTime(saveCountdown)}
              </div>
            )}
            <button
              onClick={() => setShowStats((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-slate-100"
              style={{
                background: showStats
                  ? "rgba(99,102,241,0.1)"
                  : "rgba(241, 245, 249, 0.8)",
                border: showStats
                  ? "1px solid rgba(99,102,241,0.25)"
                  : "1px solid rgba(226, 232, 240, 0.8)",
                color: showStats ? "#6366f1" : "#64748b",
              }}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Analytics panel ── */}
      {showStats && (
        <div className="relative z-10 max-w-6xl mx-auto px-5 pt-4">
          <div
            className="grid grid-cols-3 gap-4 rounded-2xl p-6"
            style={{
              background: "white",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            {[
              {
                label: "Total Generated",
                value: analytics.totalPosts,
                color: "#818cf8",
              },
              {
                label: "Today",
                value: analytics.todayPosts,
                color: "#34d399",
              },
              {
                label: "This Week",
                value: analytics.thisWeekPosts,
                color: "#38bdf8",
              },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div
                  className="text-3xl sm:text-4xl font-bold"
                  style={{ color: s.color }}
                >
                  {s.value}
                </div>
                <div
                  className="text-[10px] mt-1.5 uppercase tracking-wider"
                  style={{ color: "#94a3b8" }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero / input section ── */}
      <div className="relative z-10 max-w-3xl mx-auto px-5 pt-14 pb-10 text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium mb-7"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
            color: "#a5b4fc",
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Content Generation
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-[56px] font-extrabold tracking-tight leading-[1.06] mb-5">
          <span style={{ color: "#1e293b" }}>Generate </span>
          <span
            style={{
              background:
                "linear-gradient(120deg, #6366f1 0%, #0ea5e9 55%, #10b981 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Brilliant
          </span>
          <br />
          <span style={{ color: "#1e293b" }}>Articles Instantly</span>
        </h1>

        <p
          className="text-base sm:text-lg mb-10 leading-relaxed max-w-lg mx-auto"
          style={{ color: "#64748b" }}
        >
          Type a topic, press Generate. Your article appears immediately.
        </p>

        {/* ── Status banners ── */}

        {/* Cooldown */}
        {cooldown > 0 && (
          <div
            className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-medium mb-5"
            style={{
              background: "rgba(245,158,11,0.05)",
              border: "1px solid rgba(245,158,11,0.2)",
              color: "#f59e0b",
            }}
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
            Next article in{" "}
            <span className="font-mono font-bold text-base">
              {formatTime(cooldown)}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm mb-4"
            style={{
              background: "rgba(239,68,68,0.05)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444",
            }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success */}
        {statusMsg && !error && (
          <div
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm mb-4"
            style={{
              background: "rgba(16,185,129,0.05)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#10b981",
            }}
          >
            <span>{statusMsg}</span>
          </div>
        )}


        {/* ── Input bar ── */}
        <div
          className="flex flex-col sm:flex-row gap-2 p-2 rounded-2xl mb-5"
          style={{
            background: "white",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && topic.trim() && handleGenerate()
            }
            placeholder="e.g. The Future of Artificial Intelligence"
            className="flex-1 px-5 py-3.5 bg-transparent focus:outline-none text-sm sm:text-base placeholder:text-slate-400"
            style={{
              color: "#1e293b",
            }}
          />
          <button
            onClick={() => {
              if (!topic.trim()) {
                setError("Please enter a topic.");
                inputRef.current?.focus();
                return;
              }
              handleGenerate();
            }}
            disabled={!topic.trim() || isBlocked}
            className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: isLoading || isSaving
                ? "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)"
                : cooldown > 0
                ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
                : topic.trim()
                ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                : "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
              color: "white",
              boxShadow: isLoading || isSaving || cooldown > 0 || !topic.trim()
                ? "none"
                : "0 2px 20px rgba(99,102,241,0.25)",
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating…
              </>
            ) : isSaving ? (
              <>
                <Clock className="w-4 h-4" /> Next Article…
              </>
            ) : cooldown > 0 ? (
              <>
                <Clock className="w-4 h-4" /> {formatTime(cooldown)}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Generate
              </>
            )}
          </button>
        </div>

        {/* Popular topic chips */}
        <div className="flex flex-wrap justify-center gap-1.5">
          <span
            className="text-xs self-center mr-1"
            style={{ color: "#94a3b8" }}
          >
            Try:
          </span>
          {popularTopics.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTopic(t);
                setError(null);
                // Focus the input field after setting topic
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="px-3 py-1 rounded-full text-xs transition-all cursor-pointer"
              style={{
                background: "rgba(241,245,249,0.5)",
                border: "1px solid rgba(226,232,240,0.8)",
                color: "#64748b",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = "#475569";
                el.style.background = "rgba(99,102,241,0.08)";
                el.style.borderColor = "rgba(99,102,241,0.2)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = "#64748b";
                el.style.background = "rgba(241,245,249,0.5)";
                el.style.borderColor = "rgba(226,232,240,0.8)";
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters row ── */}
      <div className="relative z-10 max-w-6xl mx-auto px-5 pb-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div className="flex flex-wrap gap-2">
            {categories.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setSelectedCategory(id);
                  setCurrentPage(1);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all hover:bg-slate-100"
                style={{
                  background:
                    selectedCategory === id
                      ? "rgba(99,102,241,0.1)"
                      : "rgba(241,245,249,0.5)",
                  border:
                    selectedCategory === id
                      ? "1px solid rgba(99,102,241,0.25)"
                      : "1px solid rgba(226,232,240,0.8)",
                  color: selectedCategory === id ? "#6366f1" : "#64748b",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {name}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search articles…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-52 pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none transition-all"
              style={{
                background: "white",
                border: "1px solid rgba(226,232,240,0.8)",
                color: "#1e293b",
              }}
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "#475569" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Articles grid ── */}
      <main className="relative z-10 max-w-6xl mx-auto px-5 pb-24">

        {/* Empty state */}
        {!isLoading && currentPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "white",
                border: "1px solid rgba(226,232,240,0.8)",
              }}
            >
              <FileText className="w-7 h-7" style={{ color: "#94a3b8" }} />
            </div>
            <h3 className="text-lg font-semibold" style={{ color: "#1e293b" }}>
              No articles yet
            </h3>
            <p
              className="text-sm text-center max-w-xs leading-relaxed"
              style={{ color: "#64748b" }}
            >
              {searchTerm || selectedCategory !== "all"
                ? "Try adjusting your filters or clearing the search."
                : "Enter a topic above and click Generate to create your first article."}
            </p>
          </div>
        )}

        {/* Posts grid */}
        {currentPosts.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentPosts.map((post, idx) => {
                const isPending = post.id === pendingPostId;
                const isExpanded = expandedPosts.has(post.id);
                const isLong = post.description.length > 180;

                return (
                  <article
                    key={post.id}
                    className="group flex flex-col relative rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg"
                    style={{
                      background: "white",
                      border: isPending
                        ? "1px solid rgba(99,102,241,0.4)"
                        : "1px solid rgba(226,232,240,0.8)",
                      boxShadow: isPending
                        ? "0 0 0 1px rgba(99,102,241,0.1), 0 4px 20px rgba(99,102,241,0.15)"
                        : "0 2px 12px rgba(0,0,0,0.06)",
                    }}
                  >
                    {/* Pending gradient top bar */}
                    {isPending && (
                      <div
                        className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{
                          background:
                            "linear-gradient(90deg, #6366f1, #38bdf8, #34d399)",
                        }}
                      />
                    )}

                    <div className="flex flex-col flex-1 p-5">
                      {/* Meta row */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                          <span
                            className="flex items-center gap-1.5 text-xs flex-shrink-0"
                            style={{ color: "#94a3b8" }}
                          >
                            <Calendar className="w-3 h-3" />
                            {new Date(post.createdAt ?? "").toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                          {post.topic && (
                            <span
                              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium max-w-[140px]"
                              style={{
                                background: "rgba(99,102,241,0.1)",
                                color: "#6366f1",
                              }}
                            >
                              <Hash className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{post.topic}</span>
                            </span>
                          )}
                        </div>

                        {/* Action button */}
                        {isPending ? (
                          <button
                            onClick={handleStop}
                            title="Cancel save"
                            className="flex-shrink-0 p-1.5 rounded-lg transition-all hover:bg-red-100"
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              color: "#ef4444",
                            }}
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget(post.id)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all hover:bg-red-100"
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              color: "#ef4444",
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Title */}
                      <h2
                        className="text-[15px] font-semibold leading-snug mb-3"
                        style={{ color: "#1e293b" }}
                      >
                        {post.title}
                      </h2>

                      {/* Description */}
                      <div className="flex-1 relative">
                        <p
                          className={`text-sm leading-relaxed ${
                            isExpanded
                              ? "overflow-y-auto max-h-52"
                              : "line-clamp-4"
                          }`}
                          style={{ color: "#94a3b8" }}
                        >
                          {post.description}
                        </p>
                        {!isExpanded && isLong && (
                          <div
                            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                            style={{
                              background:
                                "linear-gradient(to top, white 0%, transparent 100%)",
                            }}
                          />
                        )}
                      </div>

                      {/* Read more / less */}
                      {isLong && (
                        <button
                          onClick={() => toggleExpand(post.id)}
                          className="mt-3 flex items-center gap-1 text-xs font-medium pt-3 transition-colors hover:text-indigo-600"
                          style={{
                            color: "#6366f1",
                            borderTop: "1px solid rgba(226,232,240,0.6)",
                          }}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" /> Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" /> Read more
                            </>
                          )}
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
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100"
                  style={{
                    background: "white",
                    border: "1px solid rgba(226,232,240,0.8)",
                  }}
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: "#64748b" }} />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pg = i + 1;
                  if (totalPages > 5) {
                    if (currentPage <= 3) pg = i + 1;
                    else if (currentPage >= totalPages - 2)
                      pg = totalPages - 4 + i;
                    else pg = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pg}
                      onClick={() => setCurrentPage(pg)}
                      className="w-9 h-9 rounded-xl text-sm font-medium transition-all hover:bg-slate-100"
                      style={{
                        background:
                          currentPage === pg
                            ? "rgba(99,102,241,0.1)"
                            : "white",
                        border:
                          currentPage === pg
                            ? "1px solid rgba(99,102,241,0.3)"
                            : "1px solid rgba(226,232,240,0.8)",
                        color: currentPage === pg ? "#6366f1" : "#64748b",
                      }}
                    >
                      {pg}
                    </button>
                  );
                })}

                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100"
                  style={{
                    background: "white",
                    border: "1px solid rgba(226,232,240,0.8)",
                  }}
                >
                  <ChevronRight className="w-4 h-4" style={{ color: "#64748b" }} />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        className="relative z-10"
        style={{
          borderTop: "1px solid rgba(226,232,240,0.8)",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs" style={{ color: "#94a3b8" }}>
            © 2026 Daily Drafts AI. All rights reserved.
          </span>
          <div className="flex gap-6">
            {["About", "Privacy", "Terms"].map((l) => (
              <a
                key={l}
                href="#"
                className="text-xs transition-colors hover:text-indigo-500"
                style={{ color: "#64748b" }}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}