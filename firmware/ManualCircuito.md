# 🛡️ MANUAL DE HARDWARE À PROVA DE FALHAS

## Sistema Chopeira Automatizada - ESP32-S3 + MOSFET + Solenóide

**Versão:** 3.0 - Multi-Tap (2 Torneiras)  
**Data:** Janeiro 2026  
**Status:** CIRCUITO SEGURO COM PROTEÇÕES

---

## 🎯 MAPEAMENTO OFICIAL DE PINOS - XIAO ESP32S3

### ⚠️ TABELA DEFINITIVA - USE ESTA REFERÊNCIA!

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    XIAO ESP32S3 - MAPEAMENTO OFICIAL v4.1                  │
├──────────┬─────────┬────────────────────────────────────────────────────────┤
│ Pino     │ GPIO    │ USO NO PROJETO                                         │
├──────────┼─────────┼────────────────────────────────────────────────────────┤
│ D3       │ GPIO4   │ 🟡 SENSOR FLUXO TAP 0 (INPUT) - Via divisor 5V→2.5V   │
│ D4       │ GPIO5   │ 🔴 VÁLVULA TAP 0 (OUTPUT) - Gate MOSFET #1             │
│ D5       │ GPIO6   │ 🔵 VÁLVULA TAP 1 (OUTPUT) - Gate MOSFET #2             │
│ D8       │ GPIO7   │ 🟡 SENSOR FLUXO TAP 1 (INPUT) - Via divisor 5V→2.5V   │
├──────────┼─────────┼────────────────────────────────────────────────────────┤
│ D6       │ GPIO43  │ ❌ TX SERIAL - NÃO USAR! (fica HIGH = 3.3V idle)       │
│ D7       │ GPIO44  │ ❌ RX SERIAL - NÃO USAR!                               │
├──────────┼─────────┼────────────────────────────────────────────────────────┤
│ USER_LED │ GPIO21  │ 💡 LED STATUS (interno da placa, amarelo)              │
│ 5V       │ -       │ Alimentação do ESP32 (do LM2596)                       │
│ GND      │ -       │ Terra comum                                            │
└──────────┴─────────┴────────────────────────────────────────────────────────┘
```

### 🖼️ DIAGRAMA VISUAL DA PLACA

```
         ┌────────────────────────────────────────────┐
         │              XIAO ESP32S3                  │
         │                  [USB]                     │
         ├────────────────────────────────────────────┤
         │                                            │
  D0 ────┤ GPIO1                            5V  ├──── +5V (LM2596)
  D1 ────┤ GPIO2                           GND  ├──── GND Comum
  D2 ────┤ GPIO3                           3V3  ├────
  D3 ────┤ GPIO4  � SENSOR TAP 0          D10  ├──── GPIO10
  D4 ────┤ GPIO5  🔴 VÁLVULA TAP 0          D9  ├──── GPIO8
  D5 ────┤ GPIO6  🔵 VÁLVULA TAP 1          D8  ├──── GPIO7 🟡 SENSOR TAP 1
  D6 ────┤ GPIO43 ❌ TX SERIAL             D7  ├──── GPIO44 ❌ RX SERIAL
         │                                            │
         │        💡 USER_LED = GPIO21                │
         └────────────────────────────────────────────┘
