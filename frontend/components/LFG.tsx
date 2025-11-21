import React from 'react';
import { MOCK_POSTS } from '../constants';
import { Users, Sword, Clock, Activity } from 'lucide-react';

export const LFG: React.FC = () => {
  const lfgPosts = MOCK_POSTS.filter(p => p.type === 'LFG');

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 md:pb-8 w-full pt-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold text-white uppercase tracking-wider">Sảnh Chờ</h2>
          <div className="flex items-center gap-2 mt-1">
             <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
             <p className="text-slate-400 text-sm font-mono">3,421 Players Online</p>
          </div>
        </div>
        <button className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold py-2 px-6 clip-hex-button shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all hover:scale-105">
          + TẠO PHÒNG
        </button>
      </header>

      <div className="grid gap-6">
        {lfgPosts.map(post => (
          <div key={post.id} className="bg-slate-900 relative border border-slate-700 hover:border-gold-500/50 transition-all group overflow-hidden">
             {/* Background accent */}
             <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-slate-800/50 to-transparent skew-x-12 translate-x-10"></div>
             
             <div className="p-5 relative z-10 flex flex-col md:flex-row gap-6">
                {/* Left: User Info */}
                <div className="flex flex-row md:flex-col items-center md:items-start gap-4 md:w-1/4 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-4">
                   <div className="relative">
                      <img src={post.user.avatar} alt={post.user.name} className="w-14 h-14 clip-hex-button object-cover border-2 border-slate-600 group-hover:border-gold-500 transition-colors" />
                      <div className="absolute -bottom-1 -right-1 bg-slate-950 text-[10px] text-gold-500 border border-gold-500 px-1 font-bold">
                         CAPT
                      </div>
                   </div>
                   <div>
                      <h3 className="font-display font-bold text-white text-lg leading-tight">{post.user.name}</h3>
                      <div className="text-xs font-mono text-slate-400 mt-1">Winrate: <span className="text-green-400">{post.user.winRate}%</span></div>
                      <span className="inline-block mt-2 bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 border border-slate-700 uppercase">
                        {post.user.rank}
                      </span>
                   </div>
                </div>

                {/* Middle: Request Info */}
                <div className="flex-1 flex flex-col justify-between">
                   <div>
                      <div className="flex items-center gap-2 mb-2">
                         <Activity className="w-4 h-4 text-gold-500" />
                         <span className="text-xs font-bold text-gold-500 uppercase tracking-widest">RANKED MATCH</span>
                      </div>
                      <p className="text-slate-200 text-lg font-medium italic border-l-4 border-gold-500 pl-4 py-1 bg-gradient-to-r from-gold-500/10 to-transparent">
                        "{post.content}"
                      </p>
                   </div>
                   
                   <div className="flex gap-4 mt-4 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.timestamp}</span>
                      <span className="flex items-center gap-1 text-blue-400"><Users className="w-3 h-3" /> Slots: 2/5</span>
                   </div>
                </div>

                {/* Right: Action */}
                <div className="flex flex-col justify-center items-stretch min-w-[140px]">
                   <div className="text-center mb-2">
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Đang tìm</div>
                      <div className="flex gap-1 justify-center">
                         <div className="w-8 h-8 bg-slate-800 border border-slate-600 flex items-center justify-center rounded-sm" title="Mid"><Sword className="w-4 h-4 text-slate-400" /></div>
                         <div className="w-8 h-8 bg-slate-800 border border-slate-600 flex items-center justify-center rounded-sm" title="Support"><Users className="w-4 h-4 text-slate-400" /></div>
                      </div>
                   </div>
                   <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 clip-angled transition-all uppercase tracking-wider text-sm">
                     XIN SLOT
                   </button>
                </div>
             </div>
          </div>
        ))}

        {/* Static Mock - Empty State Style */}
        <div className="border border-dashed border-slate-700 rounded-none p-8 text-center opacity-50 hover:opacity-100 transition-opacity cursor-pointer bg-slate-900/30">
           <div className="w-16 h-16 bg-slate-800 rounded-full mx-auto flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-500" />
           </div>
           <h3 className="text-white font-bold mb-1">Không tìm thấy phòng phù hợp?</h3>
           <p className="text-slate-400 text-sm">Tự tạo phòng và rủ rê bạn bè ngay</p>
        </div>
      </div>
    </div>
  );
};