/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  signOut, 
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  Folder, 
  Database, 
  Globe, 
  Smartphone, 
  LogOut, 
  Copy, 
  Check, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  Menu, 
  X,
  Sparkles,
  Layers,
  Info,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  Code,
  Sun,
  Moon,
  Download,
  Share
} from 'lucide-react';
import { auth } from './firebase.ts';
import { FirebaseProject, WebApp, AndroidApp, IosApp, WebAppConfig, FirestoreDatabase } from './types.ts';
import FirestoreExplorer from './components/FirestoreExplorer.tsx';

export default function App() {
  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Projects and Assets state
  const [projects, setProjects] = useState<FirebaseProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected project state
  const [selectedProject, setSelectedProject] = useState<FirebaseProject | null>(null);
  const [isLoadingProjectDetails, setIsLoadingProjectDetails] = useState(false);
  const [webApps, setWebApps] = useState<WebApp[]>([]);
  const [androidApps, setAndroidApps] = useState<AndroidApp[]>([]);
  const [iosApps, setIosApps] = useState<IosApp[]>([]);
  const [databases, setDatabases] = useState<FirestoreDatabase[]>([]);
  
  // App Config and Copy Feedback state
  const [appConfigs, setAppConfigs] = useState<Record<string, WebAppConfig>>({});
  const [isLoadingConfigs, setIsLoadingConfigs] = useState<Record<string, boolean>>({});
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Firestore Live Explorer States
  const [activeProjectTab, setActiveProjectTab] = useState<'apps' | 'data'>('apps');
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>('(default)');

  // Theme support
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('portal-theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('portal-theme', theme);
  }, [theme]);

  // UI status
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Progressive Web App (PWA) installation states & detection
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosTutorial, setShowIosTutorial] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone (PWA) mode
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                          (navigator as any).standalone === true;
    setIsStandalone(!!standaloneMode);

    // 2. Detect if device is Apple iOS (iPhone/iPad)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isAppleIos);

    // 3. Store deferred prompt when beforeinstallprompt fires (Chrome, Edge, Samsung Internet, Firefox on Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show install offering if not already installed as PWA
      if (!standaloneMode) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation choice: ${outcome}`);
    if (outcome === 'accepted') {
      setIsStandalone(true);
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  // Track Auth changes on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      // If signed out, clean token and projects
      if (!currentUser) {
        setAccessToken(null);
        setProjects([]);
        setSelectedProject(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Firebase Projects
  const fetchFirebaseProjects = async (tokenToCheck?: string) => {
    const activeToken = tokenToCheck || accessToken;
    if (!activeToken) {
      setAuthError("Vous devez vous connecter via Google pour accorder l'accès à vos projets Firebase.");
      return;
    }

    setIsLoadingProjects(true);
    setAuthError(null);
    try {
      const response = await fetch('https://firebase.googleapis.com/v1beta1/projects', {
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Accès refusé. Veuillez vous déconnecter puis vous reconnecter avec Google pour autoriser l'accès aux projets.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      const projectList = data.results || data.projects || [];
      setProjects(projectList);
    } catch (err: any) {
      console.error("Erreur lors de la récupération des projets:", err);
      setAuthError(err.message || "Impossible de lire la liste de vos projets.");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Trigger Google Login with popup and add scopes
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    // Firebase Management API ReadOnly scopes
    provider.addScope('https://www.googleapis.com/auth/firebase.readonly');
    // Cloud Platform ReadOnly scopes to query Firestore databases
    provider.addScope('https://www.googleapis.com/auth/cloud-platform.read-only');
    // Read-Write scopes for Full Firestore Explorer Writes & Modifications
    provider.addScope('https://www.googleapis.com/auth/datastore');
    provider.addScope('https://www.googleapis.com/auth/cloud-platform');

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Impossible d'acquérir le jeton d'accès Google.");
      }
      
      const token = credential.accessToken;
      setAccessToken(token);
      setSelectedProject(null);
      
      // Fetch list instantly
      await fetchFirebaseProjects(token);
    } catch (err: any) {
      console.error("Erreur d'authentification:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('La fenêtre de connexion Google a été fermée avant la fin de l\'authentification.');
      } else {
        setAuthError(err.message || 'Erreur lors de la connexion via Google.');
      }
    }
  };

  // Sign out
  const handleLogOut = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setProjects([]);
      setSelectedProject(null);
    } catch (e) {
      console.error("Échec de la déconnexion", e);
    }
  };

  // Load details of the clicked project
  const handleSelectProject = async (project: FirebaseProject) => {
    setSelectedProject(project);
    setIsLoadingProjectDetails(true);
    setWebApps([]);
    setAndroidApps([]);
    setIosApps([]);
    setDatabases([]);
    setActiveProjectTab('apps');
    setSelectedDatabaseId('(default)');

    if (!accessToken) return;

    try {
      // 1. Fetch Web Apps
      const webRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${project.projectId}/webApps`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (webRes.ok) {
        const webData = await webRes.json();
        setWebApps(webData.apps || []);
      }

      // 2. Fetch Android Apps
      const androidRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${project.projectId}/androidApps`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (androidRes.ok) {
        const androidData = await androidRes.json();
        setAndroidApps(androidData.apps || []);
      }

      // 3. Fetch iOS Apps
      const iosRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${project.projectId}/iosApps`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (iosRes.ok) {
        const iosData = await iosRes.json();
        setIosApps(iosData.apps || []);
      }

      // 4. Fetch Firestore databases (using Cloud Resource Manager / Firestore API)
      const firestoreRes = await fetch(`https://firestore.googleapis.com/v1/projects/${project.projectId}/databases`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (firestoreRes.ok) {
        const dbData = await firestoreRes.json();
        setDatabases(dbData.databases || []);
      }
    } catch (err) {
      console.error("Erreur lors du chargement des détails du projet:", err);
    } finally {
      setIsLoadingProjectDetails(false);
    }
  };

  // Fetch individual Web App Config snippet
  const handleFetchWebConfig = async (projectId: string, appId: string) => {
    if (appConfigs[appId]) return; // Already loaded

    setIsLoadingConfigs(prev => ({ ...prev, [appId]: true }));
    try {
      const res = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${appId}/config`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const configData: WebAppConfig = await res.json();
        setAppConfigs(prev => ({ ...prev, [appId]: configData }));
      } else {
        console.warn(`Impossible de récupérer la config de l'app ${appId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingConfigs(prev => ({ ...prev, [appId]: false }));
    }
  };

  // Manual refresh of project list
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchFirebaseProjects();
    if (selectedProject) {
      await handleSelectProject(selectedProject);
    }
    setIsRefreshing(false);
  };

  // Filter projects based on search query
  const filteredProjects = projects.filter(pkg => {
    const q = searchQuery.toLowerCase();
    return (
      pkg.projectId.toLowerCase().includes(q) ||
      (pkg.displayName || '').toLowerCase().includes(q)
    );
  });

  // Copy Config snippet helpers
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAppId(id);
    setTimeout(() => setCopiedAppId(null), 2500);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-all duration-300 ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`} id="app-root">
      
      {/* HEADER BANNER */}
      <header className={`border-b sticky top-0 z-40 transition-all duration-300 ${
        isDark 
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md' 
          : 'bg-white/95 border-slate-200 text-slate-800 shadow-xs backdrop-blur-md'
      }`} id="header-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-2.5 rounded-xl text-slate-950 shadow-xs flex items-center justify-center">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h1 className={`text-xl font-bold font-display tracking-tight flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Firebase Portal <span className="text-[10px] bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md uppercase font-mono tracking-widest font-bold">Explorer</span>
              </h1>
              <p className={`text-[10px] font-mono tracking-wider font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Console de synchronisation des Projets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* THEME SWITCHER */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                isDark 
                  ? 'bg-slate-800 border-slate-705/10 border-slate-700 hover:bg-slate-700 text-amber-400 hover:text-amber-300' 
                  : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            <div className="hidden md:flex items-center gap-3.5 text-xs font-semibold">
              {user && (
                <>
                  <div className={`flex items-center gap-2 border px-3 py-1.5 rounded-xl font-mono ${
                    isDark ? 'bg-slate-850/80 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    {user.email}
                  </div>
                  {accessToken && (
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className={`flex items-center gap-1.5 border px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                        isDark 
                          ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' 
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-750 text-slate-700'
                      }`}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Actualiser
                    </button>
                  )}
                  <button
                    onClick={handleLogOut}
                    className="flex items-center gap-1.5 bg-rose-700 hover:bg-rose-600 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
                    id="btn-logout"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Quitter
                  </button>
                </>
              )}
            </div>

            {user && (
              <div className="md:hidden">
                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                  className={`p-1.5 rounded-lg border ${isDark ? 'text-slate-300 hover:text-white border-slate-800' : 'text-slate-600 hover:text-slate-900 border-slate-150'}`}
                  aria-label="Toggle menu"
                >
                  {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {user && isMobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 space-y-3 text-slate-150 flex flex-col shadow-inner text-white" id="mobile-drawer">
          <div className="text-xs bg-slate-800 rounded-xl px-3 py-2.5 border border-slate-700 font-mono overflow-ellipsis overflow-hidden">
            Compte : {user.email}
          </div>
          {accessToken && (
            <button
              onClick={() => { handleRefresh(); setIsMobileMenuOpen(false); }}
              className="py-2.5 px-4 bg-slate-800 rounded-xl font-semibold text-center text-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Actualiser la liste
            </button>
          )}
          <button
            onClick={() => { handleLogOut(); setIsMobileMenuOpen(false); }}
            className="w-full bg-rose-700 hover:bg-rose-650 py-2.5 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* PWA INSTALLATION PROMPTS */}
        {!isStandalone && (
          <div className="mb-6 space-y-4" id="pwa-install-wrapper">
            {/* Standard Install Banner (Android, Chrome Desktop/Mobile, Firefox Android, Edge) */}
            {showInstallBanner && deferredPrompt && (
              <div className={`p-5 rounded-3xl border shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300 ${
                isDark 
                  ? 'bg-slate-900 border-amber-500/20 text-slate-100 shadow-amber-500/[0.02]' 
                  : 'bg-white border-amber-200 text-slate-800 shadow-amber-100/30'
              }`} id="android-pwa-banner">
                <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
                  <div className="bg-amber-500 text-slate-950 p-2.5 rounded-2xl shadow-md shrink-0 flex items-center justify-center animate-bounce">
                    <Smartphone className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h4 className={`text-sm sm:text-base font-bold flex items-center gap-1.5 justify-center md:justify-start ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Installer l'application native <span className="text-[9px] bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-200/20 px-1.5 py-0.5 rounded-md font-mono tracking-widest font-bold uppercase">Recommandé</span>
                    </h4>
                    <p className={`text-xs mt-1 max-w-xl ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Ajoutez l'application sur votre écran d'accueil mobile pour l'utiliser comme une application native. Plus rapide, sans barre de navigation navigateur, et accessible instantanément.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-center">
                  <button
                    onClick={handleInstallApp}
                    className="flex-1 md:flex-initial py-2.5 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4 animate-pulse" /> Installer l'App
                  </button>
                  <button
                    onClick={() => setShowInstallBanner(false)}
                    className={`p-2.5 rounded-xl border cursor-pointer ${
                      isDark ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                    title="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Apple iOS PWA Help Banner */}
            {isIOS && (
              <div className={`p-4 rounded-3xl border shadow-xs transition-all duration-300 ${
                isDark ? 'bg-slate-900 border-slate-800 text-slate-150' : 'bg-white border-slate-150 text-slate-800'
              }`} id="ios-pwa-banner">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-amber-500/15 text-amber-500 dark:text-amber-400 p-2.5 rounded-2xl shrink-0 flex items-center justify-center">
                      <Smartphone className="h-5.5 w-5.5" />
                    </div>
                    <div>
                      <h4 className={`text-sm sm:text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Ajouter sur votre iPhone / iPad
                      </h4>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Utilisez l'application en mode plein écran sans le navigateur Safari.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowIosTutorial(!showIosTutorial)}
                    className={`w-full sm:w-auto py-2 px-4 border text-xs font-semibold rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                      showIosTutorial
                        ? isDark ? 'bg-slate-800 border-slate-750 text-amber-450' : 'bg-slate-100 border-slate-300 text-amber-600'
                        : isDark ? 'border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-750'
                    }`}
                  >
                    <Info className="h-4 w-4" /> {showIosTutorial ? "Masquer l'aide" : "Comment installer ?"}
                  </button>
                </div>

                {showIosTutorial && (
                  <div className={`mt-4 pt-4 border-t space-y-3.5 text-xs ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-150 text-slate-650'}`}>
                    <p className="font-semibold text-amber-500">Pour l'installer sous iOS (Safari) :</p>
                    <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                      <li>
                        Appuyez sur le bouton de <span className="font-bold text-slate-100 dark:text-white inline-flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700"><Share className="h-3 w-3.5 inline text-amber-400" /> Partager</span> dans le menu de navigation Safari (en bas de votre écran).
                      </li>
                      <li>
                        Faites défiler le menu de partage vers le bas et sélectionnez <span className="font-bold text-slate-100 dark:text-white">Sur l'écran d'accueil</span> (ou <span className="font-bold text-slate-100 dark:text-white">Add to Home Screen</span>).
                      </li>
                      <li>
                        Appuyez sur <span className="font-bold text-amber-500">Ajouter</span> en haut à droite. L'icône de l'application apparaîtra instantanément sur votre écran d'accueil mobile comme une application native !
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* LOGGED OUT WALL */}
        {!accessToken ? (
          <div className="max-w-xl mx-auto my-12" id="auth-wall">
            <div className={`rounded-3xl border transition-all duration-300 shadow-xl p-8 md:p-10 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-150 text-slate-800'
            }`}>
              <div className="text-center mb-8">
                <div className={`h-16 w-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border transition-all ${
                  isDark ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-500 border-amber-100'
                }`}>
                  <Layers className="h-9 w-9" />
                </div>
                <h2 className={`text-2xl font-bold font-display ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Portail Firebase Multi-Projets
                </h2>
                <p className={`text-sm mt-2 max-w-sm mx-auto leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Connectez-vous avec votre compte de messagerie et donnez l'autorisation de lister tous vos projets Firebase existants en temps réel.
                </p>
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs p-4 rounded-2xl mb-6 flex gap-3 text-left font-medium leading-relaxed" id="auth-error-banner">
                  <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                  <div>{authError}</div>
                </div>
              )}

              <div className="space-y-4">
                {/* Genuine Sign-In GSI-Style Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className={`w-full font-bold text-sm py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer outline-hidden ring-offset-2 focus:ring-2 focus:ring-amber-500 ${
                    isDark ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                  id="google-signin-primary"
                >
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill={isDark ? "#0f172a" : "#ffffff"}>
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      opacity="0.85"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      opacity="0.85"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      opacity="0.85"
                    />
                  </svg>
                  Connecter mon compte Google
                </button>
              </div>

              {/* Scope Explainers */}
              <div className={`mt-8 pt-6 border-t font-sans space-y-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <h4 className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${isDark ? 'text-slate-350 text-slate-300' : 'text-slate-600'}`}>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" /> Sécurité des données & permissions
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  L'application utilise vos droits de lecteur uniquement pour récupérer et formater la liste de vos projets. Vos clés d'accès ne sont jamais enregistrées sur un serveur tiers et restent en mémoire locale dans votre navigateur.
                </p>
                <div className={`p-3.5 rounded-xl text-[11px] border space-y-1.5 transition-all ${
                  isDark ? 'bg-slate-850/50 border-slate-800 text-slate-305 text-slate-400' : 'bg-slate-50 border-slate-200/50 text-slate-600'
                }`}>
                  <div className={`font-semibold flex items-center gap-1 ${isDark ? 'text-slate-200 animate-pulse' : 'text-slate-705 text-slate-700'}`}>
                    <Sparkles className="h-3 w-3 text-amber-500" /> Scopes demandés :
                  </div>
                  <ul className={`list-disc pl-4 space-y-1 font-mono ${isDark ? 'text-slate-400' : 'text-slate-550 text-slate-500'}`}>
                    <li>firebase.readonly (Lecture des configurations de vos applications)</li>
                    <li>cloud-platform.read-only (Consultation des bases de données et services)</li>
                    <li>datastore & cloud-platform (Requêtes & mutations de documents de la base)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* LOGGED IN ACTIVE PLATFORM */
          <div className="space-y-8" id="dashboard-board">
            
            {/* Quick stats / Information Strip */}
            <div className={`rounded-3xl p-6 shadow-lg relative overflow-hidden transition-all duration-300 border ${
              isDark 
                ? 'bg-slate-900/60 border-slate-800 text-white shadow-2xl shadow-indigo-500/[0.02]' 
                : 'bg-slate-900 text-white border-transparent'
            }`} id="info-strip">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 h-64 w-64 bg-slate-800/20 dark:bg-slate-800/10 rounded-full opacity-30 pointer-events-none"></div>
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-widest mb-1.5 font-display">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Console Portative Synchronisée
                  </div>
                  <h3 className="text-2xl font-bold font-display tracking-tight text-white">
                    Bonjour, {user?.displayName || user?.email?.split('@')[0]}
                  </h3>
                  <p className="text-sm text-slate-300 dark:text-slate-450 mt-1">
                    Vous êtes actuellement authentifié avec Google. Vos informations de développeur sont listées ci-dessous en temps réel.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className={`border px-5 py-3 rounded-2xl text-center shadow-xs transition-all duration-300 ${
                    isDark ? 'bg-slate-950/50 border-slate-800 text-slate-100' : 'bg-slate-850 text-white border-transparent'
                  }`}>
                    <div className="text-2xl font-bold text-amber-500 font-mono">
                      {isLoadingProjects ? '...' : projects.length}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Projets détectés</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error alerts if any */}
            {authError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs p-4 rounded-xl flex gap-3 font-medium">
                <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                <div>{authError}</div>
              </div>
            )}

            {/* Double Column Explorer Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="explorer-core">
              
              {/* LEFT COLUMN NOW ON THE RIGHT: LIST OF PROJECTS (3 cols on large screens, order-1 on mobile, order-2 on desktop) */}
              <div className="lg:col-span-3 order-1 lg:order-2 space-y-4">
                <div className={`rounded-3xl border p-6 shadow-xs space-y-4 transition-all duration-300 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-150'
                }`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`font-bold font-display text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <Layers className="h-4.5 w-4.5 text-amber-500 inline" /> Vos Projets Firebase
                    </h3>
                    <button
                      onClick={handleRefresh}
                      disabled={isLoadingProjects || isRefreshing}
                      className={`p-1.5 rounded-lg transition-all ${
                        isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                      title="Rafraîchir"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingProjects || isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrer par nom ou ID..."
                      className={`w-full border rounded-2xl pl-10 pr-4 py-2.5 text-xs transition-all focus:outline-hidden focus:ring-2 focus:ring-amber-500 ${
                        isDark 
                          ? 'bg-slate-950/50 border-slate-800 focus:bg-slate-950 text-slate-100 placeholder:text-slate-500' 
                          : 'bg-slate-50 border-slate-200/80 focus:bg-white text-slate-700 placeholder:text-slate-400'
                      }`}
                    />
                  </div>

                  {/* List of projects container */}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {isLoadingProjects ? (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <RefreshCw className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                        <p className="text-xs font-medium">Interrogation de vos autorisations Firebase...</p>
                      </div>
                    ) : filteredProjects.length === 0 ? (
                      <div className={`py-12 text-center rounded-2xl border border-dashed p-6 space-y-2 ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-slate-200 bg-slate-50/50'}`}>
                        <HelpCircle className="h-8 w-8 text-slate-400 mx-auto" />
                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>Aucun projet trouvé</p>
                        <p className="text-[11px] text-slate-450 text-slate-400 leading-relaxed">Assurez-vous d'avoir créé au moins un projet Firebase avec votre compte {user?.email}.</p>
                      </div>
                    ) : (
                      filteredProjects.map((p) => {
                        const isSel = selectedProject?.projectId === p.projectId;
                        return (
                          <button
                            key={p.projectId}
                            onClick={() => handleSelectProject(p)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between group cursor-pointer ${
                              isSel 
                                ? isDark
                                  ? 'bg-amber-500/10 border-amber-500/30 shadow-xs'
                                  : 'bg-amber-50/70 border-amber-300/80 shadow-xs' 
                                : isDark
                                  ? 'bg-slate-950/60 hover:bg-slate-850 border-slate-850/60 text-slate-205 text-slate-200'
                                  : 'bg-slate-50 hover:bg-slate-100/60 border-slate-150 text-slate-800'
                            }`}
                          >
                            <div className="space-y-1 min-w-0 pr-2">
                              <h4 className={`font-bold text-xs font-display truncate ${isDark ? 'text-slate-200 group-hover:text-amber-400' : 'text-slate-900 group-hover:text-amber-600'}`}>
                                {p.displayName || p.projectId}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono truncate">
                                ID : {p.projectId}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                                p.state === 'ACTIVE' 
                                  ? isDark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                  : 'bg-rose-50 text-rose-600'
                              }`}>
                                {p.state}
                              </span>
                              <ChevronRight className={`h-4 w-4 text-slate-300 group-hover:translate-x-0.5 transition-all ${isSel ? 'text-amber-500 translate-x-0.5' : ''}`} />
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN NOW ON THE LEFT: PROJECT DETAILS (9 cols on large screens, filling the screen, order-2 on mobile, order-1 on desktop) */}
              <div className="lg:col-span-9 order-2 lg:order-1">
                {selectedProject ? (
                  <div className={`rounded-3xl border p-6 shadow-xs space-y-6 transition-all duration-300 ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-150'
                  }`}>
                    {/* Project Title and General info card */}
                    <div className={`pb-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isDark ? 'border-slate-805 border-slate-800' : 'border-slate-100'}`}>
                      <div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono ${
                          isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                          Informations Projet
                        </span>
                        <h2 className={`text-xl font-bold font-display mt-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                          {selectedProject.displayName || selectedProject.projectId}
                        </h2>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Numéro de projet : {selectedProject.projectNumber}
                        </p>
                      </div>
                      <a 
                        href={`https://console.firebase.google.com/project/${selectedProject.projectId}/overview`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="self-start sm:self-auto flex items-center gap-1.5 text-xs font-semibold text-amber-500 hover:text-amber-400 hover:underline inline-flex transition-all"
                      >
                        Ouvrir dans la Console <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {/* INTERACTIVE NAVIGATION TABS */}
                    <div className={`flex border-b text-xs transition-all ${isDark ? 'border-slate-805 border-slate-800' : 'border-slate-150'}`}>
                      <button
                        onClick={() => setActiveProjectTab('apps')}
                        className={`px-5 py-3.5 font-bold border-b-2 transition-all flex items-center gap-2 outline-hidden cursor-pointer ${
                          activeProjectTab === 'apps' 
                            ? 'border-amber-500 text-amber-500' 
                            : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-205 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800'}`
                        }`}
                      >
                        <Layers className="h-4 w-4" /> Applications & SDKs
                      </button>
                      
                      <button
                        onClick={() => setActiveProjectTab('data')}
                        className={`px-5 py-3.5 font-bold border-b-2 transition-all flex items-center gap-2 outline-hidden cursor-pointer ${
                          activeProjectTab === 'data' 
                            ? 'border-amber-500 text-amber-500' 
                            : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-205 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800'}`
                        }`}
                      >
                        <Database className="h-4 w-4" /> Explorateur Firestore (Écriture)
                      </button>
                    </div>

                    {isLoadingProjectDetails ? (
                      <div className="py-24 text-center text-slate-400 space-y-3">
                        <RefreshCw className="h-10 w-10 animate-spin text-amber-500 mx-auto" />
                        <p className="text-xs font-medium">Récupération des applications et bases de données liées...</p>
                      </div>
                    ) : activeProjectTab === 'data' && accessToken ? (
                      <div className="pt-2">
                        <FirestoreExplorer 
                          accessToken={accessToken} 
                          projectId={selectedProject.projectId} 
                          databaseId={selectedDatabaseId} 
                          theme={theme}
                        />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        
                        {/* LIST OF ASSETS: WEB, ANDROID, IOS APPS */}
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 font-mono">
                            Applications enregistrées ({webApps.length + androidApps.length + iosApps.length})
                          </h4>

                          {webApps.length === 0 && androidApps.length === 0 && iosApps.length === 0 ? (
                            <div className={`border rounded-2xl p-5 text-center text-xs transition-all ${
                              isDark ? 'bg-slate-950 border-slate-805/40 text-slate-500' : 'bg-slate-50 border-slate-150 text-slate-400'
                            }`}>
                              Aucune application (Web, Android, iOS) n'a été rattachée à ce projet Firebase.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Web Apps */}
                              {webApps.map((app) => (
                                <div key={app.appId} className={`border p-4 rounded-2xl flex flex-col justify-between space-y-3 transition-all ${
                                  isDark ? 'bg-slate-950 hover:bg-slate-850/45 border-slate-800' : 'bg-slate-50 hover:bg-slate-100/50 border-slate-200'
                                }`}>
                                  <div className="flex items-start gap-2.5">
                                    <div className="bg-blue-500/10 text-blue-500 p-2 rounded-lg shrink-0">
                                      <Globe className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <h5 className={`font-semibold text-xs truncate ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                        {app.displayName || "App Web sans nom"}
                                      </h5>
                                      <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                        ID : {app.appId}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {/* Config fetcher */}
                                  <div>
                                    {appConfigs[app.appId] ? (
                                      <button
                                        onClick={() => {
                                          const configObj = appConfigs[app.appId];
                                          const snippet = `const firebaseConfig = {
  apiKey: "${configObj.apiKey}",
  authDomain: "${configObj.authDomain}",
  projectId: "${configObj.projectId}",
  storageBucket: "${configObj.storageBucket || ''}",
  messagingSenderId: "${configObj.messagingSenderId || ''}",
  appId: "${configObj.appId}",
  measurementId: "${configObj.measurementId || ''}"
};`;
                                          handleCopyText(snippet, app.appId);
                                        }}
                                        className={`h-7 w-full border text-[10px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                          isDark 
                                            ? 'bg-slate-900 border-slate-800 hover:border-slate-705 text-slate-305 text-slate-300 hover:text-white' 
                                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-650 hover:bg-slate-50'
                                        }`}
                                      >
                                        {copiedAppId === app.appId ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-500" /> Copié !
                                          </>
                                        ) : (
                                          <>
                                            <Code className="h-3 w-3 text-slate-400" /> Récupérer les clés SDK
                                          </>
                                        )}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleFetchWebConfig(selectedProject.projectId, app.appId)}
                                        disabled={isLoadingConfigs[app.appId]}
                                        className={`h-7 w-full text-[10px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all disabled:opacity-50 cursor-pointer ${
                                          isDark 
                                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' 
                                            : 'bg-slate-900 hover:bg-slate-850 hover:bg-slate-800 text-white'
                                        }`}
                                      >
                                        {isLoadingConfigs[app.appId] ? (
                                          <>
                                            <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Chargement...
                                          </>
                                        ) : (
                                          'Dévoiler configurations SDK'
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Android Apps */}
                              {androidApps.map((app) => (
                                <div key={app.appId} className={`p-4 border rounded-2xl flex items-start gap-2.5 transition-all ${
                                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                }`}>
                                  <div className="bg-emerald-500/10 text-emerald-500 p-2 rounded-lg shrink-0">
                                    <Smartphone className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded font-bold uppercase font-mono border border-emerald-500/20">Android</span>
                                    <h5 className={`font-semibold text-xs truncate mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                      {app.displayName || "App Android"}
                                    </h5>
                                    <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                      ID : {app.appId}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-mono truncate mt-0.3">
                                      Package : {app.packageName}
                                    </p>
                                  </div>
                                </div>
                              ))}

                              {/* iOS Apps */}
                              {iosApps.map((app) => (
                                <div key={app.appId} className={`p-4 border rounded-2xl flex items-start gap-2.5 transition-all ${
                                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                                }`}>
                                  <div className="bg-purple-500/10 text-purple-400 p-2 rounded-lg shrink-0">
                                    <Smartphone className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded font-bold uppercase font-mono border border-purple-500/20">iOS</span>
                                    <h5 className={`font-semibold text-xs truncate mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                      {app.displayName || "App iOS"}
                                    </h5>
                                    <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                      ID : {app.appId}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-mono truncate mt-0.3">
                                      Bundle IP : {app.bundleId}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* DATABASES SECTION */}
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 font-mono">
                            Bases de données Firestore ({databases.length})
                          </h4>

                          {databases.length === 0 ? (
                            <div className={`border rounded-2xl p-5 text-center text-xs transition-all ${
                              isDark ? 'bg-slate-950 border-slate-805/45 text-slate-500' : 'bg-slate-50 border-slate-150 text-slate-400'
                            }`}>
                              Aucune base de données Firestore explicite n'a été trouvée ou elle est configurée à l'état par défaut standard.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {databases.map((dbSnap) => {
                                const dbId = dbSnap.name.split('/').pop() || '(default)';
                                return (
                                  <div key={dbSnap.name} className={`border p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                                    isDark ? 'bg-slate-950 hover:bg-slate-850/50 border-slate-800' : 'bg-slate-50 hover:bg-slate-100/50 border-slate-150'
                                  }`}>
                                    <div className="flex items-center gap-3">
                                      <div className={`p-2.5 rounded-xl shrink-0 transition-all ${isDark ? 'bg-amber-500/10 text-amber-500' : 'bg-amber-50 text-amber-500'}`}>
                                        <Database className="h-4.5 w-4.5" />
                                      </div>
                                      <div>
                                        <h5 className={`font-bold text-xs font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                          {dbId}
                                        </h5>
                                        <p className="text-[10px] text-slate-450 text-slate-400 mt-0.5">
                                          Type : {dbSnap.type} | Localisation : {dbSnap.locationId}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 self-end sm:self-auto">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold uppercase transition-all ${
                                        isDark 
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                      }`}>
                                        {dbSnap.state}
                                      </span>
                                      
                                      <button
                                        onClick={() => {
                                          setSelectedDatabaseId(dbId);
                                          setActiveProjectTab('data');
                                        }}
                                        className={`font-bold text-[10px] px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                                          isDark 
                                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' 
                                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                                        }`}
                                      >
                                        Inspecter & Éditer <ChevronRight className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* DISPLAY RENDER CONFIG DETAILS */}
                        {Object.keys(appConfigs).some(id => webApps.some(wa => wa.appId === id)) && (
                          <div className={`pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 font-mono flex items-center gap-1">
                              <Code className="h-4 w-4 text-slate-400" /> Extrait de Configuration Visualisé
                            </h4>
                            {webApps.map(wa => {
                              const configObj = appConfigs[wa.appId];
                              if (!configObj) return null;
                              const textCode = `// Configuration Firebase Web App: ${wa.displayName || 'App'}
const firebaseConfig = {
  apiKey: "${configObj.apiKey}",
  authDomain: "${configObj.authDomain}",
  projectId: "${configObj.projectId}",
  storageBucket: "${configObj.storageBucket || ''}",
  messagingSenderId: "${configObj.messagingSenderId || ''}",
  appId: "${configObj.appId}"
};`;
                              return (
                                <div key={wa.appId} className="space-y-1.5 mb-4">
                                  <div className={`flex items-center justify-between text-[11px] font-semibold font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <span>{wa.displayName || wa.appId} (JS Engine SDK)</span>
                                    <button
                                      onClick={() => handleCopyText(textCode, wa.appId)}
                                      className="text-amber-500 hover:text-amber-400 font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      {copiedAppId === wa.appId ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                      {copiedAppId === wa.appId ? 'Copié' : 'Copier'}
                                    </button>
                                  </div>
                                  <pre className={`p-4 rounded-2xl text-[11px] font-mono leading-relaxed overflow-x-auto shadow-inner border transition-all ${
                                    isDark ? 'bg-slate-950/90 text-slate-100 border-slate-800' : 'bg-slate-950 text-slate-300 border-slate-900'
                                  }`}>
                                    <code>{textCode}</code>
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* HELP TIPS */}
                        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3 text-slate-700">
                          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h5 className="font-bold text-xs text-slate-950">Besoin d'intégrer ces clés ?</h5>
                            <p className="text-[11px] leading-relaxed text-slate-600">
                              Ces identifiants de configuration vous permettent de connecter n'importe quelle application cliente Web, Android ou iOS à votre base de données en temps réel et votre service d'authentification Firebase.
                            </p>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-3xl border p-12 text-center text-slate-400 space-y-3 shadow-xs h-full flex flex-col justify-center min-h-[400px] transition-all duration-300 ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-150'
                  }`}>
                    <HelpCircle className={`h-12 w-12 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-200'}`} format="svg" />
                    <h3 className={`font-bold font-display text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Aucun projet sélectionné</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Sélectionnez l'un des projets listés dans la colonne de droite pour interroger en direct ses applications associées, ses bases de données Firestore et ses clés d'initialisation de SDK.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-500 py-6 mt-12 text-center text-xs" id="footer-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <p>© 2026 Portail Firebase Multi-Projets. Tous droits réservés.</p>
          <p className="text-[10px] text-slate-600 leading-relaxed max-w-lg mx-auto">
            Plateforme interactive interconnectée aux API sécurisées de Google Cloud Management et Firebase Projects via l'accord confidentiel au protocole OAuth v2.0.
          </p>
        </div>
      </footer>

    </div>
  );
}
