import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Video, X, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/authContext';
import { PostDetailModal } from './PostDetailModal';
import { PostCard, FeedPost, MediaItem } from './PostCard';
import { SharePostModal } from './SharePostModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface FeedResponse {
  data: FeedPost[];
  next_cursor: string | null;
  has_more: boolean;
}

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

  // Share modal state
  const [postToShare, setPostToShare] = useState<FeedPost | null>(null);

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

  // Handle file upload - uses pre-signed URLs for videos
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !token) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      
      try {
        if (isVideo) {
          // New video upload flow: pre-signed URL -> direct S3 upload -> complete
          console.log('🎬 [Video Upload] Starting upload for:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
          
          // Step 1: Request pre-signed URL
          console.log('📝 [Step 1] Requesting pre-signed URL...');
          const requestResponse = await fetch(`${API_URL}/videos/upload-request`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filename: file.name,
              content_type: file.type,
            }),
          });

          if (!requestResponse.ok) {
            const errorText = await requestResponse.text();
            console.error('❌ [Step 1] Failed to get upload URL:', requestResponse.status, errorText);
            continue;
          }

          const { video_id, upload_url, s3_key } = await requestResponse.json();
          console.log('✅ [Step 1] Got pre-signed URL:', { video_id, s3_key });
          console.log('🔗 [Step 1] Upload URL:', upload_url.substring(0, 100) + '...');

          // Step 2: Upload directly to S3 using pre-signed URL
          console.log('☁️ [Step 2] Uploading to S3...');
          const uploadStartTime = Date.now();
          const uploadResponse = await fetch(upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type,
            },
            body: file,
          });

          const uploadDuration = Date.now() - uploadStartTime;
          
          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('❌ [Step 2] Failed to upload to S3:', uploadResponse.status, errorText);
            continue;
          }
          console.log('✅ [Step 2] S3 upload successful! Duration:', uploadDuration, 'ms');

          // Step 3: Mark upload complete to trigger processing
          console.log('🚀 [Step 3] Marking upload complete & triggering processing...');
          const completeResponse = await fetch(`${API_URL}/videos/${video_id}/complete`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (completeResponse.ok) {
            const completeData = await completeResponse.json();
            console.log('✅ [Step 3] Upload marked complete:', completeData);
            console.log('📨 [Step 3] Job pushed to RabbitMQ for processing');
            
            // Get video info for thumbnail/play URL
            console.log('📊 [Step 4] Fetching video info...');
            const videoInfo = await fetch(`${API_URL}/videos/${video_id}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            const videoData = await videoInfo.json();
            console.log('✅ [Step 4] Video info:', videoData);

            const videoUrl = videoData.play_url || upload_url.split('?')[0];
            console.log('🎥 [Final] Video URL to use:', videoUrl);
            
            setMediaItems(prev => [...prev, {
              url: videoUrl,
              type: 'video',
              thumbnail_url: videoData.thumbnail_url,
            }]);
            
            console.log('🎉 [Complete] Video upload flow finished successfully!');
          } else {
            const errorText = await completeResponse.text();
            console.error('❌ [Step 3] Failed to complete:', completeResponse.status, errorText);
          }
        } else {
          // Image upload - use existing endpoint
          const formData = new FormData();
          formData.append('image', file);

          const response = await fetch(`${API_URL}/auth/upload-image`, {
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
              type: 'image',
            }]);
          }
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

  // Handle like/unlike post
  const handleLike = async (postId: string, isCurrentlyLiked: boolean) => {
    if (!token) return;

    try {
      const method = isCurrentlyLiked ? 'DELETE' : 'POST';
      const response = await fetch(`${API_URL}/posts/${postId}/like`, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        // Update post in state
        setPosts(prev => prev.map(post => 
          post.id === postId 
            ? { ...post, like_count: result.like_count, is_liked: result.is_liked }
            : post
        ));
      }
    } catch (err) {
      console.error('Like action failed:', err);
    }
  };

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setNewPostContent('');
    setMediaItems([]);
  };

  const openPostDetail = (post: FeedPost) => {
    setSelectedPost(post);
  };

  const closePostDetail = () => {
    setSelectedPost(null);
  };

  const handlePostUpdate = (updatedPost: FeedPost) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    setSelectedPost(updatedPost);
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
      {/* Compact Create Post Trigger */}
      <div 
        onClick={openModal}
        className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 mx-4 mb-8 cursor-pointer hover:border-gold-500/50 transition-all group"
      >
        <div className="flex items-center gap-4">
          <img 
            src={user?.avatar_url || 'https://via.placeholder.com/48'} 
            alt={user?.username} 
            className="w-12 h-12 rounded-full object-cover border-2 border-slate-600 group-hover:border-gold-500/50 transition-colors" 
          />
          <div className="flex-1 bg-slate-800/50 rounded-full px-4 py-3 text-slate-500 text-sm">
            {user?.username} ơi, bạn đang nghĩ gì thế?
          </div>
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Image className="w-4 h-4 text-green-400" />
            </div>
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Create Post Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />
          
          {/* Modal Content */}
          <div className="relative bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="w-10" />
              <h2 className="text-lg font-bold text-white">Tạo bài viết</h2>
              <button 
                onClick={closeModal}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3 p-4 pb-2">
              <img 
                src={user?.avatar_url || 'https://via.placeholder.com/48'} 
                alt={user?.username} 
                className="w-10 h-10 rounded-full object-cover border border-slate-600" 
              />
              <div>
                <p className="font-semibold text-white">{user?.username}</p>
              </div>
            </div>

            {/* Textarea */}
            <div className="px-4">
              <textarea
                className="w-full bg-transparent text-white text-lg resize-none focus:outline-none placeholder-slate-500 min-h-[120px]"
                placeholder={`${user?.username} ơi, bạn đang nghĩ gì thế?`}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                autoFocus
              />
            </div>

            {/* Media Preview */}
            {mediaItems.length > 0 && (
              <div className="px-4 pb-2">
                <div className="border border-slate-700 rounded-lg p-2">
                  <div className={`grid gap-2 ${mediaItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {mediaItems.map((item, index) => (
                      <div key={index} className="relative">
                        {item.type === 'image' ? (
                          <img src={item.url} alt="" className="w-full h-32 object-cover rounded-lg" />
                        ) : (
                          <video src={item.url} className="w-full h-32 object-cover rounded-lg" />
                        )}
                        <button
                          onClick={() => removeMedia(index)}
                          className="absolute top-2 right-2 w-6 h-6 bg-slate-900/80 backdrop-blur rounded-full flex items-center justify-center hover:bg-slate-800"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Add to post toolbar */}
            <div className="mx-4 mb-4 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-slate-400">Thêm vào bài viết của bạn</span>
              <div className="flex items-center gap-2">
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
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors"
                  title="Ảnh/Video"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-gold-500 animate-spin" />
                  ) : (
                    <Image className="w-5 h-5 text-green-400" />
                  )}
                </button>
                <button 
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors"
                  title="Video"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Video className="w-5 h-5 text-purple-400" />
                </button>
              </div>
            </div>

            {/* Post Button */}
            <div className="px-4 pb-4">
              <button
                onClick={() => {
                  handlePost();
                  closeModal();
                }}
                disabled={!newPostContent.trim() || isPosting || isUploading}
                className="w-full py-3 rounded-lg font-bold text-center transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gold-500 hover:bg-gold-400 text-slate-950"
              >
                {isUploading ? 'Đang tải lên...' : isPosting ? 'Đang đăng...' : 'Đăng'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <PostCard
            key={post.id}
            post={post}
            onLike={handleLike}
            onOpenComments={openPostDetail}
            onShare={(post) => setPostToShare(post)}
          />
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isLoadingMore && (
          <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          isOpen={!!selectedPost}
          onClose={closePostDetail}
          onPostUpdate={handlePostUpdate}
        />
      )}

      {/* Share Post Modal */}
      {postToShare && (
        <SharePostModal
          post={postToShare}
          isOpen={!!postToShare}
          onClose={() => setPostToShare(null)}
          onShareComplete={(newPost) => {
            setPosts(prev => [newPost, ...prev]);
            setPostToShare(null);
          }}
          token={token}
        />
      )}
    </div>
  );
};