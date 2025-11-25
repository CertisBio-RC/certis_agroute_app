# =====================================================================
#  CERTIS AGROUTE DATA PIPELINE
#  Runs all 5 processing steps:
#    1. Combine retailers_BREAKOUT.xlsx → retailers.xlsx
#    2. Geocode retailers.xlsx → retailers_latlong.xlsx
#    3. Convert retailers_latlong.xlsx → public/data/retailers.geojson
#    4. Geocode kingpin1_COMBINED.xlsx → kingpin_latlong.xlsx
#    5. Convert kingpin_latlong.xlsx → public/data/kingpin.geojson
#
#  REQUIREMENTS:
#     - scripts/ folder must contain:
#           combine_channel_partners.py
#           geocode_retailers.py
#           convert_to_geojson.py
#           geocode_kingpin.py
#           convert_to_geojson_kingpin.py
#     - /data folder must contain:
#           retailers_BREAKOUT.xlsx
#           kingpin1_COMBINED.xlsx
#           token.json   (with MAPBOX_TOKEN)
#
# =====================================================================

Write-Host ""
Write-Host "====================================================="
Write-Host "   STARTING CERTIS AGROUTE DATA PIPELINE"
Write-Host "====================================================="
Write-Host ""

$root = $PSScriptRoot
Write-Host "Running from: $root"
Write-Host ""

# Helper to run Python scripts cleanly
function Run-PythonScript($scriptName) {
    $scriptPath = Join-Path $root "scripts\$scriptName"
    Write-Host "[run] python $scriptPath"
    python $scriptPath
    Write-Host ""
}

# -------------------------------------------------------
# STEP 1 — Combine retailers_BREAKOUT.xlsx → retailers.xlsx
# -------------------------------------------------------
Write-Host "=== STEP 1: Combine retailers_BREAKOUT.xlsx → retailers.xlsx ===" -ForegroundColor Cyan
Run-PythonScript "combine_channel_partners.py"

# -------------------------------------------------------
# STEP 2 — Geocode retailers.xlsx → retailers_latlong.xlsx
# -------------------------------------------------------
Write-Host "=== STEP 2: Geocode retailers.xlsx → retailers_latlong.xlsx ===" -ForegroundColor Cyan
Run-PythonScript "geocode_retailers.py"

# -------------------------------------------------------
# STEP 3 — Convert retailers_latlong.xlsx → public/data/retailers.geojson
# -------------------------------------------------------
Write-Host "=== STEP 3: Convert retailers_latlong.xlsx → retailers.geojson ===" -ForegroundColor Cyan
Run-PythonScript "convert_to_geojson.py"

# -------------------------------------------------------
# STEP 4 — Geocode kingpin1_COMBINED.xlsx → kingpin_latlong.xlsx
# -------------------------------------------------------
Write-Host "=== STEP 4: Geocode kingpin1_COMBINED.xlsx → kingpin_latlong.xlsx ===" -ForegroundColor Cyan
Run-PythonScript "geocode_kingpin.py"

# -------------------------------------------------------
# STEP 5 — Convert kingpin_latlong.xlsx → public/data/kingpin.geojson
# -------------------------------------------------------
Write-Host "=== STEP 5: Convert kingpin_latlong.xlsx → kingpin.geojson ===" -ForegroundColor Cyan
Run-PythonScript "convert_to_geojson_kingpin.py"

Write-Host "====================================================="
Write-Host "   ALL PIPELINE STEPS COMPLETED"
Write-Host "====================================================="
Write-Host ""
