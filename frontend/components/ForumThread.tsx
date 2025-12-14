import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, MessageCircle, Share2, CornerUpLeft, Eye, Image, X, Loader2 } from 'lucide-react';
import { 
  ForumThread, ForumComment, ForumCommentsResponse, 
  ThreadStatus, ForumCommentStatus, CreateCommentInput 
} from '../types';
import { API_BASE_URL } from '../constants';
import { useAuth } from '../contexts/authContext';

interface ForumThreadPageProps {
  threadId: string;
}

// Comment component - VOZ forum style layout
const CommentItem: React.FC<{
  comment: ForumComment;
  onReply: (commentId: string, authorUsername: string) => void;
  onLike: (commentId: string) => void;
  isAuthenticated: boolean;
  commentNumber?: number;
}> = ({ comment, onReply, onLike, isAuthenticated, commentNumber }) => {

  // Handle snake_case from API
  const createdAt = comment.createdAt || (comment as any).created_at;
  
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric'
    });
  };

  const isHidden = comment.status === ForumCommentStatus.HIDDEN || 
                   comment.status === ForumCommentStatus.DELETED;

  const mediaUrls = comment.mediaUrls || (comment as any).media_urls || [];
  const quotedContent = (comment as any).quotedContent || (comment as any).quoted_content || null;
  const replyToUsername = comment.replyToUsername || (comment as any).reply_to_username;

  return (
    <div className="border border-slate-700/50 bg-slate-800/40">
      {/* Main comment card - VOZ style */}
      <div className={`flex ${isHidden ? 'opacity-60' : ''}`}>
        {/* Left column - Avatar & User info */}
        <div className="w-32 md:w-40 flex-shrink-0 bg-slate-800/60 p-4 border-r border-slate-700/50">
          <div className="flex flex-col items-center text-center">
            <img
              src={comment.author.avatarUrl || (comment.author as any).avatar_url || 
                   `https://ui-avatars.com/api/?name=${comment.author.username}&background=3b82f6&color=fff&size=96`}
              alt={comment.author.username}
              className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-slate-600 mb-3"
            />
            <a className="font-semibold text-blue-400 hover:underline text-sm md:text-base cursor-pointer">
              {comment.author.username}
            </a>
            {comment.author.rank && (
              <span className="text-xs text-slate-400 mt-1 px-2 py-0.5 bg-slate-700/50 rounded">
                {comment.author.rank}
              </span>
            )}
            <span className="text-[11px] text-slate-500 mt-2">Member</span>
          </div>
        </div>
        
        {/* Right column - Content */}
        <div className="flex-1 flex flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-700/30 border-b border-slate-700/50">
            <span className="text-xs text-slate-400">{formatDate(createdAt)}</span>
            <div className="flex items-center gap-3">
              <button className="text-slate-500 hover:text-slate-300 transition-colors" title="Chia sẻ">
                <Share2 className="w-4 h-4" />
              </button>
              {commentNumber && (
                <span className="text-xs text-slate-500">#{commentNumber}</span>
              )}
            </div>
          </div>
          
          {/* Content area */}
          <div className="flex-1 p-4">
            {/* Quote box for replies */}
            {replyToUsername && (
              <div className="bg-slate-700/40 border-l-4 border-blue-500/60 px-4 py-3 mb-4 rounded-r">
                <div className="text-blue-400 text-sm font-medium mb-1">
                  {replyToUsername} đã viết:
                </div>
                {quotedContent && (
                  <div className="text-slate-400 text-sm line-clamp-3">
                    {quotedContent}
                  </div>
                )}
              </div>
            )}
            
            {/* Content */}
            <div className="text-slate-200 text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">
              {comment.content}
            </div>
            
            {/* Media */}
            {mediaUrls.length > 0 && !isHidden && (
              <div className="flex flex-wrap gap-3 mt-4">
                {mediaUrls.map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    alt="Attached"
                    className="max-w-sm max-h-64 rounded object-cover border border-slate-600"
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* Footer actions */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-700/20 border-t border-slate-700/50">
            <div className="flex items-center gap-1">
              {/* Like button - matching PostCard style */}
              <button
                onClick={() => onLike(comment.id)}
                disabled={!isAuthenticated}
                className={`flex items-center gap-1.5 p-1.5 rounded transition-colors group/btn
                           ${comment.isLiked ? 'text-gold-400' : 'text-slate-500 hover:text-gold-400'}
                           disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Thích"
              >
                <Heart className={`w-4 h-4 group-hover/btn:scale-110 transition-transform ${comment.isLiked ? 'fill-gold-400' : ''}`} />
              </button>
              {comment.likeCount > 0 && (
                <span className="text-xs text-slate-500 font-bold">{comment.likeCount}</span>
              )}
            </div>
            
            {isAuthenticated && comment.status === ForumCommentStatus.ACTIVE && (
              <button
                onClick={() => onReply(comment.id, comment.author.username)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-400 hover:text-blue-400 
                           hover:bg-blue-400/10 rounded transition-colors group/btn"
              >
                <CornerUpLeft className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                Trả lời
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ForumThreadPage: React.FC<ForumThreadPageProps> = ({ threadId }) => {
  const { token, isAuthenticated, user } = useAuth();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  // Comment form
  const [commentContent, setCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Media upload for comments
  const [commentMediaUrls, setCommentMediaUrls] = useState<string[]>([]);
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
          setCommentMediaUrls(prev => [...prev, result.url]);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const removeMedia = (index: number) => {
    setCommentMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const fetchThread = async () => {
    try {
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}/forum/threads/${threadId}`, { headers });
      if (!response.ok) throw new Error('Thread not found');
      
      const data = await response.json();
      // Normalize snake_case to camelCase
      setThread({
        ...data,
        mediaUrls: data.media_urls || data.mediaUrls || [],
        authorId: data.author_id || data.authorId,
        categoryId: data.category_id || data.categoryId,
        categoryName: data.category_name || data.categoryName,
        viewCount: data.view_count ?? data.viewCount ?? 0,
        commentCount: data.comment_count ?? data.commentCount ?? 0,
        likeCount: data.like_count ?? data.likeCount ?? 0,
        isLiked: data.is_liked ?? data.isLiked ?? false,
        createdAt: data.created_at || data.createdAt,
        updatedAt: data.updated_at || data.updatedAt,
        lastActivityAt: data.last_activity_at || data.lastActivityAt,
        author: data.author ? {
          ...data.author,
          avatarUrl: data.author.avatar_url || data.author.avatarUrl,
        } : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    }
  };

  const fetchComments = useCallback(async (cursor?: string) => {
    try {
      if (!cursor) setLoadingComments(true);
      
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.append('cursor', cursor);
      
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(
        `${API_BASE_URL}/forum/threads/${threadId}/comments?${params}`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to fetch comments');
      
      const data: ForumCommentsResponse = await response.json();
      
      if (cursor) {
        setComments(prev => [...prev, ...data.data]);
      } else {
        setComments(data.data);
      }
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  }, [threadId, token]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchThread();
      await fetchComments();
      setLoading(false);
    };
    loadData();
  }, [threadId]);

  const handleLikeThread = async () => {
    if (!isAuthenticated || !thread) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/forum/threads/${threadId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to like');
      
      const data = await response.json();
      setThread({
        ...thread,
        isLiked: data.liked,
        likeCount: data.like_count,
      });
    } catch (err) {
      console.error('Error liking thread:', err);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!isAuthenticated) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/forum/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to like comment');
      
      const data = await response.json();
      
      // Update comment in state
      const updateComment = (comments: ForumComment[]): ForumComment[] => {
        return comments.map(c => {
          if (c.id === commentId) {
            return { ...c, isLiked: data.liked, likeCount: data.like_count };
          }
          if (c.replies) {
            return { ...c, replies: updateComment(c.replies) };
          }
          return c;
        });
      };
      
      setComments(updateComment(comments));
    } catch (err) {
      console.error('Error liking comment:', err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;
    
    try {
      setSubmitting(true);
      
      let response: Response;
      
      if (replyingTo) {
        // Reply to comment
        response = await fetch(`${API_BASE_URL}/forum/comments/${replyingTo.id}/reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: commentContent, media_urls: commentMediaUrls }),
        });
      } else {
        // New root comment
        response = await fetch(`${API_BASE_URL}/forum/threads/${threadId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: commentContent, media_urls: commentMediaUrls }),
        });
      }
      
      if (!response.ok) throw new Error('Failed to post comment');
      
      const newComment: ForumComment = await response.json();
      
      // All comments are flat now - just append to end of list
      setComments(prev => [...prev, newComment]);
      
      // Update thread comment count
      if (thread) {
        setThread({ ...thread, commentCount: thread.commentCount + 1 });
      }
      
      setCommentContent('');
      setCommentMediaUrls([]);
      setReplyingTo(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể đăng bình luận');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN');
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/4"></div>
          <div className="h-40 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300">
          <p>{error || 'Không tìm thấy chủ đề'}</p>
          <button
            onClick={() => window.location.hash = 'forum'}
            className="mt-2 text-amber-400 hover:underline"
          >
            ← Quay lại diễn đàn
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-32">
      {/* Back button */}
      <button
        onClick={() => window.location.hash = thread.categoryId ? `forum/category/${thread.categoryId}` : 'forum'}
        className="flex items-center gap-2 text-slate-400 hover:text-amber-400 transition-colors mb-4"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {thread.categoryName || 'Quay lại'}
      </button>

      {/* Thread content */}
      <article className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <img
            src={thread.author.avatarUrl || `https://ui-avatars.com/api/?name=${thread.author.username}&background=random`}
            alt={thread.author.username}
            className="w-12 h-12 rounded-full object-cover"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-400">@{thread.author.username}</span>
              {thread.author.rank && (
                <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                  {thread.author.rank}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatDate(thread.createdAt)}
              {thread.status === ThreadStatus.LOCKED && (
                <span className="ml-2 text-red-400">🔒 Đã khóa</span>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl md:text-2xl font-bold text-slate-100 mb-4">
          {thread.title}
        </h1>

        {/* Content */}
        <div className="prose prose-invert max-w-none">
          <p className="text-slate-200 whitespace-pre-wrap">{thread.content}</p>
        </div>

        {/* Media */}
        {(thread.mediaUrls?.length > 0) && (
          <div className="flex flex-wrap gap-3 mt-4">
            {thread.mediaUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt="Thread media"
                className="max-w-full max-h-96 rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-700/50">
          <button
            onClick={handleLikeThread}
            disabled={!isAuthenticated}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors group/btn
                       ${thread.isLiked 
                         ? 'bg-gold-500/20 text-gold-400' 
                         : 'bg-slate-700/50 text-slate-400 hover:bg-gold-500/20 hover:text-gold-400'}
                       disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Heart className={`w-5 h-5 group-hover/btn:scale-110 transition-transform ${thread.isLiked ? 'fill-gold-400' : ''}`} />
            <span className="font-bold">{thread.likeCount}</span>
          </button>
          
          <div className="flex items-center gap-2 text-blue-400/70 hover:text-blue-400 transition-colors">
            <MessageCircle className="w-5 h-5" />
            <span className="font-bold">{thread.commentCount}</span>
            <span className="text-slate-500">bình luận</span>
          </div>
          
          <div className="flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors">
            <Eye className="w-5 h-5" />
            <span className="font-bold">{thread.viewCount}</span>
            <span className="text-slate-500">lượt xem</span>
          </div>
        </div>
      </article>

      {/* Comments section - add pb for fixed comment bar */}
      <section className="mt-6 pb-24">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Bình luận ({thread.commentCount})
        </h2>

        {/* Comments list */}
        {loadingComments && comments.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-8 h-8 bg-slate-700 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-700 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p>Chưa có bình luận nào</p>
            {isAuthenticated && (
              <p className="text-sm mt-1">Hãy là người đầu tiên bình luận!</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={(id, username) => setReplyingTo({ id, username })}
                onLike={handleLikeComment}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        )}

        {/* Load more comments */}
        {hasMore && (
          <div className="mt-4 text-center">
            <button
              onClick={() => fetchComments(nextCursor || undefined)}
              className="px-6 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 
                         rounded-lg transition-colors"
            >
              Xem thêm bình luận
            </button>
          </div>
        )}
      </section>

      {/* Comment form - Fixed at bottom with sidebar offset */}
      {isAuthenticated && thread.status !== ThreadStatus.LOCKED && (
        <div className="fixed bottom-0 left-0 md:left-72 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-700/50 p-4 z-40">
          <form onSubmit={handleSubmitComment} className="max-w-4xl mx-auto">
            {replyingTo && (
              <div className="flex items-center gap-2 mb-2 text-sm">
                <div className="flex-1 bg-slate-800/50 border-l-2 border-amber-500/50 px-3 py-1 rounded-r">
                  <span className="text-amber-400">@{replyingTo.username}</span>
                  <span className="text-slate-500"> đã viết:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  ✕
                </button>
              </div>
            )}
            
            {/* Media preview */}
            {commentMediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {commentMediaUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <img src={url} alt="" className="h-16 w-16 object-cover rounded-lg border border-slate-600" />
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
            
            <div className="flex gap-3">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {/* Upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg
                           hover:bg-slate-700 hover:border-green-500/50 transition-colors
                           disabled:opacity-50"
                title="Thêm ảnh"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
                ) : (
                  <Image className="w-5 h-5 text-green-400" />
                )}
              </button>
              
              <input
                type="text"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder={replyingTo ? `Trả lời @${replyingTo.username}...` : 'Viết bình luận...'}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg
                           focus:outline-none focus:border-amber-500 text-slate-100"
                maxLength={5000}
              />
              <button
                type="submit"
                disabled={submitting || (!commentContent.trim() && commentMediaUrls.length === 0)}
                className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 
                           hover:from-amber-400 hover:to-orange-400 text-slate-900 
                           font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {submitting ? '...' : 'Gửi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Show message if thread is locked */}
      {thread.status === ThreadStatus.LOCKED && (
        <div className="fixed bottom-0 left-0 md:left-72 right-0 bg-slate-900/95 backdrop-blur 
                        border-t border-slate-700/50 p-4 text-center text-slate-400 z-40">
          🔒 Chủ đề này đã bị khóa, không thể bình luận thêm
        </div>
      )}
    </div>
  );
};

export default ForumThreadPage;
