import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/authContext';
import { UserPlus, Users, Check, X, Loader, User, Crown, ChevronRight } from 'lucide-react';

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

interface FriendData {
  id: string;
  username: string;
  avatar_url: string | null;
  rank: string | null;
  level: number | null;
}

interface PendingRequest {
  friendship_id: string;
  requester: FriendData;
  created_at: string;
}

export const Friends: React.FC = () => {
  const { token, isAuthenticated } = useAuth();
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  // Fetch friends list
  useEffect(() => {
    const fetchFriends = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`${API_URL}/friends`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setFriends(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch friends:', error);
      } finally {
        setIsLoadingFriends(false);
      }
    };

    fetchFriends();
  }, [token]);

  // Fetch pending requests
  useEffect(() => {
    const fetchPending = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`${API_URL}/friends/pending`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setPendingRequests(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch pending requests:', error);
      } finally {
        setIsLoadingPending(false);
      }
    };

    fetchPending();
  }, [token]);

  const handleRespondToRequest = async (friendshipId: string, accept: boolean) => {
    if (!token) return;
    setRespondingTo(friendshipId);
    
    try {
      const response = await fetch(`${API_URL}/friends/respond/${friendshipId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accept }),
      });

      if (response.ok) {
        // Remove from pending list
        const acceptedRequest = pendingRequests.find(r => r.friendship_id === friendshipId);
        setPendingRequests(prev => prev.filter(r => r.friendship_id !== friendshipId));
        
        // If accepted, add to friends list
        if (accept && acceptedRequest) {
          setFriends(prev => [...prev, acceptedRequest.requester]);
        }
      }
    } catch (error) {
      console.error('Failed to respond to request:', error);
    } finally {
      setRespondingTo(null);
    }
  };

  const handleViewProfile = (userId: string) => {
    window.location.hash = `profile/${userId}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Vui lòng đăng nhập để xem danh sách bạn bè</p>
          <button 
            onClick={() => window.location.hash = 'login'}
            className="mt-4 bg-gold-500 text-slate-900 font-bold py-2 px-6 rounded hover:bg-gold-400 transition-colors"
          >
            Đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 md:pb-8 w-full animate-fade-in pt-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
          <Users className="w-8 h-8 text-gold-500" />
          BẠN BÈ
        </h1>
        <p className="text-slate-400 mt-2">Quản lý danh sách bạn bè và lời mời kết bạn</p>
      </div>

      {/* Pending Friend Requests Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-display font-bold text-white">LỜI MỜI KẾT BẠN</h2>
          {pendingRequests.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
          {isLoadingPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 text-gold-500 animate-spin" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <UserPlus className="w-10 h-10 mx-auto mb-2 text-slate-600" />
              <p>Không có lời mời kết bạn nào</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {pendingRequests.map((request) => (
                <div key={request.friendship_id} className="p-4 flex items-center gap-4 hover:bg-slate-800/50 transition-colors">
                  {/* Avatar */}
                  <div 
                    className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-700 cursor-pointer hover:border-gold-500 transition-colors"
                    onClick={() => handleViewProfile(request.requester.id)}
                  >
                    <img 
                      src={request.requester.avatar_url || 'https://via.placeholder.com/100?text=Avatar'} 
                      alt={request.requester.username}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div 
                      className="font-bold text-white truncate cursor-pointer hover:text-gold-400 transition-colors"
                      onClick={() => handleViewProfile(request.requester.id)}
                    >
                      {request.requester.username}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {request.requester.rank && (
                        <span className="flex items-center gap-1">
                          <Crown className="w-3 h-3 text-gold-500" />
                          {RANK_DISPLAY[request.requester.rank] || request.requester.rank}
                        </span>
                      )}
                      {request.requester.level && (
                        <span>Lv.{request.requester.level}</span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {respondingTo === request.friendship_id ? (
                      <Loader className="w-5 h-5 text-gold-500 animate-spin" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleRespondToRequest(request.friendship_id, true)}
                          className="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                          title="Chấp nhận"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleRespondToRequest(request.friendship_id, false)}
                          className="p-2 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white rounded-lg transition-colors"
                          title="Từ chối"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Friends List Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-gold-500" />
          <h2 className="text-lg font-display font-bold text-white">DANH SÁCH BẠN BÈ</h2>
          <span className="bg-slate-700 text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
            {friends.length}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
          {isLoadingFriends ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 text-gold-500 animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="mb-2">Chưa có bạn bè nào</p>
              <p className="text-sm">Tìm kiếm và kết bạn với những người chơi khác!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {friends.map((friend) => (
                <div 
                  key={friend.id} 
                  className="p-4 flex items-center gap-4 hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  onClick={() => handleViewProfile(friend.id)}
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-700 group-hover:border-gold-500 transition-colors">
                    <img 
                      src={friend.avatar_url || 'https://via.placeholder.com/100?text=Avatar'} 
                      alt={friend.username}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate group-hover:text-gold-400 transition-colors">
                      {friend.username}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {friend.rank && (
                        <span className="flex items-center gap-1">
                          <Crown className="w-3 h-3 text-gold-500" />
                          {RANK_DISPLAY[friend.rank] || friend.rank}
                        </span>
                      )}
                      {friend.level && (
                        <span>Lv.{friend.level}</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-gold-500 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