```

### 🚨 POR QUE D6 e D7 NÃO PODEM SER USADOS?

- **D6 (GPIO43)** = TX da Serial USB
- **D7 (GPIO44)** = RX da Serial USB
- Quando `Serial.begin(115200)` é chamado, **TX fica em HIGH (3.3V)** quando idle
- Se conectar uma válvula no D6, ela **ACIONA AUTOMATICAMENTE**!

---

## 📋 LISTA DE MATERIAIS (MULTI-TAP - 2 TORNEIRAS)

| # | Componente | Especificação | Qtd Tap 0 | Qtd Tap 1 | Total |
|---|------------|---------------|-----------|-----------|-------|
| 1 | ESP32 | Seeed XIAO ESP32-S3 | 1 | - | 1 |
| 2 | MOSFET | IRLZ44N (Logic Level) | 1 | 1 | 2 |
| 3 | Válvula Solenóide | 12V DC | 1 | 1 | 2 |
| 4 | Sensor de Fluxo | YF-S401 ou YF-S402 (5V) | 1 | 1 | 2 |
| 5 | Conversor DC-DC | LM2596 (ajustado 5V) | 1 | - | 1 |
| 6 | Diodo Flyback | 1N4007 | 1 | 1 | 2 |
| 7 | Cap Eletrolítico | 2200µF 25V | 1 | - | 1 |
| 8 | Cap Cerâmico | 100nF | 1 | - | 1 |
| 9 | Resistor Gate | 100Ω 1/4W | 1 | 1 | 2 |
| 10 | Resistor Pull-down | 10KΩ 1/4W | 1 | 1 | 2 |
| 11 | Resistor Divisor | 10KΩ 1/4W | 2 | 2 | 4 |
| 12 | Protoboard | 30+ linhas | 1 | - | 1 |
| 13 | Fonte | 12V 3A DC | 1 | - | 1 |
| 14 | Jumpers | Diversos | - | - | ~20 |

---

## ⚠️ LIÇÕES APRENDIDAS (Por que este manual existe)

### Incidentes Anteriores:
1. **ESP32 queimou** - Fio do sensor (5V) e fio do MOSFET (3.3V) na **mesma linha** da protoboard
2. **Placa esquentou** - Curto entre linhas de alimentação
3. **Válvula não acionou** - Polaridade errada do diodo flyback
4. **Válvula acionou sozinha** - Fio conectado no D6 (TX Serial = HIGH idle)

### Causa Raiz:
```
GPIO5 conectado simultaneamente a:
├── Saída para MOSFET (OUTPUT 3.3V)
└── Entrada do Sensor (INPUT 5V) ← CONFLITO!

Resultado: Corrente excessiva → GPIO queimou
```

---

## 🔌 CONEXÕES RESUMIDAS (MULTI-TAP)

### 📌 ONDE CONECTAR CADA COMPONENTE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESUMO DE CONEXÕES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │  TORNEIRA 0      │                                                      │
│  │  (TAP 0)         │                                                      │
│  ├──────────────────┤                                                      │
│  │  VÁLVULA:        │                                                      │
│  │    Pino D4       │──► Resistor 100Ω ──► Gate MOSFET #1                  │
│  │    (GPIO5)       │                      ↓                               │
│  │                  │                   MOSFET Drain ──► Válvula ──► +12V  │
│  │                  │                   MOSFET Source ──► GND              │
│  │                  │                   Gate Pull-down 10K ──► GND         │
│  │                  │                   Diodo flyback entre Drain e +12V   │
│  ├──────────────────┤                                                      │
│  │  SENSOR FLUXO:   │                                                      │
│  │    Pino D3       │◄── Divisor de tensão (2x 10K)                        │
│  │    (GPIO4)       │         ↑                                            │
│  │                  │    Fio Amarelo do Sensor YF-S4xx                     │
│  │                  │    VCC (Vermelho) ──► +5V                            │
│  │                  │    GND (Preto) ──► GND                               │
│  └──────────────────┘                                                      │
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │  TORNEIRA 1      │                                                      │
│  │  (TAP 1)         │                                                      │
│  ├──────────────────┤                                                      │
│  │  VÁLVULA:        │                                                      │
│  │    Pino D5       │──► Resistor 100Ω ──► Gate MOSFET #2                  │
│  │    (GPIO6)       │                      ↓                               │
│  │                  │                   MOSFET Drain ──► Válvula ──► +12V  │
│  │                  │                   MOSFET Source ──► GND              │
│  │                  │                   Gate Pull-down 10K ──► GND         │
│  │                  │                   Diodo flyback entre Drain e +12V   │
│  ├──────────────────┤                                                      │
│  │  SENSOR FLUXO:   │                                                      │
│  │    Pino D8       │◄── Divisor de tensão (2x 10K)                        │
│  │    (GPIO7)       │         ↑                                            │
│  │                  │    Fio Amarelo do Sensor YF-S4xx                     │
│  │                  │    VCC (Vermelho) ──► +5V                            │
│  │                  │    GND (Preto) ──► GND                               │
│  └──────────────────┘                                                      │
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │  ALIMENTAÇÃO     │                                                      │
│  ├──────────────────┤                                                      │
│  │  ESP32 5V        │◄── LM2596 OUT+ (5V regulado)                        │
│  │  ESP32 GND       │◄── GND Comum (12V e 5V compartilham GND)            │
│  │  Fonte 12V+      │──► Válvulas (via MOSFET) + LM2596 IN+               │
│  │  Fonte 12V-      │──► GND Comum                                        │
│  └──────────────────┘                                                      │
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │  LED STATUS      │                                                      │
│  ├──────────────────┤                                                      │
│  │  GPIO21          │    LED amarelo interno da placa (USER_LED)           │
│  │  (interno)       │    Não precisa conectar nada - já está na placa!     │
│  └──────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🔧 CIRCUITO DO MOSFET (PARA CADA TORNEIRA)

```
                                    ┌────────────────┐
    ESP32 GPIO ──► [100Ω] ──────────┤ GATE           │
                              │     │   IRLZ44N      │
                             [10K]  │   (MOSFET)     │
                              │     │                │
                             GND    │                │
                                    │ DRAIN ─────────┼───► Válvula ───► +12V
                                    │                │           │
                                    │                │        ──┤├── 1N4007
                                    │                │           │    (Diodo)
                                    │ SOURCE ────────┤          +12V
                                    └────────────────┘
                                          │
                                         GND
