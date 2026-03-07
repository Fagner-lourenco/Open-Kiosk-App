# 📐 Módulo de Previsão de Demanda de Chopp — Documentação Técnica

> **Versão do Modelo**: `v0.5.0-granular-climate`
Este documento consolida a arquitetura matemática, empírica e as decisões de modelo e código que governam o Forecast Engine do OpenKiosk.
> **Última atualização**: 04 de Março de 2026
> **Autores**: Equipe Open Kiosk
> **Stack**: TypeScript · Firebase Cloud Functions v2 · Open-Meteo API · IBGE API

---

## Sumário

1. [Visão Geral e Arquitetura](#1-visão-geral-e-arquitetura)
2. [Módulo A — Potencial de Demanda λ(t)](#2-módulo-a--potencial-de-demanda-λt)
3. [Módulo B — Conversão e Atrito](#3-módulo-b--conversão-e-atrito)
4. [Módulo C — Capacidade Física Segura](#4-módulo-c--capacidade-física-segura)
5. [Módulo D — Decisão e Recomendações](#5-módulo-d--decisão-e-recomendações)
6. [Datasets e Fontes de Dados](#6-datasets-e-fontes-de-dados)
7. [Constantes Calibradas (Priors)](#7-constantes-calibradas-priors)
8. [APIs Externas Integradas](#8-apis-externas-integradas)
9. [Exemplos de Cálculo Completo](#9-exemplos-de-cálculo-completo)
10. [Limitações e Próximos Passos](#10-limitações-e-próximos-passos)

---

## 1. Visão Geral e Arquitetura

### 1.1 Objetivo

Prever o **volume total de chopp (litros)** que será consumido em um evento self-service, dado:
- Tipo e tamanho do evento
- Condições climáticas
- Configuração de hardware (totens, torneiras, resfriamento)
- Fatores logísticos (localização, concorrência, visibilidade)

### 1.2 Pipeline de Cálculo

```
┌──────────────────────────────────────────────────────────────────┐
│                        INPUT DO USUÁRIO                         │
│  Evento · Público · Clima · Hardware · Logística                │
└─────────┬────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐    ┌──────────────────────┐
│  MÓDULO A            │    │  Open-Meteo API       │
│  Potencial de        │◄───│  (clima forecast)     │
│  Demanda λ(t)        │    │  IBGE API (demog.)   │
│                      │    └──────────────────────┘
│  P_chopp × r × w_clima│
│  × w(t) × duração    │
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  MÓDULO B            │
│  Conversão / Atrito  │
│                      │
│  f_pay × f_dist ×    │
│  f_comp × f_vis      │
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  MÓDULO C            │
│  Capacidade Física   │
│                      │
│  C_safe = min(       │
│    C_vazão, C_frio)  │
└─────────┬────────────┘
          ▼
┌─────────────────────┐
│  MÓDULO D            │
│  Decisão             │
│  Risco · Barris ·    │
│  Recomendações       │
└─────────┬────────────┘
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                         OUTPUT                                   │
│  totalLiters {p10, p50, p90} · peakLph · demandCurve ·          │
│  capacityCurve · riskLevel · recommendations · kegCount         │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Estrutura de Arquivos

```
functions/src/forecast/
├── forecastEngine.ts    # Motor principal (4 módulos)
├── priors.ts            # Constantes calibradas com dados
├── climateService.ts    # Integração Open-Meteo
├── demographicService.ts # Integração IBGE
└── index.ts             # Cloud Functions endpoints

admin/src/
├── types/forecast.ts    # Tipos TypeScript
├── services/forecastService.ts  # Frontend → Cloud Functions
├── hooks/useForecast.ts # React hook
└── pages/forecast/
    ├── DemandForecastPage.tsx
    ├── ForecastSimulator.tsx
    ├── ForecastHistory.tsx
    └── ForecastCalibration.tsx
```

---

## 2. Módulo A — Potencial de Demanda λ(t)

### 2.1 Fórmula Principal

A demanda por hora `λ(t)` para cada hora `t` do evento é:

```
λ(t) = P_chopp × (r_per_capita × w_clima) × w_normalized(t) × D
```

> **Bugfix (v0.4.2)**: Historicamente, `w_clima` multiplicava a taxa de adesão (limitada a 95%), o que truncava artificialmente o impacto de calor extremo em eventos de alta adesão. Agora ele escala diretamente o volume per-capita (`r_per_capita`), refletindo o fenômeno físico real: no calor, as pessoas bebem *mais* e *mais rápido*.

Onde:
| Variável | Significado | Unidade |
|----------|-------------|---------|
| `P_chopp` | Número de pessoas que beberão chopp (limitado a max 95% do total) | pessoas |
| `r_per_capita` | Taxa de consumo por hora por tipo de evento | L/(pessoa·h) |
| `w_clima` | Fator climático multiplicativo | adimensional |
| `w_normalized(t)` | Peso horário normalizado no intervalo do evento | adimensional |
| `D` | Duração efetiva do evento (eventEnd − eventStart) | horas |

O volume total é:

```
V_total = Σ λ(t)  para t ∈ [eventStart, eventEnd)
```

### 2.2 Cálculo de P_chopp (Público Bebedor)

```
P_chopp = totalPeople × adoptionRate
```

A `adoptionRate` (taxa de adesão ao chopp) é um intervalo `[min, max]`:
- Se o usuário **não altera** os defaults (20%/40%), o sistema usa `EVENT_MULTIPLIERS[categoria]`
- Se o usuário **customiza**, seus valores são usados diretamente

| Categoria | Range Padrão [min, max] | p50 |
|-----------|------------------------|-----|
| Festival | [0.25, 0.45] | 0.35 |
| Corporativo | [0.10, 0.25] | 0.175 |
| Esportivo | [0.30, 0.50] | 0.40 |
| Bar / Taproom | [0.40, 0.65] | 0.525 |
| Casamento | [0.15, 0.35] | 0.25 |
| Show / Concerto | [0.25, 0.45] | 0.35 |
| Feira | [0.10, 0.25] | 0.175 |
| Festa Privada | [0.30, 0.50] | 0.40 |

**Fonte**: Heurística baseada em literatura de eventos + dados observacionais. Não calibrados com dados próprios (Fase 0).

### 1.1 Fatores Demográficos Granulares (Fase 2)
A base de consumo (*P_chopp*) é fortemente determinada pelo perfil demográfico, implementado via **Integração de Alta Precisão (IBGE)**:
- **População Adulta ($P_{adult} = P_{total} \times 0.76$):** Filtramos crianças/bebês usando a métrica estrutural do Censo IBGE 2022. O índice de *Saturação de Evento* agora alerta quando o evento representa $>10\%$ da população **adulta** endereçável (Risco de Logística/Abastecimento).
- **Fator Regional ($rf = cult \times income$):** 
  - $cult$: Fator Cultural CervBrasil (Sul = 1.15, Norte = 0.80).
  - $income$: Fator de Renda IBGE PNAD Contínua 2023. Regiões com maior renda per capita (DF = 1.30, SP = 1.15) recebem forte *boost* de conversão para o ticket premium.

### 2.3 Taxa de Consumo Per-Capita (`r_per_capita`)

O consumo por hora varia significativamente com o tipo de evento:

| Tipo de Evento | r_per_capita (L/h) | Justificativa |
|----------------|-------------------|---------------|
| **Esportivo** | **0.50** | Maior intensidade: calor + emoção + longa permanência |
| Festival | 0.40 | Clima festivo, música, socialização ativa |
| Festa Privada | 0.45 | Grupo motivado, open bar mental |
| Concerto | 0.38 | Música + calor induzem consumo alto |
| Bar / Taproom | 0.35 | Baseline self-service, ritmo individual |
| Casamento | 0.30 | Social, mais moderado, alternância com outras bebidas |
| **Corporativo** | **0.25** | Ambiente controlado, formalidade inibe excessos |
| **Feira** | **0.22** | Público familiar, crianças presentes, menor intensidade |

**Fonte**: Calibrado com dados diretos do *PourMyBev 2024 Self-Pour Impact Report* (n=3.1M clientes, 1.24L/sessão), *Weezevent Barometer 2025*, e cruzamento com Oktoberfest Blumenau e Munique. (Atualizado na v0.4.0).

### 2.4 Fator Climático (`w_clima`)

```
w_clima = tempFactor × rainFactor × weekendFactor × exposureFactor
```

### 1.2 O Fator Climático Horário Dinâmico ($w_{clima}(t)$) - Fase 3
A demanda $w_{clima}$ varia **gota a gota ao longo do evento**, baseada na temperatura exata de cada hora.
Integrado via **Open-Meteo Hourly API**:

- **Apparent Temperature (Sensação Térmica):** A demanda agora usa a sensação térmica hora a hora, cruzando vento e umidade (ao invés da máxima diária).
- $\beta_{temp} = +3.13\%/^\circ\text{C}$ a partir da baseline ($24^\circ\text{C}$).
- Chuva penaliza proporcionalmente: $-0.5\%$ de demanda por $1$mm de chuva (máximo de $-20\%$).

A Curva de Demanda $\lambda(t)$ final integra este peso multiplicando a base demográfica e escalonando perfeitamente a variação térmica nas horas em que o evento ocorre.

#### 2.4.1 Fator de Temperatura

```
tempFactor_raw = 1 + (T - T_baseline) × β_temp_pct
tempFactor = clamp(tempFactor_raw, 0.70, 1.50)
```

| Constante | Valor | Fonte |
|-----------|-------|-------|
| `β_temp_pct` | +3.13% / °C | Regressão linear Beer SP (R²=0.33, n=365) |
| `T_baseline` | 21.2°C | Média anual de consumo no dataset Beer SP |
| Clamp mínimo | 0.70 | Evita extrapolação abaixo de ~5°C |
| Clamp máximo | 1.50 | Evita extrapolação acima de ~37°C |

**Derivação**: Do dataset Beer Consumption São Paulo (Kaggle, n=365 dias), regressão linear simples:

```
consumo_diário = α + β × T_max

Resultado da EDA:
  α (intercepto) = ~8.5 L/dia
  β (coeficiente) = +0.7949 L/°C
  β_pct = β / consumo_baseline = 0.7949 / 25.40 = 0.0313 = +3.13%/°C
  R² = 0.3302
```

**Clamping (v0.3)**: A regressão foi treinada com dados entre 14°C e 36.5°C. Fora dessa faixa, o modelo linear extrapola irrazoavelmente. O clamp [0.70, 1.50] garante que:
- A 0°C: `1 + (-21.2 × 0.0313) = 0.34` → clamped a **0.70**
- A 40°C: `1 + (18.8 × 0.0313) = 1.59` → clamped a **1.50**

#### 2.4.2 Fator de Chuva

**v0.3 (proporcional a mm)**:
```
Se rain é número (mm):
    rainFactor = max(0.80, 1 - rain × 0.005)
Se rain é boolean true:
    rainFactor = 0.949  (penalidade fixa de -5.1%)
Se rain é false:
    rainFactor = 1.0
```

| Precipitação (mm) | Fator | Redução |
|-------------------|-------|---------|
| 0 (sem chuva) | 1.000 | 0% |
| 5 (garoa) | 0.975 | -2.5% |
| 10 (chuva leve) | 0.950 | -5.0% |
| 20 (chuva moderada) | 0.900 | -10.0% |
| 40+ (temporal) | 0.800 | -20.0% (cap) |

**Fonte**: Dataset Beer SP mostrou penalidade média de -5.06% em dias de chuva (independente da intensidade). A graduação por mm é estimativa baseada em observação de campo.

#### 2.4.3 Fator de Fim de Semana

```
weekendFactor = isWeekend ? 1.2052 : 1.0
```

**Fonte**: Dataset Beer SP, comparando média de consumo Sáb/Dom vs Seg-Sex:
- Média dias úteis: 23.5 L/dia
- Média fins de semana: 28.3 L/dia
- Boost: +20.52%

#### 2.4.4 Fator de Exposição

| Exposição | Fator | Lógica |
|-----------|-------|--------|
| Sol aberto | 1.15 | +15% consumo por calor direto |
| Coberto | 1.00 | Baseline |
| Fechado c/ AC | 0.90 | -10% (conforto reduz consumo) |

#### 2.4.5 Fallback Sazonal (quando clima não está disponível)

Se a data do evento é futura (>16 dias) e o Open-Meteo não cobre (ou a API retorna erro), usamos dados históricos:

```
effectiveTemp = MONTHLY_TMAX_SP[mês]      // Tabela de médias mensais
effectiveRain = MONTHLY_RAIN_PROB_SP[mês] > 0.5  // Binarização probabilística
```

> **Bugfix (v0.4.2)**: A verificação de fallback de temperatura foi corrigida para aceitar `0°C` como valor real válido (antes caía no fallback).

Dados extraídos do Open-Meteo ERA5 Reanalysis (SP, 2023, n=365):

| Mês | T_max média | P(chuva) | w_clima estimado |
|-----|-------------|----------|------------------|
| Jan | 25.6°C | 84% | ~1.09 (considerando chuva) |
| Fev | 26.5°C | 89% | ~1.10 |
| Mar | 26.9°C | 55% | ~1.12 |
| Jun | 21.4°C | 13% | ~1.01 |
| Jul | 22.2°C | 13% | ~1.03 |
| Set | 28.4°C | 27% | ~1.23 |
| Dez | 29.1°C | 42% | ~1.25 |

### 2.5 Distribuição Horária com Concentração de Pico

Os pesos horários vêm do dataset **Craft Beer Bar Sales** (n=50,084 transações, 2020–2022):

| Hora | Peso base | % do total |
|------|-----------|------------|
| 10:00 | 0.004 | 0.4% |
| 12:00 | 0.012 | 1.2% |
| 14:00 | 0.032 | 3.2% |
| **16:00** | **0.170** | **17.0%** |
| **17:00** | **0.170** | **17.0%** |
| 18:00 | 0.118 | 11.8% |
| 20:00 | 0.094 | 9.4% |
| 22:00 | 0.054 | 5.4% |

**Concentração de Pico (v0.3)**: O campo `peakDurationHours` modifica a distribuição:

1. O engine encontra a janela de `peakDuration` horas com **maior soma de pesos** dentro do intervalo do evento
2. Durante o pico, os pesos são multiplicados por **1.5×** (PEAK_BOOST)
3. Tudo é re-normalizado para somar 1.0

**Exemplo**: Evento das 14h–22h com pico de 2h:
- Janela ótima encontrada: 16:00–17:59 (peso base = 0.170 + 0.170 = 0.340)
- Pesos 16h–17h: 0.170 × 1.5 = 0.255 (cada)
- Demais horas: pesos base (sem boost)

---

## 3. Módulo B — Conversão e Atrito

### 3.1 Fórmula

```
λ_real(t) = λ(t) × p_conv

p_conv = f_pay × f_dist × f_comp × f_vis
```

### 3.2 Fatores de Conversão

#### f_pay — Fricção de Pagamento
```
f_pay = (0.92 + 0.98) / 2 = 0.95
```
Com PIX + cartão integrados ao totem, a fricção de pagamento é mínima. Range [0.92, 0.98] captura variação entre públicos (tech-savvy vs menos familiarizados).

#### f_dist — Distância do Fluxo Principal

| Distância | Fator | Efeito |
|-----------|-------|--------|
| < 10m | 1.00 | Sem penalidade |
| 10–50m | 0.85 | -15% (precisa caminhar) |
| > 50m | 0.65 | -35% (fora do caminho natural) |

#### f_comp — Concorrência

| Nível | Fator | Cenário |
|-------|-------|---------|
| Nenhuma | 1.00 | Único ponto de chopp |
| Leve (1-2) | 0.90 | 1-2 alternativas |
| Moderada (3-5) | 0.75 | 3-5 alternativas |
| Pesada | 0.55 | Muitas opções (festival com vários bares) |

#### f_vis — Visibilidade

| Nível | Fator | Cenário |
|-------|-------|---------|
| Alta | 1.00 | Bem visível, com sinalização |
| Média | 0.85 | Parcialmente visível |
| Baixa | 0.70 | Precisa procurar |

**Exemplo**: Evento com concorrência leve, 20m de distância, visibilidade média:
```
p_conv = 0.95 × 0.85 × 0.90 × 0.85 = 0.617
```
→ 61.7% do potencial se converte em demanda real.

---

## 4. Módulo C — Capacidade Física Segura

### 4.1 Fórmula

```
C_safe = min(C_vazão, C_frio)
```

#### C_vazão — Capacidade Hidráulica (fluxo das torneiras)

```
C_vazão = V_tap × n_taps × n_totems × 3600 / 1000   [L/h]
```

| Constante | Valor | Fonte |
|-----------|-------|-------|
| V_tap | 50 mL/s | Especificação típica de torneira de chopp |
| Cálculo | 50 × 2 × 1 × 3600 / 1000 = **360 L/h** por totem | |

#### C_frio — Capacidade de Resfriamento (glycol)

```
C_frio = cooling_nom × thermal_margin × exposure_penalty × n_totems   [L/h]
```

| Constante | Valor | Fonte |
|-----------|-------|-------|
| cooling_nom | 100 L/h | Confirmado pelo usuário (glycol 20L) |
| thermal_margin | 0.65 | 35% de margem para degradação sob carga contínua (recomendação indústria: operar glycol a máx 60%) |
| exposure_penalty | {sol: 0.80, coberto: 1.0, AC: 1.05} | Estimativa baseada em termodinâmica |

> **Bugfix (v0.4.0)**: O cálculo de `neededExtraTotems` nas recomendações agora usa a *capacidade efetiva de frio* (C_frio = cooling_nom × thermal_margin × exposure_penalty) em vez da capacidade nominal, corrigindo a subestimação de equipamento necessário.

**Exemplo (1 totem, coberto)**:
```
C_vazão = 50 × 2 × 1 × 3.6 = 360 L/h
C_frio  = 100 × 0.85 × 1.0 × 1 = 85 L/h
C_safe  = min(360, 85) = 85 L/h  (limitado pelo resfriamento!)
```

> **Insight**: O gargalo quase sempre é o **resfriamento**, não a vazão das torneiras.

### 4.2 Parâmetros de Hardware

| Parâmetro | Valor | Fonte |
|-----------|-------|-------|
| Torneiras/totem | 2 | Confirmado pelo usuário |
| Sistema térmico | Glycol 20L | Confirmado |
| Temperatura glycol | -3.5°C | Confirmado (máximo para cerveja não congelar) |
| Temperatura servir | 2.5°C | Brewers Association Draught Quality Manual |
| Velocidade de servir | ~50 mL/s | Especificação padrão |
| Tempo troca barril | ~120s (estimado) | Sem dados reais ainda |

### 3.1 C_frio Dinâmico: Degradação por Radiação Solar (Fase 3)
A capacidade volumétrica do totem não é absoluta. Em eventos ao ar livre sujeitos à insolação, simulamos a Degradação do Frio ($C_{frio}(t)$):
- **Radiação Direta (Open-Meteo `direct_radiation`):** Nas horas em que a radiação direta cai no totem ($>100\text{W/m}^2$, céu aberto), aplicamos `exposurePenalty = 0.80`.
- **Nuvens e Noite:** O modelo detecta horas de alta nebulosidade (`cloud_cover > 80%`) amenizando a punição para `0.95`, ou remove a punição (retorna a `1.0`) a partir do pôr do sol (`direct_radiation < 10\text{W/m}^2`).

---

## 5. Módulo D — Decisão e Recomendações

### 5.1 Detecção de Déficit

Para cada hora do evento:
```
se λ_real(t) > C_safe(t):
    déficit = λ_real(t) - C_safe(t)
    → Marcar como janela de déficit
```

### 5.2 Nível de Risco

| Nível | Condição | Ação |
|-------|----------|------|
| **Baixo** | Sem déficit | Operação normal |
| **Médio** | Déficit < 20% da capacidade | Monitorar |
| **Alto** | Déficit 20–50% da capacidade | Adicionar totens |
| **Crítico** | Déficit > 50% da capacidade | Evento inviável sem mais equipamento |

### 5.3 Cálculo de Barris

```
barris_base    = ceil(Volume_p50 / tamanho_barril)
barris_reserva = ceil((Volume_p90 - Volume_p50) / tamanho_barril) + 1
barris_total   = barris_base + barris_reserva
```

O "+1" extra é margem de segurança para:
- Perda por espuma em troca de barril
- Variação estatística acima do p90

### 5.4 Recomendações Automáticas

| Tipo | Gatilho | Severidade |
|------|---------|------------|
| `add_totems` | Déficit detectado | ⚠️ warning / 🔴 critical |
| `shade` | T > 30°C + sol aberto | ⚠️ warning |
| `pre_chill` | Barril chega > 15°C | ⚠️ warning / 🔴 critical |
| `co2_check` | Volume p90 > 200L | ℹ️ info |
| `extra_kegs` | Sempre (barris calculados) | ℹ️ info |
| `peak_mode` | Mês com P(chuva) > 50% + outdoor | ⚠️ warning |

### 5.5 Estimativa de CO₂

```
CO₂ (kg) = Volume_p90 × 0.005
```
Regra prática: ~5g de CO₂ por litro de chopp servido (pressurização + carbonatação).

---

## 6. Datasets e Fontes de Dados

### 6.1 Datasets Diretos

| ID | Dataset | Plataforma | Registros | Granularidade | Uso no Modelo |
|----|---------|------------|-----------|---------------|---------------|
| A01 | Beer Consumption São Paulo | Kaggle | 365 | Diária | β_temp, weekend_boost, rain_penalty, T_baseline |
| A02 | Craft Beer Bar Sales | Kaggle | 50,084 | Por transação | HOURLY_WEIGHTS, PEAK_HOURS |
| D01 | Iowa Liquor Sales | Governo Iowa (Open Data) | 5,000 (amostra) | Por transação | Validação de padrão semanal |
| D02 | SP Climate 2023 | Open-Meteo ERA5 | 365 | Diária | MONTHLY_TMAX_SP, MONTHLY_RAIN_PROB_SP, MONTHLY_PRECIP_SP, TEMP_DISTRIBUTION_SP |
| D03 | Daily Min Temp AU | GitHub/jbrownlee | 3,650 | Diária | Validação de sazonalidade hemisfério sul |

### 6.2 Referências Técnicas

| Referência | Uso |
|------------|-----|
| Brewers Association — Draught Beer Quality Manual | T_TARGET_SERVE (2.5°C), parâmetros físicos de dispensação |
| Open-Meteo API Documentation | Estrutura de response, variáveis disponíveis |
| IBGE Agregados API | Código de município, dados demográficos |

### 6.3 Detalhamento de EDA

#### A01 — Beer Consumption São Paulo

```
Fonte: Kaggle (dataset público)
n: 365 observações (1 ano completo)
Variáveis: data, temperatura_media, temperatura_maxima, 
           precipitacao_mm, final_de_semana, consumo_litros

Regressão Linear Simples:
  Y = consumo_litros
  X = temperatura_maxima
  
  Resultado:
    β (slope)     = 0.7949 L/°C
    α (intercept) = 8.58 L
    R²            = 0.3302
    
  Interpretação:
    - Cada +1°C na temperatura máxima → +0.79 L/dia de consumo
    - Explica ~33% da variância (restante: dia da semana, eventos, etc.)
    
  Fatores Secundários (do mesmo dataset):
    - Weekend boost: +20.52% (média 28.3L vs 23.5L)
    - Rain penalty: -5.06% (média 24.1L vs 25.4L)
```

#### A02 — Craft Beer Bar Sales

```
Fonte: Kaggle (dataset público)
n: 50,084 transações (2020-2022)
Estabelecimento: taproom em Moscou (análogo a bar self-service)

Extração:
    1. Agrupar por hora da transação
    2. Contar frequência relativa por hora
    3. Normalizar para soma = 1.0
    
  Resultado:
    Peak: 16:00–17:00 (34% das vendas em 2h)
    Off-peak: antes das 14h (< 5% do total)
    
  Nota: Padrão horário de Moscou pode diferir do Brasil.
  Recalibração recomendada na Fase 2 com dados reais.
```

#### D02 — SP Climate 2023 (Open-Meteo ERA5)

```
Fonte: Open-Meteo Archive API (ERA5 Reanalysis)
Coordenadas: lat=-23.55, lon=-46.63 (São Paulo centro)
Período: 2023-01-01 a 2023-12-31

Variáveis baixadas:
  - temperature_2m_max (°C)
  - temperature_2m_min (°C)  
  - precipitation_sum (mm)
  - rain_sum (mm)

Análise:
  Temperatura Máxima:
    Média anual = 25.4°C
    Mínimo = 12.9°C (junho)
    Máximo = 36.5°C (set/out)
    
  Distribuição de T_max:
    < 15°C:   2 dias (0.5%)
    15-20°C: 33 dias (9.0%)
    20-25°C: 120 dias (32.9%)   ← 78% dos dias
    25-30°C: 165 dias (45.2%)   ← estão nesta faixa
    30-35°C: 41 dias (11.2%)
    > 35°C:   4 dias (1.1%)
    
  Estação Chuvosa vs Seca:
    Out-Mar: 40-89% dias com chuva > 1mm
    Abr-Set: 13-47% dias com chuva > 1mm
```

---

## 7. Constantes Calibradas (Priors)

### 7.1 Status de Calibração

| Constante | Status | Fonte | Confiança |
|-----------|--------|-------|-----------|
| β_temp_pct (+3.13%/°C) | ✅ Dataset | Beer SP (n=365) | Média (R²=0.33) |
| WEEKEND_BOOST (+20.5%) | ✅ Dataset | Beer SP (n=365) | Alta |
| RAIN_PENALTY (-0.5%/mm) | ✅ Dataset + heurística | Beer SP base + graduação estimada | Média |
| HOURLY_WEIGHTS | ✅ Dataset | Craft Bar (n=50,084) | Alta (mas contexto ≠ Brasil) |
| R_PER_CAPITA | 📚 Literatura | Brewers Association + referências | Média |
| EVENT_MULTIPLIERS | 📚 Literatura + heurística | Observação de campo | Baixa |
| CONVERSION_FACTORS | 🔧 Heurística | Estimativa sem calibração | Baixa |
| HARDWARE_DEFAULTS | ✅ Confirmado pelo usuário | Dados reais do equipamento | Alta |
| MONTHLY_TMAX_SP | ✅ Dataset | Open-Meteo ERA5 (n=365) | Alta |
| MONTHLY_RAIN_PROB_SP | ✅ Dataset | Open-Meteo ERA5 (n=365) | Alta |
| TEMP_FACTOR_CLAMP | 🔧 Heurística | Limites conservadores | Média |

### 7.2 Hierarquia de Recalibração (Fase 2)

```
Prioridade 1: Dados do Open Kiosk (telemetria real)
  → r_per_capita, EVENT_MULTIPLIERS, HOURLY_WEIGHTS

Prioridade 2: Dados cruzados (telemetria + clima + resultado)
  → β_temp_pct, RAIN_PENALTY (com granularidade de mm)

Prioridade 3: Validação observacional
  → CONVERSION_FACTORS, EXPOSURE_MULTIPLIERS
```

---

## 8. APIs Externas Integradas

### 8.1 Open-Meteo (Clima)

```
Forecast: https://api.open-meteo.com/v1/forecast
Archive:  https://archive-api.open-meteo.com/v1/archive

Rate limit: 10,000 req/dia (gratuito, sem API key)
Timezone: America/Sao_Paulo
```

**Variáveis utilizadas**:
- `temperature_2m` (horário)
- `precipitation` (horário, mm)
- `relative_humidity_2m` (horário, %)
- `apparent_temperature` (horário, °C)
- `temperature_2m_max` (diário)
- `temperature_2m_min` (diário)
- `precipitation_sum` (diário, mm)

**Cache**: Firestore, TTL de 6 horas. Fallback para cache stale se API falhar.

### 8.2 IBGE Agregados (Demográficos)

```
Endpoint: https://servicodados.ibge.gov.br/api/v3/agregados/
Rate limit: Sem limite documentado
```

**Uso**: Código do município → população (para estimativas de potencial regional e cálculo do `regionalFactor`). 

> **Bugfix (v0.4.0)**: O `regionalFactor` (ex: SC = 1.20) agora é injetado no `ForecastInput` e aplicado *dentro* do Motor (escalando `R_PER_CAPITA`). Nas versões anteriores, ele era aplicado pós-cálculo apenas no volume final, o que fazia as verificações de Capacidade e Risco operarem cegamente sobre a curva subestimada.

**Cache**: Firestore, sem expiração (dados censitários mudam ~10 anos).

---

## 9. Exemplos de Cálculo Completo

### 9.1 Festival de Verão (cenário otimista)

**Input**:
```
Evento: Festival de Verão SP
Tipo: festival
Público: 500 pessoas
Hora: 14:00–22:00 (8h)
Pico: 2h
Temperatura: 32°C (Open-Meteo)
Chuva: 0mm
Dia: Sábado
Exposição: Sol aberto
Hardware: 2 totens, barris de 50L
Concorrência: leve, 15m, alta visibilidade
```

**Módulo A**:
```
adoptionRate (festival default) = [0.25, 0.45] → p50 = 0.35
P_chopp = 500 × 0.35 = 175 pessoas

r_per_capita (festival) = 0.60 L/h

w_clima:
  tempFactor = 1 + (32 - 21.2) × 0.0313 = 1.338
  rainFactor = 1.0 (sem chuva)
  weekendFactor = 1.2052 (sábado)
  exposureFactor = 1.15 (sol)
  w_clima = 1.338 × 1.0 × 1.205 × 1.15 = 1.854

V_total_p50 = 175 × 0.60 × 1.854 × 8 = 1,557 L
V_total_p10 = 125 × 0.60 × 1.854 × 8 = 1,112 L  (adoptionRate min=0.25)
V_total_p90 = 225 × 0.60 × 1.854 × 8 = 2,003 L  (adoptionRate max=0.45)
```

**Módulo B**:
```
p_conv = 0.95 × 0.85 × 0.90 × 1.00 = 0.727

V_real_p50 = 1,557 × 0.727 = 1,132 L
V_real_p90 = 2,003 × 0.727 = 1,456 L
```

**Módulo C**:
```
C_vazão = 50 × 2 × 2 × 3.6 = 720 L/h
C_frio  = 100 × 0.85 × 0.80 × 2 = 136 L/h  (sol reduz glycol em 20%)
C_safe  = min(720, 136) = 136 L/h
```

**Módulo D**:
```
Barris base   = ceil(1132 / 50) = 23
Barris reserva = ceil((1456 - 1132) / 50) + 1 = 8
Barris total   = 31

Peak demand (p50) = ~200 L/h (hora 16-17 com 1.5× boost)
Peak vs capacity: 200 > 136 → DÉFICIT de 64 L/h

Risco: ALTO (déficit 47% da capacidade)
Recomendação: Adicionar 1 totem → C_safe = 204 L/h (resolve déficit)
```

### 9.2 Corporativo Indoor (cenário conservador)

**Input**:
```
Evento: Happy Hour Corporativo
Tipo: corporate
Público: 80 pessoas
Hora: 18:00–21:00 (3h)
Pico: 1h
Temperatura: 22°C
Chuva: false
Dia: Quinta
Exposição: Fechado c/ AC
Hardware: 1 totem, barris de 30L
Concorrência: nenhuma, 3m, alta visibilidade
```

**Cálculo resumido**:
```
P_chopp = 80 × 0.175 = 14 pessoas (adoption corporate default)
r_per_capita = 0.35 L/h (corporate)
w_clima = 1.025 × 1.0 × 1.0 × 0.90 = 0.923

V_p50 = 14 × 0.35 × 0.923 × 3 = 13.6 L
p_conv = 0.95 × 1.0 × 1.0 × 1.0 = 0.95
V_real_p50 = 13.6 × 0.95 = 12.9 L

Barris: ceil(12.9 / 30) = 1 base + 1 reserva = 2 barris de 30L
Risco: BAIXO
```

---

## 10. Limitações e Próximos Passos

### 10.1 Limitações Conhecidas

| # | Limitação | Impacto | Mitigação |
|---|-----------|---------|-----------|
| 1 | β_temp baseado em consumo universitário SP (não self-service) | Médio | Recalibrar com telemetria |
| 2 | HOURLY_WEIGHTS de bar em Moscou (latitude/cultura diferente) | Alto | Recalibrar com dados brasileiros |
| 3 | CONVERSION_FACTORS não calibrados | Médio | Pesquisa de campo com operadores |
| 4 | C_frio constante ao longo do evento (sem degradação térmica) | Baixo | Implementar curva de degradação |
| 5 | Umidade/sensação térmica ignorada no cálculo | Baixo | Incorporar `apparent_temperature` |
| 6 | Sem dados de tipo de barril na troca | Baixo | Adicionar sensor/cronômetro |
| 7 | Modelo p95 estimado como p50 × 1.3 (sem base empírica) | Médio | Usar distribuição real dos dados |
| 8 | Sazonalidade baseada em 1 ano de dados SP (2023) | Baixo | Expandir para 5+ anos de ERA5 |

### 10.2 Próximos Passos (Evolução)

#### 10.2.1 Implementado (v0.5.0)

- **Fatores Demográficos Granulares (Fase 2)**: Integração de alta precisão com IBGE para `P_chopp` e `regionalFactor`.
- **Fator Climático Horário Dinâmico (Fase 3)**: Uso de `apparent_temperature` e penalidade de chuva granular por hora via Open-Meteo Hourly API.
- **C_frio Dinâmico (Fase 3)**: Simulação de degradação do resfriamento por radiação solar direta.

#### 10.2.2 Fase Atual (Fase 2 — Auto-Calibração)

```
Fase 2a: Registrar resultado real após cada evento
  → Campo actualResult: { totalLiters, peakLph }
  
Fase 2b: Com n ≥ 10 eventos documentados:
  → Recalcular β_temp com dados próprios
  → Ajustar R_PER_CAPITA por tipo de evento
  → Refinar HOURLY_WEIGHTS com curva brasileira

Fase 2c: Com n ≥ 30 eventos:
  → Modelo de ML (random forest) substituindo regressão linear
  → Intervalos de confiança calibrados com MAPE real
```

---

> **Nota**: Este documento é atualizado a cada versão do modelo. Referências cruzadas estão em [`priors.ts`](functions/src/forecast/priors.ts) e [`forecastEngine.ts`](functions/src/forecast/forecastEngine.ts).
