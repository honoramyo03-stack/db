# Security Specification & Threat Model for OptimÉpargne

This file defines the strict data validation policies, access controls, threat modeling, and testing specifications for the Firestore security rules.

## 1. Data Invariants

Our data architecture maintains these structural constraints:
- **Scope Isolation**: A user must never be able to read, write, update, or delete profile data, transactions, budgets, or alerts belonging to another user.
- **Strict Data Shapes**: All transactions must carry valid `amount` (non-negative number), `type` ('charge' or 'revenue'), `category`, `description`, `date`, and timestamps (`createdAt`, `updatedAt`).
- **Immutability of History**: Historical creation timestamps (`createdAt`) must remain untouched during updates.
- **Strict Time Constraint**: The system-generated server time `request.time` must align with transaction timestamps to prevent client clock manipulation.
- **No Orphan Records**: Document paths are strictly confined underneath the authenticated user's ID `/profiles/{userId}` as sub-resources.

---

## 2. The "Dirty Dozen" Threat Payloads

The following represent 12 specific exploits or invalid payloads designed to bypass client-side validations, which the Firestore rules must strictly block.

### T01 - Cross-User Read/Write (Identity Theft Case 1)
- **Path**: `/profiles/attacker_uid/transactions/t1`
- **Payload**: `{ "description": "Loyer", "amount": 800, "type": "charge", "category": "Logement", "date": "2026-06-13" }`
- **Attacker UID**: `victim_uid`
- **Expected Outcome**: `PERMISSION_DENIED` - Attempt to read/write under another user's sub-tree when authenticated UID does not match path variable `userId`.

### T02 - Spoofed Date/Time Timestamp (Temporal Clock Tampering)
- **Path**: `/profiles/user1/transactions/t1`
- **Payload**: `{ "description": "Loyer", "amount": 800, "type": "charge", "category": "Logement", "date": "2026-06-13", "createdAt": "2010-01-01T00:00:00Z", "updatedAt": "2010-01-01T00:00:00Z" }`
- **Expected Outcome**: `PERMISSION_DENIED` - The rule forces `createdAt == request.time` and `updatedAt == request.time`.

### T03 - Ghost Fields Addition (Shadow Field Attack)
- **Path**: `/profiles/user1/transactions/t1`
- **Payload**: `{ "description": "Loyer", "amount": 800, "type": "charge", "category": "Logement", "date": "2026-06-13", "createdAt": "request.time", "updatedAt": "request.time", "isVerified": true, "isAdmin": true }`
- **Expected Outcome**: `PERMISSION_DENIED` - Field size match (`keys().size() == 7`) fails due to extra parameters.

### T04 - Negative Transaction Amount (Budget Poisoning)
- **Path**: `/profiles/user1/transactions/t1`
- **Payload**: `{ "description": "Remboursement", "amount": -500, "type": "charge", "category": "Autre", "date": "2026-06-13", "createdAt": "request.time", "updatedAt": "request.time" }`
- **Expected Outcome**: `PERMISSION_DENIED` - `amount` must be a non-negative float (`amount >= 0`).

### T05 - Path Poisoning with String Injection (Wallet Denial Attack)
- **Path**: `/profiles/user1/transactions/attacker_super_long_junk_ID_over_128_chars_xxxxxxxxx`
- **Expected Outcome**: `PERMISSION_DENIED` - `isValidId()` blocks keys exceeding 128 characters or containing illegal characters.

### T06 - Overwriting Immutable Fields on Update (History Modification Setup)
- **Path**: `/profiles/user1/transactions/t1`
- **Original Document**: Created with `createdAt: request.time`
- **Update Payload**: `{ "description": "Loyer Modifié", "amount": 850, "type": "charge", "category": "Logement", "date": "2026-06-13", "createdAt": "some_other_time", "updatedAt": "request.time" }`
- **Expected Outcome**: `PERMISSION_DENIED` - `incoming().createdAt == existing().createdAt` constraint violated.

### T07 - Spoofed Profile Email (Privilege Escalation)
- **Path**: `/profiles/user1`
- **Payload**: `{ "email": "victim@gmail.com", "savingsGoal": 1000, "createdAt": "request.time", "updatedAt": "request.time" }`
- **Attacker UID**: `user1` (with email `attacker@gmail.com`)
- **Expected Outcome**: `PERMISSION_DENIED` - Profile email must strictly equal the token's authenticated email `request.auth.token.email`.

### T08 - Illegal Category Budget Limit (Float Poisoning)
- **Path**: `/profiles/user1/budgets/b1`
- **Payload**: `{ "category": "Loisirs", "monthlyLimit": -150, "createdAt": "request.time", "updatedAt": "request.time" }`
- **Expected Outcome**: `PERMISSION_DENIED` - `monthlyLimit` must be `>= 0`.

### T09 - Message Overflow on Savings Alerts (Resource Exhaustion)
- **Path**: `/profiles/user1/alerts/a1`
- **Payload**: `{ "title": "OverBudget", "message": "...very_long_string_thousands_of_characters...", "category": "Alimentation", "type": "warning", "createdAt": "request.time", "read": false }`
- **Expected Outcome**: `PERMISSION_DENIED` - Alert `message` must be a string of size `<= 500`.

### T10 - Illegal Transaction Type Value
- **Path**: `/profiles/user1/transactions/t1`
- **Payload**: `{ "description": "Courses", "amount": 100, "type": "invalid_type", "category": "Alimentation", "date": "2026-06-13", "createdAt": "request.time", "updatedAt": "request.time" }`
- **Expected Outcome**: `PERMISSION_DENIED` - `type` must be either `'charge'` or `'revenue'`.

### T11 - Unauthenticated Record Harvesting (Blanket Read Bypass)
- **Path**: `/profiles/{userId}/transactions`
- **Context**: Accessing collection list while unauthenticated (`request.auth == null`)
- **Expected Outcome**: `PERMISSION_DENIED` - `isSignedIn()` fails entirely.

### T12 - Rogue Read on Other Profile alerts (PII Leak)
- **Path**: `/profiles/victim_uid/alerts/a1`
- **Attacker UID**: `attacker_uid`
- **Expected Outcome**: `PERMISSION_DENIED` - `isOwner(userId)` checks that path variable matching `request.auth.uid`.

---

## 3. Test Runner Design

Below is a design representing how our tests verify security rules on our Firestore client:

```typescript
// firestore.rules.test.ts
// Test representation validating denial of all "Dirty Dozen" payloads.
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Our rules ensure security compliance:
// 1. Any update violating strict keys or boundaries throws PERMISSION_DENIED.
// 2. Cross-user operations are strictly unauthorized.
```
