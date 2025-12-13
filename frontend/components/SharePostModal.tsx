import React, { useState } from 'react';
import { X, Share2, Loader2 } from 'lucide-react';
import { FeedPost } from './PostCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

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

interface SharePostModalProps {
  post: FeedPost;
  isOpen: boolean;
  onClose: () => void;
  onShareComplete: (newPost: FeedPost) => void;
  token: string | null;
}

export const SharePostModal: React.FC<SharePostModalProps> = ({
  post,
  isOpen,
  onClose,
  onShareComplete,
  token,
}) => {
  const [caption, setCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Get the post to display (original if this is already a share)
  const displayPost = post.shared_post || post;

  const handleShare = async () => {
    if (!token) return;
    
    setIsSubmitting(true);
    try {
      // If sharing a shared post, we need to share the original
      const postIdToShare = post.shared_post ? post.shared_post.id : post.id;
      
      const response = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: caption.trim(),
          media: [],
          shared_post_id: postIdToShare,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onShareComplete(data.data);
        onClose();
        setCaption('');
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 w-full max-w-lg rounded-lg border border-slate-700 shadow-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Chia sẻ bài viết</h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Caption Input */}
        <div className="p-4">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Viết gì đó về bài viết này..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:border-gold-500 transition-colors"
            rows={3}
          />
        </div>

        {/* Post Preview */}
        <div className="px-4 pb-4">
          <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
            {/* Original Author Header */}
            <div className="flex items-center gap-3 p-3 border-b border-slate-700/50">
              <img 
                src={displayPost.author.avatar_url || 'https://via.placeholder.com/40'} 
                alt={displayPost.author.username}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div>
                <p className="font-semibold text-white text-sm">{displayPost.author.username}</p>
                <p className="text-xs text-slate-500">{formatTime(displayPost.created_at)}</p>
              </div>
            </div>
            
            {/* Post Content */}
            {displayPost.content && (
              <div className="p-3 text-slate-300 text-sm">
                {displayPost.content.length > 200 
                  ? displayPost.content.slice(0, 200) + '...' 
                  : displayPost.content
                }
              </div>
            )}
            
            {/* Media Preview */}
            {displayPost.media && displayPost.media.length > 0 && (
              <div className="px-3 pb-3">
                {displayPost.media[0].type === 'image' ? (
                  <img 
                    src={displayPost.media[0].url} 
                    alt="" 
                    className="w-full h-40 object-cover rounded"
                  />
                ) : (
                  <video 
                    src={displayPost.media[0].url} 
                    className="w-full h-40 object-cover rounded"
                  />
                )}
                {displayPost.media.length > 1 && (
                  <p className="text-xs text-slate-500 mt-1">
                    +{displayPost.media.length - 1} ảnh/video khác
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleShare}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang chia sẻ...
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                Chia sẻ ngay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePostModal;
