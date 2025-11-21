import React, { useState } from 'react';
import { Search, Zap, Shield, Sword, BookOpen, Info } from 'lucide-react';
import { HERO_LIST } from '../constants';
import { generateHeroGuide } from '../services/geminiService';

export const Guide: React.FC = () => {
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [guideContent, setGuideContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHeroes = HERO_LIST.filter(h => h.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleHeroSelect = async (hero: string) => {
    setSelectedHero(hero);
    setLoading(true);
    setGuideContent(null);
    
    const content = await generateHeroGuide(hero);
    setGuideContent(content);
    setLoading(false);
  };

  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('##')) return <h3 key={i} className="text-xl font-display font-bold text-gold-400 mt-6 mb-3 border-l-4 border-gold-500 pl-3 uppercase tracking-widest bg-gradient-to-r from-gold-500/10 to-transparent py-1">{line.replace('##', '')}</h3>;
      if (line.startsWith('**')) return <p key={i} className="font-bold text-white mt-3 mb-1 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-400" /> {line.replace(/\*\*/g, '')}</p>;
      if (line.startsWith('-')) return <li key={i} className="ml-6 text-slate-300 list-none relative pl-4 before:content-['>'] before:absolute before:left-0 before:text-gold-500 before:font-bold py-1">{line.replace('-', '')}</li>;
      return <p key={i} className="text-slate-300 mb-2 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-4 w-full pb-24 md:pb-8 pt-6">
      {!selectedHero ? (
        <div className="animate-fade-in">
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-display font-bold text-white uppercase tracking-[0.2em] mb-2 glow-text">Dữ Liệu Tướng</h2>
            <div className="h-1 w-24 bg-gold-500 mx-auto mb-6"></div>
            
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-4 top-3.5 text-slate-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Tìm kiếm hồ sơ tướng..."
                className="w-full bg-slate-900/80 border border-slate-600 py-3 pl-12 pr-4 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500 outline-none clip-angled transition-all placeholder-slate-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {filteredHeroes.map(hero => (
              <button
                key={hero}
                onClick={() => handleHeroSelect(hero)}
                className="group relative h-40 bg-slate-900 border border-slate-700 overflow-hidden hover:border-gold-400 transition-all duration-300 flex flex-col items-center justify-center"
              >
                {/* Hover Effect Background */}
                <div className="absolute inset-0 bg-blue-900/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                
                <div className="w-16 h-16 bg-slate-800 rounded-full mb-3 flex items-center justify-center relative z-10 group-hover:scale-110 transition-transform border-2 border-slate-600 group-hover:border-gold-500">
                   <span className="text-2xl font-display font-bold text-slate-500 group-hover:text-white">{hero[0]}</span>
                </div>
                
                <span className="font-display font-bold text-lg text-slate-400 group-hover:text-gold-400 uppercase tracking-wider relative z-10">{hero}</span>
                
                {/* Tech corners */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-600 group-hover:border-gold-500"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-600 group-hover:border-gold-500"></div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in w-full">
          <button 
            onClick={() => setSelectedHero(null)}
            className="text-slate-400 hover:text-gold-400 mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-colors"
          >
            ← TRỞ VỀ DANH SÁCH
          </button>

          <div className="flex flex-col md:flex-row gap-6">
             {/* Hero Portrait / Left Panel */}
             <div className="md:w-1/3">
                <div className="bg-slate-900 border border-slate-700 p-1 clip-angled sticky top-6">
                   <div className="bg-gradient-to-b from-slate-800 to-slate-950 p-8 flex flex-col items-center border border-slate-800 clip-angled">
                      <div className="w-32 h-32 bg-slate-800 rounded-full mb-4 border-4 border-gold-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                        <Sword className="w-12 h-12 text-gold-500" />
                      </div>
                      <h1 className="text-4xl font-display font-bold text-white uppercase tracking-wider mb-1">{selectedHero}</h1>
                      <div className="text-gold-400 text-xs font-mono border border-gold-500/30 px-2 py-1 rounded mb-6">CLASS: UNKNOWN</div>
                      
                      <div className="w-full space-y-2">
                         <div className="flex justify-between text-xs text-slate-400 font-mono"><span>DAMAGE</span> <div className="w-24 h-2 bg-slate-800"><div className="h-full bg-red-500 w-[80%]"></div></div></div>
                         <div className="flex justify-between text-xs text-slate-400 font-mono"><span>DIFFICULTY</span> <div className="w-24 h-2 bg-slate-800"><div className="h-full bg-purple-500 w-[60%]"></div></div></div>
                         <div className="flex justify-between text-xs text-slate-400 font-mono"><span>SURVIVAL</span> <div className="w-24 h-2 bg-slate-800"><div className="h-full bg-green-500 w-[40%]"></div></div></div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Content / Right Panel */}
             <div className="flex-1 bg-slate-900/80 border-t border-b md:border border-slate-700 md:clip-angled p-6 md:p-8 relative min-h-[500px]">
                <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                   <BookOpen className="w-24 h-24 text-white" />
                </div>

                {loading ? (
                  <div className="space-y-6 animate-pulse pt-10">
                    <div className="h-4 bg-slate-800 rounded w-1/4 mb-8"></div>
                    <div className="space-y-2">
                       <div className="h-3 bg-slate-800 rounded w-3/4"></div>
                       <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                       <div className="h-3 bg-slate-800 rounded w-2/3"></div>
                    </div>
                    <div className="h-32 bg-slate-800 rounded w-full mt-8 opacity-50"></div>
                    <div className="flex items-center justify-center mt-10 gap-2 text-gold-500 font-mono text-sm">
                       <span className="animate-spin">✦</span> Đang phân tích dữ liệu Meta...
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none">
                     <div className="flex items-center gap-2 mb-6">
                        <Info className="text-blue-400 w-5 h-5" />
                        <span className="text-xs font-mono text-blue-400">AI GENERATED CONTENT // VER: 2.5-FLASH</span>
                     </div>
                    {guideContent ? renderContent(guideContent) : <p className="text-red-400">System Error: Unable to retrieve data.</p>}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};