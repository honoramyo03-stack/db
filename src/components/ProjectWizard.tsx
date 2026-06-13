import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Server, 
  Globe, 
  Database, 
  Flame, 
  X, 
  RefreshCw, 
  Info,
  Copy,
  Check
} from 'lucide-react';
import { FirebaseProject } from '../types.ts';

interface ProjectWizardProps {
  accessToken: string;
  onCreated: (newProject: FirebaseProject) => void;
  onCancel: () => void;
  isDark: boolean;
}

interface StepLog {
  id: string;
  label: string;
  status: 'idle' | 'running' | 'success' | 'error';
  errorDetails?: string;
}

export default function ProjectWizard({ accessToken, onCreated, onCancel, isDark }: ProjectWizardProps) {
  // Form inputs
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('eur3'); // Multi-region Europe
  const [createDatabase, setCreateDatabase] = useState(true);
  const [createWebApp, setCreateWebApp] = useState(true);

  // States
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0); // 0: Form, 1: Progress, 2: Final Config
  const [currentExecutingIndex, setCurrentExecutingIndex] = useState(0);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdConfigData, setCreatedConfigData] = useState<any | null>(null);
  const [createdProjectData, setCreatedProjectData] = useState<FirebaseProject | null>(null);

  // Progress Logs
  const [logs, setLogs] = useState<StepLog[]>([
    { id: 'gcp', label: 'Création du projet Google Cloud', status: 'idle' },
    { id: 'firebase', label: 'Activation des fonctionnalités Firebase', status: 'idle' },
    { id: 'firestore', label: 'Initialisation de la base de données Firestore', status: 'idle' },
    { id: 'webapp', label: "Création de l'application Web par défaut", status: 'idle' },
    { id: 'config', label: 'Génération de la configuration SDK Web', status: 'idle' }
  ]);

  // Suggestions for Project ID
  useEffect(() => {
    if (projectName && !projectId) {
      const sanitized = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      setProjectId(`${sanitized || 'portal'}-${randomSuffix}`);
    }
  }, [projectName]);

  // Utility to update single log state
  const updateLogStatus = (id: string, status: 'idle' | 'running' | 'success' | 'error', errorDetails?: string) => {
    setLogs(prev => prev.map(log => log.id === id ? { ...log, status, errorDetails } : log));
  };

  // Helper wait
  const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Polling helper checking GCP project until it is ready
  const pollGCPProject = async (projId: string, maxAttempts = 15): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.ok) {
          const project = await response.json();
          if (project.lifecycleState === 'ACTIVE') {
            return true;
          }
        }
      } catch (e) {
        // ignore network error during polling
      }
      await waitMs(3000);
    }
    return false;
  };

  // Polling helper checking if Firebase has been fully attached with the addFirebase operation
  const pollFirebaseState = async (projId: string, maxAttempts = 12): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.ok) {
          return true;
        }
      } catch (e) {
        // wait
      }
      await waitMs(3000);
    }
    return false;
  };

  const handleCreateCompleteProject = async () => {
    if (!projectName.trim()) {
      setGeneralError('Veuillez spécifier un nom de projet.');
      return;
    }
    if (!projectId.trim() || projectId.length < 4 || projectId.length > 30) {
      setGeneralError("L'ID du projet doit comporter entre 4 et 30 caractères (minuscules, chiffres et tirets).");
      return;
    }

    setGeneralError(null);
    setWizardStep(1);
    
    // Reset logs
    setLogs([
      { id: 'gcp', label: "Création du projet Google Cloud sur votre compte", status: 'idle' },
      { id: 'firebase', label: 'Activation des API Firebase sur le projet', status: 'idle' },
      { id: 'firestore', label: `Création de la base Firestore (${selectedLocation})`, status: 'idle' },
      { id: 'webapp', label: "Création d'une application Web associée", status: 'idle' },
      { id: 'config', label: 'Génération du extrait de clés SDK', status: 'idle' }
    ]);

    let stepIndex = 0;

    try {
      // ----------------------------------------------------
      // STEP 1: GCP PROJECT CREATION
      // ----------------------------------------------------
      setCurrentExecutingIndex(0);
      updateLogStatus('gcp', 'running');
      
      const gcpRes = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectId,
          name: projectName
        })
      });

      if (!gcpRes.ok) {
        const errDetails = await gcpRes.json().catch(() => ({}));
        throw new Error(errDetails.error?.message || `Erreur d'initialisation GCP (${gcpRes.status}).`);
      }

      // Wait a few seconds then poll GCP project active state
      updateLogStatus('gcp', 'running', 'Génération des ressources sur Google Cloud (cela prend 5 à 15 secondes)...');
      const isProjectActive = await pollGCPProject(projectId);
      if (!isProjectActive) {
        throw new Error("La création du projet Google Cloud a pris trop de temps. Veuillez actualiser pour vérifier.");
      }
      updateLogStatus('gcp', 'success');

      // ----------------------------------------------------
      // STEP 2: ENABLE FIREBASE
      // ----------------------------------------------------
      stepIndex = 1;
      setCurrentExecutingIndex(1);
      updateLogStatus('firebase', 'running');
      await waitMs(2000); // Breathe space

      const fbRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // empty config triggers defaults
      });

      if (!fbRes.ok) {
        const errDetails = await fbRes.json().catch(() => ({}));
        throw new Error(errDetails.error?.message || `L'activation Firebase a échoué (${fbRes.status}).`);
      }

      // Check operations status till active
      updateLogStatus('firebase', 'running', "Liaison de l'API de gestion Firebase au projet...");
      const isFirebaseAttached = await pollFirebaseState(projectId);
      if (!isFirebaseAttached) {
        throw new Error("L'activation de Firebase prend trop de temps. L'activation se poursuivra en arrière-plan.");
      }
      updateLogStatus('firebase', 'success');

      // ----------------------------------------------------
      // STEP 3: CREATE FIRESTORE DATABASE (Optional check)
      // ----------------------------------------------------
      stepIndex = 2;
      setCurrentExecutingIndex(2);
      
      if (createDatabase) {
        updateLogStatus('firestore', 'running');
        await waitMs(2500);

        const fsRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locationId: selectedLocation,
            type: 'FIRESTORE_STANDARD',
            concurrencyMode: 'OPTIMISTIC'
          })
        });

        if (!fsRes.ok) {
          const fsErr = await fsRes.json().catch(() => ({}));
          console.warn("Firestore Database setup returned error:", fsErr);
          updateLogStatus('firestore', 'error', fsErr.error?.message || "La base Firestore est déjà en cours de création ou a expiré.");
          // Non-blocking skip
        } else {
          updateLogStatus('firestore', 'success');
        }
      } else {
        updateLogStatus('firestore', 'success', 'Passé par l\'utilisateur');
      }

      // ----------------------------------------------------
      // STEP 4: CREATE WEB APP
      // ----------------------------------------------------
      stepIndex = 3;
      setCurrentExecutingIndex(3);
      let registeredAppId = '';

      if (createWebApp) {
        updateLogStatus('webapp', 'running');
        await waitMs(2000);

        const waRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            displayName: `${projectName} App`
          })
        });

        if (!waRes.ok) {
          const waErr = await waRes.json().catch(() => ({}));
          throw new Error(waErr.error?.message || "Impossible de déclarer l'application Web.");
        }

        const waData = await waRes.json();
        const opName = waData.name; // operation string
        
        // Custom polling for Web App ID registration
        updateLogStatus('webapp', 'running', "Déclaration de l'application Web client...");
        
        // Usually creation operations are instantaneous for web apps, let's fetch lists to locate it
        await waitMs(4000);
        const listRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (listRes.ok) {
          const listApps = await listRes.json();
          if (listApps.apps && listApps.apps.length > 0) {
            registeredAppId = listApps.apps[0].appId;
            updateLogStatus('webapp', 'success');
          } else {
            throw new Error("L'application Web n'a pas pu être retrouvée dans la liste des ressources.");
          }
        } else {
          throw new Error("L'application Web est créée mais le portail n'a pas pu lister les ressources.");
        }
      } else {
        updateLogStatus('webapp', 'success', 'Passé par l\'utilisateur');
      }

      // ----------------------------------------------------
      // STEP 5: FETCH CONFIG
      // ----------------------------------------------------
      stepIndex = 4;
      setCurrentExecutingIndex(4);
      
      if (createWebApp && registeredAppId) {
        updateLogStatus('config', 'running');
        await waitMs(2000);

        const configRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${registeredAppId}/config`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (configRes.ok) {
          const configObj = await configRes.json();
          setCreatedConfigData(configObj);
          updateLogStatus('config', 'success');
        } else {
          updateLogStatus('config', 'error', "Projet créé ! Clés d'initialisations accessibles ultérieurement.");
        }
      } else {
        updateLogStatus('config', 'success', 'Aucune clé requise');
      }

      // All succeeded!
      await waitMs(1500);
      
      const freshProject: FirebaseProject = {
        projectId: projectId,
        projectNumber: 'Nouveau',
        displayName: projectName,
        name: `projects/${projectId}`,
        state: 'ACTIVE'
      };
      
      setCreatedProjectData(freshProject);
      setWizardStep(2);

    } catch (err: any) {
      console.error("Error creating full project:", err);
      // Mark current state as error
      const errorLogId = logs[stepIndex]?.id;
      if (errorLogId) {
        updateLogStatus(errorLogId, 'error', err.message);
      }
      setGeneralError(err.message || "Une erreur inattendue est survenue durant la création.");
    }
  };

  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-all duration-300 ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-150'
    }`} id="project-wizard-container">
      
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-xl text-slate-950 flex items-center justify-center shadow-md">
            <Flame className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h3 className={`text-lg font-bold font-display ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Créer un Projet Firebase Interactif
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Configurez, provisionnez et hébergez de nouvelles ressources directement sur votre compte Google.
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            isDark ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-505 hover:bg-slate-100 text-slate-600'
          }`}
          title="Fermer"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {generalError && wizardStep === 0 && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-2xl flex gap-3 font-medium leading-relaxed">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div>{generalError}</div>
        </div>
      )}

      {/* STEP 0: FORM SETUP */}
      {wizardStep === 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className={`block text-xs font-bold tracking-wider uppercase font-mono ${isDark ? 'text-slate-305 text-slate-300' : 'text-slate-600'}`}>
                Nom public de votre Projet
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Ex. Mon Client Database Portal"
                className={`w-full border rounded-2xl px-4 py-3.5 text-xs font-medium transition-all focus:ring-2 focus:ring-amber-500 focus:outline-hidden ${
                  isDark ? 'bg-slate-950/50 border-slate-805 text-white placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <p className="text-[10px] text-slate-400 font-medium">Ce nom sera affiché dans votre console Google Cloud.</p>
            </div>

            <div className="space-y-2">
              <label className={`block text-xs font-bold tracking-wider uppercase font-mono ${isDark ? 'text-slate-305 text-slate-300' : 'text-slate-600'}`}>
                ID unique Google Cloud (ID Projet)
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="Ex. mon-projet-firebase-1"
                className={`w-full border rounded-2xl px-4 py-3.5 text-xs font-mono transition-all focus:ring-2 focus:ring-amber-500 focus:outline-hidden ${
                  isDark ? 'bg-slate-950/50 border-slate-805 text-white placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <p className="text-[10px] text-slate-400 font-medium">Doit être unique à l'échelle mondiale.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-805/40 border-slate-800">
            <div className="space-y-2">
              <label className={`block text-xs font-bold tracking-wider uppercase font-mono ${isDark ? 'text-slate-305 text-slate-300' : 'text-slate-600'}`}>
                Centre de Données (Région)
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className={`w-full border rounded-2xl px-4 py-3.5 text-xs font-semibold transition-all focus:ring-2 focus:ring-amber-500 focus:outline-hidden ${
                  isDark ? 'bg-slate-950 border-slate-805 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="eur3">Europe (eur3 Multi-région)</option>
                <option value="nam5">Amérique (nam5 Multi-région)</option>
                <option value="us-central1">États-Unis central (Regional)</option>
                <option value="europe-west1">Belgique (Regional)</option>
                <option value="europe-west3">Francfort (Regional)</option>
              </select>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl border border-slate-805 border-slate-800 bg-slate-950/20 md:mt-6">
              <input
                id="check-db"
                type="checkbox"
                checked={createDatabase}
                onChange={(e) => setCreateDatabase(e.target.checked)}
                className="h-4.5 w-4.5 rounded text-amber-500 focus:ring-amber-500 accent-amber-500"
              />
              <label htmlFor="check-db" className="text-xs font-semibold cursor-pointer select-none">
                <span className="block font-bold">Activer Firestore</span>
                <span className="text-[10px] text-slate-400 font-medium">Crée la base de données (default).</span>
              </label>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl border border-slate-850 border-slate-800 bg-slate-950/20 md:mt-6">
              <input
                id="check-app"
                type="checkbox"
                checked={createWebApp}
                onChange={(e) => setCreateWebApp(e.target.checked)}
                className="h-4.5 w-4.5 rounded text-amber-500 focus:ring-amber-500 accent-amber-500"
              />
              <label htmlFor="check-app" className="text-xs font-semibold cursor-pointer select-none">
                <span className="block">Créer l'App Web</span>
                <span className="text-[10px] text-slate-400 font-medium font-semibold text-slate-400">Génère un identifiant client & clés SDK.</span>
              </label>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 p-4.5 rounded-2xl text-xs flex gap-3 text-slate-650">
            <Info className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="space-y-1.5 font-medium leading-relaxed">
              <p className="font-bold text-slate-950 dark:text-amber-450">Configuration de l'accès cloud :</p>
              <p className="text-[11px] text-slate-400">
                La création du projet sera provisionnée sur le quota gratuit de votre compte Google. Assurez-vous d'avoir validé les conditions générales de Firebase Console au moins une fois auparavant si c'est votre tout premier projet.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-5 border-t border-slate-805/40 border-slate-800">
            <button
              onClick={onCancel}
              className={`py-3 px-5 border text-xs font-bold rounded-xl cursor-pointer ${
                isDark ? 'border-slate-800 text-slate-300 bg-slate-950/40 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Annuler
            </button>
            <button
              onClick={handleCreateCompleteProject}
              className="py-3 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center gap-1.5"
            >
              Lancer le déploiement <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: DEPLOYMENT PROGRESS */}
      {wizardStep === 1 && (
        <div className="space-y-6">
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            isDark ? 'bg-slate-950/60 border-slate-805/40' : 'bg-slate-50 border-slate-205/60'
          }`}>
            <div className="space-y-1">
              <span className="text-[10px] bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase font-mono tracking-widest font-bold">PROGRÈS</span>
              <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Création en cours : <span className="font-mono text-amber-500 font-semibold">{projectId}</span>
              </h4>
            </div>
            {logs.some(l => l.status === 'running') && (
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            )}
          </div>

          <div className="space-y-3.5">
            {logs.map((log, index) => {
              const isIdle = log.status === 'idle';
              const isRunning = log.status === 'running';
              const isSuccess = log.status === 'success';
              const isError = log.status === 'error';

              let icon = <div className="h-4 w-4 rounded-full border border-slate-700" />;
              if (isRunning) icon = <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
              if (isSuccess) icon = <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
              if (isError) icon = <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />;

              return (
                <div 
                  key={log.id} 
                  className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isRunning 
                      ? 'bg-amber-500/[0.04] border-amber-500/30 shadow-xs' 
                      : isSuccess 
                        ? isDark ? 'bg-emerald-500/[0.01] border-emerald-500/10' : 'bg-emerald-50/20 border-emerald-100'
                        : isError 
                          ? 'bg-rose-500/[0.02] border-rose-500/20'
                          : isDark ? 'bg-slate-950/20 border-slate-805/40 opacity-70' : 'bg-slate-50/40 border-slate-150 opacity-70'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 shrink-0">{icon}</div>
                    <div>
                      <h5 className={`text-xs font-bold leading-relaxed ${
                        isSuccess 
                          ? isDark ? 'text-slate-200' : 'text-slate-705 text-slate-705 text-slate-700' 
                          : isRunning 
                            ? isDark ? 'text-white' : 'text-slate-900 font-bold'
                            : isDark ? 'text-slate-450 text-slate-400' : 'text-slate-500'
                      }`}>
                        {log.label}
                      </h5>
                      {log.errorDetails && (
                        <p className={`text-[10px] mt-1 leading-relaxed font-medium ${isError ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>
                          {log.errorDetails}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <span className={`text-[9px] font-mono font-bold self-end md:self-auto uppercase border px-2 py-0.5 rounded-full ${
                    isSuccess 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                      : isRunning 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 font-bold animate-pulse'
                        : isError 
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 font-extrabold'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}>
                    {log.status === 'idle' ? 'Attente' : log.status === 'running' ? 'En cours' : log.status === 'success' ? 'Réussi' : 'Échec'}
                  </span>
                </div>
              );
            })}
          </div>

          {generalError && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-2xl font-semibold leading-relaxed" id="deployment-api-error">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Processus interrompu :</span>
                  <p className="font-medium text-[11px] text-rose-600/90 leading-relaxed font-sans">{generalError}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  onClick={() => setWizardStep(0)}
                  className="py-1.5 px-3 bg-white hover:bg-slate-50 border text-[10px] font-bold text-slate-700 rounded-lg cursor-pointer transition-all"
                >
                  Modifier les options
                </button>
                <button
                  onClick={handleCreateCompleteProject}
                  className="py-1.5 px-3 bg-rose-600 hover:bg-rose-705 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Réessayer
                </button>
              </div>
            </div>
          )}

          {!generalError && (
            <p className="text-[10px] text-slate-450 text-slate-400 text-center animate-pulse leading-relaxed">
              * Veuillez ne pas fermer cette fenêtre. Nous orchestrons de multiples opérations asynchrones sur le cloud Google.
            </p>
          )}
        </div>
      )}

      {/* STEP 2: CONGRATULATIONS SCREEN */}
      {wizardStep === 2 && createdProjectData && (
        <div className="space-y-6 text-center py-4">
          <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto animate-bounce mb-3">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h4 className={`text-xl font-bold font-display ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Félicitations ! Votre Projet est configuré
            </h4>
            <p className={`text-xs max-w-md mx-auto mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Le projet <span className="font-mono text-amber-500 font-bold">{createdProjectData.displayName}</span> a été entièrement provisionné et rattaché à votre compte.
            </p>
          </div>

          {createdConfigData && (
            <div className="text-left space-y-2 max-w-xl mx-auto">
              <div className={`flex items-center justify-between text-[11px] font-semibold font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>Clés SDK d'initialisation Web générées :</span>
                <button
                  onClick={() => {
                    const snippet = `const firebaseConfig = {
  apiKey: "${createdConfigData.apiKey}",
  authDomain: "${createdConfigData.authDomain}",
  projectId: "${createdConfigData.projectId}",
  storageBucket: "${createdConfigData.storageBucket || ''}",
  messagingSenderId: "${createdConfigData.messagingSenderId || ''}",
  appId: "${createdConfigData.appId}"
};`;
                    handleCopyCode(snippet);
                  }}
                  className="text-amber-500 hover:text-amber-400 font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié !' : 'Copier'}
                </button>
              </div>
              <pre className={`p-4 rounded-2xl text-[10px] font-mono leading-relaxed overflow-x-auto shadow-inner border transition-all ${
                isDark ? 'bg-slate-950/90 text-slate-100 border-slate-805' : 'bg-slate-950 text-slate-300 border-slate-900'
              }`}>
                <code>{`const firebaseConfig = {
  apiKey: "${createdConfigData.apiKey}",
  authDomain: "${createdConfigData.authDomain}",
  projectId: "${createdConfigData.projectId}",
  storageBucket: "${createdConfigData.storageBucket || ''}",
  messagingSenderId: "${createdConfigData.messagingSenderId || ''}",
  appId: "${createdConfigData.appId}"
};`}</code>
              </pre>
            </div>
          )}

          <div className="pt-6 border-t border-slate-800 flex justify-center gap-3">
            <button
              onClick={() => {
                onCreated(createdProjectData);
              }}
              className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              Accéder au Projet Maintenant !
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
