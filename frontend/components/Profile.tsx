import React, { useRef, useState, useEffect } from 'react';
import { useAuth, AuthUser } from '../contexts/authContext';
import { Target, Shield, Hexagon, Camera, Loader, UserPlus, UserMinus, Clock, Check, Users, FileText, Loader2, Edit } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PostCard, FeedPost } from './PostCard';
import { PostDetailModal } from './PostDetailModal';
import { SharePostModal } from './SharePostModal';
import { EditProfileModal } from './EditProfileModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Rank display mapping
const RANK_DISPLAY: Record<string, string> = {
  BRONZE: 'Đồng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  PLATINUM: 'Bạch Kim',
  DIAMOND: 'Kim Cương',
  VETERAN: 'Tinh Anh',
  MASTER: 'Cao Thủ',
  CONQUEROR: 'Thách Đấu',
};

// Role display mapping
const ROLE_DISPLAY: Record<string, string> = {
  TOP: 'Đường Caesar',
  JUNGLE: 'Rừng',
  MID: 'Đường Giữa',
  AD: 'Xạ Thủ',
  SUPPORT: 'Trợ Thủ',
};

interface FriendshipStatus {
  status: string | null;
  is_friend: boolean;
  friendship_id: string | null;
  is_requester: boolean;
}

interface ProfileProps {
  userId?: string; // Optional: if provided, show that user's profile
}

