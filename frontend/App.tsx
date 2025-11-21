import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { Feed } from './components/Feed';
import { LFG } from './components/LFG';
import { Guide } from './components/Guide';
import { AICoach } from './components/AICoach';
import { Profile } from './components/Profile';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('feed');

  const renderContent = () => {
    switch (activeTab) {
      case 'feed': return <Feed />;
      case 'lfg': return <LFG />;
      case 'guide': return <Guide />;
      case 'coach': return <AICoach />;
      case 'profile': return <Profile />;
      default: return <Feed />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-amber-500/30">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 md:h-screen md:overflow-y-auto relative">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
