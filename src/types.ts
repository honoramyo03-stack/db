/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Profile {
  email: string;
  savingsGoal: number; // monthly target savings
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export type TransactionType = 'charge' | 'revenue';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // YYYY-MM-DD
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  category: string;
  type: 'warning' | 'info';
  createdAt: any; // Timestamp
  read: boolean;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export const TRANSACTION_CATEGORIES = [
  'Alimentation',
  'Logement & Factures',
  'Loisirs & Sorties',
  'Transport',
  'Santé',
  'Éducation',
  'Shopping',
  'Abonnements',
  'Revenus',
  'Autre'
];

export interface FirebaseProject {
  projectId: string;
  projectNumber: string;
  displayName?: string;
  name: string;
  state: string;
  resources?: {
    hostingSite?: string;
    realtimeDatabaseInstance?: string;
    storageBucket?: string;
  };
}

export interface WebApp {
  appId: string;
  displayName?: string;
  appPlatform: 'WEB';
  name: string;
  projectId: string;
}

export interface AndroidApp {
  appId: string;
  displayName?: string;
  appPlatform: 'ANDROID';
  name: string;
  projectId: string;
  packageName: string;
}

export interface IosApp {
  appId: string;
  displayName?: string;
  appPlatform: 'IOS';
  name: string;
  projectId: string;
  bundleId: string;
}

export interface WebAppConfig {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export interface FirestoreDatabase {
  name: string;
  uid: string;
  type: string;
  locationId: string;
  state: string;
}