```

### 🔧 CIRCUITO DO DIVISOR DE TENSÃO (PARA CADA SENSOR)

```
Sensor YF-S4xx (5V)
       │
    [Amarelo] ──────┬──────────────► Para GPIO do ESP32 (D5 ou D8)
                    │                     │
                   [10K]                  │
                    │                     │
                   ─┴─                   ─┴─
                   [10K]                Tensão: ~2.5V
                    │                   (Seguro para ESP32!)
                   GND

    [Vermelho] ──────► +5V
    [Preto] ──────► GND
```

---

## 🗺️ MAPA DE LIGAÇÕES SEGURO (PROTOBOARD)

### Referência da Protoboard

```
    BARRAMENTO          ÁREA PRINCIPAL              BARRAMENTO
    ESQUERDO            (30 linhas)                 DIREITO
   (+12V)(GND)    A  B  C  D  E │ F  G  H  I  J    (+5V)(GND)
     🔴   🔵                    │                    🔴   🔵
     │    │      [  COLUNAS   ] │ [  COLUNAS   ]     │    │
     │    │      [  A-E são   ] │ [  F-J são   ]     │    │
     │    │      [ conectadas ] │ [ conectadas ]     │    │
     │    │                     │                    │    │
```

**REGRA DE OURO:** Colunas A-E são um nó. Colunas F-J são outro nó. **E não conecta com F!**

---

### 📍 COORDENADAS EXATAS DE CADA COMPONENTE

#### ZONA 1: ALIMENTAÇÃO 12V (Barramento Esquerdo)

| Componente | Coordenada | Furo Específico | Cor do Fio |
|------------|------------|-----------------|------------|
| Fonte 12V (+) | Vermelho ESQ | Linha 1 | Vermelho |
| Fonte 12V (-) | Azul ESQ | Linha 1 | Preto |
| Cap 2200µF (+) | Vermelho ESQ | Linha 6 | - |
| Cap 2200µF (-) | Azul ESQ | Linha 6 | - |
| LM2596 IN+ | Vermelho ESQ | Linha 12 | Vermelho |
| LM2596 IN- | Azul ESQ | Linha 12 | Preto |

#### ZONA 2: ALIMENTAÇÃO 5V (Barramento Direito)

| Componente | Coordenada | Furo Específico | Cor do Fio |
|------------|------------|-----------------|------------|
| LM2596 OUT+ | Vermelho DIR | Linha 12 | Vermelho |
| LM2596 OUT- | Azul DIR | Linha 12 | Preto |
| Cap 100nF (+) | Vermelho DIR | Linha 14 | - |
| Cap 100nF (-) | Azul DIR | Linha 14 | - |
| **Jumper GND** | Azul ESQ ↔ Azul DIR | Linha 20 | Preto |

#### ZONA 3: ESP32 XIAO (Linhas 1-7)

```
ESP32 XIAO - USB voltado para CIMA (Linha 1)

Pino ESP32 │ GPIO │ Linha │ Coluna │ Conexão
───────────┼──────┼───────┼────────┼─────────────────────────────
5V         │  -   │   1   │ H ou I │ → Jumper → Barramento +5V DIR
GND        │  -   │   2   │ H ou I │ → Jumper → Barramento GND DIR
D4         │ GP5  │   5   │ B ou C │ ← Jumper MARROM (sozinho!)
D5         │ GP6  │   6   │ B ou C │ ← Jumper do DIVISOR (sozinho!)
```

**⚠️ CRÍTICO:** 
- Linha 5 → APENAS jumper marrom (MOSFET)
- Linha 6 → APENAS jumper do divisor (sensor)
- **NUNCA dois fios na mesma linha do ESP32!**

#### ZONA 4: DIVISOR DE TENSÃO DO SENSOR (Linhas 8-9)

```
PROTEÇÃO DO GPIO6 - Reduz 5V → 2.5V

