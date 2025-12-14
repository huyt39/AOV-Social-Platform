import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, Heart, Eye, Image, X, Loader2 } from 'lucide-react';
import { ForumCategory, ForumThreadListItem, ForumThreadsResponse, CreateThreadInput, ThreadStatus } from '../types';
import { API_BASE_URL } from '../constants';
import { useAuth } from '../contexts/authContext';

interface ForumCategoryPageProps {
  categoryId: string;
}

export const ForumCategoryPage: React.FC<ForumCategoryPageProps> = ({ categoryId }) => {
  const { token, isAuthenticated } = useAuth();
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [threads, setThreads] = useState<ForumThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<'latest' | 'activity' | 'popular'>('latest');
  
  // New thread modal
  const [showNewThread, setShowNewThread] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Media upload for new thread
  const [threadMediaUrls, setThreadMediaUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !token) return;
    
    setIsUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('image', file);
      
      try {
        const response = await fetch(`${API_BASE_URL}/auth/upload-image`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (response.ok) {
          const result = await response.json();
          setThreadMediaUrls(prev => [...prev, result.url]);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const removeMedia = (index: number) => {
    setThreadMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const fetchCategory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/forum/categories/${categoryId}`);
      if (!response.ok) throw new Error('Category not found');
      const data: ForumCategory = await response.json();
      setCategory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    }
  };

  const fetchThreads = useCallback(async (cursor?: string) => {
    try {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({ sort: sortBy, limit: '20' });
      if (cursor) params.append('cursor', cursor);

      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(
        `${API_BASE_URL}/forum/categories/${categoryId}/threads?${params}`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to fetch threads');
      
      const data: ForumThreadsResponse = await response.json();
      
      // Normalize snake_case to camelCase from API
      const normalizedThreads = data.data.map((thread: any) => ({
        ...thread,
        createdAt: thread.createdAt || thread.created_at,
        lastActivityAt: thread.lastActivityAt || thread.last_activity_at,
        viewCount: thread.viewCount ?? thread.view_count ?? 0,
        commentCount: thread.commentCount ?? thread.comment_count ?? 0,
        likeCount: thread.likeCount ?? thread.like_count ?? 0,
        contentPreview: thread.contentPreview || thread.content_preview || '',
        categoryId: thread.categoryId || thread.category_id,
        author: thread.author ? {
          ...thread.author,
          avatarUrl: thread.author.avatarUrl || thread.author.avatar_url,
        } : thread.author,
      }));
      
      if (cursor) {
        setThreads(prev => [...prev, ...normalizedThreads]);
      } else {
        setThreads(normalizedThreads);
      }
      setNextCursor(data.nextCursor || (data as any).next_cursor || null);
      setHasMore(data.hasMore ?? (data as any).has_more ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [categoryId, sortBy, token]);

  useEffect(() => {
    fetchCategory();
    fetchThreads();
  }, [categoryId, sortBy]);

  const handleThreadClick = (threadId: string) => {
    window.location.hash = `forum/thread/${threadId}`;
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      setSubmitting(true);
      const response = await fetch(
        `${API_BASE_URL}/forum/categories/${categoryId}/threads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: newTitle,
            content: newContent,
            media_urls: threadMediaUrls,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to create thread');
      
      const thread = await response.json();
      setShowNewThread(false);
      setNewTitle('');
      setNewContent('');
      setThreadMediaUrls([]);
      
      // Navigate to new thread
      window.location.hash = `forum/thread/${thread.id}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể tạo chủ đề');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  if (loading && !threads.length) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/3"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="h-5 bg-slate-700 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-slate-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Back button & Header */}
      <div className="mb-4">
        <button
          onClick={() => window.location.hash = 'forum'}
          className="flex items-center gap-2 text-slate-400 hover:text-amber-400 transition-colors mb-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại
        </button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-400">
              {category?.name || 'Đang tải...'}
            </h1>
            {category?.description && (
              <p className="text-slate-400 mt-1">{category.description}</p>
            )}
          </div>
          
          {isAuthenticated && (
            <button
              onClick={() => setShowNewThread(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 
                         hover:from-amber-400 hover:to-orange-400 text-slate-900 font-semibold 
                         rounded-lg transition-all shadow-lg shadow-amber-500/20"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Tạo chủ đề
            </button>
          )}
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-700/50 pb-3">
        {[
          { key: 'latest', label: 'Mới nhất' },
          { key: 'activity', label: 'Hoạt động' },
          { key: 'popular', label: 'Phổ biến' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSortBy(tab.key as typeof sortBy)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                       ${sortBy === tab.key 
                         ? 'bg-amber-500/20 text-amber-400' 
                         : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread List */}
      {threads.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl p-8 text-center text-slate-400">
          <div className="text-4xl mb-3">📭</div>
          <p>Chưa có chủ đề nào</p>
          {isAuthenticated && (
            <button
              onClick={() => setShowNewThread(true)}
              className="mt-3 text-amber-400 hover:underline"
            >
              Tạo chủ đề đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => handleThreadClick(thread.id)}
              className="w-full bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 
                         hover:border-amber-500/30 rounded-xl p-4 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                {/* Author avatar */}
                <img
                  src={thread.author.avatarUrl || `https://ui-avatars.com/api/?name=${thread.author.username}&background=random`}
                  alt={thread.author.username}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100 group-hover:text-amber-300 
                                   transition-colors line-clamp-1">
                      {thread.title}
                    </h3>
                    {thread.status === ThreadStatus.LOCKED && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                        🔒 Đã khóa
                      </span>
                    )}
                  </div>
                  
                  {/* Preview */}
                  <p className="text-sm text-slate-400 line-clamp-1 mt-0.5">
                    {thread.contentPreview}
                  </p>
                  
                  {/* Meta */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span className="text-amber-400/70">@{thread.author.username}</span>
                    <span>•</span>
                    <span>{formatDate(thread.createdAt)}</span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Eye className="w-3.5 h-3.5" />
                      {thread.viewCount}
                    </span>
                    <span className="flex items-center gap-1 text-blue-400/70">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {thread.commentCount}
                    </span>
                    <span className="flex items-center gap-1 text-gold-400/70">
                      <Heart className="w-3.5 h-3.5" />
                      {thread.likeCount}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchThreads(nextCursor || undefined)}
            disabled={loadingMore}
            className="px-6 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 
                       rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Đang tải...' : 'Xem thêm'}
          </button>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewThread && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-amber-400">Tạo chủ đề mới</h2>
              <button
                onClick={() => setShowNewThread(false)}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateThread} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Tiêu đề
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Nhập tiêu đề chủ đề..."
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                             focus:outline-none focus:border-amber-500 text-slate-100"
                  maxLength={200}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Nội dung
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Chia sẻ suy nghĩ của bạn..."
                  rows={8}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                             focus:outline-none focus:border-amber-500 text-slate-100 resize-none"
                  maxLength={10000}
                  required
                />
              </div>
              
              {/* Media upload section */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Hình ảnh
                </label>
                
                {/* Media preview */}
                {threadMediaUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {threadMediaUrls.map((url, index) => (
                      <div key={index} className="relative">
                        <img src={url} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-600" />
                        <button
                          type="button"
                          onClick={() => removeMedia(index)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                             hover:bg-slate-600/50 hover:border-green-500/50 transition-colors
                             disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
                  ) : (
                    <Image className="w-5 h-5 text-green-400" />
                  )}
                  <span className="text-slate-300 text-sm">Thêm ảnh</span>
                </button>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewThread(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim() || !newContent.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 
                             hover:from-amber-400 hover:to-orange-400 text-slate-900 
                             font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  {submitting ? 'Đang tạo...' : 'Đăng chủ đề'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForumCategoryPage;
