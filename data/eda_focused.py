"""EDA v3 — robust for pandas 2.x StringDtype"""
import pandas as pd
import sys, warnings
warnings.filterwarnings('ignore')
pd.set_option('future.no_silent_downcasting', True)

# ============================================================================
# A01: Beer SP
# ============================================================================
print("=" * 60)
print("A01: BEER CONSUMPTION SP")
print("=" * 60)

df = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\beer_sp\Consumo_cerveja.csv",
                 dtype=str)
print(f"Shape: {df.shape}, Cols: {df.columns.tolist()}")

# Convert ALL columns except Data to float
cols = df.columns.tolist()
for c in cols[1:]:
    df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')

df = df.dropna(subset=[cols[6]])
print(f"Valid rows: {len(df)}")

# Map cols
C = {'date': cols[0], 'temp_med': cols[1], 'temp_min': cols[2],
     'temp_max': cols[3], 'rain': cols[4], 'wknd': cols[5], 'cons': cols[6]}

# Stats
m = df[C['cons']].mean()
print(f"\nConsumption: mean={m:.1f}L, std={df[C['cons']].std():.1f}, min={df[C['cons']].min():.1f}, max={df[C['cons']].max():.1f}")
print(f"Temperature: mean={df[C['temp_med']].mean():.1f}C, min={df[C['temp_min']].min():.1f}, max={df[C['temp_max']].max():.1f}")

# Weekend
wd = df[df[C['wknd']]==0][C['cons']].mean()
we = df[df[C['wknd']]==1][C['cons']].mean()
print(f"\nWeekend boost: weekday={wd:.1f}L, weekend={we:.1f}L => +{(we/wd-1)*100:.1f}%")

# Rain
dry = df[df[C['rain']]==0][C['cons']].mean()
wet = df[df[C['rain']]>0][C['cons']].mean()
print(f"Rain effect: dry={dry:.1f}L, rainy={wet:.1f}L => {(wet/dry-1)*100:.1f}%")

# Correlations
print(f"\nCorrelations:")
for k in ['temp_med','temp_min','temp_max','rain','wknd']:
    r = df[C[k]].astype(float).corr(df[C['cons']].astype(float))
    print(f"  {k}: r={r:.4f}")

# Regression
x = df[C['temp_med']].astype(float)
y = df[C['cons']].astype(float)
b1 = (len(x) * (x*y).sum() - x.sum()*y.sum()) / (len(x)*(x**2).sum() - x.sum()**2)
b0 = y.mean() - b1*x.mean()
r = x.corr(y)
print(f"\nRegression: cons = {b0:.2f} + {b1:.4f}*temp")
print(f"  +1C => +{b1:.3f}L ({b1/m*100:+.2f}%)")
print(f"  R={r:.4f}, R2={r**2:.4f}")

# Temp bins
df['tbin'] = pd.cut(df[C['temp_med']], bins=[10,15,20,25,30,35,40])
tb = df.groupby('tbin', observed=True)[C['cons']].agg(['mean','count'])
print(f"\nBy temp bin:")
for idx, row in tb.iterrows():
    print(f"  {idx}: {row['mean']:.1f}L (n={int(row['count'])})")

# ============================================================================
# A02: Craft Bar
# ============================================================================
print("\n" + "=" * 60)
print("A02: CRAFT BEER BAR SALES")
print("=" * 60)

df_tx = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\craft_bar\Transactions.csv")
print(f"Shape: {df_tx.shape}, Cols: {df_tx.columns.tolist()}")

for c in df_tx.columns:
    print(f"  {c}: {df_tx[c].dtype}")

# Parse dates
dt_col = df_tx.columns[0]
df_tx['dt'] = pd.to_datetime(df_tx[dt_col], errors='coerce')
v = df_tx['dt'].dropna()
print(f"\nDate range: {v.min()} -> {v.max()} ({(v.max()-v.min()).days} days)")

df_tx['hour'] = df_tx['dt'].dt.hour
df_tx['dow'] = df_tx['dt'].dt.day_name()

# Hourly
print(f"\nTransactions by HOUR:")
h = df_tx['hour'].value_counts().sort_index()
for hr, cnt in h.items():
    bar = '#' * int(cnt / h.max() * 25)
    print(f"  {hr:2d}:00 {cnt:5d} {bar}")
print(f"  PEAK: {h.idxmax()}:00 ({h.max()} txns)")
print(f"  Ratio peak/min: {h.max()/h[h>0].min():.1f}x")

# Day of week
print(f"\nBy day of week:")
dw = df_tx['dow'].value_counts()
for d, cnt in dw.items():
    bar = '#' * int(cnt / dw.max() * 15)
    print(f"  {d:12s} {cnt:5d} {bar}")

# Revenue
amt = [c for c in df_tx.columns if 'sale' in c.lower() or 'amount' in c.lower()]
if amt:
    rc = amt[0]
    print(f"\nHourly revenue ({rc}):")
    hr = df_tx.groupby('hour')[rc].agg(['sum','mean','count'])
    for idx, row in hr.iterrows():
        bar = '#' * int(row['sum'] / hr['sum'].max() * 20)
        print(f"  {idx:2d}:00 sum={row['sum']:10.0f} avg={row['mean']:7.1f} n={int(row['count']):5d} {bar}")

    # Peak revenue hour
    peak_rev_h = hr['sum'].idxmax()
    print(f"  PEAK REVENUE HOUR: {peak_rev_h}:00")

# Product range
df_p = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\craft_bar\Product_range.csv")
print(f"\nProducts: {len(df_p)}")
for c in df_p.columns:
    print(f"  {c}: {df_p[c].nunique()} unique")

# ============================================================================
print("\n" + "=" * 60)
print("CALIBRATION VALUES FOR forecastEngine.ts")
print("=" * 60)
print(f"""
// Climate model (w_clima) — from Beer SP dataset
const BETA_TEMP = {b1:.4f};        // L per 1C increase
const BETA_TEMP_PCT = {b1/m*100:.2f}; // % per 1C increase  
const R_SQUARED = {r**2:.4f};
const WEEKEND_BOOST = {(we/wd-1):.4f}; // +{(we/wd-1)*100:.1f}% on weekends
const RAIN_PENALTY = {(wet/dry-1):.4f};  // {(wet/dry-1)*100:.1f}% when raining
const MEAN_DAILY_L = {m:.2f};      // mean daily L (SP sample)

// Hourly patterns (Craft Bar) 
const PEAK_HOUR = {h.idxmax()};
const PEAK_TROUGH_RATIO = {h.max()/h[h>0].min():.1f};
""")
