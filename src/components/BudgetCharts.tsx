/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { TrendingUp, ArrowDownRight, ArrowUpRight, Award, PlusCircle, PieChart as PieIcon } from 'lucide-react';
import { Transaction, Budget } from '../types.ts';

interface BudgetChartsProps {
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoal: number;
}

const COLORS = [
  '#f59e0b', // Amber/Caramel
  '#3b82f6', // Bright Blue
  '#10b981', // Emerald Green
  '#ec4899', // Pink
  '#8b5cf6', // Indigo/Purple
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#64748b'  // Slate
];

export default function BudgetCharts({ transactions, budgets, savingsGoal }: BudgetChartsProps) {
  // 1. Core aggregates
  const stats = useMemo(() => {
    let income = 0;
    let expenses = 0;
    const categoryTotals: Record<string, number> = {};

    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'revenue') {
        income += amt;
      } else {
        expenses += amt;
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + amt;
      }
    });

    const netSavings = income - expenses;
    const goalProgress = savingsGoal > 0 ? (netSavings / savingsGoal) * 100 : 0;

    return {
      income,
      expenses,
      netSavings,
      goalProgress: Math.min(Math.max(goalProgress, 0), 100),
      rawProgress: goalProgress,
      categoryTotals
    };
  }, [transactions, savingsGoal]);

  // 2. Data for Pie Chart (Expenses by Category)
  const pieData = useMemo(() => {
    return Object.entries(stats.categoryTotals).map(([name, value]) => ({
      name,
      value: Math.round(Number(value) * 100) / 100
    })).sort((a, b) => b.value - a.value);
  }, [stats.categoryTotals]);

  // 3. Data for Bar Chart (Income vs Expense comparison)
  const barData = useMemo(() => {
    return [
      {
        name: 'Flux Mensuel',
        Revenus: stats.income,
        Dépenses: stats.expenses
      }
    ];
  }, [stats.income, stats.expenses]);

  // 4. Trend Data over dates (chronological balance line)
  const lineData = useMemo(() => {
    // Group transactions by date
    const dailyTx: Record<string, { income: number; expenses: number }> = {};
    
    // Fill in dates
    transactions.forEach((tx) => {
      const date = tx.date || new Date().toISOString().split('T')[0];
      if (!dailyTx[date]) {
        dailyTx[date] = { income: 0, expenses: 0 };
      }
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'revenue') {
        dailyTx[date].income += amt;
      } else {
        dailyTx[date].expenses += amt;
      }
    });

    // Sort dates
    const sortedDates = Object.keys(dailyTx).sort();
    
    let cumulative = 0;
    return sortedDates.map((date) => {
      const net = dailyTx[date].income - dailyTx[date].expenses;
      cumulative += net;
      return {
        date: new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        EpargneAccumulee: Math.round(cumulative * 100) / 100,
        NetDuJour: Math.round(net * 100) / 100
      };
    });
  }, [transactions]);

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8" id="budget-charts-grid">
      
      {/* Financial Scorecards */}
      <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4" id="scorecards-section">
        {/* Card: Total Income */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex items-center justify-between" id="card-income">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Revenus Totaux</span>
            <h3 className="text-2xl font-semibold font-mono text-emerald-600 mt-1">{formatCurrency(stats.income)}</h3>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <span className="text-emerald-500 font-medium">Enregistrés</span> sur la plateforme
            </p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl">
            <ArrowUpRight className="h-6 w-6" />
          </div>
        </div>

        {/* Card: Total Expenses */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex items-center justify-between" id="card-expenses">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Dépenses Totales</span>
            <h3 className="text-2xl font-semibold font-mono text-rose-600 mt-1">{formatCurrency(stats.expenses)}</h3>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <span className="text-slate-500 font-medium">{pieData.length}</span> catégories actives
            </p>
          </div>
          <div className="bg-rose-50 text-rose-600 p-4 rounded-xl">
            <ArrowDownRight className="h-6 w-6" />
          </div>
        </div>

        {/* Card: Net Savings & Target Progress */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs" id="card-savings">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Épargne Réelle</span>
              <h3 className={`text-2xl font-semibold font-mono mt-1 ${stats.netSavings >= 0 ? 'text-teal-600' : 'text-amber-600'}`}>
                {formatCurrency(stats.netSavings)}
              </h3>
            </div>
            <div className={`p-4 rounded-xl ${stats.netSavings >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-amber-50 text-amber-600'}`}>
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
          
          {savingsGoal > 0 ? (
            <div className="mt-4" id="goal-progress-bar">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Objectif: <strong className="font-mono">{formatCurrency(savingsGoal)}</strong></span>
                <span className="font-medium font-mono text-teal-600">{Math.round(stats.goalProgress)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-teal-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.goalProgress}%` }}
                />
              </div>
              {stats.netSavings >= savingsGoal && (
                <p className="text-[11px] text-teal-600 mt-1 font-medium flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" /> Objectif atteint ce mois-ci ! Bravo !
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4 italic">
              Aucun objectif d'épargne global configuré.
            </p>
          )}
        </div>
      </div>

      {/* Main Charts area */}
      {transactions.length === 0 ? (
        <div className="lg:col-span-3 bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center" id="empty-state-charts">
          <div className="h-12 w-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <PieIcon className="h-6 w-6" />
          </div>
          <h3 className="text-slate-700 font-medium">Données de graphiques indisponibles</h3>
          <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
            Ajoutez au moins un revenu ou une dépense dans la section ci-dessous pour activer les graphiques interactifs en temps réel.
          </p>
        </div>
      ) : (
        <>
          {/* Income vs Expenses Bar Chart */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between" id="chart-balance">
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                Revenus vs Dépenses Globaux
              </h4>
              <p className="text-xs text-slate-400 mt-1">Comparaison des flux financiers entrants et sortants.</p>
            </div>
            
            <div className="h-64 mt-4" id="bar-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}€`} tickLine={false} />
                  <Tooltip 
                    formatter={(value) => [`${value} €`]}
                    contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                  />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="Revenus" fill="#10b981" radius={[8, 8, 0, 0]} barSize={40} />
                  <Bar dataKey="Dépenses" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart: Expenses by Category */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between" id="chart-pie">
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                Répartition des Dépenses
              </h4>
              <p className="text-xs text-slate-400 mt-1">Dépenses réparties par catégorie financière.</p>
            </div>

            {pieData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center py-6" id="empty-pie-container">
                <p className="text-xs text-slate-400 italic">Aucune dépense enregistrée.</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-4" id="pie-chart-container">
                <div className="h-44 w-44 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value) => [`${value} €`]}
                        contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total</span>
                    <span className="text-sm font-semibold font-mono text-slate-700">{formatCurrency(stats.expenses)}</span>
                  </div>
                </div>

                <div className="flex-1 max-h-48 overflow-y-auto w-full" id="pie-legend">
                  <ul className="text-xs space-y-2">
                    {pieData.slice(0, 5).map((item, index) => {
                      const percentage = stats.expenses > 0 ? (item.value / stats.expenses) * 100 : 0;
                      return (
                        <li key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 max-w-[120px] truncate">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                            <span className="text-slate-600 truncate">{item.name}</span>
                          </div>
                          <span className="font-mono text-slate-500 font-medium">{formatCurrency(item.value)} ({Math.round(percentage)}%)</span>
                        </li>
                      );
                    })}
                    {pieData.length > 5 && (
                      <li className="text-[11px] text-slate-400 italic text-right">
                        + {pieData.length - 5} autres catégories
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Line Chart: Savings trends */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between" id="chart-trend">
            <div>
              <h4 className="text-sm font-semibold text-slate-800 tracking-tight flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-500"></span>
                Évolution Temporelle de l'Épargne
              </h4>
              <p className="text-xs text-slate-400 mt-1">Cumul journalier de votre épargne nette.</p>
            </div>

            <div className="h-64 mt-4" id="line-chart-container">
              {lineData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">
                  Aucune tendance disponible.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}€`} tickLine={false} />
                    <Tooltip 
                      formatter={(value) => [`${value} €`]}
                      contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="EpargneAccumulee" 
                      name="Épargne Cumulée"
                      stroke="#0d9488" 
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#0d9488' }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