Componente    │ Perna 1 │ Perna 2 │ Observação
──────────────┼─────────┼─────────┼──────────────────────────
Resistor 10K #1│  H8    │   H9    │ Entre linhas 8 e 9
Resistor 10K #2│  J9    │ GND DIR │ Linha 9 para GND
Sensor Amarelo │  J8    │    -    │ Entrada do divisor
Jumper saída  │  F9    │   C6    │ Saída para GPIO6
```

```
DIAGRAMA DO DIVISOR:

Sensor (5V) ──► J8 ──┬── 10K ──┬── F9 ──► C6 (GPIO6)
                     │   H8-H9 │
                     │         │
                     │    ┌────┴────┐
                     │    │  10K    │ J9 → GND
                     │    └─────────┘
                     │
                     └── Tensão: 2.5V (seguro!)
```

#### ZONA 5: MOSFET E VÁLVULA (Linhas 16-22)

```
CIRCUITO DE POTÊNCIA

Componente      │ Coordenada    │ Observação
────────────────┼───────────────┼─────────────────────────────
Jumper Marrom   │ C5 → J16      │ Sinal do ESP32 GPIO5
Resistor 100Ω   │ I16 → I20     │ Proteção do Gate
Resistor 10K    │ J20 → GND DIR │ Pull-down do Gate
MOSFET Gate     │ G20           │ Perna esquerda
MOSFET Drain    │ G21           │ Perna central
MOSFET Source   │ G22           │ Perna direita
Jumper Verde    │ J22 → GND DIR │ Source para terra
Diodo Catodo    │ Verm ESQ      │ Lado com FAIXA → +12V
Diodo Anodo     │ F21           │ Lado sem faixa → Drain
Válvula Fio 1   │ Verm ESQ      │ +12V
Válvula Fio 2   │ H21 ou J21    │ Junto ao Drain
```

```
MOSFET IRLZ44N - Vista Frontal (texto virado para você)

         ┌─────────────────┐
         │    IRLZ44N      │
         │                 │
         │   (dissipador)  │
         │                 │
         └──┬────┬────┬────┘
            │    │    │
            G    D    S
           20   21   22  ← Linhas da protoboard
          Gate Drain Source
```

#### ZONA 6: SENSOR DE FLUXO

| Fio Sensor | Cor | Destino | Coordenada |
|------------|-----|---------|------------|
| VCC | Vermelho | +5V | Barramento Vermelho DIR |
| GND | Preto | GND | Barramento Azul DIR |
| Sinal | Amarelo | Divisor | J8 (entrada do divisor) |

---

## 🔌 DIAGRAMA VISUAL COMPLETO

```
═══════════════════════════════════════════════════════════════════════════════
                    DIAGRAMA COMPLETO DA PROTOBOARD
═══════════════════════════════════════════════════════════════════════════════

BARRAMENTO                                                      BARRAMENTO
ESQUERDO                     PROTOBOARD                         DIREITO
(+12V)(GND)                                                    (+5V)(GND)
  🔴   🔵      a   b   c   d   e │ f   g   h   i   j             🔴   🔵
  │    │                        │                                │    │
──┼────┼────────────────────────┼────────────────────────────────┼────┼──
  │    │                        │                                │    │
1 ├────┤◄─FONTE 12V             │                    ESP32 5V───►├────┤
  │    │                        │                                │    │
2 │    │                        │                    ESP32 GND──►├────┤
  │    │                        │                                │    │
3 │    │           ┌────────────┼────────────┐                   │    │
  │    │           │   ESP32    │   XIAO     │                   │    │
4 │    │           │            │            │                   │    │
  │    │           │            │            │                   │    │
5 │    │     MARROM◄──[D4]      │            │                   │    │
  │    │           │            │            │                   │    │
6 ├─┬──┤◄CAP2200µF │   [D5]◄────┼─────────────────────────────┐  │    │
  │ │  │           │            │            │                │  │    │
7 │ │  │           └────────────┼────────────┘                │  │    │
  │ │  │                        │                             │  │    │
8 │ │  │                        │            ┌─10K──[H8]◄─────┼──┼────┼◄─SENSOR
  │ │  │                        │            │      [H9]      │  │    │  AMARELO
