import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, Zap, ShieldCheck } from 'lucide-react';
import { MOCK_POSTS, CURRENT_USER } from '../constants';
import { Post } from '../types';

export const Feed: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [newPostContent, setNewPostContent] = useState('');

  const handlePost = () => {
    if (!newPostContent.trim()) return;
    const newPost: Post = {
      id: Date.now().toString(),
      userId: CURRENT_USER.id,
      user: CURRENT_USER,
      content: newPostContent,
      likes: 0,
      comments: 0,
      timestamp: 'Vừa xong',
      type: 'DISCUSSION'
    };
    setPosts([newPost, ...posts]);
    setNewPostContent('');
  };

  return (
    <div className="max-w-2xl mx-auto w-full pb-24 md:pb-8 pt-4">
      {/* Create Post HUD */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-1 rounded-none clip-angled mb-8 mx-4 shadow-[0_0_15px_rgba(0,0,0,0.3)]">
        <div className="bg-slate-800/50 p-4 clip-angled border-l-2 border-gold-500">
          <div className="flex gap-4">
             <div className="relative">
                <img src={CURRENT_USER.avatar} alt={CURRENT_USER.name} className="w-12 h-12 rounded-none clip-hex-button object-cover border border-slate-600" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-slate-900 transform rotate-45"></div>
             </div>
            <textarea
              className="w-full bg-slate-950/50 text-white rounded-sm p-3 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none placeholder-slate-500 font-medium border border-slate-700/50"
              placeholder="Chia sẻ chiến thuật, highlight hoặc tìm team..."
              rows={2}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
            />
          </div>
          <div className="flex justify-between items-center mt-3 pl-16">
            <div className="flex gap-2">
               {/* Decor elements */}
               <div className="h-1 w-8 bg-slate-700 skew-x-12"></div>
               <div className="h-1 w-4 bg-slate-700 skew-x-12 opacity-50"></div>
            </div>
            <button 
              onClick={handlePost}
              className="bg-gold-500 hover:bg-gold-400 text-slate-950 font-display font-bold py-1.5 px-6 clip-hex-button transition-all hover:translate-y-[-2px] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
            >
              ĐĂNG BÀI
            </button>
          </div>
        </div>
      </div>

      {/* Post List */}
      <div className="space-y-6 px-4">
        {posts.map((post) => (
          <div key={post.id} className="group relative bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors">
            {/* Decorative corner accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-gold-500"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-gold-500"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-gold-500"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-gold-500"></div>

            <div className="p-5">
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="relative cursor-pointer group-hover:scale-105 transition-transform">
                  <img src={post.user.avatar} alt={post.user.name} className="w-12 h-12 object-cover clip-hex-button border-2 border-slate-700" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950 text-[10px] font-bold px-2 py-0.5 border border-slate-700 text-gold-500 whitespace-nowrap">
                    {post.user.rank}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg text-white tracking-wide flex items-center gap-2">
                        {post.user.name}
                        {post.user.winRate > 60 && <Zap className="w-4 h-4 text-gold-400 fill-gold-400" />}
                      </h3>
                      <p className="text-slate-500 text-xs font-mono uppercase tracking-wider">{post.timestamp} • {post.user.mainRole}</p>
                    </div>
                    {post.type === 'LFG' && (
                      <div className="bg-green-900/20 text-green-400 text-xs font-bold px-3 py-1 border border-green-500/30 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> TÌM TEAM
                      </div>
                    )}
                    {post.type === 'HIGHLIGHT' && (
                      <div className="bg-purple-900/20 text-purple-400 text-xs font-bold px-3 py-1 border border-purple-500/30 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> HIGHLIGHT
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <p className="text-slate-200 mb-4 text-sm leading-relaxed font-light whitespace-pre-wrap border-l-2 border-slate-700 pl-3">
                {post.content}
              </p>
              
              {post.image && (
                <div className="relative mb-4 group-hover:brightness-110 transition-all">
                  <div className="absolute inset-0 border border-white/10 pointer-events-none z-10"></div>
                  <img src={post.image} alt="Post content" className="w-full h-64 object-cover clip-angled" />
                  <div className="absolute bottom-0 left-0 bg-black/60 backdrop-blur px-3 py-1 text-xs font-mono text-white z-20">
                    MEDIA_VIEW.01
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-6 text-slate-400 border-t border-slate-800 pt-3 mt-2">
                <button className="flex items-center gap-2 hover:text-gold-400 transition-colors group/btn">
                  <Heart className="w-5 h-5 group-hover/btn:fill-gold-400 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-sm font-bold">{post.likes}</span>
                </button>
                <button className="flex items-center gap-2 hover:text-blue-400 transition-colors group/btn">
                  <MessageCircle className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-sm font-bold">{post.comments}</span>
                </button>
                <button className="flex items-center gap-2 hover:text-white transition-colors ml-auto">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};