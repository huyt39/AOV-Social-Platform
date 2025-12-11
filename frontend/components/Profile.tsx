import React, { useRef, useState } from 'react';
import { useAuth } from '../contexts/authContext';
import { Target, Shield, Hexagon, Camera, Loader } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Rank display mapping
const RANK_DISPLAY: Record<string, string> = {
  BRONZE: 'Đồng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  PLATINUM: 'Bạch Kim',
  DIAMOND: 'Kim Cương',
  VETERAN: 'Tinh Anh',
  MASTER: 'Cao Thủ',
  CONQUEROR: 'Thách Đấu',
};

// Role display mapping
const ROLE_DISPLAY: Record<string, string> = {
  TOP: 'Đường Caesar',
  JUNGLE: 'Rừng',
  MID: 'Đường Giữa',
  AD: 'Xạ Thủ',
  SUPPORT: 'Trợ Thủ',
};

export const Profile: React.FC = () => {
  const { user, token, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Calculate chart data based on user's win rate
  const winRate = user?.win_rate || 50;
  const totalMatches = user?.total_matches || 0;
  const wins = Math.round((winRate / 100) * totalMatches);
  const losses = totalMatches - wins;

  const data = [
    { name: 'Thắng', value: wins || 50 },
    { name: 'Thua', value: losses || 50 },
  ];
  const COLORS = ['#f59e0b', '#334155'];

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);

    try {
      // Step 1: Upload image to ImgBB via backend
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await fetch(`${API_URL}/auth/upload-image`, {
        method: 'POST',
        body: formData,
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadResult.success) {
        throw new Error('Upload failed');
      }

      // Step 2: Update user avatar
      const avatarResponse = await fetch(`${API_URL}/auth/me/avatar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ avatar_url: uploadResult.url }),
      });

      const avatarResult = await avatarResponse.json();

      if (avatarResponse.ok && avatarResult.success) {
        updateUser({ avatar_url: avatarResult.avatar_url });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Đang tải...</div>
      </div>
    );
  }

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
            {/* Avatar with Hexagon Frame - Clickable for upload */}
            <div 
              className="relative w-36 h-36 flex-shrink-0 mx-auto md:mx-0 cursor-pointer group/avatar"
              onClick={handleAvatarClick}
            >
               <input
                 type="file"
                 ref={fileInputRef}
                 onChange={handleFileChange}
                 accept="image/jpeg,image/png,image/gif,image/webp"
                 className="hidden"
               />
               <div className="absolute inset-0 bg-slate-900 clip-hex-button transform scale-105"></div>
               <img 
                 src={user.avatar_url || 'https://via.placeholder.com/200?text=Avatar'} 
                 alt={user.username} 
                 className="w-full h-full object-cover clip-hex-button border-2 border-gold-500 relative z-10"
               />
               {/* Upload overlay */}
               <div className="absolute inset-0 bg-black/60 clip-hex-button opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center z-20">
                 {isUploading ? (
                   <Loader className="w-8 h-8 text-gold-500 animate-spin" />
                 ) : (
                   <Camera className="w-8 h-8 text-gold-500" />
                 )}
               </div>
               <div className="absolute bottom-0 right-0 bg-slate-900 p-1 z-20">
                 <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider border border-red-400">
                    LV.{user.level || 1}
                 </div>
               </div>
            </div>

            {/* Name & Title */}
            <div className="flex-1 text-center md:text-left mb-2 w-full">
               <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-4xl font-display font-bold text-white tracking-tight uppercase drop-shadow-md">
                      {user.username}
                    </h1>
                    <div className="flex items-center justify-center md:justify-start gap-3 mt-1">
                      <span className="text-slate-400 text-sm font-mono bg-slate-800 px-2 py-0.5 rounded-sm border border-slate-700">
                        UID: {user.id.slice(0, 8)}
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
            { label: 'Xếp Hạng', value: user.rank ? RANK_DISPLAY[user.rank] || user.rank : 'Chưa xếp hạng', color: 'text-purple-400', sub: 'Mùa 24' },
            { label: 'Vị Trí', value: user.main_role ? ROLE_DISPLAY[user.main_role] || user.main_role : 'Chưa chọn', color: 'text-blue-400', sub: 'Chuyên Gia' },
            { label: 'Tỉ Lệ Thắng', value: `${user.win_rate?.toFixed(1) || 0}%`, color: 'text-green-400', sub: 'Thượng thừa' },
            { label: 'Số Trận', value: user.total_matches?.toLocaleString() || '0', color: 'text-white', sub: 'Total Games' },
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

      {/* Winrate Chart Module - Full width since we removed Tướng Tủ */}
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
                <span className="text-2xl font-bold text-white">{winRate.toFixed(0)}%</span>
                <span className="text-[10px] text-slate-500 uppercase">Winrate</span>
              </div>
           </div>
           <div className="flex-1 space-y-3">
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-gold-500 rounded-sm"></div> Chiến Thắng</span>
                 <span className="text-white font-bold font-mono">{wins}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-400 flex items-center gap-2"><div className="w-2 h-2 bg-slate-700 rounded-sm"></div> Thất Bại</span>
                 <span className="text-white font-bold font-mono">{losses}</span>
              </div>
              <div className="h-px bg-slate-800 my-2"></div>
              <div className="text-xs text-slate-500 text-center italic">
                 {winRate >= 55 ? '"Phong độ đang rất cao!"' : winRate >= 50 ? '"Tiếp tục cố gắng!"' : '"Đừng bỏ cuộc, chiến binh!"'}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};