9 │ │  │                        │            └─10K──[J9]──────┼──┼────┤
  │ │  │                        │              ▲              │  │    │
  │ │  │                        │              └──────────────┘  │    │
10│ │  │                        │                                ├────┤◄─SENSOR VCC/GND
  │ │  │                        │                                │    │
11│ │  │                        │                                │    │
  │ │  │                        │                                │    │
12├─┼──┤◄─LM2596 IN             │                   LM2596 OUT──►├────┤
  │ │  │                        │                                │    │
13│ │  │                        │                                │    │
  │ │  │                        │                                │    │
14│ │  │                        │                      CAP 100nF─┼────┤
  │ │  │                        │                                │    │
15│ │  │                        │                                │    │
  │ │  │                        │                                │    │
16│ │  │        ┌───────────────┼──[J16]◄──MARROM                │    │
  │ │  │        │               │    │                           │    │
17│ │  │        │               │  100Ω                          │    │
  │ │  │        │               │    │                           │    │
18│ │  │        │               │    │                           │    │
  │ │  │        │               │    │                           │    │
19│ │  │        │               │    │                           │    │
  │ │  │        │               │    ▼                           │    │
20│ │  ├────────┼───────────────┼─[I20]──[G20]GATE──[J20]─10K───►├────┤
  │ │  │        │               │           │                    │    │
  │ │  │        │               │           │                    │    │
21├─┼──┤◄DIODO──┼───────────────┼──[F21]──[G21]DRAIN─[H21]◄──────┼────┼──VÁLVULA
  │    │  faixa │               │                                │    │
  │    │        │               │           │                    │    │
22│    │        │               │        [G22]SOURCE─[J22]──────►├────┤
  │    │        │               │                    verde       │    │
  │    │        │               │                                │    │
──┴────┴────────┴───────────────┴────────────────────────────────┴────┴──
  │    │                                                         │    │
  │    ◄────────────── JUMPER GND (Azul ESQ ↔ Azul DIR) ─────────┼────┘
  │                                                              │
  ◄─────────────────── VÁLVULA FIO 1 (+12V) ─────────────────────┘
