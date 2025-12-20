import React, { useState, useEffect } from 'react';
import { FiFilm, FiBookmark, FiX, FiPlus } from 'react-icons/fi';
import { CreateReel } from './CreateReel';

interface ReelThumbnail {
    id: string;
    thumbnail_url: string;
    views_count: number;
}

interface MyReelsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onReelClick?: (reelId: string) => void;
}

export const MyReelsPanel: React.FC<MyReelsPanelProps> = ({ isOpen, onClose, onReelClick }) => {
    const [activeTab, setActiveTab] = useState<'my' | 'saved'>('my');
    const [myReels, setMyReels] = useState<ReelThumbnail[]>([]);
    const [savedReels, setSavedReels] = useState<ReelThumbnail[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

    useEffect(() => {
        if (isOpen) {
            loadMyReels();
        }
    }, [isOpen]);

    const loadMyReels = async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem('auth_token');

            const profileRes = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (profileRes.ok) {
                const profileData = await profileRes.json();
                // API returns { user: {...} }
                const userId = profileData.user?.id || profileData.id;

                if (!userId) {
                    console.error('Could not get user ID from profile');
                    return;
                }

                const reelsRes = await fetch(`${API_URL}/reels/user/${userId}?limit=50`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (reelsRes.ok) {
                    const reelsData = await reelsRes.json();
                    setMyReels(reelsData.reels || []);
                }
            }
        } catch (err) {
            console.error('Failed to load my reels:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const formatViews = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Create Reel Modal */}
            {showCreateModal && (
                <CreateReel
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        loadMyReels();
                        setShowCreateModal(false);
                    }}
                />
            )}

            {/* Panel Overlay */}
            <div className="fixed inset-0 z-50 flex justify-end">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Side Panel - Full on mobile, 400px max on desktop */}
                <div className="relative w-full md:max-w-md bg-slate-900 h-full flex flex-col shadow-2xl animate-slide-in-right">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 flex-shrink-0">
                        <h2 className="text-lg font-bold text-white">Reels của tôi</h2>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                        >
                            <FiX className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    {/* Tabs - Icon Only */}
                    <div className="flex border-b border-slate-800 bg-slate-950">
                        <button
                            onClick={() => setActiveTab('my')}
                            className={`flex-1 py-4 flex items-center justify-center transition-colors ${activeTab === 'my'
                                ? 'text-gold-400 border-b-2 border-gold-400 bg-slate-900/50'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                        >
                            <FiFilm className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => setActiveTab('saved')}
                            className={`flex-1 py-4 flex items-center justify-center transition-colors ${activeTab === 'saved'
                                ? 'text-gold-400 border-b-2 border-gold-400 bg-slate-900/50'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                        >
                            <FiBookmark className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto bg-black">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : activeTab === 'my' ? (
                            <div className="grid grid-cols-3 gap-0.5">
                                {/* Upload Card - First Item */}
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="aspect-[9/16] bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 flex flex-col items-center justify-center gap-3 hover:opacity-90 transition-opacity"
                                >
                                    <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg">
                                        <div className="relative">
                                            <FiFilm className="w-7 h-7 text-pink-500" />
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-pink-500 rounded-full flex items-center justify-center">
                                                <FiPlus className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-white font-bold text-xs text-center px-1">Tạo thước phim</span>
                                </button>

                                {/* User's Reels */}
                                {myReels.map((reel) => (
                                    <button
                                        key={reel.id}
                                        onClick={() => onReelClick?.(reel.id)}
                                        className="aspect-[9/16] bg-slate-800 relative overflow-hidden group"
                                    >
                                        <img
                                            src={reel.thumbnail_url}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                                        <div className="absolute bottom-1 left-1 flex items-center gap-1 text-white text-[10px]">
                                            <FiFilm className="w-3 h-3" />
                                            <span>{formatViews(reel.views_count)}</span>
                                        </div>
                                    </button>
                                ))}

                                {/* Empty State for My Reels */}
                                {myReels.length === 0 && (
                                    <div className="col-span-2 flex items-center justify-center py-8 text-slate-500">
                                        <p className="text-sm">Chưa có reel nào</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-0.5">
                                {/* Saved Reels */}
                                {savedReels.length === 0 ? (
                                    <div className="col-span-3 flex flex-col items-center justify-center py-12 text-slate-500">
                                        <FiBookmark className="w-12 h-12 mb-3 opacity-50" />
                                        <p className="text-sm">Chưa có reel đã lưu</p>
                                    </div>
                                ) : (
                                    savedReels.map((reel) => (
                                        <button
                                            key={reel.id}
                                            onClick={() => onReelClick?.(reel.id)}
                                            className="aspect-[9/16] bg-slate-800 relative overflow-hidden group"
                                        >
                                            <img
                                                src={reel.thumbnail_url}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Animation styles */}
            <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
        </>
    );
};
