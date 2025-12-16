import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Search, Plus, Users, User as UserIcon, X, ChevronLeft } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { CreateGroupModal } from './CreateGroupModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

interface ConversationListItem {
    id: string;
    type: 'DIRECT' | 'GROUP';
    name: string | null;
    avatar_url: string | null;
    last_message_content: string | null;
    last_message_at: string | null;
    unread_count: number;
}

interface SearchUser {
    id: string;
    username: string;
    avatar_url: string | null;
}

interface MessagesProps {
    isOpen: boolean;
    onClose: () => void;
    onRefreshUnread?: () => void;
}

export const Messages: React.FC<MessagesProps> = ({ isOpen, onClose, onRefreshUnread }) => {
    const [conversations, setConversations] = useState<ConversationListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState<{
        id: string;
        name: string;
        avatar_url: string | null;
        type: 'DIRECT' | 'GROUP';
    } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchConversations();
        }
    }, [isOpen]);

    // Search users when query changes
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (searchQuery.trim().length > 0) {
            searchTimeoutRef.current = setTimeout(() => {
                searchUsers(searchQuery);
            }, 300);
        } else {
            setSearchResults([]);
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchQuery]);

    const searchUsers = async (query: string) => {
        try {
            setIsSearching(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(
                `${API_URL}/messages/search/users?q=${encodeURIComponent(query)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (response.ok) {
                const data = await response.json();
                setSearchResults(data.data || []);
            }
        } catch (error) {
            console.error('Failed to search users:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchConversations = async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/messages/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setConversations(data.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openDirectChat = async (user: SearchUser) => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/messages/direct/${user.id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedConversation({
                    id: data.data.id,
                    name: data.data.name || user.username,
                    avatar_url: data.data.avatar_url || user.avatar_url,
                    type: 'DIRECT',
                });
                setSearchQuery('');
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    };

    const formatTimeAgo = (dateString: string | null) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'Vừa xong';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}p`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    };

    // Filter conversations that match search if no API results
    const filteredConversations = searchQuery
        ? conversations.filter(conv =>
            conv.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : conversations;

    if (!isOpen) return null;

    // If a conversation is selected, show ChatWindow
    if (selectedConversation) {
        return (
            <ChatWindow
                conversationId={selectedConversation.id}
                conversationName={selectedConversation.name}
                conversationAvatar={selectedConversation.avatar_url}
                conversationType={selectedConversation.type}
                onBack={() => {
                    setSelectedConversation(null);
                    fetchConversations(); // Refresh list
                    onRefreshUnread?.(); // Refresh unread badge
                }}
                onClose={() => {
                    onClose();
                    onRefreshUnread?.(); // Refresh when closing
                }}
            />
        );
    }

    const showSearchResults = searchQuery.trim().length > 0 && searchResults.length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-0">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Messages Panel */}
            <div
                ref={containerRef}
                className="relative bg-slate-900 border border-slate-700 rounded-xl md:rounded-none w-full max-w-md md:max-w-sm h-[80vh] md:h-full md:fixed md:right-0 md:top-0 md:bottom-0 shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0 bg-slate-900/95">
                    <div className="flex items-center gap-3">
                        <MessageCircle className="w-6 h-6 text-gold-500" />
                        <h2 className="text-lg font-bold text-white">Tin nhắn</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCreateGroup(true)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-gold-500 hover:bg-gold-400 transition-colors"
                            title="Tạo nhóm chat"
                        >
                            <Plus className="w-4 h-4 text-slate-950" />
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 py-2 border-b border-slate-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm người dùng hoặc nhóm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold-500/50 transition-colors"
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Search Results */}
                {showSearchResults && (
                    <div className="border-b border-slate-800 max-h-48 overflow-y-auto">
                        <div className="px-4 py-2 text-xs text-slate-500 font-medium">
                            Người dùng
                        </div>
                        {searchResults.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => openDirectChat(user)}
                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-800/50 transition-colors text-left"
                            >
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                        <UserIcon className="w-4 h-4 text-slate-400" />
                                    </div>
                                )}
                                <div>
                                    <span className="font-medium text-white">{user.username}</span>
                                    <p className="text-xs text-slate-500">Nhấn để nhắn tin</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {/* Section header when searching */}
                    {searchQuery && filteredConversations.length > 0 && (
                        <div className="px-4 py-2 text-xs text-slate-500 font-medium">
                            Cuộc trò chuyện
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : filteredConversations.length === 0 && !showSearchResults ? (
                        <div className="text-center py-12 text-slate-500">
                            <MessageCircle className="w-16 h-16 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">
                                {searchQuery ? 'Không tìm thấy kết quả' : 'Chưa có tin nhắn nào'}
                            </p>
                            {!searchQuery && (
                                <p className="text-xs mt-2">Tìm kiếm người dùng để bắt đầu</p>
                            )}
                        </div>
                    ) : (
                        filteredConversations.map((conversation) => (
                            <button
                                key={conversation.id}
                                onClick={() => setSelectedConversation({
                                    id: conversation.id,
                                    name: conversation.name || 'Cuộc trò chuyện',
                                    avatar_url: conversation.avatar_url,
                                    type: conversation.type,
                                })}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors text-left ${conversation.unread_count > 0 ? 'bg-gold-500/5' : ''
                                    }`}
                            >
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    {conversation.avatar_url ? (
                                        <img
                                            src={conversation.avatar_url}
                                            alt=""
                                            className="w-12 h-12 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                            {conversation.type === 'GROUP' ? (
                                                <Users className="w-5 h-5 text-slate-400" />
                                            ) : (
                                                <UserIcon className="w-5 h-5 text-slate-400" />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`font-medium truncate ${conversation.unread_count > 0 ? 'text-white' : 'text-slate-300'
                                            }`}>
                                            {conversation.name || 'Cuộc trò chuyện'}
                                        </span>
                                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                                            {formatTimeAgo(conversation.last_message_at)}
                                        </span>
                                    </div>
                                    <p className={`text-sm truncate mt-0.5 ${conversation.unread_count > 0 ? 'text-slate-300 font-medium' : 'text-slate-500'
                                        }`}>
                                        {conversation.last_message_content || 'Bắt đầu cuộc trò chuyện...'}
                                    </p>
                                </div>

                                {/* Unread badge */}
                                {conversation.unread_count > 0 && (
                                    <div className="flex-shrink-0">
                                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-gold-500 rounded-full">
                                            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                                        </span>
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Create Group Modal */}
            <CreateGroupModal
                isOpen={showCreateGroup}
                onClose={() => setShowCreateGroup(false)}
                onGroupCreated={(groupId, groupName) => {
                    setSelectedConversation({
                        id: groupId,
                        name: groupName,
                        avatar_url: null,
                        type: 'GROUP',
                    });
                    fetchConversations(); // Refresh list
                }}
            />
        </div>
    );
};
