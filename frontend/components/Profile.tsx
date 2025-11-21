import React from 'react';
import { CURRENT_USER } from '../constants';
import { Trophy, Target, Shield, Sword, Hexagon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export const Profile: React.FC = () => {
  const data = [
    { name: 'Thắng', value: 320 },
    { name: 'Thua', value: 180 },
  ];
  const COLORS = ['#f59e0b', '#334155'];

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 md:pb-8 w-full animate-fade-in pt-6">
      
      {/* Banner / Header */}
      <div className="relative mb-8 group">
         {/* Background Banner */}
         <div className="h-48 w-full bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-t-none border-b-4 border-gold-500 relative overflow-hidden clip-angled">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-gold-500/10 to-transparent transform skew-x-12 translate-x-20"></div>
         </div>

         {/* User Info Overlay */}
         <div className="px-6 md:px-10 relative -mt-16 flex flex-col md:flex-row items-end gap-6">
            {/* Avatar with Hexagon Frame */}
            <div className="relative w-36 h-36 flex-shrink-0 mx-auto md:mx-0">
               <div className="absolute inset-0 bg-slate-900 clip-hex-button transform scale-105"></div>
               <img 
                 src={CURRENT_USER.avatar} 
                 alt={CURRENT_USER.name} 
                 className="w-full h-full object-cover clip-hex-button border-2 border-gold-500 relative z-10"
               />
               <div className="absolute bottom-0 right-0 bg-slate-900 p-1 z-20">
                 <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider border border-red-400">
                    LV.30
                 </div>
               </div>
            </div>

            {/* Name & Title */}
            <div className="flex-1 text-center md:text-left mb-2 w-full">
               <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-4xl font-display font-bold text-white tracking-tight uppercase drop-shadow-md">
                      {CURRENT_USER.name}
                    </h1>
                    <div className="flex items-center justify-center md:justify-start gap-3 mt-1">
                      <span className="text-slate-400 text-sm font-mono bg-slate-800 px-2 py-0.5 rounded-sm border border-slate-700">
                        UID: {CURRENT_USER.id}8829
                      </span>
                      <span className="text-gold-400 text-sm font-bold flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Server Mặt Trời
                      </span>
                    </div>
                  </div>
                  
                  <button className="bg-slate-800 hover:bg-gold-500 hover:text-slate-900 border border-gold-500 text-gold-500 font-bold py-2 px-8 clip-hex-button transition-all uppercase tracking-wider">
                    Chỉnh sửa
                  </button>
               </div>
            </div>
         </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
         {[
            { label: 'Xếp Hạng', value: CURRENT_USER.rank, color: 'text-purple-400', sub: 'Mùa 24' },
            { label: 'Vị Trí', value: CURRENT_USER.mainRole, color: 'text-blue-400', sub: 'Chuyên Gia' },
            { label: 'Tỉ Lệ Thắng', value: `${CURRENT_USER.winRate}%`, color: 'text-green-400', sub: 'Thượng thừa' },
            { label: 'Số Trận', value: '1,245', color: 'text-white', sub: 'Total Games' },
         ].map((stat, idx) => (
           <div key={idx} className="bg-slate-900/80 p-4 border border-slate-700 clip-angled relative overflow-hidden group hover:border-gold-500/50 transition-colors">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                 <Hexagon className="w-12 h-12 text-white" />
              </div>
              <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">{stat.label}</div>
              <div className={`font-display font-bold text-2xl ${stat.color} glow-text`}>{stat.value}</div>
              <div className="text-slate-600 text-[10px] mt-1 font-mono">{stat.sub}</div>
           </div>
         ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Winrate Chart Module */}
        <div className="bg-slate-900 border border-slate-800 clip-angled p-6 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-50"></div>
          <h3 className="text-lg font-display font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-2">
            <Target className="w-5 h-5 text-gold-500" /> THỐNG KÊ MÙA GIẢI
          </h3>
          <div className="flex items-center gap-8">
             <div className="h-40 w-40 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        stroke="none"
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-white">64%</span>
                  <span className="text-[10px] text-slate-500 uppercase">Winrate</span>
                </div>
             </div>
             <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center text-sm">
                   <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-gold-500 rounded-sm"></div> Chiến Thắng</span>
                   <span className="text-white font-bold font-mono">320</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-slate-700 rounded-sm"></div> Thất Bại</span>
                   <span className="text-white font-bold font-mono">180</span>
                </div>
                <div className="h-px bg-slate-800 my-2"></div>
                <div className="text-xs text-slate-500 text-center italic">
                   "Phong độ đang rất cao!"
                </div>
             </div>
          </div>
        </div>

        {/* Top Heroes Module */}
        <div className="bg-slate-900 border border-slate-800 clip-angled p-6 relative">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
           <h3 className="text-lg font-display font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-2">
            <Trophy className="w-5 h-5 text-gold-500" /> TƯỚNG TỦ
          </h3>
          <div className="space-y-4">
            {[
              { name: 'Valhein', matches: 120, win: 58, role: 'Xạ Thủ' },
              { name: 'Murad', matches: 85, win: 62, role: 'Rừng' },
              { name: 'Krixi', matches: 40, win: 45, role: 'Pháp Sư' }
            ].map((hero, idx) => (
              <div key={idx} className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-slate-800 border border-slate-600 flex items-center justify-center text-sm font-bold text-slate-400 group-hover:text-gold-500 group-hover:border-gold-500 transition-all clip-hex-button">
                  {hero.name[0]}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <span className="text-white font-display font-bold tracking-wide">{hero.name}</span>
                    <span className={`font-bold font-mono ${hero.win >= 60 ? 'text-gold-400' : 'text-blue-400'}`}>{hero.win}% WR</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-none relative overflow-hidden">
                    <div 
                      className={`h-full absolute top-0 left-0 ${hero.win >= 60 ? 'bg-gold-500' : 'bg-blue-500'}`} 
                      style={{ width: `${hero.win}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 text-right">{hero.matches} Matches</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};