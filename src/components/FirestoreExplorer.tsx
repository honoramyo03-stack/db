import { useState, useEffect, FormEvent } from 'react';
import { 
  Database, 
  FolderIcon, 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Info, 
  Code, 
  List, 
  Eye, 
  Clock, 
  ExternalLink,
  ChevronRight,
  Sliders,
  Sparkles,
  HelpCircle,
  FileCode,
  ArrowRight
} from 'lucide-react';

export interface FirestoreExplorerProps {
  accessToken: string;
  projectId: string;
  databaseId: string;
  onAlertMessage?: (msg: string, type: 'success' | 'err') => void;
  theme?: string;
}

// Convert Firestore REST formatted 'fields' object to simple JS key-value object
function fromFirestoreFields(fields: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!fields) return result;
  
  for (const [key, valObj] of Object.entries(fields)) {
    if (valObj && typeof valObj === 'object') {
      const type = Object.keys(valObj)[0];
      const val = (valObj as any)[type];
      
      if (type === 'stringValue') {
        result[key] = val;
      } else if (type === 'integerValue') {
        result[key] = parseInt(val, 10);
      } else if (type === 'doubleValue') {
        result[key] = parseFloat(val);
      } else if (type === 'booleanValue') {
        result[key] = !!val;
      } else if (type === 'nullValue') {
        result[key] = null;
      } else if (type === 'mapValue') {
        result[key] = fromFirestoreFields(val.fields);
      } else if (type === 'arrayValue') {
        const values = val.values || [];
        result[key] = values.map((item: any) => {
          const itemType = Object.keys(item)[0];
          return item[itemType];
        });
      } else {
        result[key] = val;
      }
    } else {
      result[key] = valObj;
    }
  }
  return result;
}

// Convert normal JS object to Firestore REST typed 'fields' format
function toFirestoreFields(obj: Record<string, any>): any {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => {
            if (typeof v === 'boolean') return { booleanValue: v };
            if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
            return { stringValue: String(v) };
          })
        }
      };
    } else if (typeof value === 'object') {
      fields[key] = {
        mapValue: {
          fields: toFirestoreFields(value)
        }
      };
    } else {
      fields[key] = { stringValue: String(value) };
    }
  }
  return fields;
}

