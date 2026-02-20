import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fft from 'firebase-functions-test';

const testEnv = fft();

/**
 * Wrapper v2-compatible: constrói CallableRequest a partir de (data, context)
 * como wrapV2() faria para v1, mas passando um único request object.
 */
function wrapV2(fn: any) {
  return (data: any, context?: any) => fn.run({ data, ...context });
}

const mocks = vi.hoisted(() => {
  const userDocGet = vi.fn();
  const userDocUpdate = vi.fn();
  const setCustomUserClaims = vi.fn();

  const franchiseDocGet = vi.fn();

  const invitationQueryGet = vi.fn();
  const invitationDocGet = vi.fn();
  const invitationDocSet = vi.fn();
  const invitationDocUpdate = vi.fn();

  const sendMail = vi.fn();

  const invitationQueryChain: any = {
    where: vi.fn(() => invitationQueryChain),
    limit: vi.fn(() => invitationQueryChain),
    get: invitationQueryGet,
  };

  const invitationDoc = vi.fn((id?: string) => ({
    id: id || 'generated-invite-id',
    get: invitationDocGet,
    set: invitationDocSet,
    update: invitationDocUpdate,
  }));

  const collection = vi.fn((name: string) => {
    if (name === 'users') {
      return {
        doc: vi.fn(() => ({ get: userDocGet, update: userDocUpdate })),
      };
    }

    if (name === 'franchises') {
      return {
        doc: vi.fn(() => ({ get: franchiseDocGet })),
      };
    }

    if (name === 'invitations') {
      return {
        doc: invitationDoc,
        where: vi.fn(() => invitationQueryChain),
      };
    }

    return {
      doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() })),
      where: vi.fn(() => invitationQueryChain),
      limit: vi.fn(() => invitationQueryChain),
      get: vi.fn(),
    };
  });

  return {
    userDocGet,
    userDocUpdate,
    setCustomUserClaims,
    franchiseDocGet,
    invitationQueryGet,
    invitationDocGet,
    invitationDocSet,
    invitationDocUpdate,
    invitationDoc,
    invitationQueryChain,
    sendMail,
    collection,
  };
});

vi.mock('../lib', () => ({
  db: {
    collection: mocks.collection,
    // 🔒 FIX: Add runTransaction mock for setCustomClaims BUG-30
    runTransaction: vi.fn(async (cb: any) => {
      const txnGet = vi.fn().mockImplementation(() => mocks.userDocGet());
      const txnUpdate = vi.fn();
      return cb({ get: txnGet, update: txnUpdate });
    }),
    // 🔒 FIX: Add doc mock for setCustomClaims targetUserRef
    doc: vi.fn(() => ({ get: mocks.userDocGet, update: mocks.userDocUpdate })),
  },
  admin: {
    auth: () => ({
      setCustomUserClaims: mocks.setCustomUserClaims,
      getUser: vi.fn().mockResolvedValue({ customClaims: {} }),
    }),
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
      },
      Timestamp: {
        fromDate: (date: Date) => date,
      },
    },
  },
  requireAuth: vi.fn(),
  requireOwnerOrAdmin: vi.fn(),
  requireManager: vi.fn(),
  VALID_ROLES: new Set(['superadmin', 'owner', 'admin', 'manager', 'operator', 'employee', 'technician', 'viewer']),
  roleHierarchy: {
    superadmin: 1000, owner: 100, admin: 80, manager: 60, operator: 40, employee: 40, technician: 30, viewer: 20,
  },
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: mocks.sendMail,
  })),
}));

testEnv.mockConfig({
  app: { url: 'http://localhost:5173' },
  smtp: { host: 'smtp.example.com', port: '587', user: 'smtp-user', pass: 'smtp-pass' },
});

import { setCustomClaims } from '../auth/setCustomClaims';
import { sendInvitationEmail } from '../invitations/sendEmail';

