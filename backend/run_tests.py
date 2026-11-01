import subprocess
result = subprocess.run(
    ["python", "-m", "pytest", "tests/", "-q"],
    cwd="d:\\MoneyTrack\\backend",
    capture_output=True,
    text=True,
)
print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("Return code:", result.returncode)