export default function FirestoreExplorer({ accessToken, projectId, databaseId, theme }: FirestoreExplorerProps) {
  const isDark = theme === 'dark';
  // Navigation states
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [customCollectionInput, setCustomCollectionInput] = useState<string>('');
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [searchDocQuery, setSearchDocQuery] = useState('');
  
  // Loading and Error states
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Editor states (Visual fields vs JSON text block editor)
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // Visual keys editor state
  interface VisualField {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'json';
    value: string;
  }
  const [visualFields, setVisualFields] = useState<VisualField[]>([]);

  // Document creation drawer state
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocId, setNewDocId] = useState('');
  const [newDocFieldsJson, setNewDocFieldsJson] = useState('{\n  "name": "Nouveau",\n  "active": true,\n  "count": 1\n}');

  // Load collections on component mount or change of project/database
  useEffect(() => {
    fetchCollectionsList();
    setSelectedCollection('');
    setDocuments([]);
    setSelectedDoc(null);
  }, [projectId, databaseId, accessToken]);

  // Fetch root collections
  const fetchCollectionsList = async () => {
    setIsLoadingCollections(true);
    setApiError(null);
    try {
      // POST projects/{projectId}/databases/{databaseId}/documents:listCollectionIds
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:listCollectionIds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("L'API Firestore a renvoyé un accès refusé (403). C'est normal si votre base de données est neuve : par défaut, Firestore bloque tous les accès externes. Veuillez activer le 'Mode Test' ou configurer des règles d'accès réelles de lecture/écriture (ex: 'allow read, write: if true;') dans la console Firebase (console.firebase.google.com) ou déployer votre fichier firestore.rules.");
        }
        if (response.status === 404) {
          throw new Error("Base de données Firestore non trouvée (404). Ce projet n'a peut-être pas encore initialisé Firestore.");
        }
        throw new Error(`Erreur (${response.status}) au chargement des collections.`);
      }

      const data = await response.json();
      const colList = data.collectionIds || [];
      setCollections(colList);
      
      // Select the first collection if available
      if (colList.length > 0) {
        handleSelectCollection(colList[0]);
      }
    } catch (err: any) {
      console.warn("Could not list collections:", err);
      setApiError(err.message || "Impossible de lister les collections racine.");
      // Fail gracefully - user can still input a custom collection name manually
      setCollections([]);
    } finally {
      setIsLoadingCollections(false);
    }
  };

  // Select a collection and load documents
  const handleSelectCollection = async (collectionPath: string) => {
    setSelectedCollection(collectionPath);
    setDocuments([]);
    setSelectedDoc(null);
    setIsLoadingDocs(true);
    setApiError(null);
    setIsCreatingDoc(false);

    try {
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionPath}?pageSize=100`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Accès refusé. Vérifiez que vos règles de sécurité Firestore de production autorisent la lecture (rules).");
        }
        throw new Error(`Impossible de récupérer les documents de la collection (Code ${response.status})`);
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Erreur de chargement des documents.");
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Convert raw API document to editor state
  const handleSelectDocument = (doc: any) => {
    setSelectedDoc(doc);
    setIsCreatingDoc(false);
    setSaveSuccess(false);
    
    // Normal JS key-value representation
    const jsObj = fromFirestoreFields(doc.fields);
    
    // Set JSON Text representation
    setJsonText(JSON.stringify(jsObj, null, 2));
    setJsonError(null);

    // Set Visual fields format
    const visualList: VisualField[] = Object.entries(jsObj).map(([key, value]) => {
      let type: 'string' | 'number' | 'boolean' | 'json' = 'string';
      if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'number') {
        type = 'number';
      } else if (typeof value === 'object' && value !== null) {
        type = 'json';
      }
      
      return {
        key,
        type,
        value: type === 'json' ? JSON.stringify(value) : String(value ?? '')
      };
    });
    setVisualFields(visualList);
  };

  // Add field in visual mode
  const handleAddVisualField = () => {
    setVisualFields(prev => [...prev, { key: `champ_${prev.length + 1}`, type: 'string', value: '' }]);
  };

  // Remove field in visual mode
  const handleRemoveVisualField = (index: number) => {
    setVisualFields(prev => prev.filter((_, i) => i !== index));
  };

  // Edit visual field key-value
  const handleUpdateVisualField = (index: number, updates: Partial<VisualField>) => {
    setVisualFields(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  // Handle custom manual collection search
  const handleCustomCollectionSearch = (e: FormEvent) => {
    e.preventDefault();
    if (customCollectionInput.trim()) {
      handleSelectCollection(customCollectionInput.trim());
      if (!collections.includes(customCollectionInput.trim())) {
        setCollections(prev => [...prev, customCollectionInput.trim()]);
      }
    }
  };

  // Synchronize/Save edited document back to Firebase Firestore
  const handleSaveDocument = async () => {
    if (!selectedDoc) return;
    setIsSaving(true);
    setApiError(null);
    setSaveSuccess(false);

    let parsedPayload: Record<string, any> = {};

    try {
      if (editMode === 'json') {
        try {
          parsedPayload = JSON.parse(jsonText);
        } catch (jsonErr: any) {
          throw new Error(`JSON Invalide: ${jsonErr.message}`);
        }
      } else {
        // Build payload object from visual inputs
        visualFields.forEach(field => {
          if (!field.key.trim()) return;
          
          if (field.type === 'number') {
            const num = Number(field.value);
            parsedPayload[field.key] = isNaN(num) ? 0 : num;
          } else if (field.type === 'boolean') {
            parsedPayload[field.key] = field.value.toLowerCase() === 'true' || field.value === '1';
          } else if (field.type === 'json') {
            try {
              parsedPayload[field.key] = JSON.parse(field.value);
            } catch (e) {
              parsedPayload[field.key] = field.value; // Fallback as raw text if JSON parse fails
            }
          } else {
            parsedPayload[field.key] = field.value;
          }
        });
      }

      // Format simple JSON to Firestore fields Schema structure
      const firestoreTypedFields = toFirestoreFields(parsedPayload);
      
      // Retrieve intermediate relative path of the document
      // Extract from raw document name: projects/{proj}/databases/{db}/documents/{path}
      const rawName = selectedDoc.name;
      const docPath = rawName.replace(`projects/${projectId}/databases/${databaseId}/documents/`, '');

      // To synchronize safely, build update query parameters for all root fields
      const params = new URLSearchParams();
      Object.keys(parsedPayload).forEach(key => {
        params.append('updateMask.fieldPaths', key);
      });

      const patchEndpoint = `https://firestore.googleapis.com/v1/${rawName}?${params.toString()}`;

      const response = await fetch(patchEndpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: firestoreTypedFields
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erreur d'écriture Firebase (${response.status})`);
      }

      const updatedDoc = await response.json();
      setSaveSuccess(true);
      
      // Update local array item state
      setDocuments(prev => prev.map(d => d.name === updatedDoc.name ? updatedDoc : d));
      setSelectedDoc(updatedDoc);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Impossible de sauvegarder les modifications.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete document
  const handleDeleteDocument = async () => {
    if (!selectedDoc) return;
    if (!window.confirm("Êtes-vous certain de vouloir supprimer définitivement ce document de Firebase Firestore ?")) return;

    setIsDeleting(true);
    setApiError(null);

    try {
      const rawName = selectedDoc.name;
      const response = await fetch(`https://firestore.googleapis.com/v1/${rawName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Erreur lors de la suppression du document (Code ${response.status})`);
      }

      // Remove from states
      setDocuments(prev => prev.filter(d => d.name !== rawName));
      setSelectedDoc(null);
      setSaveSuccess(false);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Une erreur est survenue lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete all documents inside the current collection to delete the collection itself
  const handleDeleteCollection = async () => {
    if (!selectedCollection || documents.length === 0) return;
    if (!window.confirm(`Attention : cette action va supprimer DÉFINITIVEMENT tous les documents (${documents.length}) présents dans la collection "${selectedCollection}". Cela supprimera également la collection dans Firestore de manière irréversible. Voulez-vous continuer ?`)) {
      return;
    }

    setIsDeletingCollection(true);
    setApiError(null);

    try {
      // Loop over and delete documents sequentially
      for (const doc of documents) {
        const response = await fetch(`https://firestore.googleapis.com/v1/${doc.name}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson.error?.message || `Code ${response.status}`;
          console.warn(`Impossible de supprimer le document ${doc.name}: ${errMsg}`);
          throw new Error(`Impossible de vider complètement la collection: ${errMsg}`);
        }
      }
      
      setDocuments([]);
      setSelectedDoc(null);
      setSaveSuccess(false);
      
      // Refresh list of collections
      await fetchCollectionsList();
      setSelectedCollection('');
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Impossible de vider complètement la collection.");
    } finally {
      setIsDeletingCollection(false);
    }
  };

  // Create document in active collection
  const handleCreateDocumentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCollection) return;
    setApiError(null);
    
    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(newDocFieldsJson);
    } catch (err: any) {
      alert(`Erreur de syntaxe JSON dans le corps du document : ${err.message}`);
      return;
    }

    setIsLoadingDocs(true);

    try {
      const typedFields = toFirestoreFields(parsed);
      
      // Build POST url
      let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${selectedCollection}`;
      if (newDocId.trim()) {
        url += `?documentId=${encodeURIComponent(newDocId.trim())}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: typedFields
        })
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error?.message || `Impossible de créer le document (${res.status})`);
      }

      const createdObj = await res.json();
      
      // Prepend to documents list
      setDocuments(prev => [createdObj, ...prev]);
      handleSelectDocument(createdObj);
      setIsCreatingDoc(false);
      setNewDocId('');
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "Erreur lors de la création du document.");
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Filter listed documents
  const filteredDocs = documents.filter(doc => {
    const docId = doc.name.split('/').pop() || '';
    if (!searchDocQuery) return true;
    
    const q = searchDocQuery.toLowerCase();
    if (docId.toLowerCase().includes(q)) return true;
    
    // Check inside fields contents (string values)
    const jsonStr = JSON.stringify(fromFirestoreFields(doc.fields)).toLowerCase();
    return jsonStr.includes(q);
  });

  return (
    <div className={`border rounded-3xl overflow-hidden shadow-xs transition-all duration-300 ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200/60'
    }`} id="firestore-explorer-element">
      
      {/* SECTION HEADER BAR */}
      <div className="bg-slate-950 text-white p-5 border-b border-slate-850 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-slate-950 p-2 rounded-xl flex items-center justify-center">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight font-display flex items-center gap-2">
              Explorateur Live Firestore <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide font-mono">Lecture & Écriture</span>
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
              Projet : {projectId} | Base de données : {databaseId}
            </p>
          </div>
        </div>
        <button
          onClick={() => { fetchCollectionsList(); if (selectedCollection) handleSelectCollection(selectedCollection); }}
          className="p-1.5 hover:bg-slate-800 text-slate-350 hover:text-white rounded-lg transition-all cursor-pointer"
          title="Actualiser la base"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* THREE-PANEL CORE INTERFACE */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 min-h-[500px] divide-y lg:divide-y-0 lg:divide-x transition-all duration-300 ${
        isDark ? 'divide-slate-800 bg-slate-900/40' : 'divide-slate-150 bg-white'
      }`}>
        
        {/* PANEL 1: COLLECTIONS (cols 1-3) */}
        <div className="lg:col-span-3 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
            <span>Collections ({collections.length})</span>
            <FolderIcon className="h-3.5 w-3.5" />
          </div>

          {apiError && !selectedCollection && (
            <div className={`p-3 rounded-xl border text-[11px] font-medium leading-relaxed font-sans ${
              isDark ? 'bg-rose-950/20 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-100 text-rose-700'
            }`}>
              <AlertTriangle className="h-4 w-4 text-rose-500 inline mr-1" />
              {apiError}
            </div>
          )}

          {/* Quick Collection Navigator Search Input */}
          <form onSubmit={handleCustomCollectionSearch} className="flex gap-2">
            <input
              type="text"
              value={customCollectionInput}
              onChange={(e) => setCustomCollectionInput(e.target.value)}
              placeholder="Chemin... (ex: users)"
              className={`flex-1 border rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden focus:ring-1 focus:ring-amber-500 transition-all ${
                isDark 
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-505 placeholder:text-slate-500 focus:bg-slate-950' 
                  : 'bg-slate-50 border-slate-200 text-slate-705 placeholder:text-slate-400 focus:bg-white'
              }`}
            />
            <button
              type="submit"
              className={`text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                isDark ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-slate-900 text-white hover:bg-slate-850'
              }`}
            >
              <ArrowRight className="h-3 w-3" />
            </button>
          </form>

          {/* List panel */}
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {isLoadingCollections ? (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-amber-500" />
                <span>Recherche de collections...</span>
              </div>
            ) : collections.length === 0 ? (
              <div className={`border border-dashed p-4 rounded-xl text-center text-[11px] space-y-2.5 transition-all ${
                isDark ? 'bg-slate-950/45 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                <Info className="h-4 w-4 text-amber-500 mx-auto" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-700 dark:text-slate-300">Aucune collection trouvée.</p>
                  <p className="text-[10px] leading-relaxed">Firestore est vide ou configuré avec des règles de sécurité limitantes.</p>
                </div>
                
                <div className="pt-1 space-y-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Suggestions de départ :</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {['users', 'tasks', 'messages', 'products'].map(col => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          setCustomCollectionInput(col);
                          handleSelectCollection(col);
                          if (!collections.includes(col)) {
                            setCollections(prev => [...prev, col]);
                          }
                        }}
                        className={`text-[10px] px-2 py-1 rounded-lg font-mono font-bold transition-all border cursor-pointer ${
                          isDark 
                            ? 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300 hover:text-white' 
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-350'
                        }`}
                      >
                        +{col}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              collections.map((colName) => {
                const isActive = selectedCollection === colName;
                return (
                  <button
                    key={colName}
                    onClick={() => handleSelectCollection(colName)}
                    className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold font-mono flex items-center justify-between transition-all group cursor-pointer ${
                      isActive 
                        ? (isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/35' : 'bg-amber-50 text-amber-700 border border-amber-200') 
                        : (isDark ? 'bg-slate-955/40 bg-slate-950/40 hover:bg-slate-850 border-slate-800 text-slate-305 text-slate-300' : 'bg-slate-50 hover:bg-slate-100/70 border-slate-150 text-slate-600')
                    }`}
                  >
                    <span className="truncate">{colName}</span>
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all ${isActive ? 'opacity-100 text-amber-600' : 'text-slate-400'}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* PANEL 2: DOCUMENTS LIST (cols 4-7) */}
        <div className="lg:col-span-4 p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono shrink-0">
              Documents ({filteredDocs.length})
            </span>
            {selectedCollection && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDeleteCollection}
                  disabled={isDeletingCollection || documents.length === 0}
                  className="text-[10px] bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  title="Supprimer toute la collection"
                >
                  <Trash2 className="h-3 w-3" /> {isDeletingCollection ? 'Vider...' : 'Vider'}
                </button>
                <button
                  onClick={() => {
                    setIsCreatingDoc(true);
                    setSelectedDoc(null);
                  }}
                  className="text-[10px] bg-amber-500 hover:bg-amber-600 text-slate-950 px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-3 w-3" /> Nouveau
                </button>
              </div>
            )}
          </div>

          {/* Quick Find doc bar */}
          <div className="relative">
            <Search className={`absolute left-3 top-3 h-3.5 w-3.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
            <input
              type="text"
              value={searchDocQuery}
              onChange={(e) => setSearchDocQuery(e.target.value)}
              placeholder="Filtrer les documents..."
              className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-amber-500 transition-all ${
                isDark 
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:bg-slate-950' 
                  : 'bg-slate-55 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400 focus:bg-white'
              }`}
            />
          </div>

          {/* Document list container */}
          <div className="flex-1 overflow-y-auto max-h-[400px] space-y-1.5 pr-0.5">
            {isLoadingDocs ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin text-amber-500 mx-auto" />
                <span>Interrogation en temps réel...</span>
              </div>
            ) : !selectedCollection ? (
              <div className="py-12 text-center text-[11px] text-slate-400">
                Sélectionnez d'abord une collection dans le panneau de gauche.
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className={`py-8 text-center text-xs border border-dashed p-4 rounded-xl text-slate-400 ${
                isDark ? 'border-slate-800 bg-slate-950/20' : 'border-slate-150 bg-slate-50/50'
              }`}>
                Aucun document trouvé dans la collection <span className="font-mono text-slate-500">"{selectedCollection}"</span>.
              </div>
            ) : (
              filteredDocs.map((docObj) => {
                const docId = docObj.name.split('/').pop();
                const isSelected = selectedDoc?.name === docObj.name;
                const simpleData = fromFirestoreFields(docObj.fields);
                const displaySnippet = Object.entries(simpleData)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{...}' : v}`)
                  .join(', ');

                return (
                  <button
                    key={docObj.name}
                    onClick={() => handleSelectDocument(docObj)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all text-xs flex flex-col gap-1.5 cursor-pointer ${
                      isSelected 
                        ? (isDark ? 'bg-amber-500/10 border-amber-500/40 shadow-xs' : 'bg-amber-50 border-amber-300 shadow-xs') 
                        : (isDark ? 'bg-slate-905 bg-slate-950/40 hover:bg-slate-850 border-slate-800 text-slate-300' : 'bg-slate-50 hover:bg-slate-100/70 border-slate-150')
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold font-mono truncate max-w-[180px] ${
                        isSelected 
                          ? (isDark ? 'text-amber-400' : 'text-amber-900') 
                          : (isDark ? 'text-slate-100' : 'text-slate-800')
                      }`}>
                        {docId}
                      </span>
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected 
                          ? (isDark ? 'text-amber-400' : 'text-amber-500') 
                          : (isDark ? 'text-slate-600' : 'text-slate-300')
                      }`} />
                    </div>
                    {displaySnippet && (
                      <p className={`text-[10px] truncate font-sans ${
                        isSelected 
                          ? (isDark ? 'text-slate-300' : 'text-slate-600') 
                          : 'text-slate-400'
                      }`}>
                        {displaySnippet}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* PANEL 3: DETAIL INSPECTOR & SYNCHRONIZER (cols 8-12) */}
        <div className="lg:col-span-5 p-5">
          
          {/* CREATION DRAFT FORM VIEW */}
          {isCreatingDoc && selectedCollection ? (
            <form onSubmit={handleCreateDocumentSubmit} className="space-y-4">
              <div className={`pb-3 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-150'}`}>
                <div>
                  <h4 className={`font-bold text-xs uppercase ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    Création de document
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Dans : {selectedCollection}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingDoc(false)}
                  className={`text-xs ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'} cursor-pointer`}
                >
                  Annuler
                </button>
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[11px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Identifiant de document (ID)
                </label>
                <input
                  type="text"
                  value={newDocId}
                  onChange={(e) => setNewDocId(e.target.value)}
                  placeholder="Laisser vide pour un auto-ID généré"
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 font-mono focus:outline-hidden transition-all ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:bg-slate-950' 
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`block text-[11px] font-bold uppercase flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>Corps de données (JSON valide)</span>
                  <HelpCircle className="h-3.5 w-3.5 text-slate-400" title="Format JSON natif simple" />
                </label>
                <textarea
                  value={newDocFieldsJson}
                  onChange={(e) => setNewDocFieldsJson(e.target.value)}
                  rows={8}
                  className={`w-full border p-4 font-mono text-xs focus:ring-1 focus:outline-hidden focus:ring-amber-500 leading-relaxed rounded-2xl transition-all ${
                    isDark ? 'bg-slate-950 text-emerald-400 border-slate-800' : 'bg-slate-950 text-emerald-400 border-slate-900'
                  }`}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Enregistrer sur Firebase
              </button>
            </form>
          ) : selectedDoc ? (
            /* ACTIVE DOCUMENT VIEW & EDITOR */
            <div className="space-y-5">
              
              {/* Document identity info */}
              <div className={`pb-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3 ${isDark ? 'border-slate-800' : 'border-slate-150'}`}>
                <div>
                  <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase truncate max-w-[200px] inline-block ${
                    isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
                  }`}>
                    ID: {selectedDoc.name.split('/').pop()}
                  </span>
                  <h3 className={`text-sm font-bold font-mono mt-1 flex items-center gap-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    Path: {selectedDoc.name.replace(`projects/${projectId}/databases/${databaseId}/documents/`, '')}
                  </h3>
                </div>
                
                {/* Delete button */}
                <button
                  onClick={handleDeleteDocument}
                  disabled={isDeleting}
                  className="text-xs text-rose-600 hover:text-white border border-rose-200 hover:bg-rose-600 hover:border-rose-600 px-3 py-1.5 rounded-xl transition-all font-semibold flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? "Suppression..." : "Supprimer"}
                </button>
              </div>

              {/* API status display updates (success icon or network messages) */}
              {saveSuccess && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 font-medium border transition-all ${
                  isDark 
                    ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
                    : 'bg-emerald-55 bg-emerald-50 border-emerald-100 text-emerald-707 text-emerald-700'
                }`}>
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Modifications écrites & synchronisées en direct sur Firebase.</span>
                </div>
              )}

              {apiError && (
                <div className={`p-3.5 rounded-xl text-xs flex gap-2 font-medium border transition-all ${
                  isDark 
                    ? 'bg-rose-950/30 border-rose-900/50 text-rose-400' 
                    : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Erreur de requétage :</p>
                    <p className="leading-relaxed text-[11px] font-normal font-mono">{apiError}</p>
                  </div>
                </div>
              )}

              {/* EDITOR MODE CONTROLLER (VISUAL VS JSON) */}
              <div className={`flex rounded-xl p-1 text-xs transition-all ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => setEditMode('visual')}
                  className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    editMode === 'visual' 
                      ? isDark ? 'bg-slate-800 text-slate-100 shadow-xs' : 'bg-white text-slate-900 shadow-xs'
                      : isDark ? 'text-slate-500 hover:text-slate-350 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" /> Éditeur Visuel
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode('json')}
                  className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    editMode === 'json' 
                      ? isDark ? 'bg-slate-800 text-slate-100 shadow-xs' : 'bg-white text-slate-900 shadow-xs'
                      : isDark ? 'text-slate-500 hover:text-slate-350 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Code className="h-3.5 w-3.5" /> Code JSON
                </button>
              </div>

              {/* VISUAL CONTROLLER FIELDS EDITOR */}
              {editMode === 'visual' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    <span>Paramètres du Document</span>
                    <button
                      type="button"
                      onClick={handleAddVisualField}
                      className="text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1 text-xs cursor-pointer transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Ajouter un champ
                    </button>
                  </div>

                  <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                    {visualFields.length === 0 ? (
                      <div className={`text-center py-8 rounded-2xl border border-dashed text-xs text-slate-400 ${
                        isDark ? 'border-slate-800 bg-slate-950/20' : 'border-slate-200/60 bg-slate-50/50'
                      }`}>
                        Aucun champ défini. Appuyez sur "+ Ajouter un champ" pour commencer.
                      </div>
                    ) : (
                      visualFields.map((field, index) => (
                        <div key={index} className={`flex flex-col gap-2.5 p-3.5 rounded-2xl border transition-all ${
                          isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200/50 shadow-xs'
                        }`}>
                          {/* Line 1: Field name header and trash button */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              Clé du champ #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveVisualField(index)}
                              className={`p-1.5 rounded-xl hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 transition-all cursor-pointer ${
                                isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-200'
                              }`}
                              title="Supprimer ce champ"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </button>
                          </div>

                          {/* Clé Input */}
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) => handleUpdateVisualField(index, { key: e.target.value })}
                            placeholder="Nom de la clé (ex: status, age, stock)"
                            className={`w-full border rounded-xl px-3 py-2 text-xs font-mono transition-all focus:outline-hidden focus:ring-1 focus:ring-amber-500 ${
                              isDark ? 'bg-slate-900 border-slate-750 text-slate-100 placeholder:text-slate-650' : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-450'
                            }`}
                          />

                          {/* Type & Value Selection Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mt-0.5">
                            {/* Type Dropdown (cols 1-4) */}
                            <div className="sm:col-span-4 flex flex-col gap-1">
                              <span className={`text-[9px] font-semibold uppercase tracking-wider font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Type</span>
                              <select
                                value={field.type}
                                onChange={(e) => handleUpdateVisualField(index, { type: e.target.value as any })}
                                className={`w-full border rounded-xl p-2 text-xs font-semibold focus:outline-hidden cursor-pointer ${
                                  isDark ? 'bg-slate-900 border-slate-755 text-slate-305 text-slate-300' : 'bg-white border-slate-200 text-slate-705'
                                }`}
                              >
                                <option value="string">Texte</option>
                                <option value="number">Nombre</option>
                                <option value="boolean">Boolean</option>
                                <option value="json">JSON / Map</option>
                              </select>
                            </div>

                            {/* Value Input (cols 5-12) */}
                            <div className="sm:col-span-8 flex flex-col gap-1">
                              <span className={`text-[9px] font-semibold uppercase tracking-wider font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Valeur</span>
                              {field.type === 'boolean' ? (
                                <select
                                  value={field.value}
                                  onChange={(e) => handleUpdateVisualField(index, { value: e.target.value })}
                                  className={`w-full border rounded-xl p-2 text-xs font-medium focus:outline-hidden cursor-pointer ${
                                    isDark ? 'bg-slate-900 border-slate-750 text-slate-200' : 'bg-white border-slate-250 text-slate-800'
                                  }`}
                                >
                                  <option value="true">Vrai (true)</option>
                                  <option value="false">Faux (false)</option>
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) => handleUpdateVisualField(index, { value: e.target.value })}
                                  placeholder={field.type === 'number' ? 'Chiffre (ex: 42)' : 'Insérer la valeur...'}
                                  className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-amber-500 ${
                                    isDark ? 'bg-slate-900 border-slate-750 text-slate-100 placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
                                  }`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* JSON TEXT BLOCK EDITOR */
                 <div className="space-y-1.5">
                   <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Éditeur de code JSON
                  </div>
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    rows={12}
                    className={`w-full border p-4 font-mono text-xs focus:ring-1 focus:outline-hidden focus:ring-amber-500 leading-relaxed rounded-2xl transition-all ${
                      isDark ? 'bg-slate-950 text-emerald-400 border-slate-800' : 'bg-slate-950 text-emerald-400 border-slate-900'
                    }`}
                  />
                </div>
              )}

              {/* SAVE / SYNC ACTIONS BAR */}
              <div className={`pt-3 border-t flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-150'}`}>
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" /> Mis à jour : {new Date(selectedDoc.updateTime).toLocaleTimeString()}
                </span>
                
                <button
                  onClick={handleSaveDocument}
                  disabled={isSaving}
                  className={`font-bold text-xs px-5 py-2.5 rounded-2xl flex items-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer ${
                    isDark ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Sauvegarde..." : "Synchroniser sur Firebase"}
                </button>
              </div>

            </div>
          ) : (
            /* NONE SELECTED PLACEHOLDER */
            <div className="h-full min-h-[300px] flex flex-col justify-center items-center text-center text-slate-450 text-slate-400 space-y-3">
              <Eye className={`h-10 w-10 ${isDark ? 'text-slate-800' : 'text-slate-200'}`} />
              <h4 className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Aucun document actif</h4>
              <p className="text-[11px] text-slate-405 leading-relaxed text-slate-400 max-w-xs">
                Sélectionnez un document d'une collection pour dévoiler son contenu, éditer ses attributs ou le synchroniser directement.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
