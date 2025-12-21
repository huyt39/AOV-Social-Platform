import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageCircle, Bell, ChevronDown, User as UserIcon, Settings, LogOut, X } from 'lucide-react';
import { useAuth } from '../contexts/authContext';
import { PostDetailModal } from './PostDetailModal';
import { Messages } from './Messages';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// FeedPost interface for PostDetailModal
interface MediaItem {
    url: string;
    type: 'image' | 'video';
    thumbnail_url?: string;
}

interface PostAuthor {
    id: string;
    username: string;
    avatar_url: string | null;
    rank: string | null;
    level: number | null;
}

interface FeedPost {
    id: string;
    author_id: string;
    author: PostAuthor;
    content: string;
    media: MediaItem[];
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    created_at: string;
}

interface HeaderProps {
    onNavigate: (route: string) => void;
}

interface NotificationActor {
    id: string;
    username: string;
    avatar_url: string | null;
}

interface NotificationItem {
    id: string;
    type: string;
    actor_id: string;
    actor: NotificationActor;
    content: string;
    post_id: string | null;
    comment_id: string | null;
    is_read: boolean;
    created_at: string;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate }) => {
    const { user, logout, token } = useAuth();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

    // Post modal state
    const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);

    // Full notifications panel state
    const [showAllNotifications, setShowAllNotifications] = useState(false);
    const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Messages panel state
    const [showMessages, setShowMessages] = useState(false);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

    // Search state
    const [searchValue, setSearchValue] = useState('');

    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const allNotificationsRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch unread count on mount
    useEffect(() => {
        fetchUnreadCount();
        fetchUnreadMessagesCount();
    }, []);

    const fetchUnreadCount = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/notifications/unread-count`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.unread_count);
            }
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    const fetchUnreadMessagesCount = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/messages/conversations?limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Sum up all unread counts from conversations
                const totalUnread = (data.data || []).reduce(
                    (sum: number, conv: any) => sum + (conv.unread_count || 0),
                    0
                );
                setUnreadMessagesCount(totalUnread);
            }
        } catch (error) {
            console.error('Failed to fetch unread messages count:', error);
        }
    };

    const fetchNotifications = async (cursor?: string, forFullPanel?: boolean) => {
        try {
            if (!cursor) {
                setIsLoadingNotifications(true);
            } else {
                setIsLoadingMore(true);
            }
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const limit = forFullPanel ? 20 : 10;
            let url = `${API_URL}/notifications?limit=${limit}`;
            if (cursor) {
                url += `&cursor=${encodeURIComponent(cursor)}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();

                if (forFullPanel) {
                    if (cursor) {
                        setAllNotifications(prev => [...prev, ...data.data]);
                    } else {
                        setAllNotifications(data.data);
                    }
                    setNextCursor(data.next_cursor);
                    setHasMore(data.has_more);
                } else {
                    setNotifications(data.data);
                }
                setUnreadCount(data.unread_count);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setIsLoadingNotifications(false);
            setIsLoadingMore(false);
        }
    };

    const loadMoreNotifications = () => {
        if (isLoadingMore || !hasMore || !nextCursor) return;
        fetchNotifications(nextCursor, true);
    };

    const openAllNotifications = () => {
        setShowNotifications(false);
        setShowAllNotifications(true);
        setAllNotifications([]);
        setNextCursor(null);
        setHasMore(false);
        fetchNotifications(undefined, true);
    };

    // Handle scroll for infinite loading
    const handleNotificationsScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
            loadMoreNotifications();
        }
    };

    const handleNotificationClick = () => {
        setShowNotifications(!showNotifications);
        setShowProfileMenu(false);
        if (!showNotifications) {
            fetchNotifications();
        }
    };

    const markAsRead = async (notificationId: string) => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            await fetch(`${API_URL}/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            await fetch(`${API_URL}/notifications/read-all`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const handleLogout = () => {
        logout();
        setShowProfileMenu(false);
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'Vừa xong';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ`;
        return `${Math.floor(seconds / 86400)} ngày`;
    };

    // Fetch and open post detail
    const handleNotificationItemClick = async (notification: NotificationItem) => {
        // Mark as read
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // Close dropdown
        setShowNotifications(false);

        // Handle post-related notifications
        if (notification.post_id) {
            try {
                const authToken = localStorage.getItem('auth_token');
                if (!authToken) return;

                const response = await fetch(`${API_URL}/posts/${notification.post_id}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setSelectedPost(data.data || data);
                }
            } catch (error) {
                console.error('Failed to fetch post:', error);
            }
        }

        // Handle thread-related notifications (forum)
        if (notification.type.includes('thread')) {
            // Navigate to forum thread
            // onNavigate(`forum/thread/${notification.thread_id}`);
        }
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 h-16 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 z-50 px-4">
                <div className="h-full max-w-screen-2xl mx-auto flex items-center justify-between gap-4">

                    {/* Left: Logo */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={() => onNavigate('feed')}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                        >
                            <div className="w-10 h-10 bg-gradient-to-br from-gold-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-gold-500/20">
                                <span className="text-white font-bold text-lg font-display">A</span>
                            </div>
                            <span className="hidden sm:block text-xl font-display font-bold text-white">
                                ARENA<span className="text-gold-500">HUB</span>
                            </span>
                        </button>
                    </div>

                    {/* Center: Search */}
                    <div className="flex-1 max-w-md hidden md:block">
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            if (searchValue.trim()) {
                                window.location.hash = `search?q=${encodeURIComponent(searchValue.trim())}`;
                            }
                        }}>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    placeholder="Tìm kiếm trên ArenaHub"
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-full py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 focus:bg-slate-800 transition-all"
                                />
                            </div>
                        </form>
                    </div>

                    {/* Right: Icons */}
                    <div className="flex items-center gap-1 sm:gap-2">

                        {/* Search Icon (Mobile) */}
                        <button
                            onClick={() => {
                                const query = prompt('Tìm kiếm:');
                                if (query?.trim()) {
                                    window.location.hash = `search?q=${encodeURIComponent(query.trim())}`;
                                }
                            }}
                            className="md:hidden p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                            title="Tìm kiếm"
                        >
                            <Search className="w-5 h-5 text-slate-300" />
                        </button>

                        {/* Message Icon */}
                        <button
                            onClick={() => setShowMessages(true)}
                            className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors relative"
                            title="Tin nhắn"
                        >
                            <MessageCircle className="w-5 h-5 text-slate-300" />
                            {unreadMessagesCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center px-1 text-white">
                                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                                </span>
                            )}
                        </button>

                        {/* Notifications */}
                        <div className="relative" ref={notificationRef}>
                            <button
                                onClick={handleNotificationClick}
                                className={`p-2.5 rounded-full transition-colors relative ${showNotifications ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                    }`}
                                title="Thông báo"
                            >
                                <Bell className="w-5 h-5" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center px-1">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notifications Dropdown */}
                            {showNotifications && (
                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                                        <h3 className="text-lg font-bold text-white">Thông báo</h3>
                                        {unreadCount > 0 && (
                                            <button
                                                onClick={markAllAsRead}
                                                className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
                                            >
                                                Đánh dấu tất cả đã đọc
                                            </button>
                                        )}
                                    </div>

                                    {/* Notifications List */}
                                    <div className="max-h-96 overflow-y-auto">
                                        {isLoadingNotifications ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : notifications.length === 0 ? (
                                            <div className="text-center py-8 text-slate-500">
                                                <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">Chưa có thông báo nào</p>
                                            </div>
                                        ) : (
                                            notifications.map((notification) => (
                                                <div
                                                    key={notification.id}
                                                    onClick={() => handleNotificationItemClick(notification)}
                                                    className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition-colors border-l-2 ${notification.is_read ? 'border-transparent' : 'border-gold-500 bg-gold-500/5'
                                                        }`}
                                                >
                                                    {/* Avatar */}
                                                    <div className="flex-shrink-0">
                                                        {notification.actor.avatar_url ? (
                                                            <img
                                                                src={notification.actor.avatar_url}
                                                                alt=""
                                                                className="w-10 h-10 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                                                <UserIcon className="w-5 h-5 text-slate-400" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-slate-200 line-clamp-2">
                                                            {notification.content}
                                                        </p>
                                                        <span className="text-xs text-slate-500 mt-1 block">
                                                            {formatTimeAgo(notification.created_at)}
                                                        </span>
                                                    </div>

                                                    {/* Unread dot */}
                                                    {!notification.is_read && (
                                                        <div className="w-2.5 h-2.5 rounded-full bg-gold-500 flex-shrink-0 mt-1.5"></div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Footer */}
                                    {notifications.length > 0 && (
                                        <div className="border-t border-slate-800">
                                            <button
                                                onClick={openAllNotifications}
                                                className="w-full py-3 text-sm text-gold-400 hover:bg-slate-800/50 transition-colors font-medium"
                                            >
                                                Xem tất cả thông báo
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Profile Menu */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => {
                                    setShowProfileMenu(!showProfileMenu);
                                    setShowNotifications(false);
                                }}
                                className={`flex items-center gap-2 p-1 pr-2 rounded-full transition-colors ${showProfileMenu ? 'bg-slate-700' : 'hover:bg-slate-800'
                                    }`}
                            >
                                {/* Avatar */}
                                {user?.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={user.username}
                                        className="w-9 h-9 rounded-full object-cover border-2 border-slate-700"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center">
                                        <span className="text-white font-bold text-sm">
                                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                                        </span>
                                    </div>
                                )}
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform hidden sm:block ${showProfileMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Profile Dropdown */}
                            {showProfileMenu && (
                                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                                    {/* User Info */}
                                    <div className="p-4 border-b border-slate-800">
                                        <div className="flex items-center gap-3">
                                            {user?.avatar_url ? (
                                                <img
                                                    src={user.avatar_url}
                                                    alt={user.username}
                                                    className="w-12 h-12 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center">
                                                    <span className="text-white font-bold text-lg">
                                                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-white truncate">{user?.username}</p>
                                                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-2">
                                        <button
                                            onClick={() => {
                                                onNavigate('profile');
                                                setShowProfileMenu(false);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                                        >
                                            <UserIcon className="w-5 h-5 text-slate-400" />
                                            <span className="text-sm text-slate-200">Hồ sơ của tôi</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                onNavigate('settings');
                                                setShowProfileMenu(false);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                                        >
                                            <Settings className="w-5 h-5 text-slate-400" />
                                            <span className="text-sm text-slate-200">Cài đặt</span>
                                        </button>
                                    </div>

                                    {/* Logout */}
                                    <div className="border-t border-slate-800 py-2">
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 transition-colors text-left group"
                                        >
                                            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                                            <span className="text-sm text-slate-200 group-hover:text-red-400">Đăng xuất</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header >

            {/* Post Detail Modal */}
            {
                selectedPost && (
                    <PostDetailModal
                        post={selectedPost}
                        isOpen={!!selectedPost}
                        onClose={() => setSelectedPost(null)}
                        onPostUpdate={(updatedPost) => setSelectedPost(updatedPost)}
                    />
                )
            }

            {/* Full Notifications Panel */}
            {
                showAllNotifications && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={() => setShowAllNotifications(false)}
                        />

                        {/* Panel */}
                        <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
                                <h3 className="text-lg font-bold text-white">Tất cả thông báo</h3>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
                                        >
                                            Đánh dấu đã đọc
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowAllNotifications(false)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                                    >
                                        <X className="w-4 h-4 text-slate-400" />
                                    </button>
                                </div>
                            </div>

                            {/* Notifications List with Infinite Scroll */}
                            <div
                                ref={allNotificationsRef}
                                className="flex-1 overflow-y-auto"
                                onScroll={handleNotificationsScroll}
                            >
                                {isLoadingNotifications && allNotifications.length === 0 ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : allNotifications.length === 0 ? (
                                    <div className="text-center py-12 text-slate-500">
                                        <Bell className="w-16 h-16 mx-auto mb-3 opacity-50" />
                                        <p className="text-sm">Chưa có thông báo nào</p>
                                    </div>
                                ) : (
                                    <>
                                        {allNotifications.map((notification) => (
                                            <div
                                                key={notification.id}
                                                onClick={() => {
                                                    setShowAllNotifications(false);
                                                    handleNotificationItemClick(notification);
                                                }}
                                                className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition-colors border-l-2 ${notification.is_read ? 'border-transparent' : 'border-gold-500 bg-gold-500/5'
                                                    }`}
                                            >
                                                {/* Avatar */}
                                                <div className="flex-shrink-0">
                                                    {notification.actor.avatar_url ? (
                                                        <img
                                                            src={notification.actor.avatar_url}
                                                            alt=""
                                                            className="w-12 h-12 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                                            <UserIcon className="w-6 h-6 text-slate-400" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-slate-200">
                                                        {notification.content}
                                                    </p>
                                                    <span className="text-xs text-slate-500 mt-1 block">
                                                        {formatTimeAgo(notification.created_at)}
                                                    </span>
                                                </div>

                                                {/* Unread dot */}
                                                {!notification.is_read && (
                                                    <div className="w-3 h-3 rounded-full bg-gold-500 flex-shrink-0 mt-1.5"></div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Loading more indicator */}
                                        {isLoadingMore && (
                                            <div className="flex items-center justify-center py-4">
                                                <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        )}

                                        {/* End of list */}
                                        {!hasMore && allNotifications.length > 0 && (
                                            <div className="text-center py-4 text-slate-600 text-xs">
                                                Đã hiển thị tất cả thông báo
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Messages Panel */}
            <Messages
                isOpen={showMessages}
                onClose={() => setShowMessages(false)}
                onRefreshUnread={fetchUnreadMessagesCount}
            />
        </>
    );
};