export const Profile: React.FC<ProfileProps> = ({ userId }) => {
  const { user: currentUser, token, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [friendCount, setFriendCount] = useState(0);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus | null>(null);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const [profileUser, setProfileUser] = useState<AuthUser | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'posts'>('profile');

  // Posts state
  const [userPosts, setUserPosts] = useState<FeedPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [postToShare, setPostToShare] = useState<FeedPost | null>(null);

  // Edit profile modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Determine if viewing own profile or someone else's
  const isOwnProfile = !userId || userId === currentUser?.id;
  const displayUser = isOwnProfile ? currentUser : profileUser;

  // Fetch other user's profile if needed
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (isOwnProfile || !userId) return;

      setIsLoadingProfile(true);
      try {
        const response = await fetch(`${API_URL}/auth/users/${userId}`);
        if (response.ok) {
          const data = await response.json();
          setProfileUser(data.user);
        } else {
          console.error('Failed to fetch user profile');
          setProfileUser(null);
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        setProfileUser(null);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchUserProfile();
  }, [userId, isOwnProfile]);

  // Fetch friend count
  useEffect(() => {
    const fetchFriendCount = async () => {
      if (!displayUser?.id) return;

      try {
        const targetId = isOwnProfile ? '' : `/${displayUser.id}`;
        const endpoint = isOwnProfile ? `${API_URL}/friends/count` : `${API_URL}/friends/count/${displayUser.id}`;

        const headers: Record<string, string> = {};
        if (token && isOwnProfile) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(endpoint, { headers });
        if (response.ok) {
          const data = await response.json();
          setFriendCount(data.count);
        }
      } catch (error) {
        console.error('Failed to fetch friend count:', error);
      }
    };

    fetchFriendCount();
  }, [displayUser?.id, token, isOwnProfile]);

  // Fetch friendship status with viewed user
  useEffect(() => {
    const fetchFriendshipStatus = async () => {
      if (isOwnProfile || !userId || !token) return;

      try {
        const response = await fetch(`${API_URL}/friends/status/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setFriendshipStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch friendship status:', error);
      }
    };

    fetchFriendshipStatus();
  }, [userId, token, isOwnProfile]);

  // Fetch user posts when tab changes
  useEffect(() => {
    const fetchUserPosts = async () => {
      if (activeTab !== 'posts' || !displayUser?.id || !token) return;

      setIsLoadingPosts(true);
      try {
        const response = await fetch(`${API_URL}/posts/user/${displayUser.id}?limit=10`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setUserPosts(data.data);
          setPostsNextCursor(data.next_cursor);
          setHasMorePosts(data.has_more);
        }
      } catch (error) {
        console.error('Failed to fetch user posts:', error);
      } finally {
        setIsLoadingPosts(false);
      }
    };

    fetchUserPosts();
  }, [activeTab, displayUser?.id, token]);

  // Handle friend actions
  const handleSendFriendRequest = async () => {
    if (!userId || !token) return;
    setIsFriendActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/friends/request/${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setFriendshipStatus({
          status: 'PENDING',
          is_friend: false,
          friendship_id: (await response.json()).friendship_id,
          is_requester: true,
        });
      }
    } catch (error) {
      console.error('Failed to send friend request:', error);
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!friendshipStatus?.friendship_id || !token) return;
    setIsFriendActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/friends/respond/${friendshipStatus.friendship_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accept: true }),
      });

      if (response.ok) {
        setFriendshipStatus({
          ...friendshipStatus,
          status: 'ACCEPTED',
          is_friend: true,
        });
        setFriendCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!userId || !token) return;
    setIsFriendActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/friends/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setFriendshipStatus({
          status: null,
          is_friend: false,
          friendship_id: null,
          is_requester: false,
        });
        setFriendCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to remove friend:', error);
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  // Handle post like
  const handleLike = async (postId: string, isLiked: boolean) => {
    if (!token) return;

    const method = isLiked ? 'DELETE' : 'POST';
    try {
      const response = await fetch(`${API_URL}/posts/${postId}/like`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUserPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, like_count: data.like_count, is_liked: data.is_liked }
            : post
        ));
        // Update selected post if it's open
        if (selectedPost?.id === postId) {
          setSelectedPost(prev => prev ? { ...prev, like_count: data.like_count, is_liked: data.is_liked } : null);
        }
      }
    } catch (err) {
      console.error('Like action failed:', err);
    }
  };

  const openPostDetail = (post: FeedPost) => {
    setSelectedPost(post);
  };

  const closePostDetail = () => {
    setSelectedPost(null);
  };

  const handlePostUpdate = (updatedPost: FeedPost) => {
    setUserPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    setSelectedPost(updatedPost);
  };

  // Calculate chart data based on user's win rate
  const winRate = displayUser?.win_rate || 50;
  const totalMatches = displayUser?.total_matches || 0;
  const wins = Math.round((winRate / 100) * totalMatches);
  const losses = totalMatches - wins;

  const data = [
    { name: 'Thắng', value: wins || 50 },
    { name: 'Thua', value: losses || 50 },
  ];
  const COLORS = ['#f59e0b', '#334155'];

  const handleAvatarClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);

    try {
      // Step 1: Upload image to ImgBB via backend
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await fetch(`${API_URL}/auth/upload-image`, {
        method: 'POST',
        body: formData,
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadResult.success) {
        throw new Error('Upload failed');
      }

      // Step 2: Update user avatar
      const avatarResponse = await fetch(`${API_URL}/auth/me/avatar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_url: uploadResult.url }),
      });

      const avatarResult = await avatarResponse.json();

      if (avatarResponse.ok && avatarResult.success) {
        updateUser({ avatar_url: avatarResult.avatar_url });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Render friend action button
  const renderFriendButton = () => {
    if (isOwnProfile || !currentUser) return null;

    if (isFriendActionLoading) {
      return (
        <button className="bg-slate-700 text-slate-400 font-bold py-2 px-8 clip-hex-button uppercase tracking-wider flex items-center gap-2" disabled>
          <Loader className="w-4 h-4 animate-spin" />
          Đang xử lý...
        </button>
      );
    }

    if (!friendshipStatus || !friendshipStatus.status) {
      // No relationship - show Add Friend button
      return (
        <button
          onClick={handleSendFriendRequest}
          className="bg-slate-800 hover:bg-gold-500 hover:text-slate-900 border border-gold-500 text-gold-500 font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Kết bạn
        </button>
      );
    }

    if (friendshipStatus.status === 'PENDING') {
      if (friendshipStatus.is_requester) {
        // Current user sent the request - show Pending/Cancel
        return (
          <button
            onClick={handleRemoveFriend}
            className="bg-slate-800 hover:bg-red-600 border border-slate-600 text-slate-400 hover:text-white font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            Đã gửi lời mời
          </button>
        );
      } else {
        // Other user sent the request - show Accept button
        return (
          <button
            onClick={handleAcceptFriendRequest}
            className="bg-green-600 hover:bg-green-500 border border-green-400 text-white font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Chấp nhận lời mời
          </button>
        );
      }
    }

    if (friendshipStatus.status === 'ACCEPTED') {
      // Already friends - show Unfriend button
      return (
        <button
          onClick={handleRemoveFriend}
          className="bg-slate-800 hover:bg-red-600 border border-cyan-500 text-cyan-400 hover:text-white hover:border-red-500 font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider flex items-center gap-2"
        >
          <UserMinus className="w-4 h-4" />
          Hủy kết bạn
        </button>
      );
    }

    return null;
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Đang tải...</div>
      </div>
    );
  }

  if (!displayUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 md:pb-8 w-full animate-fade-in pt-6">

      {/* Banner / Header */}
      <div className="relative mb-8 group">
        {/* Background Banner */}
        <div className="h-48 w-full bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-t-none border-b-4 border-gold-500 relative overflow-hidden clip-angled">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-gold-500/10 to-transparent transform skew-x-12 translate-x-20"></div>
        </div>

        {/* User Info Overlay */}
        <div className="px-6 md:px-10 relative -mt-16 flex flex-col md:flex-row items-end gap-6">
          {/* Avatar with Hexagon Frame - Clickable for upload (only own profile) */}
          <div
            className={`relative w-36 h-36 flex-shrink-0 mx-auto md:mx-0 ${isOwnProfile ? 'cursor-pointer' : ''} group/avatar`}
            onClick={handleAvatarClick}
          >
            {isOwnProfile && (
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
              />
            )}
            <div className="absolute inset-0 bg-slate-900 clip-hex-button transform scale-105"></div>
            <img
              src={displayUser.avatar_url || 'https://via.placeholder.com/200?text=Avatar'}
              alt={displayUser.username}
              className="w-full h-full object-cover clip-hex-button border-2 border-gold-500 relative z-10"
            />
            {/* Upload overlay - only for own profile */}
            {isOwnProfile && (
              <div className="absolute inset-0 bg-black/60 clip-hex-button opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center z-20">
                {isUploading ? (
                  <Loader className="w-8 h-8 text-gold-500 animate-spin" />
                ) : (
                  <Camera className="w-8 h-8 text-gold-500" />
                )}
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-slate-900 p-1 z-20">
              <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider border border-red-400">
                LV.{displayUser.level || 1}
              </div>
            </div>
          </div>

          {/* Name & Title */}
          <div className="flex-1 text-center md:text-left mb-2 w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-display font-bold text-white tracking-tight uppercase drop-shadow-md">
                  {displayUser.username}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-3 mt-1">
                  <span className="text-slate-400 text-sm font-mono bg-slate-800 px-2 py-0.5 rounded-sm border border-slate-700">
                    UID: {displayUser.id.slice(0, 8)}
                  </span>
                  <span className="text-gold-400 text-sm font-bold flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Server Mặt Trời
                  </span>
                </div>
              </div>

              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="bg-slate-800 hover:bg-gold-500 hover:text-slate-900 border border-gold-500 text-gold-500 font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Chỉnh sửa
                </button>
              ) : (
                renderFriendButton()
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Bạn Bè', value: friendCount.toString(), color: 'text-cyan-400', sub: 'Friends', icon: Users },
          { label: 'Xếp Hạng', value: displayUser.rank ? RANK_DISPLAY[displayUser.rank] || displayUser.rank : 'Chưa xếp hạng', color: 'text-purple-400', sub: 'Mùa 24' },
          { label: 'Vị Trí', value: displayUser.main_role ? ROLE_DISPLAY[displayUser.main_role] || displayUser.main_role : 'Chưa chọn', color: 'text-blue-400', sub: 'Chuyên Gia' },
          { label: 'Tỉ Lệ Thắng', value: `${displayUser.win_rate?.toFixed(1) || 0}%`, color: 'text-green-400', sub: 'Thượng thừa' },
          { label: 'Số Trận', value: displayUser.total_matches?.toLocaleString() || '0', color: 'text-white', sub: 'Total Games' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-slate-900/80 p-4 border border-slate-700 clip-angled relative overflow-hidden group hover:border-gold-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Hexagon className="w-12 h-12 text-white" />
            </div>
            <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">{stat.label}</div>
            <div className={`font-display font-bold text-2xl ${stat.color} glow-text`}>{stat.value}</div>
            <div className="text-slate-600 text-[10px] mt-1 font-mono">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'profile'
              ? 'border-gold-500 text-gold-500'
              : 'border-transparent text-slate-400 hover:text-white'
            }`}
        >
          <Shield className="w-4 h-4" />
          Hồ sơ
        </button>
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'posts'
              ? 'border-gold-500 text-gold-500'
              : 'border-transparent text-slate-400 hover:text-white'
            }`}
        >
          <FileText className="w-4 h-4" />
          Bài viết
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <>
          {/* Winrate Chart Module */}
          <div className="bg-slate-900 border border-slate-800 clip-angled p-6 relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-50"></div>
            <h3 className="text-lg font-display font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Target className="w-5 h-5 text-gold-500" /> THỐNG KÊ MÙA GIẢI
            </h3>
            <div className="flex items-center gap-8">
              <div className="h-40 w-40 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      stroke="none"
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-white">{winRate.toFixed(0)}%</span>
                  <span className="text-[10px] text-slate-500 uppercase">Winrate</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-gold-500 rounded-sm"></div> Chiến Thắng</span>
                  <span className="text-white font-bold font-mono">{wins}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-slate-700 rounded-sm"></div> Thất Bại</span>
                  <span className="text-white font-bold font-mono">{losses}</span>
                </div>
                <div className="h-px bg-slate-800 my-2"></div>
                <div className="text-xs text-slate-500 text-center italic">
                  {winRate >= 55 ? '"Phong độ đang rất cao!"' : winRate >= 50 ? '"Tiếp tục cố gắng!"' : '"Đừng bỏ cuộc, chiến binh!"'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'posts' && (
        <div className="space-y-4">
          {isLoadingPosts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gold-500 animate-spin" />
            </div>
          ) : userPosts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg">Chưa có bài viết nào</p>
              <p className="text-sm mt-1">
                {isOwnProfile ? 'Hãy chia sẻ điều gì đó với cộng đồng!' : `${displayUser.username} chưa đăng bài viết nào.`}
              </p>
            </div>
          ) : (
            userPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onOpenComments={openPostDetail}
                onShare={(post) => setPostToShare(post)}
              />
            ))
          )}
        </div>
      )}

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
            setUserPosts(prev => [newPost, ...prev]);
            setPostToShare(null);
          }}
          token={token}
        />
      )}

      {/* Edit Profile Modal */}
      {isOwnProfile && currentUser && token && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={currentUser}
          token={token}
          onProfileUpdate={(updatedUser) => {
            updateUser(updatedUser);
          }}
        />
      )}
    </div>
  );
};