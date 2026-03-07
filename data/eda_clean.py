import pandas as pd, warnings, sys
warnings.filterwarnings('ignore')
out = open(r'd:\Open-Kiosk-App\data\eda_results.txt', 'w', encoding='utf-8')
def p(s):
    print(s)
    out.write(s + '\n')

df = pd.read_csv(r'd:\Open-Kiosk-App\data\raw\beer_sp\Consumo_cerveja.csv', dtype=str)
cols = df.columns.tolist()
for c in cols[1:]:
    df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')
df = df.dropna(subset=[cols[6]])

tm, tmin, tmax, rain, wk, cons = cols[1], cols[2], cols[3], cols[4], cols[5], cols[6]
m = df[cons].mean()
wd = df[df[wk]==0][cons].mean()
we = df[df[wk]==1][cons].mean()
dry = df[df[rain]==0][cons].mean()
wet = df[df[rain]>0][cons].mean()
x = df[tm].astype(float)
y = df[cons].astype(float)
n = len(x)
b1 = (n*(x*y).sum() - x.sum()*y.sum()) / (n*(x**2).sum() - x.sum()**2)
b0 = y.mean() - b1*x.mean()
r = x.corr(y)

p('=== A01: BEER CONSUMPTION SP ===')
p(f'Rows: {len(df)}')
p(f'Consumption: mean={m:.2f}L std={df[cons].std():.2f}')
p(f'Temperature: mean={df[tm].mean():.1f}C range={df[tmin].min():.1f}-{df[tmax].max():.1f}C')
p(f'Regression: cons = {b0:.2f} + {b1:.4f} * temp')
p(f'  +1C => +{b1:.3f}L (+{b1/m*100:.2f}%)')
p(f'  R={r:.4f} R2={r**2:.4f}')
p(f'Weekend: weekday={wd:.1f}L weekend={we:.1f}L boost=+{(we/wd-1)*100:.1f}%')
p(f'Rain: dry={dry:.1f}L rainy={wet:.1f}L penalty={((wet/dry-1)*100):.1f}%')

p(f'\nTemp bins:')
df['tb'] = pd.cut(df[tm], bins=[10,15,20,25,30,35,40])
for idx, row in df.groupby('tb', observed=True)[cons].agg(['mean','count']).iterrows():
    p(f'  {idx}: {row["mean"]:.1f}L (n={int(row["count"])})')

p(f'\nCorrelations with consumption:')
for c in [tm, tmin, tmax, rain, wk]:
    p(f'  {c}: r={df[c].astype(float).corr(df[cons].astype(float)):.4f}')

# A02
df2 = pd.read_csv(r'd:\Open-Kiosk-App\data\raw\craft_bar\Transactions.csv')
df2['dt'] = pd.to_datetime(df2.iloc[:,0], errors='coerce')
df2['hour'] = df2['dt'].dt.hour
df2['dow'] = df2['dt'].dt.day_name()
v = df2['dt'].dropna()
h = df2['hour'].value_counts().sort_index()
dw = df2['dow'].value_counts()

p(f'\n=== A02: CRAFT BEER BAR ===')
p(f'Transactions: {len(df2)}')
p(f'Date range: {v.min()} to {v.max()} ({(v.max()-v.min()).days} days)')
p(f'Peak hour: {h.idxmax()}:00 ({h.max()} txns)')
p(f'Peak/trough ratio: {h.max()/h[h>0].min():.1f}x')
p(f'Busiest day: {dw.idxmax()} ({dw.max()} txns)')
p(f'\nHourly distribution:')
for hr, cnt in h.items():
    pct = cnt/h.sum()*100
    bars = '#' * int(pct*2)
    p(f'  {hr:2d}:00  {cnt:5d} ({pct:4.1f}%) {bars}')
p(f'\nDay of week:')
for d, cnt in dw.items():
    p(f'  {d}: {cnt}')
p(f'\nColumns: {df2.columns.tolist()}')

# Products
df_p = pd.read_csv(r'd:\Open-Kiosk-App\data\raw\craft_bar\Product_range.csv')
p(f'\nProducts: {len(df_p)}')
p(f'Columns: {df_p.columns.tolist()}')

p(f'\n=== CALIBRATION CONSTANTS ===')
p(f'BETA_TEMP = {b1:.4f}  // L per 1C')
p(f'BETA_TEMP_PCT = {b1/m*100:.2f}  // % per 1C')
p(f'R_SQUARED = {r**2:.4f}')
p(f'WEEKEND_BOOST = {we/wd-1:.4f}  // +{(we/wd-1)*100:.1f}%')
p(f'RAIN_PENALTY = {wet/dry-1:.4f}  // {(wet/dry-1)*100:.1f}%')
p(f'MEAN_DAILY_L = {m:.2f}')
p(f'PEAK_HOUR = {h.idxmax()}')
p(f'PEAK_TROUGH_RATIO = {h.max()/h[h>0].min():.1f}')
out.close()
