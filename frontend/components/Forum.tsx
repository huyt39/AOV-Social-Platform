import React, { useState, useEffect } from 'react';
import { ForumCategory, ForumCategoriesResponse } from '../types';
import { API_BASE_URL } from '../constants';

interface ForumProps {
  onNavigate?: (route: string) => void;
}

export const Forum: React.FC<ForumProps> = ({ onNavigate }) => {
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/forum/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      
      const data: ForumCategoriesResponse = await response.json();
      setCategories(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    window.location.hash = `forum/category/${categoryId}`;
  };

  const getCategoryIcon = (icon?: string): string => {
    // Default icons for common categories
    const defaultIcons: Record<string, string> = {
      'general': '💬',
      'gameplay': '🎮',
      'heroes': '⚔️',
      'builds': '🛠️',
      'events': '🎉',
      'bugs': '🐛',
      'suggestions': '💡',
    };
    return icon || defaultIcons[categories[0]?.name.toLowerCase()] || '📁';
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/60 rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-700 rounded-lg"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-700 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-slate-700 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300">
          <p>{error}</p>
          <button 
            onClick={fetchCategories}
            className="mt-2 px-4 py-1 bg-red-500/30 hover:bg-red-500/50 rounded-lg transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
      </div>

      {/* Category List */}
      {categories.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl p-8 text-center text-slate-400">
          <div className="text-4xl mb-3">📭</div>
          <p>Chưa có danh mục nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className="w-full bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 
                         hover:border-amber-500/30 rounded-xl p-4 transition-all duration-200
                         text-left group"
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 
                                rounded-lg flex items-center justify-center text-2xl
                                group-hover:from-amber-500/30 group-hover:to-orange-500/30 transition-colors">
                  {getCategoryIcon(category.icon)}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-100 group-hover:text-amber-300 
                                 transition-colors truncate">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="text-sm text-slate-400 truncate mt-0.5">
                      {category.description}
                    </p>
                  )}
                </div>
                
                {/* Thread Count */}
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-amber-400">
                    {category.threadCount}
                  </div>
                  <div className="text-xs text-slate-500">chủ đề</div>
                </div>
                
                {/* Arrow */}
                <svg 
                  className="w-5 h-5 text-slate-500 group-hover:text-amber-400 
                             group-hover:translate-x-1 transition-all"
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Info Section */}
      <div className="mt-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 
                      border border-amber-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div>
            <h4 className="font-semibold text-amber-300 mb-1">
              Quy định diễn đàn
            </h4>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• Tôn trọng thành viên khác, không spam</li>
              <li>• Không đăng nội dung vi phạm pháp luật</li>
              <li>• Đặt tiêu đề rõ ràng, sử dụng đúng danh mục</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forum;
