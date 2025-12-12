import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Zap, ShieldCheck, Image, Video, X, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/authContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Types matching backend
interface MediaItem {
  url: string;
  type: 'image' | 'video';
  thumbnail_url?: string;
}

interface PostAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  rank: string | null;
  level: number | null;
}

interface FeedPost {
  id: string;
  author_id: string;
  author: PostAuthor;
  content: string;
  media: MediaItem[];
  created_at: string;
}

interface FeedResponse {
  data: FeedPost[];
  next_cursor: string | null;
  has_more: boolean;
}

// Rank display mapping
const RANK_DISPLAY: Record<string, string> = {
  'BRONZE': 'Đồng',
  'SILVER': 'Bạc', 
  'GOLD': 'Vàng',
  'PLATINUM': 'Bạch Kim',
  'DIAMOND': 'Kim Cương',
  'VETERAN': 'Tinh Anh',
  'MASTER': 'Cao Thủ',
  'CONQUEROR': 'Thách Đấu',
};

// Format timestamp
const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN');
};

export const Feed: React.FC = () => {
  const { user, token } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create post state
  const [newPostContent, setNewPostContent] = useState('');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch feed posts
  const fetchFeed = async (cursor?: string) => {
    if (!token) return;

    try {
      const url = new URL(`${API_URL}/posts/feed`);
      url.searchParams.set('limit', '10');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feed');
      }

      const result: FeedResponse = await response.json();
      
      if (cursor) {
        setPosts(prev => [...prev, ...result.data]);
      } else {
        setPosts(result.data);
      }
      
      setNextCursor(result.next_cursor);
      setHasMore(result.has_more);
    } catch (err) {
      setError('Không thể tải bài viết. Vui lòng thử lại.');
      console.error('Feed fetch error:', err);
    }
  };

  // Initial load
  useEffect(() => {
    const loadFeed = async () => {
      setIsLoading(true);
      await fetchFeed();
      setIsLoading(false);
    };
    
    if (token) {
      loadFeed();
    }
  }, [token]);

  // Infinite scroll observer
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;
    
    setIsLoadingMore(true);
    await fetchFeed(nextCursor);
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, nextCursor]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loadMore]);

  // Handle file upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !token) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      const endpoint = isVideo ? '/auth/upload-video' : '/auth/upload-image';
      
      const formData = new FormData();
      formData.append(isVideo ? 'video' : 'image', file);

      try {
        const response = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          setMediaItems(prev => [...prev, {
            url: result.url,
            type: isVideo ? 'video' : 'image',
          }]);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove media item
  const removeMedia = (index: number) => {
    setMediaItems(prev => prev.filter((_, i) => i !== index));
  };

  // Create new post
  const handlePost = async () => {
    if (!newPostContent.trim() || !token) return;

    setIsPosting(true);

    try {
      const response = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newPostContent,
          media: mediaItems,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setPosts(prev => [result.data, ...prev]);
        setNewPostContent('');
        setMediaItems([]);
      }
    } catch (err) {
      console.error('Post creation failed:', err);
    }

    setIsPosting(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full pb-24 md:pb-8 pt-4">
      {/* Create Post HUD */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-1 rounded-none clip-angled mb-8 mx-4 shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <div className="bg-slate-800/50 p-4 clip-angled border-l-2 border-gold-500">
          <div className="flex gap-4">
            <div className="relative">
              <img 
                src={user?.avatar_url || 'https://via.placeholder.com/48'} 
                alt={user?.username} 
                className="w-12 h-12 rounded-none clip-hex-button object-cover border border-slate-600" 
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-slate-900 transform rotate-45"></div>
            </div>
            <div className="flex-1">
              <textarea
                className="w-full bg-slate-950/50 text-white rounded-sm p-3 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none placeholder-slate-500 font-medium border border-slate-700/50"
                placeholder="Chia sẻ chiến thuật, highlight hoặc tìm team..."
                rows={2}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                disabled={isPosting}
              />
              
              {/* Media preview */}
              {mediaItems.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {mediaItems.map((item, index) => (
                    <div key={index} className="relative">
                      {item.type === 'image' ? (
                        <img src={item.url} alt="" className="w-20 h-20 object-cover rounded" />
                      ) : (
                        <video src={item.url} className="w-20 h-20 object-cover rounded" />
                      )}
                      <button
                        onClick={() => removeMedia(index)}
                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-3 pl-16">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1 text-slate-400 hover:text-gold-400 transition-colors text-sm"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Image className="w-4 h-4" />
                    <Video className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            <button 
              onClick={handlePost}
              disabled={!newPostContent.trim() || isPosting}
              className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-display font-bold py-1.5 px-6 clip-hex-button transition-all hover:translate-y-[-2px] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
            >
              {isPosting ? 'ĐANG ĐĂNG...' : 'ĐĂNG BÀI'}
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-900/30 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && !error && (
        <div className="text-center text-slate-500 py-12">
          <p className="text-lg">Chưa có bài viết nào</p>
          <p className="text-sm mt-1">Hãy kết bạn hoặc đăng bài viết đầu tiên!</p>
        </div>
      )}

      {/* Post List */}
      <div className="space-y-6 px-4">
        {posts.map((post) => (
          <div key={post.id} className="group relative bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors">
            {/* Decorative corner accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-gold-500"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-gold-500"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-gold-500"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-gold-500"></div>

            <div className="p-5">
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <a 
                  href={`#profile/${post.author.id}`}
                  className="relative cursor-pointer group-hover:scale-105 transition-transform"
                >
                  <img 
                    src={post.author.avatar_url || 'https://via.placeholder.com/48'} 
                    alt={post.author.username} 
                    className="w-12 h-12 object-cover clip-hex-button border-2 border-slate-700" 
                  />
                  {post.author.rank && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950 text-[10px] font-bold px-2 py-0.5 border border-slate-700 text-gold-500 whitespace-nowrap">
                      {RANK_DISPLAY[post.author.rank] || post.author.rank}
                    </div>
                  )}
                </a>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg text-white tracking-wide flex items-center gap-2">
                        <a href={`#profile/${post.author.id}`} className="hover:text-gold-400 transition-colors">
                          {post.author.username}
                        </a>
                        {post.author.level && post.author.level >= 30 && <Zap className="w-4 h-4 text-gold-400 fill-gold-400" />}
                      </h3>
                      <p className="text-slate-500 text-xs font-mono uppercase tracking-wider">
                        {formatTime(post.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <p className="text-slate-200 mb-4 text-sm leading-relaxed font-light whitespace-pre-wrap border-l-2 border-slate-700 pl-3">
                {post.content}
              </p>
              
              {/* Media */}
              {post.media.length > 0 && (
                <div className={`grid gap-2 mb-4 ${post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {post.media.map((item, index) => (
                    <div key={index} className="relative group-hover:brightness-110 transition-all">
                      <div className="absolute inset-0 border border-white/10 pointer-events-none z-10"></div>
                      {item.type === 'image' ? (
                        <img 
                          src={item.url} 
                          alt="Post content" 
                          className="w-full h-64 object-cover clip-angled" 
                        />
                      ) : (
                        <video 
                          src={item.url} 
                          controls 
                          className="w-full h-64 object-cover clip-angled"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-6 text-slate-400 border-t border-slate-800 pt-3 mt-2">
                <button className="flex items-center gap-2 hover:text-gold-400 transition-colors group/btn">
                  <Heart className="w-5 h-5 group-hover/btn:fill-gold-400 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-sm font-bold">0</span>
                </button>
                <button className="flex items-center gap-2 hover:text-blue-400 transition-colors group/btn">
                  <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-sm font-bold">0</span>
                </button>
                <button className="flex items-center gap-2 hover:text-white transition-colors ml-auto">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isLoadingMore && (
          <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
        )}
      </div>
    </div>
  );
};