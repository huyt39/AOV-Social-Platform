import React from 'react';
import { X, Users, Clock, Trophy, Target, ExternalLink } from 'lucide-react';
import { TeamDetail, TeamMemberInfo } from '../types';

interface TeamDetailModalProps {
    team: TeamDetail;
    isOpen: boolean;
    onClose: () => void;
    onJoinRequest: () => void;
    isJoining: boolean;
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

export const TeamDetailModal: React.FC<TeamDetailModalProps> = ({
    team,
    isOpen,
    onClose,
    onJoinRequest,
    isJoining,
}) => {
    const [remainingTime, setRemainingTime] = React.useState(getRemainingTime(team.expires_at));

    // Update countdown every second
    React.useEffect(() => {
        const interval = setInterval(() => {
            setRemainingTime(getRemainingTime(team.expires_at));
        }, 1000);
        return () => clearInterval(interval);
    }, [team.expires_at]);

    if (!isOpen) return null;

    const handleNavigateToProfile = (userId: string) => {
        window.location.hash = `profile/${userId}`;
        onClose();
    };

    const canJoin = !team.is_owner && !team.has_requested && team.current_members < team.max_members;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] clip-angled">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700 p-5 flex items-center justify-between relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gold-500"></div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gold-500">Team Info</span>
                        </div>
                        <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wide glow-text">
                            {team.name}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                            <span className={`flex items-center gap-1 ${getRemainingTime(team.expires_at) === 'Đã hết hạn' ? 'text-red-400' : 'text-gold-400'}`}>
                                <Clock className="w-3 h-3" /> Còn {remainingTime}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-slate-400 flex items-center gap-1">
                                <Users className="w-3 h-3" /> {team.current_members}/{team.max_members}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded clip-hex-button"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                    {/* Owner Info */}
                    <div className="p-4 bg-slate-800/30 border border-slate-700/50 relative group">
                        <div className="absolute -top-3 left-4 bg-slate-900 px-2 text-xs text-gold-500 font-bold uppercase tracking-wider border border-slate-700">
                            Chủ phòng
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div className="relative">
                                <img
                                    src={team.owner.avatar_url || 'https://via.placeholder.com/40'}
                                    alt={team.owner.username}
                                    className="w-12 h-12 object-cover bg-slate-800 clip-hex-button border border-gold-500"
                                />
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gold-500 clip-hex-button flex items-center justify-center">
                                    <Trophy className="w-2.5 h-2.5 text-black" />
                                </div>
                            </div>
                            <div className="flex-1">
                                <button
                                    onClick={() => handleNavigateToProfile(team.owner.id)}
                                    className="text-white font-bold hover:text-gold-400 transition-colors flex items-center gap-2 text-lg"
                                >
                                    {team.owner.username}
                                    <ExternalLink className="w-3 h-3 text-slate-500" />
                                </button>
                                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                    <span className="bg-slate-800 px-2 py-0.5 border border-slate-700 text-slate-300">
                                        {translateRank(team.owner.rank)}
                                    </span>
                                    {team.owner.win_rate && (
                                        <span className="text-green-400 font-bold">WR: {team.owner.win_rate.toFixed(1)}%</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Team Info */}
                    <div>
                        <div className="flex gap-2 mb-3">
                            <span className="text-xs font-bold bg-gold-600/10 text-gold-500 px-3 py-1 border border-gold-500/20 uppercase tracking-wider">
                                {team.game_mode} Mode
                            </span>
                            <span className="text-xs font-bold bg-slate-800 text-slate-300 px-3 py-1 border border-slate-700 uppercase tracking-wider">
                                Rank: {translateRank(team.rank)}
                            </span>
                        </div>
                        <p className="text-slate-300 italic border-l-2 border-slate-600 pl-4 py-2 bg-slate-800/20 text-sm leading-relaxed">
                            "{team.description}"
                        </p>
                    </div>

                    {/* Members List */}
                    <div>
                        <div className="text-sm font-bold text-white uppercase mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                            <Users className="w-4 h-4 text-gold-500" />
                            Thành viên ({team.members.length}/{team.max_members})
                        </div>
                        <div className="space-y-3">
                            {team.members.map((member: TeamMemberInfo) => (
                                <div
                                    key={member.id}
                                    className="flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 hover:border-gold-500/30 transition-all group"
                                >
                                    <img
                                        src={member.avatar_url || 'https://via.placeholder.com/32'}
                                        alt={member.username}
                                        className="w-10 h-10 object-cover bg-slate-800 clip-hex-button border border-slate-600 group-hover:border-gold-500/50 transition-colors"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <button
                                            onClick={() => handleNavigateToProfile(member.user_id)}
                                            className="text-white text-sm font-bold hover:text-gold-400 transition-colors flex items-center gap-1 truncate"
                                        >
                                            {member.username}
                                            {member.user_id === team.owner.id && (
                                                <span className="text-[10px] text-gold-500 bg-gold-500/10 px-1 ml-1 rounded border border-gold-500/20">C</span>
                                            )}
                                        </button>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                                            <span>{translateRank(member.rank)}</span>
                                            {member.main_role && (
                                                <>
                                                    <span className="text-slate-600">•</span>
                                                    <span className="flex items-center gap-1 text-slate-300">
                                                        <Target className="w-3 h-3" />
                                                        {translateRole(member.main_role)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {member.win_rate && (
                                        <div className="text-xs text-green-400 font-mono font-bold bg-green-900/10 px-2 py-1 rounded">
                                            {member.win_rate.toFixed(1)}%
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Empty Slots */}
                            {Array.from({ length: team.max_members - team.members.length }).map((_, i) => (
                                <div key={`empty-${i}`} className="p-3 border border-dashed border-slate-700/50 bg-slate-900/20 flex items-center gap-3 opacity-50">
                                    <div className="w-10 h-10 bg-slate-800/50 clip-hex-button flex items-center justify-center">
                                        <Users className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <span className="text-sm text-slate-500 italic">Còn trống</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="border-t border-slate-700 p-6 bg-slate-900/80">
                    {team.is_owner ? (
                        <div className="text-center text-slate-400 text-sm py-2 bg-slate-800 border border-slate-700 font-mono">
                            Bạn là chủ phòng này
                        </div>
                    ) : team.is_member ? (
                        <div className="text-center text-green-500 bg-green-500/10 border border-green-500/30 text-sm font-bold py-3 clip-angled">
                            BẠN ĐÃ LÀ THÀNH VIÊN
                        </div>
                    ) : team.has_requested ? (
                        <div className="text-center text-slate-900 bg-gold-500/20 border border-gold-500 text-sm font-bold py-3 clip-angled text-gold-500">
                            ĐÃ GỬI YÊU CẦU
                        </div>
                    ) : team.current_members >= team.max_members ? (
                        <div className="text-center text-red-500 bg-red-500/10 border border-red-500/30 text-sm font-bold py-3 clip-angled">
                            PHÒNG ĐÃ ĐẦY
                        </div>
                    ) : (
                        <button
                            onClick={onJoinRequest}
                            disabled={isJoining}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 clip-angled transition-all uppercase tracking-widest shadow-lg shadow-blue-900/20 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isJoining ? 'Đang gửi...' : 'XIN SLOT'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
