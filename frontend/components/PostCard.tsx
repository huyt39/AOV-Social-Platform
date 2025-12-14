import React from 'react';
import { Heart, MessageCircle, Share2, Zap } from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';

// Types matching backend
export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  thumbnail_url?: string;
}

export interface PostAuthor {
  id: string;
  username: string;
  avatar_url: string | null;
  rank: string | null;
  level: number | null;
}

// Shared post info (embedded in FeedPost when it's a share)
export interface SharedPostInfo {
  id: string;
  author: PostAuthor;
  content: string;
  media: MediaItem[];
  created_at: string;
}

export interface FeedPost {
  id: string;
  author_id: string;
  author: PostAuthor;
  content: string;
  media: MediaItem[];
  like_count: number;
  comment_count: number;
  share_count: number;
  is_liked: boolean;
  shared_post: SharedPostInfo | null;  // Original post if this is a share
  created_at: string;
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

interface PostCardProps {
  post: FeedPost;
  onLike: (postId: string, isLiked: boolean) => void;
  onOpenComments: (post: FeedPost) => void;
  onShare?: (post: FeedPost) => void;  // Share callback
  showAuthor?: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onLike,
  onOpenComments,
  onShare,
  showAuthor = true,
}) => {
  // Check if this is a shared post
  const isSharedPost = !!post.shared_post;
  return (
    <div className="group relative bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors">
      {/* Decorative corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-gold-500"></div>
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-gold-500"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-gold-500"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-gold-500"></div>

      <div className="p-5">
        {/* Header - Author info */}
        {showAuthor && (
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
        )}

        {/* Time for no-author mode */}
        {!showAuthor && (
          <p className="text-slate-500 text-xs font-mono uppercase tracking-wider mb-3">
            {formatTime(post.created_at)}
          </p>
        )}
        
        {/* Content - Caption for shared posts, or regular content */}
        {post.content && (
          <p 
            onClick={() => onOpenComments(post)}
            className="text-slate-200 mb-4 text-sm leading-relaxed font-light whitespace-pre-wrap border-l-2 border-slate-700 pl-3 cursor-pointer hover:text-white transition-colors"
          >
            {post.content}
          </p>
        )}

        {/* Shared Post Embed (for shared posts) */}
        {isSharedPost && post.shared_post && (
          <div className="mb-4 border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
            {/* Shared post author header */}
            <div className="flex items-center gap-3 p-3 border-b border-slate-700/50">
              <a href={`#profile/${post.shared_post.author.id}`}>
                <img 
                  src={post.shared_post.author.avatar_url || 'https://via.placeholder.com/40'} 
                  alt={post.shared_post.author.username}
                  className="w-10 h-10 rounded-full object-cover border border-slate-600"
                />
              </a>
              <div>
                <a 
                  href={`#profile/${post.shared_post.author.id}`}
                  className="font-semibold text-white text-sm hover:text-gold-400 transition-colors"
                >
                  {post.shared_post.author.username}
                </a>
                <p className="text-xs text-slate-500">{formatTime(post.shared_post.created_at)}</p>
              </div>
            </div>
            
            {/* Shared post content */}
            {post.shared_post.content && (
              <div 
                className="p-3 text-slate-300 text-sm cursor-pointer hover:text-white transition-colors"
                onClick={() => onOpenComments(post)}
              >
                {post.shared_post.content}
              </div>
            )}
            
            {/* Shared post media */}
            {post.shared_post.media && post.shared_post.media.length > 0 && (
              <div className={`grid gap-1 ${post.shared_post.media.length > 1 ? 'grid-cols-2' : ''}`}>
                {post.shared_post.media.map((item, index) => (
                  <div key={index} className="relative">
                    {item.type === 'image' ? (
                      <img 
                        src={item.url} 
                        alt="" 
                        className="w-full h-48 object-cover" 
                      />
                    ) : (
                      <VideoPlayer 
                        src={item.url} 
                        poster={item.thumbnail_url}
                        className="w-full h-48"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Media (only for non-shared posts, or if sharer adds media) */}
        {!isSharedPost && post.media.length > 0 && (
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
                  <VideoPlayer 
                    src={item.url} 
                    poster={item.thumbnail_url}
                    className="w-full h-64 clip-angled"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-6 text-slate-400 border-t border-slate-800 pt-3 mt-2">
          <button 
            onClick={() => onLike(post.id, post.is_liked)}
            className={`flex items-center gap-2 transition-colors group/btn ${
              post.is_liked ? 'text-gold-400' : 'hover:text-gold-400'
            }`}
          >
            <Heart className={`w-5 h-5 group-hover/btn:scale-110 transition-transform ${
              post.is_liked ? 'fill-gold-400' : ''
            }`} />
            <span className="text-sm font-bold">{post.like_count}</span>
          </button>
          <button 
            onClick={() => onOpenComments(post)}
            className="flex items-center gap-2 hover:text-blue-400 transition-colors group/btn"
          >
            <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
            <span className="text-sm font-bold">{post.comment_count}</span>
          </button>
          <button 
            onClick={() => onShare?.(post)}
            className="flex items-center gap-2 hover:text-cyan-400 transition-colors ml-auto group/btn"
          >
            <Share2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
            {post.share_count > 0 && <span className="text-sm font-bold">{post.share_count}</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostCard;
