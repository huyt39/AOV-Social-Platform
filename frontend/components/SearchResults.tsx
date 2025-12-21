import React, { useState, useEffect } from 'react';
import { Search, User as UserIcon, Users, ChevronLeft } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface SearchUser {
    id: string;
    username: string;
    avatar_url: string | null;
    rank?: string;
    level?: number;
}

interface SearchResultsProps {
    query: string;
    onNavigate: (route: string) => void;
}

type TabType = 'users' | 'groups';

export const SearchResults: React.FC<SearchResultsProps> = ({ query, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<TabType>('users');
    const [users, setUsers] = useState<SearchUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchInput, setSearchInput] = useState(query);

    // Fetch users when query changes
    useEffect(() => {
        if (query) {
            setSearchInput(query);
            searchUsers(query);
        }
    }, [query]);

    const searchUsers = async (q: string) => {
        if (!q.trim()) return;

        try {
            setIsLoading(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/search/users?q=${encodeURIComponent(q)}&limit=20`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (response.ok) {
                const data = await response.json();
                setUsers(data.data || []);
            }
        } catch (error) {
            console.error('Failed to search users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchInput.trim()) {
            window.location.hash = `search?q=${encodeURIComponent(searchInput.trim())}`;
        }
    };

    const handleUserClick = (userId: string) => {
        onNavigate(`profile/${userId}`);
    };

    const getRankColor = (rank?: string) => {
        if (!rank) return 'text-slate-400';
        const rankLower = rank.toLowerCase();
        if (rankLower.includes('cao thủ') || rankLower.includes('thách đấu')) return 'text-red-400';
        if (rankLower.includes('tinh anh')) return 'text-purple-400';
        if (rankLower.includes('kim cương')) return 'text-cyan-400';
        if (rankLower.includes('bạch kim')) return 'text-emerald-400';
        if (rankLower.includes('vàng')) return 'text-yellow-400';
        if (rankLower.includes('bạc')) return 'text-slate-300';
        return 'text-amber-700';
    };

    return (
        <div className="min-h-screen bg-slate-900 pb-20 md:pb-0">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
                {/* Search bar */}
                <div className="p-4">
                    <form onSubmit={handleSearch} className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => window.history.back()}
                            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Tìm kiếm..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-full py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 focus:bg-slate-800/80 transition-all"
                            />
                        </div>
                    </form>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-all border-b-2 ${activeTab === 'users'
                            ? 'text-gold-400 border-gold-500 bg-gold-500/5'
                            : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
                            }`}
                    >
                        <UserIcon className="w-4 h-4" />
                        <span>Người dùng</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-all border-b-2 ${activeTab === 'groups'
                            ? 'text-gold-400 border-gold-500 bg-gold-500/5'
                            : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        <span>Nhóm</span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                {activeTab === 'users' ? (
                    <>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-12">
                                <UserIcon className="w-16 h-16 mx-auto mb-4 text-slate-700" />
                                <p className="text-slate-500">
                                    {query ? `Không tìm thấy người dùng "${query}"` : 'Nhập từ khóa để tìm kiếm'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {users.map((user) => (
                                    <button
                                        key={user.id}
                                        onClick={() => handleUserClick(user.id)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all group"
                                    >
                                        {/* Avatar */}
                                        {user.avatar_url ? (
                                            <img
                                                src={user.avatar_url}
                                                alt={user.username}
                                                className="w-12 h-12 rounded-full object-cover ring-2 ring-slate-700 group-hover:ring-gold-500/50 transition-all"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center ring-2 ring-slate-700 group-hover:ring-gold-500/50 transition-all">
                                                <span className="text-white font-bold text-lg">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}

                                        {/* Info */}
                                        <div className="flex-1 text-left">
                                            <p className="font-medium text-white group-hover:text-gold-400 transition-colors">
                                                {user.username}
                                            </p>
                                            {user.rank && (
                                                <p className={`text-xs font-medium ${getRankColor(user.rank)}`}>
                                                    {user.rank}
                                                    {user.level && ` • Lv.${user.level}`}
                                                </p>
                                            )}
                                        </div>

                                        {/* Arrow indicator */}
                                        <ChevronLeft className="w-5 h-5 text-slate-600 rotate-180 group-hover:text-gold-400 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    /* Groups Tab - Placeholder */
                    <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                            <Users className="w-10 h-10 text-slate-600" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-400 mb-2">Tính năng đang phát triển</h3>
                        <p className="text-sm text-slate-600">
                            Tìm kiếm nhóm sẽ sớm được ra mắt
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
