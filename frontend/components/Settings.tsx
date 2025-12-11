import React, { useState } from 'react';
import { LogOut, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/authContext';

export const Settings: React.FC = () => {
  const { logout, user } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    logout();
    setShowLogoutModal(false);
  };

  return (
    <>
      <div className="p-4 md:p-8 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">
              CÀI ĐẶT
            </h1>
            <p className="text-slate-400 text-sm">
              Quản lý tài khoản và tùy chỉnh ứng dụng
            </p>
          </div>

          {/* User Info Card */}
          {user && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 mb-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold-500 to-amber-600 flex items-center justify-center">
                {user.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user.username}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-lg">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold">{user.username}</p>
                <p className="text-slate-400 text-sm">{user.email}</p>
              </div>
            </div>
          )}

          {/* Settings List */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="divide-y divide-slate-700/50">
              {/* Logout Button */}
              <button
                onClick={() => setShowLogoutModal(true)}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-700/30 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-red-400 font-medium">Đăng xuất</p>
                  <p className="text-slate-500 text-sm">Thoát khỏi tài khoản hiện tại</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-400 transition-colors" />
              </button>
            </div>
          </div>

          {/* Version Info */}
          <div className="mt-8 text-center">
            <p className="text-slate-600 text-xs">
              ArenaHub v1.0.0
            </p>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLogoutModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Close button */}
            <button
              onClick={() => setShowLogoutModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Đăng xuất?
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
