import React, { useState, useEffect, useCallback } from 'react';
import { Users, Clock, Trophy, ChevronLeft, ChevronRight, Filter, Settings, Plus, Eye } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { useAuth } from '../contexts/authContext';
import { TeamListItem, TeamDetail, TeamsResponse, CreateTeamInput, GameMode } from '../types';
import { TeamDetailModal } from './TeamDetailModal';
import { CreateTeamModal } from './CreateTeamModal';
import { TeamOwnerDashboard } from './TeamOwnerDashboard';

// Helper to translate rank
const translateRank = (rank?: string): string => {
   const rankMap: Record<string, string> = {
      'BRONZE': 'Đồng',
      'SILVER': 'Bạc',
      'GOLD': 'Vàng',
      'PLATINUM': 'Bạch Kim',
      'DIAMOND': 'Kim Cương',
      'VETERAN': 'Tinh Anh',
      'MASTER': 'Cao Thủ',
      'CONQUEROR': 'Thách Đấu',
   };
   return rank ? rankMap[rank] || rank : 'Chưa xác định';
};

// Helper to get remaining time
const getRemainingTime = (expiresAt: string): { text: string; urgent: boolean } => {
   const now = new Date();
   const expires = new Date(expiresAt);
   const diff = expires.getTime() - now.getTime();

   if (diff <= 0) return { text: 'Hết hạn', urgent: true };

   const minutes = Math.floor(diff / 60000);
   const seconds = Math.floor((diff % 60000) / 1000);

   return {
      text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
      urgent: minutes < 5
   };
};

const RANK_OPTIONS = [
   { value: '', label: 'Tất cả rank' },
   { value: 'BRONZE', label: 'Đồng' },
   { value: 'SILVER', label: 'Bạc' },
   { value: 'GOLD', label: 'Vàng' },
   { value: 'PLATINUM', label: 'Bạch Kim' },
   { value: 'DIAMOND', label: 'Kim Cương' },
   { value: 'VETERAN', label: 'Tinh Anh' },
   { value: 'MASTER', label: 'Cao Thủ' },
   { value: 'CONQUEROR', label: 'Thách Đấu' },
];

const PAGE_SIZE = 5;

