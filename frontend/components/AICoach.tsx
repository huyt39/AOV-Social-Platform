import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Cpu, Sparkles } from 'lucide-react';
import { chatWithCoach } from '../services/geminiService';
import { ChatMessage } from '../types';

export const AICoach: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'model', text: 'SYSTEM ONLINE...\nXin chào kiện tướng! Tôi là AI Tactical Support. Bạn cần phân tích meta, build đồ hay khắc chế tướng nào?', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Prepare history for context
    const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    const responseText = await chatWithCoach(userMsg.text, history);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, botMsg]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen bg-slate-950 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.9)_2px,transparent_2px),linear-gradient(90deg,rgba(15,23,42,0.9)_2px,transparent_2px)] bg-[size:40px_40px] pointer-events-none opacity-20"></div>

      <header className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center gap-4 z-10 shadow-lg">
        <div className="w-12 h-12 relative flex items-center justify-center">
           <div className="absolute inset-0 border-2 border-blue-500 rounded-full animate-[spin_10s_linear_infinite] border-t-transparent"></div>
           <div className="absolute inset-2 border border-blue-300/50 rounded-full"></div>
           <Bot className="text-blue-400 w-6 h-6 relative z-10" />
        </div>
        <div>
          <h2 className="font-display font-bold text-white text-xl tracking-wide flex items-center gap-2">
            AI TACTICAL COACH <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">ONLINE</span>
          </h2>
          <p className="text-slate-500 text-xs font-mono">GEMINI-2.5-FLASH CORE // LINKED</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 z-10 scroll-smooth">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center clip-hex-button ${
              msg.role === 'user' ? 'bg-gold-600' : 'bg-slate-800 border border-blue-500/50'
            }`}>
              {msg.role === 'user' ? <User className="w-6 h-6 text-slate-900" /> : <Cpu className="w-6 h-6 text-blue-400" />}
            </div>
            
            <div className="flex flex-col max-w-[85%] md:max-w-[70%]">
               <span className={`text-[10px] font-mono mb-1 opacity-50 uppercase ${msg.role === 'user' ? 'text-right text-gold-400' : 'text-blue-400'}`}>
                 {msg.role === 'user' ? 'Commander' : 'System'} // {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
               </span>
               <div
                className={`p-4 text-sm md:text-base leading-relaxed whitespace-pre-wrap shadow-lg relative ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-gold-50 border-r-2 border-gold-500 clip-angled'
                    : 'bg-slate-900/80 text-blue-100 border-l-2 border-blue-500 clip-angled'
                }`}
              >
                {msg.text}
                {/* Decorative corner line */}
                <div className={`absolute w-3 h-3 border-b border-opacity-50 ${
                    msg.role === 'user' ? 'bottom-0 right-0 border-r border-gold-500' : 'bottom-0 left-0 border-l border-blue-500'
                }`}></div>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-slate-800 border border-blue-500/50 flex items-center justify-center clip-hex-button">
              <Cpu className="w-6 h-6 text-blue-400" />
            </div>
            <div className="bg-slate-900/80 border-l-2 border-blue-500 p-4 clip-angled flex items-center gap-2">
              <span className="text-blue-400 font-mono text-xs animate-pulse">ANALYZING STRATEGY...</span>
              <div className="flex gap-1">
                 <span className="w-1 h-4 bg-blue-500/50 animate-[pulse_0.6s_ease-in-out_infinite]"></span>
                 <span className="w-1 h-4 bg-blue-500/50 animate-[pulse_0.6s_ease-in-out_0.2s_infinite]"></span>
                 <span className="w-1 h-4 bg-blue-500/50 animate-[pulse_0.6s_ease-in-out_0.4s_infinite]"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-950/90 backdrop-blur z-20">
        <div className="flex gap-0 max-w-4xl mx-auto relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 opacity-20 blur rounded-none"></div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Nhập lệnh yêu cầu chiến thuật..."
            className="flex-1 bg-slate-900 text-white px-6 py-4 focus:outline-none placeholder-slate-600 border border-slate-700 font-mono text-sm clip-angled"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-gold-600 hover:bg-gold-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 px-6 flex items-center justify-center transition-all font-bold uppercase tracking-wider clip-angled ml-2"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};