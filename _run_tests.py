import subprocess
import os

os.chdir(r"d:\Open-Kiosk-App")

result = subprocess.run(
    [r"C:\Program Files\nodejs\npx.CMD", "vitest", "run",
     "src/__tests__/phase0-fixes.test.ts",
     "src/__tests__/phase1-fixes.test.ts",
     "src/__tests__/phase2-fixes.test.ts",
     "--reporter=default"],
    capture_output=True,
    text=True,
    shell=True,
    encoding="utf-8",
    errors="replace",
)

with open(r"d:\Open-Kiosk-App\testresult.txt", "w", encoding="utf-8") as f:
    f.write(result.stdout)
    f.write("\n\nSTDERR:\n")
    f.write(result.stderr)
    f.write(f"\n\nEXIT_CODE: {result.returncode}\n")

print(f"Done. Exit code: {result.returncode}")
