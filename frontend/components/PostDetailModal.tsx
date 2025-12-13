import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageCircle, Share2, X, Loader2, Send, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/authContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Types
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
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  created_at: string;
}

interface CommentAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  author: CommentAuthor;
  content: string;
  mentions: string[];
  parent_id: string | null;
  reply_to_user_id: string | null;
  reply_to_username: string | null;
  like_count: number;
  reply_count: number;
  is_liked: boolean;
  created_at: string;
}

interface FriendForMention {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface PostDetailModalProps {
  post: FeedPost;
  isOpen: boolean;
  onClose: () => void;
  onPostUpdate?: (post: FeedPost) => void;
}

// Format timestamp
const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  if (diffHour < 24) return `${diffHour} giờ`;
  if (diffDay < 7) return `${diffDay} ngày`;
  return date.toLocaleDateString('vi-VN');
};

// Parse mentions in content and return JSX with clickable mentions
const renderContentWithMentions = (
  content: string, 
  friends: FriendForMention[],
  userMapping: Map<string, string>
): React.ReactNode => {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      const username = part.slice(1);
      // First try userMapping (includes comment authors), then friends list
      let userId = userMapping.get(username);
      if (!userId) {
        const mentionedUser = friends.find(f => f.username === username);
        userId = mentionedUser?.id;
      }
      // Link to user ID if found, otherwise don't link (can't resolve)
      const profileLink = userId ? `#profile/${userId}` : null;
      
      if (profileLink) {
        return (
          <a
            key={index}
            href={profileLink}
            className="text-blue-400 hover:underline font-semibold"
          >
            {part}
          </a>
        );
      }
      // No link if we can't resolve the user ID
      return <span key={index} className="text-blue-400 font-semibold">{part}</span>;
    }
    return part;
  });
};

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  isOpen,
  onClose,
  onPostUpdate,
}) => {
  const { user, token } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, Comment[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  
  // Local post state for like updates
  const [localPost, setLocalPost] = useState(post);
  
  // Mention autocomplete state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [friends, setFriends] = useState<FriendForMention[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<FriendForMention[]>([]);
  
  // User mapping for mention lookups (username -> user id)
  const [userMapping, setUserMapping] = useState<Map<string, string>>(new Map());
  
  const inputRef = useRef<HTMLInputElement>(null);
  const commentsContainerRef = useRef<HTMLDivElement>(null);

  // Sync localPost with prop changes
  useEffect(() => {
    setLocalPost(post);
  }, [post]);

  // Fetch comments when modal opens
  useEffect(() => {
    if (isOpen && post.id) {
      fetchComments();
      fetchFriends();
    }
  }, [isOpen, post.id]);

  // Auto-focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      setCommentContent(`@${replyingTo.username} `);
      inputRef.current.focus();
    }
  }, [replyingTo]);

  // Filter friends for mention dropdown
  useEffect(() => {
    if (mentionSearch) {
      const filtered = friends.filter(f => 
        f.username.toLowerCase().includes(mentionSearch.toLowerCase())
      );
      setFilteredFriends(filtered);
    } else {
      setFilteredFriends(friends);
    }
  }, [mentionSearch, friends]);

  const fetchComments = async () => {
    if (!token) return;
    setIsLoadingComments(true);
    try {
      const response = await fetch(`${API_URL}/posts/${post.id}/comments`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        const commentsData = result.data || [];
        setComments(commentsData);
        
        // Build user mapping from comment authors for mention lookups
        const newMapping = new Map(userMapping);
        commentsData.forEach((comment: Comment) => {
          if (comment.author?.username && comment.author?.id) {
            newMapping.set(comment.author.username, comment.author.id);
          }
        });
        setUserMapping(newMapping);
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const fetchFriends = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/friends`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        const friendsData = result.data || [];
        setFriends(friendsData);
        
        // Also add friends to user mapping
        const newMapping = new Map(userMapping);
        friendsData.forEach((friend: FriendForMention) => {
          if (friend.username && friend.id) {
            newMapping.set(friend.username, friend.id);
          }
        });
        setUserMapping(newMapping);
      }
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    }
  };

  // Handle post like
  const handleLikePost = async () => {
    if (!token) return;
    
    const method = localPost.is_liked ? 'DELETE' : 'POST';
    try {
      const response = await fetch(`${API_URL}/posts/${localPost.id}/like`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const updatedPost = { ...localPost, like_count: data.like_count, is_liked: data.is_liked };
        setLocalPost(updatedPost);
        // Notify parent to update
        if (onPostUpdate) {
          onPostUpdate(updatedPost);
        }
      }
    } catch (err) {
      console.error('Like post failed:', err);
    }
  };

  const fetchReplies = async (commentId: string) => {
    if (!token || loadingReplies[commentId]) return;
    
    setLoadingReplies(prev => ({ ...prev, [commentId]: true }));
    try {
      const response = await fetch(`${API_URL}/comments/${commentId}/replies`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        setExpandedReplies(prev => ({ ...prev, [commentId]: result.data || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch replies:', err);
    } finally {
      setLoadingReplies(prev => ({ ...prev, [commentId]: false }));
    }
  };

  const handleSubmitComment = async () => {
    if (!commentContent.trim() || !token || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      // Extract mentions from content
      const mentionMatches = commentContent.match(/@(\w+)/g) || [];
      const mentionedUsernames = mentionMatches.map(m => m.slice(1));
      const mentionedUserIds = friends
        .filter(f => mentionedUsernames.includes(f.username))
        .map(f => f.id);
      
      const body: any = {
        content: commentContent,
        mentions: mentionedUserIds,
      };
      
      if (replyingTo) {
        body.parent_id = replyingTo.commentId;
        // Find the user being replied to
        const replyToUser = friends.find(f => f.username === replyingTo.username);
        if (replyToUser) {
          body.reply_to_user_id = replyToUser.id;
        }
      }

      const response = await fetch(`${API_URL}/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const result = await response.json();
        const newComment = result.data;
        
        if (replyingTo) {
          // Add to expanded replies
          setExpandedReplies(prev => ({
            ...prev,
            [replyingTo.commentId]: [newComment, ...(prev[replyingTo.commentId] || [])],
          }));
          // Update reply count on parent comment
          setComments(prev => prev.map(c => 
            c.id === replyingTo.commentId 
              ? { ...c, reply_count: c.reply_count + 1 }
              : c
          ));
        } else {
          // Add to root comments
          setComments(prev => [newComment, ...prev]);
        }
        
        // Update post comment count
        if (onPostUpdate) {
          onPostUpdate({ ...post, comment_count: post.comment_count + 1 });
        }
        
        setCommentContent('');
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string, isLiked: boolean, isReply: boolean = false, parentId?: string) => {
    if (!token) return;
    
    const method = isLiked ? 'DELETE' : 'POST';
    try {
      const response = await fetch(`${API_URL}/comments/${commentId}/like`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (isReply && parentId) {
          setExpandedReplies(prev => ({
            ...prev,
            [parentId]: prev[parentId]?.map(c =>
              c.id === commentId
                ? { ...c, like_count: result.like_count, is_liked: result.is_liked }
                : c
            ) || [],
          }));
        } else {
          setComments(prev => prev.map(c =>
            c.id === commentId
              ? { ...c, like_count: result.like_count, is_liked: result.is_liked }
              : c
          ));
        }
      }
    } catch (err) {
      console.error('Failed to like comment:', err);
    }
  };

  const handleDeleteComment = async (commentId: string, isReply: boolean = false, parentId?: string) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        if (isReply && parentId) {
          setExpandedReplies(prev => ({
            ...prev,
            [parentId]: prev[parentId]?.filter(c => c.id !== commentId) || [],
          }));
          // Update reply count
          setComments(prev => prev.map(c =>
            c.id === parentId
              ? { ...c, reply_count: Math.max(0, c.reply_count - 1) }
              : c
          ));
        } else {
          // Remove root comment and its replies from count
          const comment = comments.find(c => c.id === commentId);
          const deletedCount = 1 + (comment?.reply_count || 0);
          setComments(prev => prev.filter(c => c.id !== commentId));
          
          if (onPostUpdate) {
            onPostUpdate({ ...post, comment_count: Math.max(0, post.comment_count - deletedCount) });
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setCommentContent(value);
    
    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show dropdown if there's no space after @
      if (!textAfterAt.includes(' ')) {
        setShowMentionDropdown(true);
        setMentionStartIndex(lastAtIndex);
        setMentionSearch(textAfterAt);
        return;
      }
    }
    
    setShowMentionDropdown(false);
    setMentionSearch('');
  };

  const handleSelectMention = (friend: FriendForMention) => {
    const beforeMention = commentContent.slice(0, mentionStartIndex);
    const afterMention = commentContent.slice(mentionStartIndex + mentionSearch.length + 1);
    setCommentContent(`${beforeMention}@${friend.username} ${afterMention}`);
    setShowMentionDropdown(false);
    setMentionSearch('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      handleSubmitComment();
    }
    if (e.key === 'Escape') {
      if (showMentionDropdown) {
        setShowMentionDropdown(false);
      } else if (replyingTo) {
        setReplyingTo(null);
        setCommentContent('');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <div className="w-10" />
          <h2 className="text-lg font-bold text-white">Bài viết của {post.author.username}</h2>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto" ref={commentsContainerRef}>
          {/* Post Content */}
          <div className="p-4 border-b border-slate-700">
            {/* Author */}
            <div className="flex items-center gap-3 mb-3">
              <a href={`#profile/${post.author.id}`}>
                <img 
                  src={post.author.avatar_url || 'https://via.placeholder.com/48'} 
                  alt={post.author.username}
                  className="w-10 h-10 rounded-full object-cover border border-slate-600"
                />
              </a>
              <div>
                <a href={`#profile/${post.author.id}`} className="font-semibold text-white hover:underline">
                  {post.author.username}
                </a>
                <p className="text-slate-500 text-xs">{formatTime(post.created_at)}</p>
              </div>
            </div>
            
            {/* Content */}
            <p className="text-slate-200 mb-3 whitespace-pre-wrap">{post.content}</p>
            
            {/* Media */}
            {post.media.length > 0 && (
              <div className={`grid gap-2 mb-3 ${post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {post.media.map((item, index) => (
                  <div key={index}>
                    {item.type === 'image' ? (
                      <img src={item.url} alt="" className="w-full rounded-lg object-cover max-h-80" />
                    ) : (
                      <video src={item.url} controls className="w-full rounded-lg max-h-80" />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Stats */}
            <div className="flex items-center justify-between text-sm text-slate-400 py-2 border-y border-slate-700/50">
              <span>{localPost.like_count} lượt thích</span>
              <span>{localPost.comment_count} bình luận</span>
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-around py-2">
              <button 
                onClick={handleLikePost}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  localPost.is_liked ? 'text-gold-400' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Heart className={`w-5 h-5 ${localPost.is_liked ? 'fill-gold-400' : ''}`} />
                <span>Thích</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors">
                <MessageCircle className="w-5 h-5" />
                <span>Bình luận</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors">
                <Share2 className="w-5 h-5" />
                <span>Chia sẻ</span>
              </button>
            </div>
          </div>

          {/* Comments Section */}
          <div className="p-4">
            {isLoadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Chưa có bình luận nào</p>
            ) : (
              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id}>
                    {/* Root Comment */}
                    <div className="flex gap-3">
                      <a href={`#profile/${comment.author.id}`}>
                        <img 
                          src={comment.author.avatar_url || 'https://via.placeholder.com/40'}
                          alt={comment.author.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      </a>
                      <div className="flex-1">
                        <div className="bg-slate-800 rounded-2xl px-3 py-2 inline-block">
                          <a href={`#profile/${comment.author.id}`} className="font-semibold text-white text-sm hover:underline">
                            {comment.author.username}
                          </a>
                          <p className="text-slate-200 text-sm">
                            {renderContentWithMentions(comment.content, friends, userMapping)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 mt-1 ml-1 text-xs">
                          <span className="text-slate-500">{formatTime(comment.created_at)}</span>
                          <button 
                            onClick={() => handleLikeComment(comment.id, comment.is_liked)}
                            className={`font-semibold ${comment.is_liked ? 'text-gold-400' : 'text-slate-400 hover:text-slate-300'}`}
                          >
                            Thích
                          </button>
                          <button 
                            onClick={() => setReplyingTo({ commentId: comment.id, username: comment.author.username })}
                            className="font-semibold text-slate-400 hover:text-slate-300"
                          >
                            Trả lời
                          </button>
                          {comment.like_count > 0 && (
                            <span className="text-slate-400">
                              <Heart className="w-3 h-3 inline fill-gold-400 text-gold-400" /> {comment.like_count}
                            </span>
                          )}
                          {comment.author_id === user?.id && (
                            <button 
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-slate-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {/* Replies */}
                        {comment.reply_count > 0 && (
                          <div className="mt-2">
                            {!expandedReplies[comment.id] ? (
                              <button 
                                onClick={() => fetchReplies(comment.id)}
                                className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1"
                                disabled={loadingReplies[comment.id]}
                              >
                                {loadingReplies[comment.id] ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>Xem {comment.reply_count} phản hồi</>
                                )}
                              </button>
                            ) : (
                              <div className="space-y-3 mt-2">
                                {expandedReplies[comment.id]?.map(reply => (
                                  <div key={reply.id} className="flex gap-2 ml-2">
                                    <a href={`#profile/${reply.author.id}`}>
                                      <img 
                                        src={reply.author.avatar_url || 'https://via.placeholder.com/32'}
                                        alt={reply.author.username}
                                        className="w-6 h-6 rounded-full object-cover"
                                      />
                                    </a>
                                    <div className="flex-1">
                                      <div className="bg-slate-800 rounded-2xl px-3 py-2 inline-block">
                                        <a href={`#profile/${reply.author.id}`} className="font-semibold text-white text-sm hover:underline">
                                          {reply.author.username}
                                        </a>
                                        <p className="text-slate-200 text-sm">
                                          {renderContentWithMentions(reply.content, friends, userMapping)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-3 mt-1 ml-1 text-xs">
                                        <span className="text-slate-500">{formatTime(reply.created_at)}</span>
                                        <button 
                                          onClick={() => handleLikeComment(reply.id, reply.is_liked, true, comment.id)}
                                          className={`font-semibold ${reply.is_liked ? 'text-gold-400' : 'text-slate-400 hover:text-slate-300'}`}
                                        >
                                          Thích
                                        </button>
                                        <button 
                                          onClick={() => setReplyingTo({ commentId: comment.id, username: reply.author.username })}
                                          className="font-semibold text-slate-400 hover:text-slate-300"
                                        >
                                          Trả lời
                                        </button>
                                        {reply.like_count > 0 && (
                                          <span className="text-slate-400">
                                            <Heart className="w-3 h-3 inline fill-gold-400 text-gold-400" /> {reply.like_count}
                                          </span>
                                        )}
                                        {reply.author_id === user?.id && (
                                          <button 
                                            onClick={() => handleDeleteComment(reply.id, true, comment.id)}
                                            className="text-slate-500 hover:text-red-400"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment Input */}
        <div className="p-4 border-t border-slate-700 shrink-0">
          {replyingTo && (
            <div className="flex items-center gap-2 mb-2 text-sm text-slate-400">
              <span>Đang trả lời <span className="text-blue-400">@{replyingTo.username}</span></span>
              <button 
                onClick={() => {
                  setReplyingTo(null);
                  setCommentContent('');
                }}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 relative">
            <img 
              src={user?.avatar_url || 'https://via.placeholder.com/40'}
              alt={user?.username}
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={commentContent}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Bình luận dưới tên ${user?.username}...`}
                className="w-full bg-slate-800 rounded-full px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500/50"
              />
              
              {/* Mention Dropdown */}
              {showMentionDropdown && filteredFriends.length > 0 && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredFriends.map(friend => (
                    <button
                      key={friend.id}
                      onClick={() => handleSelectMention(friend)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 transition-colors"
                    >
                      <img 
                        src={friend.avatar_url || 'https://via.placeholder.com/32'}
                        alt={friend.username}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <span className="text-white text-sm">{friend.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSubmitComment}
              disabled={!commentContent.trim() || isSubmitting}
              className="w-8 h-8 flex items-center justify-center text-gold-500 hover:text-gold-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetailModal;
