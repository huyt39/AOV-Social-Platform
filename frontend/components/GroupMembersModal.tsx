import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, Crown, Search, Loader2, LogOut } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface Participant {
    user_id: string;
    username: string;
    avatar_url: string | null;
    role: 'MEMBER' | 'ADMIN';
    is_online: boolean;
}

interface SearchUser {
    id: string;
    username: string;
    avatar_url: string | null;
}

interface GroupMembersModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversationId: string;
    conversationName: string;
    currentUserId: string;
    onLeaveGroup: () => void;
}

export const GroupMembersModal: React.FC<GroupMembersModalProps> = ({
    isOpen,
    onClose,
    conversationId,
    conversationName,
    currentUserId,
    onLeaveGroup,
}) => {
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const currentUserRole = participants.find(p => p.user_id === currentUserId)?.role;
    const isAdmin = currentUserRole === 'ADMIN';

    useEffect(() => {
        if (isOpen) {
            fetchParticipants();
        }
    }, [isOpen, conversationId]);

    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (searchQuery.trim().length > 0) {
                await searchUsers(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const fetchParticipants = async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/conversations/${conversationId}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (response.ok) {
                const data = await response.json();
                setParticipants(data.participants || []);
            }
        } catch (error) {
            console.error('Failed to fetch participants:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const searchUsers = async (query: string) => {
        try {
            setIsSearching(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/search/users?q=${encodeURIComponent(query)}&limit=20`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (response.ok) {
                const data = await response.json();
                // Filter out existing participants
                const existingIds = new Set(participants.map(p => p.user_id));
                setSearchResults((data.data || []).filter((u: SearchUser) => !existingIds.has(u.id)));
            }
        } catch (error) {
            console.error('Failed to search users:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const addMember = async (userId: string) => {
        try {
            setIsProcessing(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/conversations/${conversationId}/participants?user_ids=${userId}`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                }
            );

            if (response.ok) {
                setSearchQuery('');
                setSearchResults([]);
                setShowAddMember(false);
                await fetchParticipants();
            }
        } catch (error) {
            console.error('Failed to add member:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const removeMember = async (userId: string) => {
        if (!confirm('Bạn có chắc muốn xóa thành viên này?')) return;

        try {
            setIsProcessing(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/conversations/${conversationId}/participants/${userId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                }
            );

            if (response.ok) {
                await fetchParticipants();
            }
        } catch (error) {
            console.error('Failed to remove member:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const leaveGroup = async () => {
        if (!confirm('Bạn có chắc muốn rời khỏi nhóm này?')) return;

        try {
            setIsProcessing(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/conversations/${conversationId}/participants/${currentUserId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                }
            );

            if (response.ok) {
                onLeaveGroup();
                onClose();
            }
        } catch (error) {
            console.error('Failed to leave group:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl shadow-black/50 flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white">{conversationName}</h2>
                        <p className="text-xs text-slate-500">{participants.length} thành viên</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Add member button (admin only) */}
                {isAdmin && !showAddMember && (
                    <div className="px-4 py-2 border-b border-slate-800">
                        <button
                            onClick={() => setShowAddMember(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-gold-500/20 hover:bg-gold-500/30 rounded-lg text-gold-400 text-sm transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            Thêm thành viên
                        </button>
                    </div>
                )}

                {/* Search to add */}
                {showAddMember && (
                    <div className="px-4 py-2 border-b border-slate-800">
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm người để thêm..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/50"
                                autoFocus
                            />
                        </div>
                        {isSearching ? (
                            <div className="flex justify-center py-2">
                                <Loader2 className="w-5 h-5 text-gold-500 animate-spin" />
                            </div>
                        ) : searchResults.length > 0 ? (
                            <div className="max-h-32 overflow-y-auto">
                                {searchResults.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => addMember(user.id)}
                                        disabled={isProcessing}
                                        className="w-full flex items-center gap-2 px-2 py-2 hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        <img
                                            src={user.avatar_url || 'https://via.placeholder.com/32'}
                                            alt={user.username}
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                        <span className="text-sm text-white">{user.username}</span>
                                        <UserPlus className="w-4 h-4 text-gold-500 ml-auto" />
                                    </button>
                                ))}
                            </div>
                        ) : searchQuery.trim() ? (
                            <p className="text-xs text-slate-500 text-center py-2">Không tìm thấy</p>
                        ) : null}
                        <button
                            onClick={() => { setShowAddMember(false); setSearchQuery(''); }}
                            className="w-full text-xs text-slate-500 mt-2"
                        >
                            Hủy
                        </button>
                    </div>
                )}

                {/* Members list */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {participants.map(participant => (
                                <div
                                    key={participant.user_id}
                                    className="flex items-center gap-3 px-4 py-3"
                                >
                                    <div className="relative">
                                        <img
                                            src={participant.avatar_url || 'https://via.placeholder.com/40'}
                                            alt={participant.username}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                        {participant.is_online && (
                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-white">
                                                {participant.username}
                                                {participant.user_id === currentUserId && ' (Bạn)'}
                                            </span>
                                            {participant.role === 'ADMIN' && (
                                                <Crown className="w-3 h-3 text-gold-500" />
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-500">
                                            {participant.role === 'ADMIN' ? 'Quản trị viên' : 'Thành viên'}
                                        </span>
                                    </div>
                                    {/* Remove button (admin can remove others, not self) */}
                                    {isAdmin && participant.user_id !== currentUserId && (
                                        <button
                                            onClick={() => removeMember(participant.user_id)}
                                            disabled={isProcessing}
                                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
                                            title="Xóa khỏi nhóm"
                                        >
                                            <UserMinus className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Leave group button */}
                <div className="p-4 border-t border-slate-800 flex-shrink-0">
                    <button
                        onClick={leaveGroup}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Rời khỏi nhóm
                    </button>
                </div>
            </div>
        </div>
    );
};
