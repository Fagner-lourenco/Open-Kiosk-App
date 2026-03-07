"""
EDA - Exploratory Data Analysis for Beer/Chopp Prediction Datasets
"""
import pandas as pd

# ============================================================================
# DATASET 1: Beer Consumption São Paulo (A01)
# ============================================================================
print("=" * 80)
print("DATASET A01: Beer Consumption - Sao Paulo")
print("=" * 80)

df_sp = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\beer_sp\Consumo_cerveja.csv")
print(f"\nShape: {df_sp.shape}")
print(f"\nColumns: {list(df_sp.columns)}")
print(f"\ndtypes:\n{df_sp.dtypes}")
print(f"\nFirst 5 rows:\n{df_sp.head().to_string()}")
print(f"\nDescribe:\n{df_sp.describe().to_string()}")
print(f"\nNull counts:\n{df_sp.isnull().sum()}")

# Show column samples
for col in df_sp.columns:
    sample = df_sp[col].dropna().head(3).tolist()
    print(f"  Column '{col}': {sample}")

# Correlation
numeric_cols = df_sp.select_dtypes(include=['number']).columns.tolist()
if len(numeric_cols) > 1:
    print(f"\nCorrelation matrix:")
    print(df_sp[numeric_cols].corr().to_string())

# ============================================================================
# DATASET 2: Craft Beer Bar Sales (A02)
# ============================================================================
print("\n" + "=" * 80)
print("DATASET A02: Craft Beer Bar Sales - Transactions")
print("=" * 80)

df_tx = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\craft_bar\Transactions.csv")
print(f"\nShape: {df_tx.shape}")
print(f"\nColumns: {list(df_tx.columns)}")
print(f"\ndtypes:\n{df_tx.dtypes}")
print(f"\nFirst 5 rows:\n{df_tx.head().to_string()}")
print(f"\nDescribe:\n{df_tx.describe().to_string()}")

# Column samples
for col in df_tx.columns:
    sample = df_tx[col].dropna().head(3).tolist()
    print(f"  Column '{col}': {sample}")

# Date analysis
for col in df_tx.columns:
    if 'date' in col.lower() or 'time' in col.lower() or 'dt' in col.lower() or col.lower() == 'data':
        try:
            dates = pd.to_datetime(df_tx[col], errors='coerce')
            valid = dates.dropna()
            print(f"\n  Date column '{col}': min={valid.min()}, max={valid.max()}, range={valid.max() - valid.min()}")
        except:
            pass

# Hourly pattern analysis
print("\n--- Hourly patterns ---")
for col in df_tx.columns:
    if 'hour' in col.lower() or 'hora' in col.lower() or 'time' in col.lower():
        print(f"  {col} distribution:")
        print(df_tx[col].value_counts().sort_index().head(24).to_string())

# Product range
print(f"\n--- Product Range ---")
df_prod = pd.read_csv(r"d:\Open-Kiosk-App\data\raw\craft_bar\Product_range.csv")
print(f"Shape: {df_prod.shape}")
print(f"Columns: {list(df_prod.columns)}")
print(f"\nFirst 10 rows:\n{df_prod.head(10).to_string()}")
for col in df_prod.columns:
    n = df_prod[col].nunique()
    print(f"  {col}: {n} unique", end="")
    if n < 20:
        print(f" -> {df_prod[col].unique().tolist()[:15]}")
    else:
        print()

# ============================================================================
# Day-of-week / weekend analysis of craft bar
# ============================================================================
print("\n--- Day of week patterns in Craft Bar ---")
for col in df_tx.columns:
    if 'date' in col.lower() or col.lower() == 'data':
        try:
            dates = pd.to_datetime(df_tx[col], errors='coerce')
            df_tx['_dow'] = dates.dt.day_name()
            print(f"  Transactions by day of week:")
            print(df_tx['_dow'].value_counts().to_string())
            df_tx.drop(columns=['_dow'], inplace=True)
        except:
            pass

# ============================================================================
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"""
A01 (Beer SP): {len(df_sp)} rows, {len(df_sp.columns)} columns
  Best for: Climate regression model (w_clima)
  
A02 (Craft Bar): {len(df_tx)} tx rows, {len(df_prod)} products
  Best for: Hourly consumption curves, product mix
""")