export const LFG: React.FC = () => {
   const { token, user } = useAuth();

   // State
   const [teams, setTeams] = useState<TeamListItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [page, setPage] = useState(1);
   const [total, setTotal] = useState(0);
   const [hasMore, setHasMore] = useState(false);
   const [rankFilter, setRankFilter] = useState('');

   // Modal states
   const [showCreateModal, setShowCreateModal] = useState(false);
   const [isCreating, setIsCreating] = useState(false);
   const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
   const [showDetailModal, setShowDetailModal] = useState(false);
   const [isJoining, setIsJoining] = useState(false);
   const [loadingTeamDetail, setLoadingTeamDetail] = useState<string | null>(null);

   // My team state
   const [myTeam, setMyTeam] = useState<TeamDetail | null>(null);
   const [showMyTeamDashboard, setShowMyTeamDashboard] = useState(false);

   // Countdown refresh
   const [, setTick] = useState(0);

   // Fetch teams
   const fetchTeams = useCallback(async () => {
      if (!token) return;

      setLoading(true);
      try {
         let url = `${API_BASE_URL}/teams?page=${page}&page_size=${PAGE_SIZE}`;
         if (rankFilter) {
            url += `&rank=${rankFilter}`;
         }

         const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
         });

         if (!res.ok) throw new Error('Failed to fetch teams');

         const data: TeamsResponse = await res.json();
         setTeams(data.data);
         setTotal(data.total);
         setHasMore(data.has_more);
      } catch (err) {
         console.error('Error fetching teams:', err);
      } finally {
         setLoading(false);
      }
   }, [token, page, rankFilter]);

   // Fetch my team
   const fetchMyTeam = useCallback(async () => {
      if (!token) return;

      try {
         const res = await fetch(`${API_BASE_URL}/teams/my-team`, {
            headers: { Authorization: `Bearer ${token}` },
         });

         if (res.ok) {
            const data = await res.json();
            setMyTeam(data);
         } else {
            setMyTeam(null);
         }
      } catch (err) {
         console.error('Error fetching my team:', err);
      }
   }, [token]);

   useEffect(() => {
      fetchTeams();
      fetchMyTeam();
   }, [fetchTeams, fetchMyTeam]);

   // Update countdown every second
   useEffect(() => {
      const interval = setInterval(() => {
         setTick(t => t + 1);
      }, 1000);
      return () => clearInterval(interval);
   }, []);

   // Handlers
   const handleViewDetail = async (teamId: string) => {
      if (!token) return;

      setLoadingTeamDetail(teamId);
      try {
         const res = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
            headers: { Authorization: `Bearer ${token}` },
         });

         if (!res.ok) throw new Error('Failed to fetch team details');

         const data: TeamDetail = await res.json();
         setSelectedTeam(data);
         setShowDetailModal(true);
      } catch (err) {
         console.error('Error fetching team detail:', err);
         alert('Không thể tải thông tin team');
      } finally {
         setLoadingTeamDetail(null);
      }
   };

   const handleJoinRequest = async () => {
      if (!token || !selectedTeam) return;

      setIsJoining(true);
      try {
         const res = await fetch(`${API_BASE_URL}/teams/${selectedTeam.id}/join`, {
            method: 'POST',
            headers: {
               Authorization: `Bearer ${token}`,
               'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: '' }),
         });

         if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Failed to send join request');
         }

         // Refresh the team detail to show updated status
         const updatedRes = await fetch(`${API_BASE_URL}/teams/${selectedTeam.id}`, {
            headers: { Authorization: `Bearer ${token}` },
         });
         if (updatedRes.ok) {
            const updatedData = await updatedRes.json();
            setSelectedTeam(updatedData);
         }

         alert('Đã gửi yêu cầu tham gia!');
      } catch (err: any) {
         alert(err.message || 'Không thể gửi yêu cầu');
      } finally {
         setIsJoining(false);
      }
   };

   const handleCreateTeam = async (data: CreateTeamInput) => {
      if (!token) return;

      setIsCreating(true);
      try {
         const res = await fetch(`${API_BASE_URL}/teams`, {
            method: 'POST',
            headers: {
               Authorization: `Bearer ${token}`,
               'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
         });

         if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Failed to create team');
         }

         setShowCreateModal(false);
         fetchTeams();
         fetchMyTeam();
      } catch (err: any) {
         alert(err.message || 'Không thể tạo phòng');
      } finally {
         setIsCreating(false);
      }
   };

   const handleRankFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setRankFilter(e.target.value);
      setPage(1); // Reset to first page when filter changes
   };

   const totalPages = Math.ceil(total / PAGE_SIZE);

   // Show owner dashboard if requested
   if (showMyTeamDashboard && myTeam) {
      return (
         <TeamOwnerDashboard
            teamId={myTeam.id}
            onBack={() => {
               setShowMyTeamDashboard(false);
               fetchTeams();
               fetchMyTeam();
            }}
         />
      );
   }

   return (
      <div className="max-w-3xl mx-auto p-4 pb-24 md:pb-8 w-full pt-6">
         {/* Header */}
         <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
               <h2 className="text-3xl font-display font-bold text-white uppercase tracking-wider">Sảnh Chờ</h2>
               <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></span>
                  <p className="text-slate-400 text-sm font-mono tracking-wide">{total} phòng đang mở</p>
               </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
               {myTeam ? (
                  <button
                     onClick={() => setShowMyTeamDashboard(true)}
                     className="flex-1 md:flex-none bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 clip-angled transition-all flex items-center justify-center gap-2 border-b-2 border-slate-500 hover:border-slate-400"
                  >
                     <Settings className="w-4 h-4" />
                     Phòng của tôi
                  </button>
               ) : (
                  <button
                     onClick={() => setShowCreateModal(true)}
                     className="flex-1 md:flex-none bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold py-2 px-8 clip-hex-button shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all hover:scale-105 flex items-center justify-center gap-2"
                  >
                     <Plus className="w-4 h-4" />
                     TẠO PHÒNG
                  </button>
               )}
            </div>
         </header>

         {/* Filters */}
         <div className="flex items-center gap-4 mb-6 bg-slate-900/50 p-2 rounded border border-slate-800 backdrop-blur-sm">
            <div className="flex items-center gap-2 px-2">
               <Filter className="w-4 h-4 text-gold-500" />
               <span className="text-sm font-bold text-slate-400 uppercase mr-2">Bộ lọc:</span>
               <select
                  value={rankFilter}
                  onChange={handleRankFilterChange}
                  className="bg-slate-800 border border-slate-600 text-white px-3 py-1 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-all font-mono"
               >
                  {RANK_OPTIONS.map(opt => (
                     <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
               </select>
            </div>
         </div>

         {/* Teams List */}
         {loading ? (
            <div className="flex items-center justify-center h-64">
               <div className="relative">
                  <div className="w-12 h-12 border-4 border-slate-700 rounded-full"></div>
                  <div className="absolute top-0 left-0 w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
               </div>
            </div>
         ) : teams.length === 0 ? (
            <div className="border border-dashed border-slate-700 p-12 text-center bg-slate-900/30 backdrop-blur-sm">
               <div className="w-20 h-20 bg-slate-800/50 rounded-full mx-auto flex items-center justify-center mb-6 border border-slate-700">
                  <Users className="w-10 h-10 text-slate-500" />
               </div>
               <h3 className="text-xl font-bold font-display text-white mb-2 uppercase tracking-wide">Không tìm thấy phòng</h3>
               <p className="text-slate-400">
                  {rankFilter ? 'Thử thay đổi bộ lọc hoặc ' : ''}Hãy tạo phòng mới để tìm đồng đội!
               </p>
            </div>
         ) : (
            <div className="grid gap-4">
               {teams.map(team => {
                  const remaining = getRemainingTime(team.expires_at);
                  return (
                     <div key={team.id} className="bg-slate-900 relative border border-slate-700 hover:border-gold-500/50 transition-all group overflow-hidden shadow-lg">
                        {/* Background accent */}
                        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-slate-800/80 to-transparent skew-x-12 translate-x-12 group-hover:translate-x-6 transition-transform duration-500"></div>
                        <div className="absolute left-0 bottom-0 w-1 h-0 bg-gold-500 group-hover:h-full transition-all duration-300"></div>

                        <div className="p-5 relative z-10 flex flex-col md:flex-row gap-6">
                           {/* Left: Owner Info */}
                           <div className="flex flex-row md:flex-col items-center md:items-start gap-4 md:w-1/5 md:min-w-[150px] border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-4">
                              <div className="relative group-hover:scale-105 transition-transform">
                                 <img
                                    src={team.owner.avatar_url || 'https://via.placeholder.com/56'}
                                    alt={team.owner.username}
                                    className="w-16 h-16 object-cover bg-slate-800 clip-hex-button border-2 border-slate-600 group-hover:border-gold-500 transition-colors"
                                 />
                                 <div className="absolute -bottom-1 -right-2 bg-slate-900 text-[10px] text-gold-500 border border-gold-500 px-1.5 py-0.5 font-bold uppercase tracking-wider transform skew-x-[-10deg]">
                                    Chủ phòng
                                 </div>
                              </div>
                              <div>
                                 <h3 className="font-display font-bold text-white text-lg leading-tight truncate max-w-[150px]">{team.owner.username}</h3>
                                 {team.owner.win_rate && (
                                    <div className="text-xs font-mono text-slate-400 mt-1">
                                       WR: <span className="text-green-400 font-bold">{team.owner.win_rate.toFixed(1)}%</span>
                                    </div>
                                 )}
                                 <div className="mt-2 text-center">
                                    <span className={`inline-block text-[10px] px-2 py-0.5 border uppercase font-bold tracking-wider ${team.rank === 'DIAMOND' || team.rank === 'MASTER' || team.rank === 'CONQUEROR'
                                       ? 'bg-purple-900/30 text-purple-400 border-purple-500/50'
                                       : 'bg-slate-800 text-slate-300 border-slate-600'
                                       }`}>
                                       {translateRank(team.rank)}
                                    </span>
                                 </div>
                              </div>
                           </div>

                           {/* Middle: Team Info */}
                           <div className="flex-1 flex flex-col justify-between py-1">
                              <div>
                                 <div className="flex items-center gap-2 mb-2">
                                    <Trophy className="w-4 h-4 text-gold-500" />
                                    <span className="text-xs font-bold text-gold-500 uppercase tracking-widest">{team.game_mode}</span>
                                    {remaining.urgent && (
                                       <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-1 ml-auto animate-pulse font-bold">SẮP HẾT HẠN</span>
                                    )}
                                 </div>
                                 <h4 className="text-white font-bold text-xl mb-2 font-display tracking-wide">{team.name}</h4>
                                 <div className="relative pl-4 py-1">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-500/30"></div>
                                    <p className="text-slate-300 text-sm italic line-clamp-2 leading-relaxed">
                                       "{team.description}"
                                    </p>
                                 </div>
                              </div>

                              <div className="flex gap-6 mt-4 text-xs font-mono border-t border-slate-800/50 pt-3">
                                 <span className={`flex items-center gap-1.5 font-bold ${remaining.urgent ? 'text-red-400' : 'text-slate-400'}`}>
                                    <Clock className="w-3.5 h-3.5" />
                                    {remaining.text}
                                 </span>
                                 <span className="flex items-center gap-1.5 text-blue-400 font-bold">
                                    <Users className="w-3.5 h-3.5" />
                                    {team.current_members}/{team.max_members} SLOTS
                                 </span>
                              </div>
                           </div>

                           {/* Right: Actions */}
                           <div className="flex flex-row md:flex-col justify-end md:justify-center items-center gap-2 min-w-[140px]">
                              <button
                                 onClick={() => handleViewDetail(team.id)}
                                 disabled={loadingTeamDetail === team.id}
                                 className="flex-1 md:w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-white font-bold py-3 px-4 clip-angled transition-all text-sm flex items-center justify-center gap-2 uppercase tracking-wider group-hover:bg-slate-700"
                              >
                                 {loadingTeamDetail === team.id ? (
                                    <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                                 ) : (
                                    <>
                                       <Eye className="w-4 h-4" />
                                       CHI TIẾT
                                    </>
                                 )}
                              </button>
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         )}

         {/* Pagination */}
         {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
               <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-gold-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all clip-hex-button"
               >
                  <ChevronLeft className="w-5 h-5" />
               </button>
               <span className="text-slate-400 font-mono text-sm bg-slate-900 px-4 py-1 rounded border border-slate-800">
                  TRANG <span className="text-white font-bold">{page}</span> / {totalPages}
               </span>
               <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={!hasMore}
                  className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-gold-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all clip-hex-button"
               >
                  <ChevronRight className="w-5 h-5" />
               </button>
            </div>
         )}

         {/* Empty State for Create */}
         {!loading && teams.length > 0 && (
            <div className="border border-dashed border-slate-700 rounded-none p-6 text-center opacity-50 hover:opacity-100 transition-opacity cursor-pointer bg-slate-900/30 mt-6" onClick={() => !myTeam && setShowCreateModal(true)}>
               <div className="w-12 h-12 bg-slate-800 rounded-full mx-auto flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-slate-500" />
               </div>
               <h3 className="text-white font-bold mb-1">Không tìm thấy phòng phù hợp?</h3>
               <p className="text-slate-400 text-sm">
                  {myTeam ? 'Bạn đang có phòng hoạt động' : 'Tự tạo phòng và rủ rê bạn bè ngay'}
               </p>
            </div>
         )}

         {/* Modals */}
         <CreateTeamModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateTeam}
            isCreating={isCreating}
         />

         {selectedTeam && (
            <TeamDetailModal
               team={selectedTeam}
               isOpen={showDetailModal}
               onClose={() => {
                  setShowDetailModal(false);
                  setSelectedTeam(null);
               }}
               onJoinRequest={handleJoinRequest}
               isJoining={isJoining}
            />
         )}
      </div>
   );
};