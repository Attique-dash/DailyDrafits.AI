"use client";
import { useEffect, useState } from "react";
import { Article } from "@/app/types/article";
import Image from "next/image";
import logo from "../../public/Images/Logo.png";
import { getFirestore } from 'firebase/firestore';
import { db, collection, addDoc, getDocs, doc, deleteDoc } from "@/app/lib/firebase";

export default function Home() {
  const [posts, setPosts] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const postsPerPage = 3;

  // Fetch all posts from Firebase
  const fetchPosts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "articles"));
      const postsData: Article[] = [];
      querySnapshot.forEach((doc) => {
        postsData.push({ ...doc.data(), id: doc.id } as Article);
      });
      // Sort posts by createdAt in descending order (newest first)
      const sortedPosts = postsData.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setPosts(sortedPosts);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  // Initial load
  useEffect(() => {
    fetchPosts();
  }, []);

  // Group posts into rows of 3 for grid display
  const postRows = [];
  for (let i = 0; i < posts.length; i += 3) {
    postRows.push(posts.slice(i, i + 3));
  }

  // Delete post function
  const deletePost = async (postId: string) => {
    if (!postId) return;
    
    try {
      // Create a reference to the specific document
      const postRef = doc(getFirestore(), "articles", postId);
      
      // Delete the document
      await deleteDoc(postRef);
      
      // Update local state
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
    setShowDeleteConfirm(false);
    setPostToDelete(null);
  };

  // Validate topic function
  const validateTopic = async (topic: string): Promise<string | null> => {
    if (!topic) return "Please enter a topic";
    if (topic.length < 3) return "Topic must be at least 3 characters long";
    if (topic.length > 50) return "Topic must be less than 50 characters long";
    
    // Check if the topic contains only valid characters
    const validTopicRegex = /^[a-zA-Z0-9\s\-.,!?]+$/;
    if (!validTopicRegex.test(topic)) {
      return "Topic contains invalid characters. Please use only letters, numbers, spaces, and basic punctuation.";
    }

    // Check for meaningful content
    try {
      const response = await fetch("/api/validate-topic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic }),
      });

      const data = await response.json();
      if (!data.isValid) {
        return data.message || "Please enter a valid topic. Examples: 'Artificial Intelligence', 'Climate Change', 'Space Exploration'";
      }
    } catch (error) {
      console.error("Error validating topic:", error);
      return "Unable to validate topic. Please try again.";
    }

    return null;
  };

  // Generate and store new post
  const generateAndStorePost = async () => {
    if (!currentTopic) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log("Sending request for topic:", currentTopic);
      
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: currentTopic,
          previousTitles: posts.map((p) => p.title),
        }),
      });

      const data = await res.json();
      console.log("Received response:", data);

      if (!res.ok || data.error) {
        const errorMessage = data.error || `Failed to generate content. Status: ${res.status}`;
        console.error("API Error:", errorMessage);
        throw new Error(errorMessage);
      }

      // Validate the response data
      if (!data.title || !data.description) {
        console.error("Invalid response format:", data);
        throw new Error("Invalid response format: missing title or description");
      }

      console.log("Storing article in Firebase...");
      // Store in Firebase
      const docRef = await addDoc(collection(db, "articles"), {
        ...data,
        createdAt: new Date().toISOString(),
        topic: currentTopic,
      });

      console.log("Article stored successfully");
      // Update local state with the new post
      setPosts((prev) => [data, ...prev]);
    } catch (err) {
      console.error("Error in generateAndStorePost:", err);
      setError(err instanceof Error ? err.message : "Failed to generate article. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle topic change
  const handleTopicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTopic = e.target.value;
    setCurrentTopic(newTopic);
    
    // Only validate if the topic is not empty and has at least 3 characters
    if (newTopic && newTopic.length >= 3) {
      try {
        const validationError = await validateTopic(newTopic);
        setError(validationError);
      } catch (error) {
        console.error("Validation error:", error);
        setError("Error validating topic");
      }
    } else {
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!currentTopic) {
      setError("Please enter a topic");
      return;
    }

    try {
      const validationError = await validateTopic(currentTopic);
      if (validationError) {
        setError(validationError);
        return;
      }

      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: currentTopic }),
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (!response.ok) {
        const errorMessage = data.error || "Failed to generate content";
        const errorDetails = data.details ? `\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      if (!data || !data.title || !data.description) {
        console.error("Invalid response format:", data);
        throw new Error("Invalid response format from API. Please try again.");
      }

      // Clean up the text by removing markdown formatting
      const cleanTitle = data.title
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/#/g, '')
        .trim();

      const cleanDescription = data.description
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/#/g, '')
        .trim();

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

      await addDoc(collection(db, "articles"), newPost);
      setPosts((prev) => [newPost, ...prev]);
      setCurrentTopic(""); // Clear the input after successful generation
    } catch (error) {
      console.error("Error:", error);
      setError(error instanceof Error ? error.message : "An error occurred while generating content. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 font-sans">
      {/* Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/90 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this post?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 rounded-lg cursor-pointer bg-gray-200 hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => postToDelete && deletePost(postToDelete)}
                className="px-4 py-2 rounded-lg bg-red-500 cursor-pointer hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="h-20 bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center justify-between px-6 shadow-lg">
        <div className="flex-1">
          <Image src={logo} alt="Logo" width={180} height={60} className="filter brightness-0 invert" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="text-xl font-bold text-white">AI Post Generator</div>
        </div>
        <div className="flex-1"></div>
      </header>

      <div className="p-6 flex flex-col items-center gap-4">
        <div className="w-full max-w-md relative">
          <input
            type="text"
            value={currentTopic}
            onChange={handleTopicChange}
            placeholder="Enter a topic to generate content"
            className="px-4 py-3 rounded-lg w-full border-2 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
          {error && (
            <div className="absolute -bottom-6 left-0 text-red-500 text-sm">
              {error}
            </div>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={!currentTopic || isLoading || !!error}
          className="px-6 py-3 rounded-lg font-medium transition-all cursor-pointer transform hover:scale-105 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:hover:scale-100"
        >
          Generate Content
        </button>
      </div>

      <main className="container mx-auto px-4 py-8">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-32 space-y-4">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <p className="text-gray-600">Generating new content...</p>
          </div>
        )}

        {postRows.length > 0 ? (
          <div className="space-y-8">
            {postRows.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage).map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {row.map((post, postIndex) => (
                  <div
                    key={`post-${rowIndex}-${postIndex}`}
                    className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all transform hover:-translate-y-1"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <h2 className="text-lg font-bold text-gray-800 flex-grow pr-4">
                          {post.title
                            ?.replace(/^```json\s*{\s*|\s*}\s*```$/g, '')
                            .replace(/^["']|["']$/g, '')
                            .replace(/\\n/g, ' ')
                            .trim()}
                        </h2>
                        <button
                          onClick={() => handleDeleteClick(post.id)}
                          className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0 cursor-pointer"
                          title="Delete post"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-gray-600">
                        <p className="text-sm leading-relaxed">
                          {post.description
                            ?.replace(/^```json\s*{\s*|\s*}\s*```$/g, '')
                            .replace(/^["']|["']$/g, '')
                            .replace(/\\n/g, ' ')
                            .trim()}
                        </p>
                      </div>
                      {post.urlToImage && (
                        <div className="mt-3">
                          <img
                            src={post.urlToImage}
                            alt={post.title}
                            className="w-full h-40 object-cover rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Pagination */}
            {postRows.length > postsPerPage && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-gray-600">
                  Page {currentPage} of {Math.ceil(postRows.length / postsPerPage)}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(postRows.length / postsPerPage), prev + 1))}
                  disabled={currentPage === Math.ceil(postRows.length / postsPerPage)}
                  className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-800">
              {currentTopic
                ? `No posts yet for "${currentTopic}"`
                : "Enter a topic to begin"}
            </h2>
            <p className="mt-4 text-gray-600">
              {currentTopic
                ? "Click 'Generate Content' to create content"
                : "Popular topics: AI, Web Development, Science"}
            </p>
          </div>
        )}
      </main>

      <footer className="bg-gradient-to-r from-blue-600 to-indigo-700 py-6 text-center text-white">
        <p className="text-sm">© {new Date().getFullYear()} AI Content Generator</p>
      </footer>
    </div>
  );
}