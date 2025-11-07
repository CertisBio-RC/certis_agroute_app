# =========================================================
# 🚀 CERTIS AGROUTE GOLD BUILD & DEPLOY (STATIC EXPORT FIX)
# =========================================================
Set-Location "C:\Users\jbailey\certis_agroute_app"

Write-Host "🧹 Cleaning old builds..." -ForegroundColor Yellow
Remove-Item -Recurse -Force .next, out -ErrorAction SilentlyContinue

Write-Host "🏗️ Building static site (Next.js export)..." -ForegroundColor Cyan
& "$env:USERPROFILE\node-portable\npm.cmd" run build

# ------------------------------------------
# PATCH: Rewrite broken /_next paths → /certis_agroute_app/_next
# ------------------------------------------
Write-Host "🩹 Rewriting _next paths for GitHub Pages..." -ForegroundColor Yellow
$prefix = "/certis_agroute_app"
Get-ChildItem -Path "out" -Recurse -Include *.html | ForEach-Object {
    (Get-Content $_.FullName -Raw) `
        -replace '="/_next', "=""$prefix/_next" `
        -replace "='/_next", "='$prefix/_next" `
        | Set-Content $_.FullName -Encoding UTF8
}

Write-Host "🚀 Deploying to gh-pages..." -ForegroundColor Green
& "$env:USERPROFILE\node-portable\node.exe" `
  "C:\Users\jbailey\certis_agroute_app\node_modules\gh-pages\bin\gh-pages.js" `
  -d out -b gh-pages

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 View live site: https://certisbio-rc.github.io/certis_agroute_app/"
