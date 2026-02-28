# Script para probar el sistema de historial de precios

Write-Host "🧪 Test del Sistema de Historial de Precios" -ForegroundColor Cyan
Write-Host ""

# 1. Sincronizar datos (esto guardará el snapshot de hoy)
Write-Host "1️⃣ Sincronizando datos y guardando snapshot..." -ForegroundColor Yellow
$syncResponse = Invoke-RestMethod -Uri "http://localhost:8080/gasolineras/sync" -Method Post
Write-Host "✅ Sync completado:" -ForegroundColor Green
Write-Host "   - Gasolineras insertadas: $($syncResponse.registros_insertados)"
Write-Host "   - Registros históricos: $($syncResponse.registros_historicos)"
Write-Host "   - Fecha snapshot: $($syncResponse.fecha_snapshot)"
Write-Host ""

# 2. Obtener una gasolinera de ejemplo
Write-Host "2️⃣ Obteniendo gasolinera de ejemplo..." -ForegroundColor Yellow
$gasolinerasResponse = Invoke-RestMethod -Uri "http://localhost:8080/gasolineras?limit=1"
$gasolinera = $gasolinerasResponse.gasolineras[0]
$id = $gasolinera.IDEESS
Write-Host "✅ Gasolinera seleccionada:" -ForegroundColor Green
Write-Host "   - ID: $id"
Write-Host "   - Nombre: $($gasolinera.Rótulo)"
Write-Host "   - Municipio: $($gasolinera.Municipio)"
Write-Host ""

# 3. Consultar historial
Write-Host "3️⃣ Consultando historial de precios (últimos 30 días)..." -ForegroundColor Yellow
$historialResponse = Invoke-RestMethod -Uri "http://localhost:8080/gasolineras/$id/historial?dias=30"
Write-Host "✅ Historial obtenido:" -ForegroundColor Green
Write-Host "   - Registros encontrados: $($historialResponse.registros)"
Write-Host "   - Período: $($historialResponse.fecha_desde) a $($historialResponse.fecha_hasta)"
Write-Host ""

if ($historialResponse.registros -gt 0) {
    Write-Host "📊 Datos históricos:" -ForegroundColor Cyan
    foreach ($registro in $historialResponse.historial) {
        Write-Host "   Fecha: $($registro.fecha)" -ForegroundColor White
        Write-Host "   Precios:" -ForegroundColor Gray
        if ($registro.precios.'Gasolina 95 E5') {
            Write-Host "     - Gasolina 95 E5: $($registro.precios.'Gasolina 95 E5')"
        }
        if ($registro.precios.'Gasolina 98 E5') {
            Write-Host "     - Gasolina 98 E5: $($registro.precios.'Gasolina 98 E5')"
        }
        if ($registro.precios.'Gasóleo A') {
            Write-Host "     - Gasóleo A: $($registro.precios.'Gasóleo A')"
        }
        Write-Host ""
    }
} else {
    Write-Host "ℹ️ No hay datos históricos disponibles aún" -ForegroundColor Yellow
    Write-Host "   (El historial se construye con cada sync posterior)" -ForegroundColor Gray
}

Write-Host "✅ Test completado" -ForegroundColor Green
