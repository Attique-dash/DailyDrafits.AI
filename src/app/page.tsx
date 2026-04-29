"use client";
import { useEffect, useState, useRef } from "react";
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
  XCircle,
  Loader2,
  Calendar,
  Hash,
  Send,
  Globe,
  Users,
  Heart,
  Square,
  ChevronUp
} from "lucide-react";

// MongoDB API helpers
const fetchArticles = async () => {
  const res = await fetch('/api/articles');
  if (!res.ok) throw new Error('Failed to fetch');
  const data = await res.json();
  return data.articles || [];
};

const createArticle = async (article: any) => {
  const res = await fetch('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article),
  });
  if (!res.ok) throw new Error('Failed to create');
  return res.json();
};

const deleteArticle = async (id: string) => {
  const res = await fetch(`/api/articles/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete');
  return res.json();
};

// Analytics helpers
const updateAnalytics = async (topic: string) => {
  try {
    const now = new Date();
    const today = now.toDateString();
    
    // Get current analytics
    const res = await fetch('/api/analytics');
    const data = await res.json();
    const analytics = data.analytics || { totalPosts: 0, todayPosts: 0, thisWeekPosts: 0, generatedTopics: {} };
    
    // Check if last update was today
    const lastUpdated = analytics.lastUpdated ? new Date(analytics.lastUpdated).toDateString() : null;
    const isToday = lastUpdated === today;
    
    // Calculate this week
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const isThisWeek = analytics.lastUpdated ? new Date(analytics.lastUpdated) > weekAgo : false;
    
    const updatedAnalytics = {
      totalPosts: (analytics.totalPosts || 0) + 1,
      todayPosts: isToday ? (analytics.todayPosts || 0) + 1 : 1,
      thisWeekPosts: isThisWeek ? (analytics.thisWeekPosts || 0) + 1 : 1,
      generatedTopics: { ...analytics.generatedTopics, [topic]: now.toISOString() },
    };
    
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedAnalytics),
    });
  } catch (err) {
    console.error('Error updating analytics:', err);
  }
};

export default function Home() {
  const [posts, setPosts] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [stopMessage, setStopMessage] = useState<string>("");
  const [pendingPosts, setPendingPosts] = useState<Map<string, { post: Article; timer: number; timerId: NodeJS.Timeout }>>(new Map());
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [analytics, setAnalytics] = useState({ totalPosts: 0, todayPosts: 0, thisWeekPosts: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedTopicsRef = useRef<Record<string, number>>({});
  
  const postsPerPage = 6;
  const COOLDOWN_SECONDS = 120;

  // Popular topics suggestions
  const popularTopics = [
    "Artificial Intelligence", "Climate Change", "Space Exploration", 
    "Web Development", "Digital Marketing", "Mental Health",
    "Sustainable Living", "Blockchain", "Renewable Energy"
  ];

  // Categories for filtering
  const categories = [
    { id: "all", name: "All Posts", icon: Globe },
    { id: "technology", name: "Technology", icon: Zap },
    { id: "science", name: "Science", icon: TrendingUp },
    { id: "business", name: "Business", icon: Users },
    { id: "health", name: "Health", icon: Heart }
  ];

  // Cooldown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev <= 1 ? 0 : prev - 1);
      }, 1000);
    }
    return () => interval && clearInterval(interval);
  }, [cooldown]);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchPosts = async () => {
    try {
      const articles = await fetchArticles();
      const postsData: Article[] = articles.map((article: any) => ({
        ...article,
        id: article._id || article.id,
      }));
      const sortedPosts = postsData.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setPosts(sortedPosts);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchAnalytics();
  }, []);

  const deletePost = async (postId: string) => {
    if (!postId) return;
    try {
      // Check if it's a pending post
      if (pendingPosts.has(postId)) {
        const pending = pendingPosts.get(postId);
        if (pending) {
          clearInterval(pending.timerId);
        }
        setPendingPosts(prev => {
          const next = new Map(prev);
          next.delete(postId);
          return next;
        });
        setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
        setShowDeleteConfirm(false);
        setPostToDelete(null);
        return;
      }
      
      // Delete from MongoDB
      await deleteArticle(postId);
      setPosts((prevPosts) => prevPosts.filter(post => post.id !== postId));
      setShowDeleteConfirm(false);
      setPostToDelete(null);
    } catch (err) {
      console.error("Error deleting post:", err);
      setError("Failed to delete post");
    }
  };

  const handleDeleteClick = (postId: string) => {
    setPostToDelete(postId);
    setShowDeleteConfirm(true);
  };

  const handleCancelDelete = () => {
    setPostToDelete(null);
    setShowDeleteConfirm(false);
  };

  const validateTopic = async (topic: string): Promise<string | null> => {
    if (!topic) return "Please enter a topic";
    if (topic.length < 3) return "Topic must be at least 3 characters long";
    if (topic.length > 50) return "Topic must be less than 50 characters long";
    
    const validTopicRegex = /^[a-zA-Z0-9\s\-.,!?]+$/;
    if (!validTopicRegex.test(topic)) {
      return "Topic contains invalid characters";
    }

    try {
      const response = await fetch("/api/validate-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await response.json();
      if (!data.isValid) {
        return data.message || "Please enter a valid topic";
      }
    } catch (error) {
      console.error("Error validating topic:", error);
      return "Unable to validate topic. Please try again.";
    }
    return null;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStopMessage("Generation stopped - Pending content discarded");
    
    // Clear all pending post timers (don't save to MongoDB)
    pendingPosts.forEach((pending) => {
      clearInterval(pending.timerId);
    });
    
    // Remove pending posts from UI
    pendingPosts.forEach((pending) => {
      setPosts(prev => prev.filter(p => p.id !== pending.post.id));
    });
    
    setPendingPosts(new Map());
    
    // Note: Cooldown timer continues - don't reset it
    // The user still needs to wait before generating again
    
    // Clear stop message after 5 seconds, then cooldown timer shows naturally
    setTimeout(() => {
      setStopMessage("");
    }, 5000);
  };

  const toggleExpandPost = (postId: string) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!currentTopic) {
      setError("Please enter a topic");
      return;
    }

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;
    if (timeSinceLastClick < COOLDOWN_SECONDS * 1000) {
      const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - timeSinceLastClick) / 1000);
      setError(`Please wait ${formatCooldown(remaining)} before generating again`);
      setCooldown(remaining);
      return;
    }

    // Check for duplicate topic within 2 minutes
    const topicKey = currentTopic.toLowerCase().trim();
    const lastGenerated = generatedTopicsRef.current[topicKey];
    if (lastGenerated && (now - lastGenerated) < 2 * 60 * 1000) {
      const remainingSeconds = Math.ceil((2 * 60 * 1000 - (now - lastGenerated)) / 1000);
      setError(`Please wait ${Math.ceil(remainingSeconds / 60)} minutes before generating the same topic again`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setStopMessage("");

    try {
      const validationError = await validateTopic(currentTopic);
      if (validationError) {
        setError(validationError);
        setIsLoading(false);
        return;
      }

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: currentTopic }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate content");
      }

      // Log model used to console only (not on page)
      if (data.modelUsed) {
        console.log("Model used:", data.modelUsed);
      }

      const cleanTitle = data.title.replace(/\*\*|\*|`|#/g, '').trim();
      const cleanDescription = data.description.replace(/\*\*|\*|`|#/g, '').trim();

      const newPost: Article = {
        id: Date.now().toString(),
        title: cleanTitle,
        description: cleanDescription,
        createdAt: new Date().toISOString(),
        topic: currentTopic,
        url: '',
        urlToImage: '',
        tags: [],
        publishedAt: new Date().toISOString()
      };

      // Add to UI immediately
      setPosts((prev) => [newPost, ...prev]);
      
      // IMPORTANT: Stop loading so content shows
      setIsLoading(false);
      
      // Track this topic as generated
      generatedTopicsRef.current[topicKey] = Date.now();
      
      // Clear topic input
      setCurrentTopic("");
      if (inputRef.current) inputRef.current.value = "";

      // Start 2-minute timer before saving to MongoDB
      const postId = newPost.id;
      let remainingSeconds = 120;
      
      const timerId = setInterval(() => {
        remainingSeconds--;
        
        setPendingPosts(prev => {
          const next = new Map(prev);
          const current = next.get(postId);
          if (current) {
            next.set(postId, { ...current, timer: remainingSeconds });
          }
          return next;
        });
        
        if (remainingSeconds <= 0) {
          clearInterval(timerId);
          // Save to MongoDB after timer completes
          createArticle(newPost).then(() => {
            console.log("Saved to MongoDB after timer:", postId);
            setPendingPosts(prev => {
              const next = new Map(prev);
              next.delete(postId);
              return next;
            });
            // Update analytics
            updateAnalytics(newPost.topic || '');
            // Update cooldown after successful save
            setLastClickTime(Date.now());
            setCooldown(COOLDOWN_SECONDS);
          }).catch(err => {
            console.error("Failed to save to MongoDB:", err);
            setPendingPosts(prev => {
              const next = new Map(prev);
              next.delete(postId);
              return next;
            });
          });
        }
      }, 1000);
      
      // Store pending post with timer
      setPendingPosts(prev => {
        const next = new Map(prev);
        next.set(postId, { post: newPost, timer: remainingSeconds, timerId });
        return next;
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Request was aborted");
        // Don't set error here, handleStop already shows message
      } else {
        console.error("Error:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Filter posts based on category and search
  const filteredPosts = posts.filter(post => {
    const matchesSearch = searchTerm === "" || 
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || 
      (selectedCategory === "technology" && post.topic?.toLowerCase().match(/ai|tech|programming|web|digital/i)) ||
      (selectedCategory === "science" && post.topic?.toLowerCase().match(/science|space|climate|biology/i)) ||
      (selectedCategory === "business" && post.topic?.toLowerCase().match(/business|market|finance|economy/i)) ||
      (selectedCategory === "health" && post.topic?.toLowerCase().match(/health|mental|wellness|fitness/i));
    
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const currentPosts = filteredPosts.slice(
    (currentPage - 1) * postsPerPage,
    currentPage * postsPerPage
  );

  // Statistics from database
  const stats = {
    total: analytics.totalPosts,
    today: analytics.todayPosts,
    thisWeek: analytics.thisWeekPosts
  };
  
  // Fetch analytics on load
  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.analytics) {
        setAnalytics({
          totalPosts: data.analytics.totalPosts || 0,
          todayPosts: data.analytics.todayPosts || 0,
          thisWeekPosts: data.analytics.thisWeekPosts || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 backdrop-blur-md bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-700 transform animate-scaleIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-full">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Delete Post</h3>
            </div>
            <p className="text-gray-300 mb-6">Are you sure you want to delete this post? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => postToDelete && deletePost(postToDelete)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all transform hover:scale-105"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 bg-black/30 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12">
                <Image src={logo} alt="Logo" fill className="object-contain filter brightness-0 invert" />
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Daily Drafits AI
                </h1>
                <p className="text-xs text-gray-400">AI-Powered Content Generation</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowStats(!showStats)}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Panel */}
      {showStats && (
        <div className="relative z-10 container mx-auto px-6 mt-4 animate-slideDown">
          <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{stats.total}</div>
                <div className="text-gray-400 mt-1">Total Posts</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{stats.today}</div>
                <div className="text-gray-400 mt-1">Created Today</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">{stats.thisWeek}</div>
                <div className="text-gray-400 mt-1">This Week</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full px-4 py-2 mb-6 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-300">AI-Powered Content Generation</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-white via-blue-300 to-purple-300 bg-clip-text text-transparent mb-6">
            Create Amazing Content
          </h2>
          
          <p className="text-xl text-gray-300 mb-8">
            Generate unique, engaging articles with our advanced AI technology
          </p>

          {/* Cooldown Timer */}
          {cooldown > 0 && (
            <div className="inline-flex items-center gap-3 bg-black/50 backdrop-blur-sm rounded-full px-6 py-3 mb-8">
              <Clock className="w-5 h-5 text-yellow-400 animate-pulse" />
              <span className="text-white font-mono text-xl">{formatCooldown(cooldown)}</span>
              <span className="text-gray-400">cooldown</span>
            </div>
          )}

          {/* Input Section */}
          <div className="bg-black/30 backdrop-blur-xl rounded-2xl p-1 border border-white/20 mb-6">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentTopic}
                  onChange={(e) => setCurrentTopic(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="Enter a topic... (e.g., 'Future of Artificial Intelligence')"
                  className="w-full px-6 py-4 bg-transparent text-white placeholder-gray-400 focus:outline-none"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!currentTopic || isLoading || cooldown > 0}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mb-6">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {stopMessage && (
            <div className="flex items-center justify-center gap-2 text-yellow-400 bg-yellow-400/10 rounded-lg px-4 py-2 mb-6">
              <AlertCircle className="w-4 h-4" />
              <span>{stopMessage}</span>
            </div>
          )}

          {/* Popular Topics */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            <span className="text-gray-400 text-sm">Popular:</span>
            {popularTopics.map((topic) => (
              <button
                key={topic}
                onClick={() => {
                  setCurrentTopic(topic);
                  if (inputRef.current) inputRef.current.value = topic;
                }}
                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 text-sm transition-all"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-12 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    selectedCategory === category.id
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search posts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 pl-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Posts Grid */}
      <main className="relative z-10 container mx-auto px-6 py-12">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              </div>
            </div>
            <p className="mt-6 text-gray-300">Crafting your content...</p>
            <button
              onClick={handleStop}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all"
            >
              <Square className="w-4 h-4" />
              Stop Generation
            </button>
          </div>
        )}

        {!isLoading && currentPosts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentPosts.map((post, index) => {
                const isPending = pendingPosts.has(post.id);
                const pendingData = pendingPosts.get(post.id);
                const isExpanded = expandedPosts.has(post.id);
                
                return (
                  <div
                    key={post.id}
                    className="group relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl rounded-2xl overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 animate-fadeInUp flex flex-col h-[400px]"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    {/* Gradient Border */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl -z-10"></div>
                    <div className="absolute inset-[1px] bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl"></div>
                    
                    {/* Pending Timer Badge */}
                    {isPending && (
                      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium">
                        <Clock className="w-3 h-3 animate-pulse" />
                        {Math.ceil((pendingData?.timer || 0) / 60)}:{((pendingData?.timer || 0) % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                    
                    <div className="relative p-6 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-400">
                              {new Date(post.createdAt ?? '').toLocaleDateString()}
                            </span>
                            {post.topic && (
                              <>
                                <Hash className="w-3 h-3 text-gray-400" />
                                <span className="text-xs text-gray-400 truncate max-w-[100px]">{post.topic}</span>
                              </>
                            )}
                          </div>
                          {/* Full title without truncation */}
                          <h3 className="text-lg font-bold text-white mb-3 group-hover:text-blue-300 transition-colors leading-tight">
                            {post.title}
                          </h3>
                        </div>
                        <button
                          onClick={() => handleDeleteClick(post.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-all flex-shrink-0 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Scrollable content area with fixed height */}
                      <div className="flex-1 overflow-hidden relative">
                        <div 
                          className={`text-gray-300 leading-relaxed transition-all duration-300 ${
                            isExpanded ? 'overflow-y-auto max-h-[200px] pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent' : 'line-clamp-4'
                          }`}
                        >
                          {post.description}
                        </div>
                        
                        {/* Gradient overlay when not expanded */}
                        {!isExpanded && post.description.length > 200 && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none"></div>
                        )}
                      </div>
                      
                      {/* Read More / Read Less Button */}
                      {post.description.length > 150 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <button 
                            onClick={() => toggleExpandPost(post.id)}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                          >
                            {isExpanded ? (
                              <>
                                Read less
                                <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                Read more
                                <ChevronRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-12">
     
               <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-10 h-10 rounded-lg transition-all ${
                          currentPage === pageNum
                            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          !isLoading && (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 mb-6">
                <BookOpen className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">No posts found</h3>
              <p className="text-gray-400">
                {searchTerm || selectedCategory !== "all"
                  ? "Try adjusting your filters or search term"
                  : "Enter a topic above to generate your first post"}
              </p>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-black/30 backdrop-blur-xl border-t border-white/10 mt-20">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">© 2026 Daily Drafits AI. All rights reserved.</span>
            </div>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">About</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out forwards;
        }
        .animate-slideDown {
          animation: slideDown 0.5s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}