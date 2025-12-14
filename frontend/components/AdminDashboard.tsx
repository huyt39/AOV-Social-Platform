import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants';
import { useAuth } from '../contexts/authContext';
import { UserRole } from '../types';

interface AdminStats {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalCategories: number;
  totalThreads: number;
  totalForumComments: number;
  pendingReports: number;
  newUsersToday: number;
  newThreadsToday: number;
  newCommentsToday: number;
}

interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  threadCount: number;
  displayOrder: number;
  isActive?: boolean;
}

type AdminTab = 'dashboard' | 'categories' | 'users' | 'reports';

export const AdminDashboard: React.FC = () => {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New category form
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  useEffect(() => {
    if (activeTab === 'dashboard') fetchStats();
    if (activeTab === 'categories') fetchCategories();
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/stats`, { headers });
      if (!response.ok) throw new Error('Không có quyền truy cập');
      const data = await response.json();
      setStats({
        totalUsers: data.total_users,
        usersByRole: data.users_by_role,
        totalCategories: data.total_categories,
        totalThreads: data.total_threads,
        totalForumComments: data.total_forum_comments,
        pendingReports: data.pending_reports,
        newUsersToday: data.new_users_today,
        newThreadsToday: data.new_threads_today,
        newCommentsToday: data.new_comments_today,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/forum/categories`, { headers });
      if (!response.ok) throw new Error('Không thể tải danh mục');
      const data = await response.json();
      setCategories(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/admin/categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newCatName,
          description: newCatDesc || null,
          icon: newCatIcon || null,
          display_order: categories.length,
        }),
      });

      if (!response.ok) throw new Error('Không thể tạo danh mục');
      
      const newCat = await response.json();
      setCategories([...categories, newCat]);
      setShowNewCategory(false);
      setNewCatName('');
      setNewCatDesc('');
      setNewCatIcon('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể tạo danh mục');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Bạn có chắc muốn xóa danh mục này?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/categories/${categoryId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) throw new Error('Không thể xóa danh mục');
      setCategories(categories.filter(c => c.id !== categoryId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể xóa danh mục');
    }
  };

  // Check admin access
  const userRole = (user as any)?.role;
  const isAdmin = userRole === 'ADMIN' || userRole === UserRole.ADMIN || (user as any)?.is_superuser;

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-xl font-bold text-red-400 mb-2">Không có quyền truy cập</h1>
          <p className="text-slate-400">Bạn cần quyền Admin để truy cập trang này.</p>
          <button
            onClick={() => window.location.hash = 'feed'}
            className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Quay về Trang chủ
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: '📊' },
    { id: 'categories', label: 'Danh mục', icon: '📁' },
    { id: 'users', label: 'Người dùng', icon: '👥' },
    { id: 'reports', label: 'Báo cáo', icon: '🚨' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-amber-400">
          Quản trị hệ thống
        </h1>
        <p className="text-slate-400 mt-1">Xin chào, Admin {(user as any)?.username}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700/50 pb-3 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                        transition-colors whitespace-nowrap
                       ${activeTab === tab.id 
                         ? 'bg-amber-500/20 text-amber-400' 
                         : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'reports' && stats?.pendingReports ? (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {stats.pendingReports}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 text-red-300">
          {error}
        </div>
      )}

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse">
                  <div className="h-8 bg-slate-700 rounded mb-2"></div>
                  <div className="h-4 bg-slate-700 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Main stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon="👥" label="Người dùng" value={stats.totalUsers} />
                <StatCard icon="📁" label="Danh mục" value={stats.totalCategories} />
                <StatCard icon="📝" label="Chủ đề" value={stats.totalThreads} />
                <StatCard icon="💬" label="Bình luận" value={stats.totalForumComments} />
              </div>

              {/* Today's activity */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <h3 className="font-semibold text-slate-200 mb-3">📆 Hoạt động hôm nay</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-400">{stats.newUsersToday}</div>
                    <div className="text-xs text-slate-500">Người dùng mới</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">{stats.newThreadsToday}</div>
                    <div className="text-xs text-slate-500">Chủ đề mới</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">{stats.newCommentsToday}</div>
                    <div className="text-xs text-slate-500">Bình luận mới</div>
                  </div>
                </div>
              </div>

              {/* Pending reports */}
              {stats.pendingReports > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-red-400">
                        🚨 {stats.pendingReports} báo cáo đang chờ xử lý
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Hãy kiểm tra và xử lý các báo cáo vi phạm
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('reports')}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 
                                 rounded-lg transition-colors"
                    >
                      Xem báo cáo
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-200">Quản lý danh mục</h2>
            <button
              onClick={() => setShowNewCategory(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 
                         text-slate-900 font-semibold rounded-lg transition-all"
            >
              + Tạo danh mục
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse">
                  <div className="h-5 bg-slate-700 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-slate-800/60 rounded-xl p-8 text-center text-slate-400">
              <div className="text-4xl mb-3">📭</div>
              <p>Chưa có danh mục nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 
                             flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon || '📁'}</span>
                    <div>
                      <h3 className="font-semibold text-slate-100">{cat.name}</h3>
                      {cat.description && (
                        <p className="text-sm text-slate-400">{cat.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{cat.threadCount} chủ đề</span>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Category Modal */}
          {showNewCategory && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-800 rounded-2xl w-full max-w-md">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-amber-400">Tạo danh mục mới</h2>
                  <button
                    onClick={() => setShowNewCategory(false)}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                </div>
                
                <form onSubmit={handleCreateCategory} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Tên danh mục *
                    </label>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="VD: Thảo luận chung"
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                                 focus:outline-none focus:border-amber-500 text-slate-100"
                      maxLength={100}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Mô tả
                    </label>
                    <input
                      type="text"
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="Mô tả ngắn về danh mục..."
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                                 focus:outline-none focus:border-amber-500 text-slate-100"
                      maxLength={500}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Icon (emoji)
                    </label>
                    <input
                      type="text"
                      value={newCatIcon}
                      onChange={(e) => setNewCatIcon(e.target.value)}
                      placeholder="VD: 💬"
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg
                                 focus:outline-none focus:border-amber-500 text-slate-100"
                      maxLength={10}
                    />
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowNewCategory(false)}
                      className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !newCatName.trim()}
                      className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 
                                 text-slate-900 font-semibold rounded-lg transition-all 
                                 disabled:opacity-50"
                    >
                      {submitting ? 'Đang tạo...' : 'Tạo danh mục'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="bg-slate-800/60 rounded-xl p-8 text-center text-slate-400">
          <div className="text-4xl mb-3">👥</div>
          <p>Quản lý người dùng</p>
          <p className="text-sm mt-2">Tính năng đang phát triển...</p>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="bg-slate-800/60 rounded-xl p-8 text-center text-slate-400">
          <div className="text-4xl mb-3">🚨</div>
          <p>Quản lý báo cáo</p>
          <p className="text-sm mt-2">Tính năng đang phát triển...</p>
        </div>
      )}
    </div>
  );
};

// Stat card component
const StatCard: React.FC<{ icon: string; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xl">{icon}</span>
      <span className="text-slate-400 text-sm">{label}</span>
    </div>
    <div className="text-2xl font-bold text-slate-100">{value}</div>
  </div>
);

export default AdminDashboard;