```

---

## 🧪 ETAPA 1: VALIDAÇÃO A FRIO (Sem Energia)

### Equipamento Necessário:
- Multímetro no modo **CONTINUIDADE** (símbolo 🔊)
- Protoboard montada **SEM** fonte ligada
- **SEM** ESP32 conectado

### Testes de Curto-Circuito

**❌ NENHUM destes testes deve dar BIP!**

#### Teste 1.1: Curtos nos Barramentos

| # | Ponta 1 | Ponta 2 | Esperado | ✓ |
|---|---------|---------|----------|---|
| 1 | Vermelho ESQ (L1) | Azul ESQ (L1) | SEM BIP | □ |
| 2 | Vermelho DIR (L1) | Azul DIR (L1) | SEM BIP | □ |
| 3 | Vermelho ESQ | Vermelho DIR | SEM BIP | □ |
| 4 | Vermelho ESQ | Azul DIR | SEM BIP | □ |

#### Teste 1.2: Curtos no ESP32 (Linhas 1-7)

| # | Ponta 1 | Ponta 2 | Esperado | ✓ |
|---|---------|---------|----------|---|
| 5 | C5 (GPIO5) | Vermelho DIR | SEM BIP | □ |
| 6 | C5 (GPIO5) | Azul DIR | SEM BIP | □ |
| 7 | C6 (GPIO6) | Vermelho DIR | SEM BIP | □ |
| 8 | C6 (GPIO6) | Azul DIR | SEM BIP | □ |
| 9 | C5 (GPIO5) | C6 (GPIO6) | **SEM BIP** | □ |

**⚠️ Teste 9 é CRÍTICO!** Se der BIP, os fios estão na mesma linha!

#### Teste 1.3: Curtos no MOSFET

| # | Ponta 1 | Ponta 2 | Esperado | ✓ |
|---|---------|---------|----------|---|
| 10 | G20 (Gate) | G21 (Drain) | SEM BIP | □ |
| 11 | G20 (Gate) | G22 (Source) | SEM BIP | □ |
| 12 | G21 (Drain) | G22 (Source) | SEM BIP | □ |

### Testes de Continuidade (Conexões)

**✅ Estes testes DEVEM dar BIP!**

| # | Ponta 1 | Ponta 2 | Esperado | ✓ |
|---|---------|---------|----------|---|
| 13 | Azul ESQ (L20) | Azul DIR (L20) | **BIP** (jumper GND) | □ |
| 14 | J16 | I16 | **BIP** (mesmo nó) | □ |
| 15 | I20 | G20 | **BIP** (resistor → Gate) | □ |
| 16 | J22 | Azul DIR | **BIP** (Source → GND) | □ |
| 17 | F21 | G21 | **BIP** (diodo → Drain) | □ |

### Testes de Resistência

**Modo: Ω (Ohms)**

| # | Ponta 1 | Ponta 2 | Esperado | ✓ |
|---|---------|---------|----------|---|
| 18 | I16 | I20 | ~100Ω | □ |
| 19 | J20 | Azul DIR | ~10KΩ | □ |
| 20 | H8 | H9 | ~10KΩ | □ |
| 21 | J9 | Azul DIR | ~10KΩ | □ |

---

## ⚡ ETAPA 2: VALIDAÇÃO A QUENTE (Com Energia)

### ⚠️ PRÉ-REQUISITOS:
```
□ Todos os testes a frio passaram
□ ESP32 ainda DESCONECTADO
□ Multímetro em modo DC VOLTS (20V)
□ Área de trabalho limpa e seca
```

### Sequência de Energização

#### Passo 2.1: Ligar Fonte 12V

```
1. Conecte a fonte 12V aos barramentos ESQ
2. LED do LM2596 deve acender
3. Aguarde 5 segundos para estabilizar
```

#### Passo 2.2: Medir Tensões Principais

**Ponta PRETA sempre no GND (Azul DIR)**

| # | Ponta Vermelha | Esperado | Tolerância | Medido | ✓ |
|---|----------------|----------|------------|--------|---|
| 1 | Vermelho ESQ | 12.0V | ±1V | ___V | □ |
| 2 | Vermelho DIR | 5.0V | ±0.2V | ___V | □ |
| 3 | Azul ESQ | 0V | ±0.1V | ___V | □ |

#### Passo 2.3: Medir Tensões no MOSFET (Gate deve estar LOW)

| # | Ponto | Esperado | Observação | Medido | ✓ |
|---|-------|----------|------------|--------|---|
| 4 | G20 (Gate) | ~0V | Pull-down ativo | ___V | □ |
| 5 | G21 (Drain) | ~12V | Válvula desligada | ___V | □ |
| 6 | G22 (Source) | 0V | Conectado ao GND | ___V | □ |

#### Passo 2.4: Medir Divisor de Tensão do Sensor

| # | Ponto | Esperado | Observação | Medido | ✓ |
|---|-------|----------|------------|--------|---|
| 7 | J8 (entrada) | ~5V | Tensão do sensor | ___V | □ |
| 8 | F9 (saída) | ~2.5V | Dividido por 2 | ___V | □ |
| 9 | C6 (GPIO6) | ~2.5V | Seguro para ESP32 | ___V | □ |

#### Passo 2.5: Teste Funcional da Válvula (SEM ESP32)

```
TESTE MANUAL:

1. Com fonte ligada
2. Use um jumper para conectar brevemente:
   - Ponta 1: G20 ou J20 (Gate)
   - Ponta 2: Vermelho DIR (+5V)
3. Válvula deve fazer CLICK (abrir)
4. Remova o jumper
5. Válvula deve fazer CLICK (fechar)

Resultado:
□ Válvula clicou ao conectar = OK
□ Válvula clicou ao desconectar = OK
```

#### Passo 2.6: Teste do Sensor de Fluxo

```
TESTE DO SENSOR:

1. Multímetro em DC VOLTS
2. Ponta preta no GND
3. Ponta vermelha em F9 ou C6
4. Sopre no sensor ou gire a hélice com o dedo
5. Tensão deve oscilar entre 0V e 2.5V

Resultado:
□ Tensão oscilou = Sensor funcionando
□ Tensão fixa = Verificar conexões
```

---

## 🖥️ ETAPA 3: CONECTAR ESP32

### Pré-requisitos:
```
□ Todos os testes a quente passaram
□ DESLIGUE a fonte 12V
□ Verifique visualmente as linhas 5 e 6
```

### Checklist Visual Final:

```
LINHA 5 (GPIO5/D4):
□ Apenas o jumper MARROM está conectado
□ Nenhum outro fio na linha 5

