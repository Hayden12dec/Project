
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = (Get-Location).Path }

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "AI-Based Smart Examination Proctoring System" -ForegroundColor Green
Write-Host "Starting FastAPI Backend and React Frontend..." -ForegroundColor Cyan
Write-Host "Project Directory: $projectRoot" -ForegroundColor Gray
Write-Host "==================================================="

# Stop any lingering background servers on port 8000
try {
    Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    $venvPython = "python"
}

$frontendDir = Join-Path $projectRoot "frontend"

# 1. Start Backend Server
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "`"$venvPython`" -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload" -WorkingDirectory $projectRoot

Write-Host "Waiting for backend services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 2. Start Frontend Dev Server
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory $frontendDir

Start-Sleep -Seconds 3

# 3. Automatically launch the web application in default browser
try {
    Start-Process "http://localhost:5173"
} catch {
    Write-Host "Please open http://localhost:5173 in your browser." -ForegroundColor Yellow
}

Write-Host "`nSystem processes successfully launched!" -ForegroundColor Green
Write-Host "Frontend App:     http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Yellow
Write-Host "`nDemo Credentials:" -ForegroundColor Cyan
Write-Host "  Admin:   admin@proctor.edu   / Admin@123" -ForegroundColor White
Write-Host "  Student: student@proctor.edu / Student@123" -ForegroundColor White
Write-Host "==================================================="


