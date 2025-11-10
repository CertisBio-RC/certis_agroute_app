# ========================================
# 🚀 CERTIS AGROUTE PLANNER — GOLD STANDARD DEPLOY
# ========================================
# This PowerShell script performs a full clean build and deployment
# to GitHub Pages for the Certis AgRoute Planner (Next.js 15 + React 19).
# Run it from the project root:
#     PS> .\deploy.ps1
# ========================================

Write-Host "`n🧹 Cleaning old build artifacts..." -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules, .next, out -ErrorAction SilentlyContinue

Write-Host "`n⚙️ Re-installing dependencies (forced clean install)..." -ForegroundColor Cyan
& "$env:USERPROFILE\node-portable\npm.cmd" install --force

Write-Host "`n🏗️ Building static export (Next 15.2.4)..." -ForegroundColor Cyan
& "$env:USERPROFILE\node-portable\npm.cmd" run build

# Verify build success
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Check error log above." -ForegroundColor Red
    exit 1
}

Write-Host "`n🧩 Adding .nojekyll to disable Jekyll processing..." -ForegroundColor Cyan
New-Item -Path ".\out\.nojekyll" -ItemType File -Force | Out-Null

Write-Host "`n🌐 Preparing GitHub Pages branch (gh-pages)..." -ForegroundColor Cyan
Set-Location out
git init | Out-Null
git checkout -b gh-pages | Out-Null
git remote add origin https://github.com/CertisBio-RC/certis_agroute_app.git

git add .
$commitMessage = "🚀 Gold Standard Deploy — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMessage

Write-Host "`n🚢 Pushing to GitHub Pages..." -ForegroundColor Cyan
git push --set-upstream origin gh-pages --force

Set-Location ..
Write-Host "`n✅ Deployment complete! Site should be live at:" -ForegroundColor Green
Write-Host "   https://certisbio-rc.github.io/certis_agroute_app/" -ForegroundColor Yellow
Write-Host "`n========================================" -ForegroundColor DarkCyan
Write-Host "All done — your Next 15 static export and asset paths are locked in." -ForegroundColor Green
