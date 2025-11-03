# Script para generar JWT_SECRET seguro
# Ejecutar con: .\generate-jwt-secret.ps1

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Generador de JWT_SECRET" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Generar 32 bytes aleatorios y convertir a Base64
$bytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($bytes)
$jwtSecret = [Convert]::ToBase64String($bytes)

Write-Host "Tu nuevo JWT_SECRET seguro es:" -ForegroundColor Green
Write-Host ""
Write-Host $jwtSecret -ForegroundColor Yellow
Write-Host ""
Write-Host "Longitud: $($jwtSecret.Length) caracteres" -ForegroundColor Gray
Write-Host ""
Write-Host "Copia este valor y agrégalo a tu archivo .env:" -ForegroundColor Cyan
Write-Host "JWT_SECRET=$jwtSecret" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  IMPORTANTE: No compartas este secreto con nadie" -ForegroundColor Red
Write-Host "==================================" -ForegroundColor Cyan
