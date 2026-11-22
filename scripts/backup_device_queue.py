import subprocess
import os
from datetime import datetime

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_dir = os.path.join("backups", "device_queue_backups", ts)
os.makedirs(backup_dir, exist_ok=True)

adb_path = r"C:\Users\velmu\AppData\Local\Android\Sdk\platform-tools\adb.exe"

for filename in ["sms_transaction_queue.json", "sms_settings.json"]:
    cmd = [adb_path, "-s", "e9818d7b", "exec-out", f"run-as com.moneytrack.app cat files/{filename}"]
    res = subprocess.run(cmd, capture_output=True)
    target_path = os.path.join(backup_dir, filename)
    with open(target_path, "wb") as f:
        f.write(res.stdout)
    print(f"Backed up {filename} ({len(res.stdout)} bytes) to {target_path}")
