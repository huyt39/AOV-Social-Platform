import React, { useState, useEffect } from 'react';
import { X, Search, Users, Check, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface User {
    id: string;
    username: string;
    avatar_url: string | null;
}

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGroupCreated: (groupId: string, groupName: string) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
    isOpen,
    onClose,
    onGroupCreated,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    // Search users when query changes
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
                // Filter out already selected users
                const selectedIds = new Set(selectedUsers.map(u => u.id));
                setSearchResults((data.data || []).filter((u: User) => !selectedIds.has(u.id)));
            }
        } catch (error) {
            console.error('Failed to search users:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const toggleUserSelection = (user: User) => {
        setSelectedUsers(prev => {
            const isSelected = prev.find(u => u.id === user.id);
            if (isSelected) {
                return prev.filter(u => u.id !== user.id);
            } else {
                return [...prev, user];
            }
        });
        // Remove from search results when selected
        setSearchResults(prev => prev.filter(u => u.id !== user.id));
    };

    const removeSelectedUser = (userId: string) => {
        setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    };

    const handleCreateGroup = async () => {
        // Validation
        if (selectedUsers.length < 2) {
            setError('Cần chọn ít nhất 2 người bạn (tổng 3 người bao gồm bạn)');
            return;
        }
        if (!groupName.trim()) {
            setError('Vui lòng đặt tên cho nhóm');
            return;
        }

        setError('');
        setIsCreating(true);

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/messages/conversations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'GROUP',
                    participant_ids: selectedUsers.map(u => u.id),
                    name: groupName.trim(),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                onGroupCreated(data.data.id, groupName.trim());
                // Reset state
                setSelectedUsers([]);
                setGroupName('');
                setSearchQuery('');
                onClose();
            } else {
                const errorData = await response.json();
                setError(errorData.detail || 'Không thể tạo nhóm');
            }
        } catch (error) {
            console.error('Failed to create group:', error);
            setError('Đã xảy ra lỗi khi tạo nhóm');
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl shadow-black/50 flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gold-500" />
                        <h2 className="text-lg font-bold text-white">Tạo nhóm chat</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Group name input */}
                <div className="p-4 border-b border-slate-800">
                    <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Tên nhóm *"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/50"
                    />
                </div>

                {/* Selected users */}
                {selectedUsers.length > 0 && (
                    <div className="px-4 py-2 border-b border-slate-800 flex-shrink-0">
                        <p className="text-xs text-slate-500 mb-2">
                            Đã chọn: {selectedUsers.length} người (cần ít nhất 2)
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {selectedUsers.map(user => (
                                <div
                                    key={user.id}
                                    className="flex items-center gap-2 bg-gold-500/20 border border-gold-500/30 rounded-full px-2 py-1"
                                >
                                    <img
                                        src={user.avatar_url || 'https://via.placeholder.com/24'}
                                        alt={user.username}
                                        className="w-5 h-5 rounded-full object-cover"
                                    />
                                    <span className="text-xs text-gold-400">{user.username}</span>
                                    <button
                                        onClick={() => removeSelectedUser(user.id)}
                                        className="w-4 h-4 flex items-center justify-center hover:text-red-400"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Search input */}
                <div className="p-4 border-b border-slate-800 flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm người dùng..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/50"
                        />
                    </div>
                </div>

                {/* Search results */}
                <div className="flex-1 overflow-y-auto min-h-[200px]">
                    {isSearching ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 text-gold-500 animate-spin" />
                        </div>
                    ) : searchResults.length > 0 ? (
                        <div className="divide-y divide-slate-800">
                            {searchResults.map(user => (
                                <button
                                    key={user.id}
                                    onClick={() => toggleUserSelection(user)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors"
                                >
                                    <img
                                        src={user.avatar_url || 'https://via.placeholder.com/40'}
                                        alt={user.username}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                    <span className="flex-1 text-left text-sm text-white">
                                        {user.username}
                                    </span>
                                    <div className="w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center">
                                        {selectedUsers.find(u => u.id === user.id) && (
                                            <Check className="w-3 h-3 text-gold-500" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : searchQuery.trim() ? (
                        <div className="text-center py-8 text-slate-500 text-sm">
                            Không tìm thấy người dùng
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500 text-sm">
                            Nhập tên để tìm kiếm người dùng
                        </div>
                    )}
                </div>

                {/* Error message */}
                {error && (
                    <div className="px-4 py-2 bg-red-900/30 border-t border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Create button */}
                <div className="p-4 border-t border-slate-800 flex-shrink-0">
                    <button
                        onClick={handleCreateGroup}
                        disabled={selectedUsers.length < 2 || !groupName.trim() || isCreating}
                        className="w-full py-3 rounded-lg font-bold text-center transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gold-500 hover:bg-gold-400 text-slate-950"
                    >
                        {isCreating ? (
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        ) : (
                            `Tạo nhóm (${selectedUsers.length + 1} thành viên)`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
