/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, FormEvent } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  X, 
  Check, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { db, handleFirestoreError } from '../firebase.ts';
import { Transaction, TransactionType, TRANSACTION_CATEGORIES, OperationType } from '../types.ts';

interface TransactionsCRUDProps {
  userId: string;
  transactions: Transaction[];
}

export default function TransactionsCRUD({ userId, transactions }: TransactionsCRUDProps) {
  // 1. Local UI State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('charge');
  const [category, setCategory] = useState('Alimentation');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'charge' | 'revenue'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('charge');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');

  // Local errors
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 2. Add New Transaction Action
  const handleAddTransaction = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
      setErrorMsg('Veuillez renseigner une description.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Le montant doit être un nombre strictement supérieur à zéro.');
      return;
    }
    if (!date) {
      setErrorMsg('Veuillez entrer une date valide.');
      return;
    }

    const path = `profiles/${userId}/transactions`;
    try {
      await addDoc(collection(db, 'profiles', userId, 'transactions'), {
        description: description.trim(),
        amount: parsedAmount,
        type,
        category: type === 'revenue' ? 'Revenus' : category,
        date,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Clear input form
      setDescription('');
      setAmount('');
      setCategory('Alimentation');
      setSuccessMsg('Transaction ajoutée avec succès !');
      
      // Auto-clear message
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  };

  // 3. Delete Transaction Action
  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette transaction ?')) return;
    setErrorMsg(null);
    const path = `profiles/${userId}/transactions/${id}`;
    try {
      await deleteDoc(doc(db, 'profiles', userId, 'transactions', id));
      setSuccessMsg('Transaction supprimée.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  // 4. Populating / Handling Edit Form
  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditDescription(tx.description);
    setEditAmount(tx.amount.toString());
    setEditType(tx.type);
    setEditCategory(tx.category);
    setEditDate(tx.date);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleUpdateTransaction = async (id: string) => {
    setErrorMsg(null);
    const parsedAmount = parseFloat(editAmount);
    
    if (!editDescription.trim()) {
      setErrorMsg('La description ne peut pas être vide.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Le montant doit être valide.');
      return;
    }

    const path = `profiles/${userId}/transactions/${id}`;
    try {
      await updateDoc(doc(db, 'profiles', userId, 'transactions', id), {
        description: editDescription.trim(),
        amount: parsedAmount,
        type: editType,
        category: editType === 'revenue' ? 'Revenus' : editCategory,
        date: editDate,
        updatedAt: serverTimestamp()
      });

      setEditingId(null);
      setSuccessMsg('Transaction mise à jour !');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  // 5. Computed transactions list (Filtered, Searched, Sorted)
  const processedTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              tx.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || tx.type === filterType;
        const matchesCategory = filterCategory === 'all' || tx.category === filterCategory;
        return matchesSearch && matchesType && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') return b.date.localeCompare(a.date);
        if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
        if (sortBy === 'amount-desc') return b.amount - a.amount;
        if (sortBy === 'amount-asc') return a.amount - b.amount;
        return 0;
      });
  }, [transactions, searchQuery, filterType, filterCategory, sortBy]);

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="crud-grid">
      
      {/* 1. Form Column */}
      <div className="lg:col-span-1" id="add-transaction-section">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs sticky top-4">
          <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-4">
            <Plus className="h-5 w-5 text-teal-600" />
            Nouvelle Transaction
          </h3>

          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-2" id="alert-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-600 text-xs p-3 rounded-lg mb-4 flex items-center gap-2 animate-fade-in" id="alert-success">
              <Check className="h-4 w-4" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleAddTransaction} className="space-y-4" id="add-transaction-form">
            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label>
              <input
                type="text"
                placeholder="Ex: Courses Carrefour, Loyer..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition-all text-slate-700"
                id="tx-desc-input"
              />
            </div>

            {/* Type Choice */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Type de Transaction</label>
              <div className="grid grid-cols-2 gap-2" id="tx-type-selector">
                <button
                  type="button"
                  onClick={() => {
                    setType('charge');
                    if (category === 'Revenus') setCategory('Alimentation');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border flex items-center justify-center gap-1.5 transition-all
                    ${type === 'charge' 
                      ? 'bg-rose-550 border-rose-500 text-rose-600 font-semibold' 
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500'}`}
                  id="btn-type-charge"
                >
                  <ArrowDownRight className="h-3.5 w-3.5" /> Dépense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType('revenue');
                    setCategory('Revenus');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border flex items-center justify-center gap-1.5 transition-all
                    ${type === 'revenue' 
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-600 font-semibold' 
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500'}`}
                  id="btn-type-revenue"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" /> Revenu
                </button>
              </div>
            </div>

            {/* Amount / Date Row */}
            <div className="grid grid-cols-2 gap-3" id="tx-amount-date-row">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Montant (€)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono text-slate-700"
                  id="tx-amount-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-650 font-mono"
                  id="tx-date-input"
                />
              </div>
            </div>

            {/* Category selection */}
            {type === 'charge' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Catégorie</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-700"
                  id="tx-category-select"
                >
                  {TRANSACTION_CATEGORIES.filter(cat => cat !== 'Revenus').map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer mt-4"
              id="tx-submit-button"
            >
              Enregistrer
            </button>
          </form>
        </div>
      </div>

      {/* 2. Historic List Column */}
      <div className="lg:col-span-2" id="list-transactions-section">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col h-full justify-between">
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4" id="list-header-row">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight">Historique des Flux</h3>
                <p className="text-xs text-slate-400 mt-0.5">Retrouvez toutes vos écritures synchronisées en direct.</p>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-1.5 self-start bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full text-[10px] text-emerald-600 font-semibold" id="real-time-badge">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                SYNCHRO TEMPS RÉEL
              </div>
            </div>

            {/* Filters bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60" id="filters-container">
              {/* Search */}
              <div className="relative sm:col-span-1" id="filter-search-col">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:outline-hidden"
                />
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1" id="filter-type-col">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="w-full bg-transparent text-xs text-slate-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">Tous types</option>
                  <option value="charge">Dépenses</option>
                  <option value="revenue">Revenus</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="bg-white border border-slate-200 rounded-lg px-2 py-1" id="filter-category-col">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">Toutes catégories</option>
                  {TRANSACTION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Sorting Filter */}
              <div className="bg-white border border-slate-200 rounded-lg px-2 py-1" id="filter-sorting-col">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-transparent text-xs text-slate-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="date-desc">Récent → Ancien</option>
                  <option value="date-asc">Ancien → Récent</option>
                  <option value="amount-desc">Montant élevé</option>
                  <option value="amount-asc">Montant faible</option>
                </select>
              </div>
            </div>

            {/* Transactions Table/List */}
            {processedTransactions.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center" id="empty-state-list">
                <p className="text-slate-400 text-xs italic">Aucune transaction ne correspond à vos filtres.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100" id="transactions-table-container">
                <table className="w-full border-collapse text-left text-xs" id="transactions-table">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                      <th className="px-4 py-2.5">Détail</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Catégorie</th>
                      <th className="px-4 py-2.5 text-right">Valeur</th>
                      <th className="px-4 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {processedTransactions.map((tx) => {
                      const isEditing = editingId === tx.id;

                      if (isEditing) {
                        return (
                          <tr key={tx.id} className="bg-teal-50/50" id={`edit-row-${tx.id}`}>
                            {/* Inline Edit Form */}
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-32 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono"
                              />
                            </td>
                            <td className="px-4 py-3">
                              {editType === 'charge' ? (
                                <select
                                  value={editCategory}
                                  onChange={(e) => setEditCategory(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-xs"
                                >
                                  {TRANSACTION_CATEGORIES.filter(cat => cat !== 'Revenus').map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-slate-400 font-medium">Revenus</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-mono">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  className="w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs text-right"
                                />
                                <span className="text-xs font-semibold">€</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateTransaction(tx.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                                  title="Confirmer"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                  title="Annuler"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors" id={`row-${tx.id}`}>
                          {/* Description + Badge type */}
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2">
                              {tx.type === 'revenue' ? (
                                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-rose-450 bg-rose-500"></span>
                              )}
                              <span className="text-slate-800">{tx.description}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {tx.date}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium">
                              {tx.category}
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-semibold font-mono ${tx.type === 'revenue' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {tx.type === 'revenue' ? '+' : '-'} {formatCurrency(tx.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-90 hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => startEdit(tx)}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                                title="Modifier"
                                id={`btn-edit-${tx.id}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(tx.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Supprimer"
                                id={`btn-delete-${tx.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="text-[10px] text-slate-400 text-right mt-4 italic">
            Affichage de {processedTransactions.length} de {transactions.length} flux au total
          </div>
        </div>
      </div>

    </div>
  );
}
