/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { 
  Bell, 
  Trash2, 
  Check, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle,
  Lightbulb,
  CheckCircle2
} from 'lucide-react';
import { db, handleFirestoreError } from '../firebase.ts';
import { Alert, Transaction, Budget, OperationType } from '../types.ts';

interface SavingAlertsProps {
  userId: string;
  alerts: Alert[];
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoal: number;
}

export default function SavingAlerts({ 
  userId, 
  alerts, 
  transactions, 
  budgets, 
  savingsGoal 
}: SavingAlertsProps) {
  // 1. Calculate smart recommendations dynamically on the client
  const smartRecommendations = useMemo(() => {
    const recs: { id: string; title: string; message: string; type: 'warning' | 'info'; icon: any }[] = [];

    let totalIncome = 0;
    let totalExpenses = 0;
    const categorySpent: Record<string, number> = {};

    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'revenue') {
        totalIncome += amt;
      } else {
        totalExpenses += amt;
        categorySpent[tx.category] = (categorySpent[tx.category] || 0) + amt;
      }
    });

    const currentSavings = totalIncome - totalExpenses;

    // Check 1: Deficit Alert
    if (totalExpenses > totalIncome && totalIncome > 0) {
      recs.push({
        id: 'rec-deficit',
        title: 'Contraintes budgétaires',
        message: 'Vos dépenses mensuelles dépassent vos revenus actuels. Essayez de reporter les achats non prioritaires.',
        type: 'warning',
        icon: AlertTriangle
      });
    }

    // Check 2: Global target progress
    if (savingsGoal > 0 && currentSavings >= savingsGoal) {
      recs.push({
        id: 'rec-goal-met',
        title: 'Objectif d\'épargne sécurisé !',
        message: `Félicitations ! Vous avez dépassé votre objectif d'épargne mensuel de ${savingsGoal} € (Épargne actuelle: ${currentSavings} €).`,
        type: 'info',
        icon: CheckCircle2
      });
    }

    // Check 3: Subscription costs
    const subCosts = categorySpent['Abonnements'] || 0;
    if (totalIncome > 0 && subCosts > totalIncome * 0.15) {
      recs.push({
        id: 'rec-subscriptions',
        title: 'Alerte Abonnements récurrents',
        message: `Vos abonnements réguliers représentent ${Math.round((subCosts / totalIncome) * 100)}% de vos revenus financiers. Faites le tri !`,
        type: 'warning',
        icon: Lightbulb
      });
    }

    // Check 4: Food overspending
    const foodCosts = categorySpent['Alimentation'] || 0;
    if (totalExpenses > 0 && foodCosts > totalExpenses * 0.45) {
      recs.push({
        id: 'rec-food',
        title: 'Surveillance Alimentation',
        message: 'La moitié de votre budget s\'oriente vers la restauration et l\'alimentation. Privilégiez les paniers faits maison pour économiser.',
        type: 'info',
        icon: Lightbulb
      });
    }

    // Check 5: General advice
    if (transactions.length > 3 && recs.length === 0) {
      recs.push({
        id: 'rec-advice',
        title: 'Épargne optimisée',
        message: 'Excellente gestion ! Vos plafonds sont respectés et vos soldes sont sur la bonne voie.',
        type: 'info',
        icon: Sparkles
      });
    }

    return recs;
  }, [transactions, savingsGoal]);

  // 2. Dismiss (Mark as read) Database alerts
  const handleMarkAsRead = async (id: string) => {
    const path = `profiles/${userId}/alerts/${id}`;
    try {
      await updateDoc(doc(db, 'profiles', userId, 'alerts', id), {
        read: true
      });
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  // 3. Delete database alert
  const handleDeleteAlert = async (id: string) => {
    const path = `profiles/${userId}/alerts/${id}`;
    try {
      await deleteDoc(doc(db, 'profiles', userId, 'alerts', id));
    } catch (e: any) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  const activeDbAlerts = useMemo(() => {
    return alerts.filter(a => !a.read);
  }, [alerts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="saving-alerts-layout">
      
      {/* Dynamic Smart Saving Suggestions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between" id="smart-recs-panel">
        <div>
          <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-1.5">
            <Sparkles className="h-5 w-5 text-teal-600 animate-pulse" />
            Optimisation Spécifique de l'Épargne
          </h3>
          <p className="text-xs text-slate-400 mb-4Leading-relaxed">
            Astuces intelligentes calculées instantanément d'après l'analyse des dépenses en cours.
          </p>

          <div className="space-y-4" id="smart-recs-list">
            {smartRecommendations.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center">
                En attente d'écritures pour générer des astuces d'épargne.
              </p>
            ) : (
              smartRecommendations.map((rec) => {
                const IconComponent = rec.icon;
                return (
                  <div 
                    key={rec.id} 
                    className={`p-4 rounded-xl border flex gap-3 transition-colors ${
                      rec.type === 'warning' 
                        ? 'bg-amber-50/70 border-amber-100 text-amber-900' 
                        : 'bg-emerald-50/70 border-emerald-100 text-emerald-900'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 h-fit ${
                      rec.type === 'warning' ? 'bg-amber-100/90 text-amber-700' : 'bg-emerald-100/90 text-emerald-700'
                    }`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-semibold text-xs uppercase tracking-wider">{rec.title}</h4>
                      <p className="text-xs text-slate-600 leading-normal">{rec.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          Mise à jour d'après vos flux récents.
        </div>
      </div>

      {/* Database Warning Alerts */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs" id="db-notifications-panel">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            Vos Alertes Budgets
          </h3>
          <span className="bg-slate-150 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-slate-500">
            {activeDbAlerts.length} non lues
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Alertes de plafonds et dépassements configurées. Marquez les messages comme lus pour vider le panneau.
        </p>

        {activeDbAlerts.length === 0 ? (
          <div className="border border-dashed border-slate-150 rounded-xl p-10 text-center text-slate-400 text-xs italic" id="empty-state-alerts">
            <p>Aucune alerte à signaler. Vos budgets de catégories respectent vos limites de dépenses.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[310px] overflow-y-auto pr-1" id="notifications-list">
            {activeDbAlerts.map((alt) => (
              <div 
                key={alt.id} 
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                  alt.type === 'warning' ? 'bg-rose-50/60 border-rose-100' : 'bg-blue-50/60 border-blue-100'
                }`}
                id={`alert-card-${alt.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${alt.type === 'warning' ? 'bg-rose-505 bg-rose-500' : 'bg-blue-500'}`}></span>
                    <span className="font-bold text-xs text-slate-800">{alt.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-normal">{alt.message}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMarkAsRead(alt.id)}
                    className="p-1.5 bg-white text-slate-400 hover:text-emerald-600 border border-slate-200/50 hover:border-emerald-250 hover:bg-emerald-50 rounded-lg transition-all shadow-2xs shrink-0 cursor-pointer"
                    title="Masquer"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAlert(alt.id)}
                    className="p-1.5 bg-white text-slate-400 hover:text-rose-600 border border-slate-200/50 hover:border-rose-250 hover:bg-rose-50 rounded-lg transition-all shadow-2xs shrink-0 cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
