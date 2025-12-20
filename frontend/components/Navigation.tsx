import React from 'react';
import { Home, Users, MessagesSquare, User as UserIcon, Settings, LogOut, UsersRound, Shield, PlayCircle } from 'lucide-react';
import { useAuth } from '../contexts/authContext';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { logout, user } = useAuth();

  // Check if user is admin (using role from /auth/me or is_superuser)
  const isAdmin = user?.role === 'ADMIN' || user?.is_superuser === true;

  const navItems = [
    { id: 'feed', icon: Home, label: 'TRANG CHỦ' },
    { id: 'reels', icon: PlayCircle, label: 'REELS' },
    { id: 'forum', icon: MessagesSquare, label: 'DIỄN ĐÀN' },
    { id: 'lfg', icon: Users, label: 'TÌM TEAM' },
    { id: 'friends', icon: UsersRound, label: 'BẠN BÈ' },
    // Profile and Settings moved to Header
  ];

  // Add admin item if user is admin
  if (isAdmin) {
    navItems.push({ id: 'admin', icon: Shield, label: 'QUẢN TRỊ' });
  }

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 md:relative md:top-0 md:w-60 md:h-[calc(100vh-3.5rem)] md:border-r md:border-t-0 z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
      <div className="flex md:flex-col justify-between md:justify-start h-16 md:h-full md:p-0">

        {/* Logo Area - Hidden (now in Header) */}

        {/* Nav Items */}
        <div className="flex md:flex-col w-full justify-around md:justify-start md:p-4 md:gap-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id ||
              (item.id === 'forum' && (activeTab === 'forum-category' || activeTab === 'forum-thread'));
            const isAdminItem = item.id === 'admin';
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group relative flex flex-col md:flex-row items-center md:gap-4 p-2 md:px-6 md:py-4 transition-all duration-300 w-full md:text-left overflow-hidden
                  ${isActive
                    ? isAdminItem
                      ? 'text-red-400 md:bg-gradient-to-r md:from-red-500/10 md:to-transparent'
                      : 'text-gold-400 md:bg-gradient-to-r md:from-gold-500/10 md:to-transparent'
                    : isAdminItem
                      ? 'text-red-400/60 hover:text-red-400 hover:bg-red-500/10'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/30'
                  }
                `}
              >
                {/* Active Indicator Line (Desktop) */}
                {isActive && (
                  <div className={`hidden md:block absolute left-0 top-0 bottom-0 w-1 ${isAdminItem ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-gold-500 shadow-[0_0_10px_#f59e0b]'}`}></div>
                )}

                {/* Icon */}
                <item.icon
                  className={`w-6 h-6 md:w-5 md:h-5 transition-all duration-300 ${isActive ? 'stroke-[2.5px] drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'group-hover:scale-110'
                    }`}
                />

                {/* Label */}
                <span className={`text-[10px] md:text-sm font-bold tracking-wider md:font-display uppercase ${isActive ? isAdminItem ? 'text-red-400' : 'text-gold-400' : ''}`}>
                  {item.label}
                </span>

                {/* Hover Glint Effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 md:block hidden" />
              </button>
            );
          })}
        </div>

        {/* Footer Info (Desktop) */}
        <div className="hidden md:block mt-auto p-6 border-t border-slate-800/50">
          <div className="bg-slate-900/50 p-3 rounded border border-slate-800 flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
            <span className="text-xs text-slate-400 font-mono">SERVER: ONLINE</span>
          </div>
        </div>
      </div>
    </nav>
  );
};