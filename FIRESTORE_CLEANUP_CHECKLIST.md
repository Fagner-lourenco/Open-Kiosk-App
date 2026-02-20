# LIMPEZA FIRESTORE — Checklist de Ação

**Data**: 2025-01-09  
**Projeto**: Open Kiosk App  
**Banco**: open-kiosk-22b2b  
**Status**: ✅ Análise Completa

---

## 📊 Resumo da Auditoria

| Métrica | Resultado |
|---------|-----------|
| **Total de collections** | 13 |
| **Collections EM USO** | 13 ✅ |
| **Collections NÃO USADAS** | 0 |
| **Conclusão** | FIRESTORE LIMPO! 🎉 |

---

## 🎯 ACHADO IMPORTANTE

### ✅ `tvConfig` — ESTÁ SENDO USADO (Subcollection)

```
Tipo: SUBCOLLECTION (não root collection!)
Path: franchises/{franchiseId}/stores/{storeId}/tvConfig/current
Status: ✅ EM USO
Referências encontradas: 12+ arquivos
Risco: NÃO DELETAR
```

**Arquivos que usam tvConfig:**
- `admin/src/hooks/useTvDashboard.ts` — Hook real-time
- `admin/src/hooks/useTvDynamicPricing.ts` — Preços dinâmicos
- `admin/src/lib/pathResolver.ts` — Resolve path para tvConfig
- `admin/src/services/dynamicPricingService.ts` — Serviço de preços
- `admin/src/services/tvEventService.ts` — Eventos de TV
- `admin/src/types/tvDashboard.ts` — Tipos TypeScript
- `admin/src/pages/ranking/TvDashboardPage.tsx` — Dashboard
- `functions/src/cleanup/onDeleteStore.ts` — Cleanup ao deletar loja
- `functions/src/ranking/rankingFunctions.ts` — Funções de ranking

**Conclusão:** ✅ `tvConfig` é crítico e deve ser MANTIDO!

---

## ✅ Collections EM USO — NÃO TOCAR

Essas collections estão sendo usadas no código (incluindo subcollections como tvConfig):

| Collection | Arquivo | Status | 
|-----------|---------|--------|
| `franchises` | 110+ arquivos | ✅ CRÍTICO |
| `users` | 32 arquivos | ✅ CRÍTICO |
| `invitations` | 23 arquivos | ✅ IMPORTANTE |
| `superadmins` | 10 arquivos | ✅ CRÍTICO |
| `payments` | 39 arquivos | ✅ CRÍTICO |
| `sessions` | 8 arquivos | ✅ IMPORTANTE |
| `stores` | 119 arquivos | ✅ CRÍTICO |
| `taps` | 43 arquivos | ✅ CRÍTICO |
| `members` | 42 arquivos | ✅ IMPORTANTE |
| `products` | 48 arquivos | ✅ CRÍTICO |
| `kegs` | 20 arquivos | ✅ IMPORTANTE |
| `events` | 55 arquivos | ✅ IMPORTANTE |

---

## 📋 Checklist de Ação

- [ ] ✅ Auditoria completa — nenhum dado órfão encontrado

---

**Gerado por**: simple-audit-v2.js + investigate-tv-config.js  
**Última execução**: 2025-01-09  
**Próxima ação**: Deploy em produção está SEGURO para limpeza de dados ✅
