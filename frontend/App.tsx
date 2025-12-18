import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Header } from './components/Header';
import { Feed } from './components/Feed';
import { LFG } from './components/LFG';
import { Friends } from './components/Friends';
import { Guide } from './components/Guide';
import { AICoach } from './components/AICoach';
import { Profile } from './components/Profile';
import { Settings } from './components/Settings';
import { Register } from './components/Register';
import { Login } from './components/Login';
import { Forum } from './components/Forum';
import { ForumCategoryPage } from './components/ForumCategory';
import { ForumThreadPage } from './components/ForumThread';
import { AdminDashboard } from './components/AdminDashboard';
import { Reels } from './components/Reels';
import { AuthProvider, useAuth } from './contexts/authContext';

type Route = 'feed' | 'reels' | 'lfg' | 'friends' | 'guide' | 'coach' | 'profile' | 'settings' | 'register' | 'login' | 'forum' | 'forum-category' | 'forum-thread' | 'admin';

const AppContent: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<Route>('feed');
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [forumCategoryId, setForumCategoryId] = useState<string | undefined>(undefined);
  const [forumThreadId, setForumThreadId] = useState<string | undefined>(undefined);
  const { isLoading, isAuthenticated } = useAuth();

  // Simple hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'feed';

      // Check for profile/:userId pattern
      if (hash.startsWith('profile/')) {
        const userId = hash.split('/')[1];
        setProfileUserId(userId);
        setCurrentRoute('profile');
      }
      // Check for forum/category/:categoryId pattern
      else if (hash.startsWith('forum/category/')) {
        const categoryId = hash.split('/')[2];
        setForumCategoryId(categoryId);
        setCurrentRoute('forum-category');
      }
      // Check for forum/thread/:threadId pattern
      else if (hash.startsWith('forum/thread/')) {
        const threadId = hash.split('/')[2];
        setForumThreadId(threadId);
        setCurrentRoute('forum-thread');
      }
      else {
        setProfileUserId(undefined);
        setForumCategoryId(undefined);
        setForumThreadId(undefined);
        setCurrentRoute(hash as Route);
      }
    };

    // Set initial route
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Redirect to login if not authenticated (except for public routes)
  useEffect(() => {
    const publicRoutes: Route[] = ['login', 'register', 'forum', 'forum-category', 'forum-thread'];
    if (!isLoading && !isAuthenticated && !publicRoutes.includes(currentRoute)) {
      window.location.hash = 'login';
    }
  }, [isLoading, isAuthenticated, currentRoute]);

  const handleTabChange = (tab: string) => {
    window.location.hash = tab;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    }

    switch (currentRoute) {
      case 'register': return <Register />;
      case 'login': return <Login />;
      case 'feed': return <Feed />;
      case 'reels': return <Reels />;
      case 'lfg': return <LFG />;
      case 'friends': return <Friends />;
      case 'guide': return <Guide />;
      case 'coach': return <AICoach />;
      case 'profile': return <Profile userId={profileUserId} />;
      case 'settings': return <Settings />;
      case 'forum': return <Forum />;
      case 'forum-category': return <ForumCategoryPage categoryId={forumCategoryId || ''} />;
      case 'forum-thread': return <ForumThreadPage threadId={forumThreadId || ''} />;
      case 'admin': return <AdminDashboard />;
      default: return <Feed />;
    }
  };

  // Hide navigation only on auth pages
  const showNavigation = currentRoute !== 'register' && currentRoute !== 'login';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-amber-500/30">
      {/* Top Header */}
      {showNavigation && <Header onNavigate={handleTabChange} />}

      <div className={`flex flex-col md:flex-row ${showNavigation ? 'pt-14' : ''}`}>
        {/* Left Sidebar Navigation */}
        {showNavigation && <Navigation activeTab={currentRoute} setActiveTab={handleTabChange} />}

        {/* Main Content */}
        <main className="flex-1 md:h-[calc(100vh-3.5rem)] md:overflow-y-auto relative">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
