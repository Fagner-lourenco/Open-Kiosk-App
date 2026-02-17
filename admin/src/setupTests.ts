import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ─── Mock Firebase Auth ─────────────────────────────────────────────────────
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(),
    connectAuthEmulator: vi.fn(),
}));

// ─── Mock Firebase App ──────────────────────────────────────────────────────
vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
    getApps: vi.fn(() => []),
}));

// ─── Mock Firebase Firestore ────────────────────────────────────────────────
vi.mock('firebase/firestore', () => {
    // Timestamp precisa ser uma classe real para que `instanceof` funcione nos hooks
    class MockTimestamp {
        seconds: number;
        nanoseconds: number;
        constructor(seconds: number, nanoseconds: number) {
            this.seconds = seconds;
            this.nanoseconds = nanoseconds;
        }
        toDate() {
            return new Date(this.seconds * 1000);
        }
        static now() {
            return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
        }
        static fromDate(d: Date) {
            return new MockTimestamp(Math.floor(d.getTime() / 1000), 0);
        }
    }
    return {
        getFirestore: vi.fn(),
        initializeFirestore: vi.fn(),
        connectFirestoreEmulator: vi.fn(),
        collection: vi.fn((...args: string[]) => ({ path: args.join('/'), type: 'collection' })),
        doc: vi.fn((...args: string[]) => ({ path: args.join('/'), type: 'doc' })),
        getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
        getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
        addDoc: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
        setDoc: vi.fn(() => Promise.resolve()),
        updateDoc: vi.fn(() => Promise.resolve()),
        deleteDoc: vi.fn(() => Promise.resolve()),
        query: vi.fn((...args: unknown[]) => args[0]),
        where: vi.fn(),
        orderBy: vi.fn(),
        serverTimestamp: vi.fn(() => MockTimestamp.now()),
        Timestamp: MockTimestamp,
        onSnapshot: vi.fn(),
    };
});

// ─── Mock Firebase Storage ──────────────────────────────────────────────────
vi.mock('firebase/storage', () => ({
    getStorage: vi.fn(),
    connectStorageEmulator: vi.fn(),
}));

// ─── Mock Firebase lib (our wrapper) ────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({
    db: {},
    auth: {},
    storage: {},
    default: {},
}));

// ─── Mock Sonner (direct toast imports) ─────────────────────────────────────
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    }),
    Toaster: vi.fn(() => null),
}));

// ─── Mock AuthContext ───────────────────────────────────────────────────────
vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { uid: 'test-user-id', email: 'test@test.com', displayName: 'Test User' },
        isLoading: false,
        isSuperAdmin: false,
        claims: { role: 'admin', franchiseId: 'f1', storeId: 's1' },
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        resetPassword: vi.fn(),
        refreshClaims: vi.fn(),
    })),
    AuthProvider: ({ children }: { children: unknown }) => children,
}));

// ─── Mock useToast hook ─────────────────────────────────────────────────────
vi.mock('@/hooks/useToast', () => ({
    useToast: vi.fn(() => ({
        toast: Object.assign(vi.fn(), {
            success: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warning: vi.fn(),
            loading: vi.fn(),
            dismiss: vi.fn(),
        }),
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    })),
}));

// ─── Mock pathResolver ──────────────────────────────────────────────────────
vi.mock('@/lib/pathResolver', () => {
    const FINANCE_MAP: Record<string, string> = {
        accounts: 'finAccounts',
        categories: 'finCategories',
        costCenters: 'finCostCenters',
        parties: 'finParties',
        ledger: 'finLedger',
        invoices: 'finInvoices',
        bills: 'finBills',
        finPayments: 'finPayments',
    };
    return {
        financeSubPath: vi.fn(
            (fId: string, sId: string, sub: string) =>
                `franchises/${fId}/stores/${sId}/${FINANCE_MAP[sub] || sub}`,
        ),
        financeDocPath: vi.fn(
            (fId: string, sId: string, sub: string, docId: string) =>
                `franchises/${fId}/stores/${sId}/${FINANCE_MAP[sub] || sub}/${docId}`,
        ),
        financeSummaryPath: vi.fn((fId: string) => `franchises/${fId}/financeSummary`),
        storeSubPath: vi.fn(
            (fId: string, sId: string, sub: string) => `franchises/${fId}/stores/${sId}/${sub}`,
        ),
        storeDocPath: vi.fn(
            (fId: string, sId: string, sub: string, docId: string) =>
                `franchises/${fId}/stores/${sId}/${sub}/${docId}`,
        ),
        default: {},
    };
});

// ─── Mock react-hook-form ───────────────────────────────────────────────────
vi.mock('react-hook-form', async () => {
    const actual = await vi.importActual('react-hook-form');
    return {
        ...actual,
        useForm: () => ({
            register: vi.fn(),
            handleSubmit: vi.fn(),
            formState: { errors: {} },
            reset: vi.fn(),
        }),
    };
});