LINHA 6 (GPIO6/D5):
□ Apenas o jumper do DIVISOR (vem de F9)
□ Nenhum outro fio na linha 6
□ Fio AMARELO do sensor está em J8 (NÃO em linha 6!)
```

### Sequência de Conexão:

```
1. □ Insira o ESP32 nas linhas 1-7
      - USB voltado para linha 1 (topo)
      - Pinos do lado esquerdo nas colunas B-C
      - Pinos do lado direito nas colunas H-I

2. □ Verifique que 5V (H1/I1) está conectado ao barramento +5V

3. □ Verifique que GND (H2/I2) está conectado ao barramento GND

4. □ Conecte o cabo USB ao computador (NÃO ligue a fonte ainda!)

5. □ Abra o Arduino IDE → Serial Monitor (115200 baud)

6. □ Verifique se aparece "Sistema pronto!" no monitor

7. □ AGORA ligue a fonte 12V

8. □ Teste o comando via app ou serial: {"action":"test_valve","duration":1000}

9. □ Válvula deve clicar por 1 segundo
```

---

## 🚨 TROUBLESHOOTING

### Problema: ESP32 esquenta ao conectar

| Causa Provável | Solução |
|----------------|---------|
| Curto 5V-GND | Desconecte imediatamente. Refaça testes 1.1 |
| ESP32 invertido | Verifique orientação (USB para cima) |
| Dois fios na mesma linha | Verifique linhas 5 e 6 |

### Problema: Válvula não clica no teste manual

| Causa Provável | Solução |
|----------------|---------|
| MOSFET invertido | Texto deve estar virado para você |
| Diodo invertido | Faixa deve ir para +12V |
| Fio da válvula solto | Verificar H21 e barramento +12V |
| Fonte sem carga | Medir tensão no Drain |

### Problema: Sensor não responde

| Causa Provável | Solução |
|----------------|---------|
| Divisor mal conectado | Verificar resistores 10K |
| Sensor sem alimentação | Medir 5V no fio vermelho |
| Hélice travada | Limpar sensor |

### Problema: Válvula clica mas não abre água

| Causa Provável | Solução |
|----------------|---------|
| Baixa pressão | Verificar torneira |
| Válvula NC vs NO | Confirmar tipo (deve ser NC) |
| Sujeira na válvula | Limpar filtro |

---

## 📊 TABELA DE REFERÊNCIA RÁPIDA

### Código de Cores dos Resistores

| Resistor | Faixa 1 | Faixa 2 | Faixa 3 | Faixa 4 |
|----------|---------|---------|---------|---------|
| 100Ω | Marrom | Preto | Marrom | Dourado |
| 10KΩ | Marrom | Preto | Laranja | Dourado |

### Pinagem XIAO ESP32-S3

```
         ┌─────────────┐
    D0 ──┤ 1        14 ├── 5V
    D1 ──┤ 2        13 ├── GND
    D2 ──┤ 3        12 ├── 3V3
    D3 ──┤ 4        11 ├── D10 (LED)
    D4 ──┤ 5        10 ├── D9
    D5 ──┤ 6         9 ├── D8
    D6 ──┤ 7         8 ├── D7
         └─────────────┘
              USB
```

| Pino | GPIO | Função no Projeto |
|------|------|-------------------|
| D3 | GPIO4 | Válvula Tap 1 (OUTPUT) |
| D4 | GPIO5 | Válvula Tap 0 / MOSFET (OUTPUT) |
| D5 | GPIO6 | Sensor de Fluxo Tap 0 (INPUT) |
| D6 | GPIO43 | ❌ TX Serial - NÃO USAR! |
| D7 | GPIO44 | ❌ RX Serial - NÃO USAR! |
| D8 | GPIO7 | Sensor de Fluxo Tap 1 (INPUT) |
| D10 | GPIO10 | Pino SPI (MOSI) - disponível |
| USER_LED | GPIO21 | LED Status interno (OUTPUT) |

### Tensões de Referência

| Ponto | Mínimo | Típico | Máximo |
|-------|--------|--------|--------|
| Fonte 12V | 11V | 12V | 13V |
| LM2596 OUT | 4.8V | 5.0V | 5.2V |
| Gate (sem sinal) | 0V | 0V | 0.1V |
| Gate (com sinal) | 2.5V | 3.3V | 3.5V |
| Divisor saída | 2.0V | 2.5V | 3.0V |

---

## ✅ CHECKLIST FINAL DE APROVAÇÃO

```
VALIDAÇÃO A FRIO:
□ Todos os 12 testes de curto passaram (sem BIP)
□ Todos os 5 testes de continuidade passaram (com BIP)
□ Todos os 4 testes de resistência passaram