describe('functions coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ franchiseId: 'f1', role: 'operator', storeId: 's1' }),
    });

    mocks.franchiseDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: 'Franquia Teste' }),
    });

    mocks.invitationQueryGet.mockResolvedValue({
      empty: true,
      docs: [],
    });

    mocks.invitationDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        email: 'invited@openkiosk.app',
        role: 'manager',
        token: 'token-123',
      }),
    });

    mocks.invitationDocSet.mockResolvedValue(undefined);
    mocks.invitationDocUpdate.mockResolvedValue(undefined);
    mocks.userDocUpdate.mockResolvedValue(undefined);
    mocks.setCustomUserClaims.mockResolvedValue(undefined);
    mocks.sendMail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  it('setCustomClaims bloqueia caller sem role owner/admin', async () => {
    const wrapped = wrapV2(setCustomClaims);

    await expect(
      wrapped(
        { userId: 'u-1', role: 'manager' },
        { auth: { uid: 'caller', token: { role: 'manager', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Apenas owners e admins podem modificar claims');
  });

  it('setCustomClaims valida userId obrigatório', async () => {
    const wrapped = wrapV2(setCustomClaims);

    await expect(
      wrapped(
        { role: 'manager' },
        { auth: { uid: 'caller', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('userId é obrigatório');
  });

  it('setCustomClaims rejeita usuário inexistente', async () => {
    mocks.userDocGet.mockResolvedValueOnce({ exists: false, data: () => null });
    const wrapped = wrapV2(setCustomClaims);

    await expect(
      wrapped(
        { userId: 'missing-user', role: 'manager' },
        { auth: { uid: 'owner', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Usuário não encontrado');
  });

  it('setCustomClaims impede cross-franchise', async () => {
    mocks.userDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ franchiseId: 'other', role: 'operator', storeId: 's1' }),
    });

    const wrapped = wrapV2(setCustomClaims);

    await expect(
      wrapped(
        { userId: 'target', role: 'manager' },
        { auth: { uid: 'owner', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('outra franquia');
  });

  it('setCustomClaims impede admin alterar/prometer nível igual ou superior', async () => {
    const wrapped = wrapV2(setCustomClaims);

    mocks.userDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ franchiseId: 'f1', role: 'admin', storeId: 's1' }),
    });

    await expect(
      wrapped(
        { userId: 'target', role: 'manager' },
        { auth: { uid: 'admin', token: { role: 'admin', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('mesmo nível ou superior');

    mocks.userDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ franchiseId: 'f1', role: 'operator', storeId: 's1' }),
    });

    await expect(
      wrapped(
        { userId: 'target', role: 'admin' },
        { auth: { uid: 'admin', token: { role: 'admin', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('promover usuários ao seu nível ou superior');
  });

  it('setCustomClaims executa sucesso para owner', async () => {
    const wrapped = wrapV2(setCustomClaims);

    const result = await wrapped(
      { userId: 'target-user', role: 'manager', storeId: null },
      { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
    );

    expect(result.success).toBe(true);
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith(
      'target-user',
      expect.objectContaining({ role: 'manager', franchiseId: 'f1', storeId: null }),
    );
    // Note: user doc update now happens inside Firestore transaction (txn.update)
  });

  it('setCustomClaims trata erro interno não-https', async () => {
    mocks.userDocGet.mockRejectedValueOnce(new Error('db offline'));
    const wrapped = wrapV2(setCustomClaims);

    await expect(
      wrapped(
        { userId: 'target-user', role: 'manager' },
        { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Erro interno ao processar a requisição');
  });

  it('sendInvitationEmail valida email/role e role permitida', async () => {
    const wrapped = wrapV2(sendInvitationEmail);
    const ctx = { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } };

    await expect(wrapped({ email: '', role: '' }, ctx)).rejects.toThrow('email e role são obrigatórios');
    await expect(wrapped({ email: 'email-invalido', role: 'manager' }, ctx)).rejects.toThrow('Formato de email inválido');
    await expect(wrapped({ email: 'valid@openkiosk.app', role: 'superadmin' }, ctx)).rejects.toThrow('Role inválida');
  });

  it('sendInvitationEmail rejeita quando franquia não existe', async () => {
    mocks.franchiseDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const wrapped = wrapV2(sendInvitationEmail);

    await expect(
      wrapped(
        { email: 'new@openkiosk.app', role: 'manager' },
        { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Franquia não encontrada');
  });

  it('sendInvitationEmail bloqueia convite pendente duplicado', async () => {
    mocks.invitationQueryGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'existing-invite' }],
    });

    const wrapped = wrapV2(sendInvitationEmail);

    await expect(
      wrapped(
        { email: 'new@openkiosk.app', role: 'manager' },
        { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Já existe um convite pendente');
  });

  it('sendInvitationEmail retorna not-found quando invitationId não existe', async () => {
    mocks.invitationDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

    const wrapped = wrapV2(sendInvitationEmail);

    await expect(
      wrapped(
        {
          invitationId: 'missing-invite',
          email: 'new@openkiosk.app',
          role: 'manager',
        },
        { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
      ),
    ).rejects.toThrow('Convite não encontrado');
  });

  it('sendInvitationEmail cria convite e finaliza sem envio quando SMTP ausente', async () => {
    const wrapped = wrapV2(sendInvitationEmail);

    const result = await wrapped(
      { email: 'new@openkiosk.app', role: 'manager', storeId: 's1' },
      { auth: { uid: 'owner-1', token: { role: 'owner', franchiseId: 'f1' } } },
    );

    expect(result.success).toBe(true);
    expect(mocks.invitationDocSet).toHaveBeenCalledTimes(1);
    expect(String(result.message)).toContain('SMTP não configurado');
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.invitationDocUpdate).not.toHaveBeenCalled();
  });
});
