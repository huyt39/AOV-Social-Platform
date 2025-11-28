import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Feed } from './components/Feed';
import { LFG } from './components/LFG';
import { Guide } from './components/Guide';
import { AICoach } from './components/AICoach';
import { Profile } from './components/Profile';
import { Register } from './components/Register';
import { Login } from './components/Login';

type Route = 'feed' | 'lfg' | 'guide' | 'coach' | 'profile' | 'register' | 'login';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<Route>('feed');

  // Simple hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'feed';
      setCurrentRoute(hash as Route);
    };

    // Set initial route
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleTabChange = (tab: string) => {
    window.location.hash = tab;
  };

  const renderContent = () => {
    switch (currentRoute) {
      case 'register': return <Register />;
      case 'login': return <Login />;
      case 'feed': return <Feed />;
      case 'lfg': return <LFG />;
      case 'guide': return <Guide />;
      case 'coach': return <AICoach />;
      case 'profile': return <Profile />;
      default: return <Feed />;
    }
  };

  // Hide navigation on auth pages
  const showNavigation = currentRoute !== 'register' && currentRoute !== 'login';

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-amber-500/30">
      {showNavigation && <Navigation activeTab={currentRoute} setActiveTab={handleTabChange} />}
      <main className="flex-1 md:h-screen md:overflow-y-auto relative">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
