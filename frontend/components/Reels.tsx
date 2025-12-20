import React, { useState, useEffect, useRef } from 'react';
import { Heart, MoreVertical, AlertCircle, Plus, ChevronUp, ChevronDown, Volume2, VolumeX, PlayCircle } from 'lucide-react';
import { CreateReel } from './CreateReel';

interface ReelData {
  id: string;
  user_id: string;
  username: string;
  user_avatar?: string;
  video_url: string;
  video_raw_url?: string;  // Raw video URL (fallback when not processed)
  thumbnail_url: string;
  duration: number;
  video_processed?: boolean;  // Flag indicating video processing complete
  caption?: string;

  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_liked: boolean;
  created_at: string;
}

interface ReelFeedResponse {
  reels: ReelData[];
  has_more: boolean;
}

export const Reels: React.FC = () => {
  const [reels, setReels] = useState<ReelData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [hasMore, setHasMore] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Muted by default for autoplay

  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const isScrolling = useRef(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  // Load reels on component mount
  useEffect(() => {
    loadReels();
  }, []);

  // Play/pause videos based on current index
  useEffect(() => {
    if (reels.length === 0) return;

    Object.keys(videoRefs.current).forEach((key) => {
      const index = parseInt(key);
      const video = videoRefs.current[index];
      if (video) {
        if (index === currentIndex) {
          video.muted = isMuted; // Ensure muted state is synced
          video.play().catch(err => console.error('Play error:', err));
        } else {
          video.pause();
          video.currentTime = 0;
        }
      }
    });
  }, [currentIndex, reels, isMuted]);

  // Mark reel as viewed when it plays
  useEffect(() => {
    if (reels[currentIndex]) {
      markAsViewed(reels[currentIndex].id);
    }
  }, [currentIndex, reels]);

  const loadReels = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/reels/feed?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load reels');
      }

      const data: ReelFeedResponse = await response.json();

      // Backend automatically resamples when all reels are viewed
      setReels(data.reels);
      setHasMore(data.has_more);
    } catch (err) {
      console.error('Load reels error:', err);
      setError('Không thể tải reels. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const markAsViewed = async (reelId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${API_URL}/reels/${reelId}/view`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed: true,
        }),
      });
    } catch (err) {
      console.error('Mark viewed error:', err);
    }
  };

  const handleLike = async (reelId: string, currentlyLiked: boolean) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/reels/${reelId}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();

        // Update local state
        setReels(prev => prev.map(reel =>
          reel.id === reelId
            ? {
              ...reel,
              is_liked: result.liked,
              likes_count: result.likes_count
            }
            : reel
        ));
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  // Note: Backend automatically resamples reels when user has viewed all
  // No need for manual reset anymore

  const handleScroll = (direction: 'up' | 'down') => {
    if (isScrolling.current) return;

    isScrolling.current = true;

    if (direction === 'down' && currentIndex < reels.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (direction === 'up' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (direction === 'down' && currentIndex === reels.length - 1) {
      // Loop back to first video
      setCurrentIndex(0);
    } else if (direction === 'up' && currentIndex === 0) {
      // Loop to last video
      setCurrentIndex(reels.length - 1);
    }

    setTimeout(() => {
      isScrolling.current = false;
    }, 500);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleScroll('down');
      } else {
        handleScroll('up');
      }
    }
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      handleScroll('down');
    } else {
      handleScroll('up');
    }
  };

  // Use native wheel event listener with passive: false to prevent scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  if (isLoading && reels.length === 0) {
    return (
      <div className="h-screen md:h-[calc(100vh-3.5rem)] bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Đang tải Reels...</p>
        </div>
      </div>
    );
  }

  if (error && reels.length === 0) {
    return (
      <div className="h-screen md:h-[calc(100vh-3.5rem)] bg-black flex items-center justify-center">
        <div className="text-white text-center px-4">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="mb-4">{error}</p>
          <button
            onClick={loadReels}
            className="px-6 py-2 bg-gold-500 text-black rounded-lg font-bold hover:bg-gold-600 transition"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // Empty state when no reels available
  if (reels.length === 0) {
    return (
      <>
        {showCreateModal && (
          <CreateReel
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              loadReels();
              setCurrentIndex(0);
            }}
          />
        )}
        <div className="h-screen md:h-[calc(100vh-3.5rem)] bg-gradient-to-b from-slate-900 to-black flex items-center justify-center">
          <div className="text-white text-center px-6 max-w-md">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-gold-500/20 to-amber-500/20 rounded-full flex items-center justify-center border border-gold-500/30">
              <PlayCircle className="w-12 h-12 text-gold-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gold-400">Chưa có Reel nào</h2>
            <p className="text-slate-400 mb-6">
              Hãy là người đầu tiên chia sẻ khoảnh khắc gameplay của bạn!
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-8 py-3 bg-gradient-to-r from-gold-500 to-amber-500 text-black rounded-lg font-bold hover:from-gold-600 hover:to-amber-600 transition-all flex items-center gap-2 mx-auto"
            >
              <Plus className="w-5 h-5" />
              Tạo Reel đầu tiên
            </button>
          </div>
        </div>
      </>
    );
  }

  const currentReel = reels[currentIndex];

  return (
    <>
      {/* Create Reel Modal */}
      {showCreateModal && (
        <CreateReel
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadReels();
            setCurrentIndex(0);
          }}
        />
      )}

      <div
        ref={containerRef}
        className="h-screen md:h-[calc(100vh-3.5rem)] bg-black overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Video Container */}
        <div className="absolute inset-0 flex items-center justify-center">
          {reels.map((reel, index) => (
            <div
              key={reel.id}
              className={`absolute inset-0 transition-opacity duration-300 ${index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
            >
              <video
                ref={(el) => {
                  if (el) videoRefs.current[index] = el;
                }}
                src={reel.video_processed ? reel.video_url : (reel.video_raw_url || reel.video_url)}
                poster={reel.thumbnail_url}
                className="w-full h-full object-contain"
                loop
                playsInline
                muted={isMuted}
                onClick={() => setIsMuted(!isMuted)}
              />
            </div>
          ))}
        </div>

        {/* Overlay Content */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* Create Button (Top Right) */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="absolute top-4 right-4 bg-gradient-to-r from-gold-500 to-amber-500 text-black rounded-full p-3 shadow-lg hover:shadow-gold-500/50 hover:scale-110 transition-all pointer-events-auto group"
          >
            <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
          </button>

          {/* Right Side Actions */}
          <div className="absolute right-4 bottom-24 flex flex-col gap-6 pointer-events-auto">
            {/* User Avatar */}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 p-0.5">
                <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center">
                  <span className="text-white font-bold">
                    {currentReel.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Like Button */}
            <button
              onClick={() => handleLike(currentReel.id, currentReel.is_liked)}
              className="flex flex-col items-center gap-1"
            >
              <Heart
                className={`w-8 h-8 ${currentReel.is_liked ? 'fill-red-500 text-red-500' : 'text-white'
                  } drop-shadow-lg`}
              />
              <span className="text-white text-xs font-semibold drop-shadow-lg">
                {currentReel.likes_count}
              </span>
            </button>

            {/* Navigation Arrows */}
            <button
              onClick={() => handleScroll('up')}
              className="w-12 h-12 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-all backdrop-blur-sm"
            >
              <ChevronUp className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={() => handleScroll('down')}
              className="w-12 h-12 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-all backdrop-blur-sm"
            >
              <ChevronDown className="w-6 h-6 text-white" />
            </button>

            {/* More Button */}
            <button>
              <MoreVertical className="w-8 h-8 text-white drop-shadow-lg" />
            </button>
          </div>

          {/* Bottom Info */}
          <div className="absolute left-4 right-20 bottom-24 pointer-events-auto">
            {/* Username */}
            <div className="mb-3">
              <p className="text-white font-bold text-lg drop-shadow-lg">
                @{currentReel.username}
              </p>
            </div>

            {/* Caption */}
            {currentReel.caption && (
              <p className="text-white text-sm mb-3 drop-shadow-lg line-clamp-3">
                {currentReel.caption}
              </p>
            )}

            {/* Original Audio Indicator */}
            <div className="flex items-center gap-2 text-white/70 text-xs">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="drop-shadow-lg">Âm thanh gốc</span>
            </div>
          </div>

          {/* Scroll Hints */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-white/50 text-sm">
            ↓ Vuốt để xem tiếp
          </div>
        </div>
      </div>
    </>
  );
};