VALIDAÇÃO A QUENTE:
□ Tensão 12V OK (11-13V)
□ Tensão 5V OK (4.8-5.2V)
□ Gate em 0V (pull-down funcionando)
□ Divisor em 2.5V (proteção OK)
□ Válvula clicou no teste manual

CONEXÃO ESP32:
□ Linha 5 tem apenas jumper marrom
□ Linha 6 tem apenas jumper do divisor
□ ESP32 orientado corretamente
□ Serial Monitor mostra "Sistema pronto!"
□ Comando test_valve funciona

DATA: ___/___/______
TÉCNICO: _________________
ASSINATURA: _________________
```

---

## 📎 ANEXOS

### Comandos JSON para Teste (MULTI-TAP)

```json
// ===== TORNEIRA 0 (TAP 0) =====

// Teste de válvula Tap 0 (2 segundos)
{"action":"test_valve","tapId":0,"duration":2000}

// Teste de sensor de fluxo Tap 0 (5 segundos)
{"action":"test_flow","tapId":0,"duration":5000}

// Simular dispensação Tap 0
{"action":"release_drink","orderId":"TEST-001","mlPerUnit":200,"quantity":1,"sizeLabel":"Teste","tapId":0}

// ===== TORNEIRA 1 (TAP 1) =====

// Teste de válvula Tap 1 (2 segundos)
{"action":"test_valve","tapId":1,"duration":2000}

// Teste de sensor de fluxo Tap 1 (5 segundos)
{"action":"test_flow","tapId":1,"duration":5000}

// Simular dispensação Tap 1
{"action":"release_drink","orderId":"TEST-002","mlPerUnit":200,"quantity":1,"sizeLabel":"Teste","tapId":1}

// ===== COMANDOS GERAIS =====

// Ping (verificar conexão)
{"action":"ping"}

// Status do sistema (mostra ambas torneiras)
{"action":"status"}

// Status das torneiras (detalhado)
{"action":"get_taps"}

// Diagnóstico completo de GPIO
{"action":"diagnose_gpio"}

// Parar todas as torneiras (emergência)
{"action":"stop"}
```

### Medições Esperadas com Multímetro

| Ponto | Idle (sem comando) | Ativo (comando enviado) |
|-------|-------------------|------------------------|
| D4 (GPIO5) - Gate Tap 0 | ~0V (pull-down) | ~3.3V |
| D3 (GPIO4) - Gate Tap 1 | ~0V (pull-down) | ~3.3V |
| D5 (GPIO6) - Sensor Tap 0 | ~2.5V (divisor) | Pulsos durante fluxo |
| D8 (GPIO7) - Sensor Tap 1 | ~2.5V (divisor) | Pulsos durante fluxo |
| D6 (GPIO43) - TX Serial | **~3.3V (HIGH!)** | ❌ NÃO USAR! |
| D7 (GPIO44) - RX Serial | ~0-3.3V | ❌ NÃO USAR! |

### Links Úteis

- [Datasheet IRLZ44N](https://www.infineon.com/dgdl/irlz44n.pdf)
- [Datasheet YF-S401/S402](https://www.seeedstudio.com/blog/2020/05/11/how-to-use-water-flow-sensor-with-arduino/)
- [Pinout XIAO ESP32-S3](https://wiki.seeedstudio.com/XIAO_ESP32S3_Getting_Started/)

---

## 🎯 RESUMO RÁPIDO - ONDE CONECTAR CADA FIO

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONEXÕES RÁPIDAS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   TORNEIRA 0:                                                   │
│   ├── Válvula (MOSFET Gate) ──► D4 (GPIO5)                     │
│   └── Sensor Fluxo (via divisor) ──► D5 (GPIO6)                │
│                                                                 │
│   TORNEIRA 1:                                                   │
│   ├── Válvula (MOSFET Gate) ──► D3 (GPIO4)                     │
│   └── Sensor Fluxo (via divisor) ──► D8 (GPIO7)                │
│                                                                 │
│   NUNCA USAR:                                                   │
│   ├── D6 (GPIO43) ──► TX Serial (HIGH = 3.3V quando idle!)     │
│   └── D7 (GPIO44) ──► RX Serial                                │
│                                                                 │
│   LED: GPIO21 (interno, não precisa conectar)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Documento atualizado para Multi-Tap - Janeiro 2026**
**Versão 3.0 - Firmware v4.0.2**
**Circuito validado e seguro para operação**
