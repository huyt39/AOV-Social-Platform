import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Users, Clock, Trophy, Target, Check, X, Trash2, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { useAuth } from '../contexts/authContext';
import { TeamDetail, TeamJoinRequest, TeamMemberInfo } from '../types';

interface TeamOwnerDashboardProps {
    teamId: string;
    onBack: () => void;
}

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

// Helper to translate game role
const translateRole = (role?: string): string => {
    const roleMap: Record<string, string> = {
        'TOP': 'Đường Caesar',
        'JUNGLE': 'Rừng',
        'MID': 'Đường Giữa',
        'AD': 'Xạ Thủ',
        'SUPPORT': 'Trợ Thủ',
    };
    return role ? roleMap[role] || role : '';
};

// Helper to get remaining time
const getRemainingTime = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Đã hết hạn';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const TeamOwnerDashboard: React.FC<TeamOwnerDashboardProps> = ({ teamId, onBack }) => {
    const { token } = useAuth();
    const [team, setTeam] = useState<TeamDetail | null>(null);
    const [requests, setRequests] = useState<TeamJoinRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingRequest, setProcessingRequest] = useState<string | null>(null);
    const [removingMember, setRemovingMember] = useState<string | null>(null);
    const [deletingTeam, setDeletingTeam] = useState(false);
    const [remainingTime, setRemainingTime] = useState('');

    const fetchTeamData = useCallback(async () => {
        if (!token) return;

        try {
            // Fetch team details
            const teamRes = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!teamRes.ok) throw new Error('Failed to fetch team');
            const teamData = await teamRes.json();
            setTeam(teamData);
            setRemainingTime(getRemainingTime(teamData.expires_at));

            // Fetch pending requests
            const reqRes = await fetch(`${API_BASE_URL}/teams/${teamId}/requests`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (reqRes.ok) {
                const reqData = await reqRes.json();
                setRequests(reqData.data || []);
            }
        } catch (err) {
            setError('Không thể tải thông tin team');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [token, teamId]);

    useEffect(() => {
        fetchTeamData();
    }, [fetchTeamData]);

    // Update countdown every second
    useEffect(() => {
        if (!team) return;
        const interval = setInterval(() => {
            setRemainingTime(getRemainingTime(team.expires_at));
        }, 1000);
        return () => clearInterval(interval);
    }, [team]);

    const handleApprove = async (requestId: string) => {
        if (!token) return;
        setProcessingRequest(requestId);

        try {
            const res = await fetch(`${API_BASE_URL}/teams/${teamId}/requests/${requestId}/approve`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Failed to approve');
            }
            await fetchTeamData();
        } catch (err: any) {
            alert(err.message || 'Không thể duyệt yêu cầu');
        } finally {
            setProcessingRequest(null);
        }
    };

    const handleReject = async (requestId: string) => {
        if (!token) return;
        setProcessingRequest(requestId);

        try {
            const res = await fetch(`${API_BASE_URL}/teams/${teamId}/requests/${requestId}/reject`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to reject');
            await fetchTeamData();
        } catch (err) {
            alert('Không thể từ chối yêu cầu');
        } finally {
            setProcessingRequest(null);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!token || !confirm('Bạn có chắc muốn xóa thành viên này?')) return;
        setRemovingMember(userId);

        try {
            const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to remove');
            await fetchTeamData();
        } catch (err) {
            alert('Không thể xóa thành viên');
        } finally {
            setRemovingMember(null);
        }
    };

    const handleDeleteTeam = async () => {
        if (!token || !confirm('Bạn có chắc muốn đóng phòng này? Thao tác này không thể hoàn tác.')) return;
        setDeletingTeam(true);

        try {
            const res = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to delete');
            onBack();
        } catch (err) {
            alert('Không thể đóng phòng');
            setDeletingTeam(false);
        }
    };

    const handleNavigateToProfile = (userId: string) => {
        window.location.hash = `profile/${userId}`;
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto p-4 pt-6 flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !team) {
        return (
            <div className="max-w-3xl mx-auto p-4 pt-6">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4">
                    <ArrowLeft className="w-4 h-4" /> Quay lại
                </button>
                <div className="text-center text-red-400">{error || 'Team không tồn tại'}</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 pb-24 md:pb-8 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
                    <div className="w-8 h-8 bg-slate-800 border border-slate-600 group-hover:border-gold-500 flex items-center justify-center clip-hex-button transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="font-bold uppercase tracking-wide text-sm">Quay lại</span>
                </button>
                <button
                    onClick={handleDeleteTeam}
                    disabled={deletingTeam}
                    className="flex items-center gap-2 bg-red-900/20 text-red-500 hover:bg-red-900/40 hover:text-red-400 pr-4 pl-3 py-2 border border-red-900/50 clip-angled transition-all disabled:opacity-50 group"
                >
                    <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="font-bold uppercase tracking-wide text-sm">{deletingTeam ? 'Đang đóng...' : 'Đóng phòng'}</span>
                </button>
            </div>

            {/* Team Info Card */}
            <div className="bg-slate-900 border border-slate-700 p-6 mb-8 relative overflow-hidden shadow-xl clip-angled">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute top-0 left-0 w-1 h-full bg-gold-500"></div>

                <div className="flex flex-col md:flex-row items-start justify-between mb-4 relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-gold-600/10 text-gold-500 px-2 py-0.5 border border-gold-500/20 uppercase tracking-wider font-bold">
                                Quản lý phòng
                            </span>
                        </div>
                        <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wide glow-text mb-2">
                            {team.name}
                        </h1>
                        <div className="flex items-center gap-4 text-sm font-mono border-t border-slate-800 pt-3">
                            <span className={`text-gold-400 font-bold flex items-center gap-1.5 ${getRemainingTime(team.expires_at) === 'Đã hết hạn' ? 'text-red-400' : ''}`}>
                                <Clock className="w-4 h-4" /> Còn {remainingTime}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                                <Users className="w-4 h-4" /> {team.current_members}/{team.max_members} Thành viên
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4 md:mt-0">
                        <div className="bg-slate-800 border border-slate-600 p-2 text-center min-w-[100px] clip-angled">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Chế độ</div>
                            <div className="text-gold-500 font-bold">{team.game_mode}</div>
                        </div>
                        <div className="bg-slate-800 border border-slate-600 p-2 text-center min-w-[100px] clip-angled">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Rank</div>
                            <div className="text-white font-bold">{translateRank(team.rank)}</div>
                        </div>
                    </div>
                </div>
                <p className="text-slate-300 italic border-l-2 border-slate-600 pl-4 py-2 bg-slate-800/30 text-sm">
                    "{team.description}"
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Pending Requests */}
                <div className="bg-slate-900 border border-slate-700 shadow-lg">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                            <div className="w-2 h-2 bg-gold-500 rotate-45"></div>
                            Yêu cầu tham gia
                            <span className="bg-slate-700 text-gold-500 text-xs px-2 py-0.5 rounded-full">{requests.length}</span>
                        </h2>
                    </div>
                    <div className="p-4 space-y-3 h-[400px] overflow-y-auto custom-scrollbar">
                        {requests.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                                <Users className="w-12 h-12 opacity-20" />
                                <p className="font-mono text-sm">Chưa có yêu cầu mới</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {requests.map((req) => (
                                    <div key={req.id} className="flex flex-col gap-3 p-4 bg-slate-800/50 border border-slate-700 group hover:border-gold-500/30 transition-all shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={req.user.avatar_url || 'https://via.placeholder.com/40'}
                                                alt={req.user.username}
                                                className="w-12 h-12 object-cover bg-slate-800 clip-hex-button border border-slate-600"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <button
                                                    onClick={() => handleNavigateToProfile(req.user.id)}
                                                    className="text-white font-bold hover:text-gold-400 transition-colors flex items-center gap-1 text-base"
                                                >
                                                    {req.user.username}
                                                    <ExternalLink className="w-3 h-3 text-slate-500" />
                                                </button>
                                                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-1">
                                                    <span className="bg-slate-900 px-1.5 py-0.5 border border-slate-700">{translateRank(req.user.rank)}</span>
                                                    {req.user.win_rate && (
                                                        <span className="text-green-400 font-bold">WR: {req.user.win_rate.toFixed(1)}%</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {req.message && (
                                            <div className="bg-slate-900/50 p-2 text-xs text-slate-300 italic border-l-2 border-slate-600">
                                                "{req.message}"
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-1">
                                            <button
                                                onClick={() => handleApprove(req.id)}
                                                disabled={processingRequest === req.id || team.current_members >= team.max_members}
                                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all clip-angled text-xs uppercase flex items-center justify-center gap-1"
                                            >
                                                <Check className="w-3 h-3" /> Duyệt
                                            </button>
                                            <button
                                                onClick={() => handleReject(req.id)}
                                                disabled={processingRequest === req.id}
                                                className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50 transition-all clip-angled text-xs uppercase flex items-center justify-center gap-1"
                                            >
                                                <X className="w-3 h-3" /> Từ chối
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Current Members */}
                <div className="bg-slate-900 border border-slate-700 shadow-lg">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                            <div className="w-2 h-2 bg-blue-500 rotate-45"></div>
                            Thành viên
                            <span className="bg-slate-700 text-blue-400 text-xs px-2 py-0.5 rounded-full">{team.members.length}/{team.max_members}</span>
                        </h2>
                    </div>
                    <div className="p-4 space-y-2 h-[400px] overflow-y-auto custom-scrollbar">
                        {team.members.map((member: TeamMemberInfo, index: number) => (
                            <div
                                key={member.id}
                                className={`flex items-center gap-3 p-3 bg-slate-800/30 border transition-all group ${index === 0 ? 'border-gold-500/50 bg-gold-500/5' : 'border-slate-700 hover:border-slate-500'}`}
                            >
                                <img
                                    src={member.avatar_url || 'https://via.placeholder.com/40'}
                                    alt={member.username}
                                    className={`w-10 h-10 object-cover bg-slate-800 clip-hex-button ${index === 0 ? 'border-2 border-gold-500' : 'border border-slate-600'}`}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleNavigateToProfile(member.user_id)}
                                            className="text-white font-bold hover:text-gold-400 transition-colors flex items-center gap-1 truncate"
                                        >
                                            {member.username}
                                            <ExternalLink className="w-3 h-3 text-slate-500" />
                                        </button>
                                        {index === 0 && (
                                            <span className="text-[9px] bg-gold-500 text-black px-1.5 py-0.5 font-bold uppercase tracking-wider skew-x-[-10deg]">
                                                Chủ phòng
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                        <span className="flex items-center gap-1">
                                            <Trophy className="w-3 h-3 text-gold-500" />
                                            {translateRank(member.rank)}
                                        </span>
                                        {member.main_role && (
                                            <>
                                                <span className="text-slate-600">|</span>
                                                <span className="flex items-center gap-1 text-slate-300">
                                                    <Target className="w-3 h-3" />
                                                    {translateRole(member.main_role)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {index > 0 && (
                                    <button
                                        onClick={() => handleRemoveMember(member.user_id)}
                                        disabled={removingMember === member.user_id}
                                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                        title="Xóa thành viên"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Empty Slots */}
                        {Array.from({ length: team.max_members - team.members.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="p-3 border border-dashed border-slate-700/50 bg-slate-900/20 flex items-center gap-3 opacity-50">
                                <div className="w-10 h-10 object-cover bg-slate-800/50 clip-hex-button flex items-center justify-center">
                                    <Users className="w-4 h-4 text-slate-600" />
                                </div>
                                <span className="text-sm text-slate-500 italic">Còn trống</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
