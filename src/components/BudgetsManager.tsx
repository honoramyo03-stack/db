/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Plus, 
  Check, 
  Trash2, 
  Edit2, 
  Target, 
  AlertTriangle, 
  TrendingUp, 
  X,
  Sparkles
} from 'lucide-react';
import { db, handleFirestoreError } from '../firebase.ts';
import { Budget, Transaction, TRANSACTION_CATEGORIES, OperationType } from '../types.ts';

interface BudgetsManagerProps {
  userId: string;
  budgets: Budget[];
  transactions: Transaction[];
  savingsGoal: number;
  onUpdateSavingsGoal: (val: number) => Promise<void>;
}

export default function BudgetsManager({ 
  userId, 
  budgets, 
  transactions, 
  savingsGoal, 
  onUpdateSavingsGoal 
}: BudgetsManagerProps) {
  // Budget values
  const [selectedCategory, setSelectedCategory] = useState('Alimentation');
  const [limitValue, setLimitValue] = useState('');
  
  // Edit goal values
  const [editGoalValue, setEditGoalValue] = useState(savingsGoal.toString());
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  // Edit inline budgets
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editLimitValue, setEditLimitValue] = useState('');

  // Statuses
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sum spending per category MTD
  const categorySpentMap = transactions.reduce((acc, tx) => {
    if (tx.type === 'charge') {
      acc[tx.category] = (acc[tx.category] || 0) + Number(tx.amount || 0);
    }
    return acc;
  }, {} as Record<string, number>);

  // 1. Create or Update category budget limit
  const handleSaveBudget = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsedLimit = parseFloat(limitValue);
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      setErrorMsg('Veuillez spécifier un montant de limite positif ou nul.');
      return;
    }

    // Use category as docId to ensure unique budget limits per category (idempotent design)
    const docId = selectedCategory.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const path = `profiles/${userId}/budgets/${docId}`;
    
    try {
      await setDoc(doc(db, 'profiles', userId, 'budgets', docId), {
        category: selectedCategory,
        monthlyLimit: parsedLimit,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setLimitValue('');
      setSuccessMsg(`Budget défini pour ${selectedCategory} !`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  // 2. Inline budget edit action
  const handleUpdateInlineBudget = async (id: string, categoryName: string) => {
    setErrorMsg(null);
    const parsedLimit = parseFloat(editLimitValue);
    if (isNaN(parsedLimit) || parsedLimit < 0) {
      setErrorMsg('Veuillez entrer une limite supérieure ou égale à 0.');
      return;
    }

    const path = `profiles/${userId}/budgets/${id}`;
    try {
      await setDoc(doc(db, 'profiles', userId, 'budgets', id), {
        category: categoryName,
        monthlyLimit: parsedLimit,
        createdAt: serverTimestamp(), // fallback or update
        updatedAt: serverTimestamp()
      }, { merge: true });

      setEditingBudgetId(null);
      setSuccessMsg('Budget mis à jour !');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  // 3. Delete category budget limit
  const handleDeleteBudget = async (id: string, categoryName: string) => {
    if (!window.confirm(`Supprimer la limite de budget pour la catégorie ${categoryName} ?`)) return;
    setErrorMsg(null);
    const path = `profiles/${userId}/budgets/${id}`;
    try {
      await deleteDoc(doc(db, 'profiles', userId, 'budgets', id));
      setSuccessMsg(`Budget supprimé pour ${categoryName}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  // 4. Update overall Savings target Goal
  const handleSaveSavingsGoal = async () => {
    setErrorMsg(null);
    const parsedGoal = parseFloat(editGoalValue);
    if (isNaN(parsedGoal) || parsedGoal < 0) {
      setErrorMsg("L'objectif d'épargne mensuel doit être supérieur ou égal à zéro.");
      return;
    }

    try {
      await onUpdateSavingsGoal(parsedGoal);
      setIsEditingGoal(false);
      setSuccessMsg("Objectif d'épargne enregistré !");
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e) {
      setErrorMsg("Échec de la mise à jour de l'objectif d'épargne.");
    }
  };

  // Select progress styling depending on used ratio
  const getProgressStyles = (ratio: number) => {
    if (ratio >= 1) return { bar: 'bg-rose-600', text: 'text-rose-600 font-bold', bg: 'bg-rose-50' };
    if (ratio >= 0.8) return { bar: 'bg-amber-500', text: 'text-amber-600 font-semibold', bg: 'bg-amber-50' };
    if (ratio >= 0.5) return { bar: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' };
    return { bar: 'bg-emerald-500', text: 'text-slate-600', bg: 'bg-transparent' };
  };

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="budgets-manager-layout">
      {/* 1. Global goals panel */}
      <div className="lg:col-span-1 space-y-6" id="target-saving-panel">
        
        {/* Savings Goal Card */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
          <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-2">
            <Target className="h-5 w-5 text-teal-600" />
            Épargne Cible Mensuelle
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Définissez votre objectif d'épargne globale restant après déduction de vos charges mensuelles.
          </p>

          <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col gap-3" id="saving-goal-form-wrapper">
            {isEditingGoal ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Ex: 500"
                  value={editGoalValue}
                  onChange={(e) => setEditGoalValue(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleSaveSavingsGoal}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg text-xs flex items-center justify-center cursor-pointer"
                  title="Valider"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingGoal(false);
                    setEditGoalValue(savingsGoal.toString());
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-600 p-1.5 rounded-lg text-xs"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cible d'Épargne</span>
                  <span className="text-xl font-bold font-mono text-slate-800 mt-1">{formatCurrency(savingsGoal)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingGoal(true)}
                  className="text-xs text-teal-600 font-medium hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-all border border-teal-100 cursor-pointer"
                >
                  Modifier
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Set Specific Category Budget limit Form */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
          <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Limiter une Catégorie
          </h3>

          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mb-4" id="budget-error">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-1.5 animate-fade-in" id="budget-success">
              <Check className="h-4 w-4" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveBudget} className="space-y-4" id="budget-limit-form">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Catégorie cible</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-hidden text-slate-700 font-medium"
              >
                {TRANSACTION_CATEGORIES.filter(c => c !== 'Revenus').map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Plafond Mensuel (€)</label>
              <input
                type="number"
                placeholder="Ex: 300"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono text-slate-700"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Fixer cette limite
            </button>
          </form>
        </div>

      </div>

      {/* 2. List of current budgets and spending comparisons */}
      <div className="lg:col-span-2" id="managed-budgets-list-section">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs h-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">Suivi Plafonds & Dépenses</h3>
              <p className="text-xs text-slate-400 mt-0.5">Vérifiez les seuils de dépenses par rapport aux limites d'alerte.</p>
            </div>
            <div className="text-xs text-slate-400 bg-slate-50 hover:bg-slate-100 flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium border border-slate-200/50">
              <TrendingUp className="h-3.5 w-3.5" /> Plafonds actifs: {budgets.length}
            </div>
          </div>

          {budgets.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center" id="empty-state-budgets">
              <p className="text-slate-400 text-xs italic">
                Aucun plafond de dépense n'a encore été configuré. Utilisez le panneau latéral gauche pour configurer des plafonds et vous prémunir du gaspillage.
              </p>
            </div>
          ) : (
            <div className="space-y-4" id="budgets-progress-list">
              {budgets.map((b) => {
                const spent = categorySpentMap[b.category] || 0;
                const ratio = b.monthlyLimit > 0 ? spent / b.monthlyLimit : 0;
                const styles = getProgressStyles(ratio);
                const isEditing = editingBudgetId === b.id;

                return (
                  <div key={b.id} className={`p-4 rounded-xl border border-slate-100 ${styles.bg} transition-all`} id={`budget-card-${b.id}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-700"></span>
                        <span className="font-semibold text-sm text-slate-850">{b.category}</span>
                      </div>

                      {/* Display / Inline modification controls */}
                      {isEditing ? (
                        <div className="flex items-center gap-1 text-xs self-start sm:self-center">
                          <input
                            type="number"
                            value={editLimitValue}
                            onChange={(e) => setEditLimitValue(e.target.value)}
                            className="bg-white border border-slate-200 rounded px-2 py-1 w-20 font-mono text-right text-xs"
                          />
                          <span className="mr-1">€</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateInlineBudget(b.id, b.category)}
                            className="p-1 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Confirmer"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBudgetId(null)}
                            className="p-1 hover:text-slate-600 hover:bg-slate-100 rounded"
                            title="Annuler"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 self-start sm:self-center text-xs">
                          <span className="text-slate-500 font-mono">
                            Dépensé: <strong className="text-slate-800">{formatCurrency(spent)}</strong> / {formatCurrency(b.monthlyLimit)}
                          </span>
                          
                          <div className="flex items-center shrink-0 border-l border-slate-200 pl-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBudgetId(b.id);
                                setEditLimitValue(b.monthlyLimit.toString());
                              }}
                              className="p-1 hover:text-slate-800 text-slate-400 hover:bg-slate-50 rounded"
                              title="Modifier la limite"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBudget(b.id, b.category)}
                              className="p-1 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded ml-0.5"
                              title="Supprimer la limite"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Category progress view indicator */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-slate-200/60 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${styles.bar}`}
                          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Restant: <strong className="font-mono">{formatCurrency(Math.max(b.monthlyLimit - spent, 0))}</strong></span>
                        <span className={`{styles.text} font-mono font-medium`}>
                          {Math.round(ratio * 100)}% Consommé
                        </span>
                      </div>
                    </div>

                    {/* Warn message if limit exceeded */}
                    {ratio >= 1 && (
                      <div className="mt-3 bg-rose-50 border-l-2 border-rose-550 border-rose-500 p-2 rounded-r-lg text-[10px] text-rose-700 flex items-center gap-1.5 font-medium animate-pulse">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span>Plafond de budget dépassé ! Pensez à modérer vos dépenses pour compenser.</span>
                      </div>
                    )}
                    {ratio >= 0.8 && ratio < 1 && (
                      <div className="mt-3 bg-amber-50 border-l-2 border-amber-500 p-2 rounded-r-lg text-[10px] text-amber-700 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>Attention : Seuil de vigilance de 80% franchi pour cette catégorie.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
