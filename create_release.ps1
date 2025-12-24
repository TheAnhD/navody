if (-not $env:GITHUB_TOKEN) { Write-Error 'TOKEN_MISSING'; exit 1 }

$body = @{ 
  tag_name = 'v1.0.0'
  name = 'Návod'
  body = 'Windows portable build (v1.0.0)'
  draft = $false
  prerelease = $false
}

# Convert JSON with Compress to avoid formatting issues
$bodyJson = $body | ConvertTo-Json -Depth 10 -Compress
Write-Output "JSON to send:"
Write-Output $bodyJson

$headers = @{ Authorization = "token $env:GITHUB_TOKEN"; 'User-Agent' = 'navody-release-pwsh' }

try {
  $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/TheAnhD/navody/releases' -Method Post -Headers $headers -Body $bodyJson -ContentType 'application/json; charset=utf-8'
  Write-Output "RELEASE_CREATED"
  Write-Output ($rel | ConvertTo-Json -Depth 4)
} catch {
  Write-Output "ERROR_CREATING_RELEASE"
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $err = $reader.ReadToEnd()
    Write-Output $err
  } else {
    Write-Output $_.Exception.Message
  }
  exit 1
}

# Download artifact (already known id)
$artifactId = 4957220440
$artifactZip = Join-Path -Path (Get-Location) -ChildPath 'windows-artifacts.zip'
Write-Output "Downloading artifact $artifactId to $artifactZip..."
try {
  Invoke-WebRequest -Uri "https://api.github.com/repos/TheAnhD/navody/actions/artifacts/$artifactId/zip" -Headers $headers -OutFile $artifactZip -UseBasicParsing
  Write-Output "Downloaded artifact"
} catch {
  Write-Output "ERROR_DOWNLOADING_ARTIFACT"
  Write-Output $_.Exception.Message
  exit 1
}

# Extract
$extractDir = Join-Path -Path (Get-Location) -ChildPath 'windows-artifacts'
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
Write-Output "Extracting $artifactZip to $extractDir"
try {
  Expand-Archive -Path $artifactZip -DestinationPath $extractDir -Force
  Write-Output "Extracted"
} catch {
  Write-Output "ERROR_EXTRACTING"
  Write-Output $_.Exception.Message
  exit 1
}

# Find the largest exe
$exe = Get-ChildItem -Path $extractDir -Recurse -Filter *.exe | Sort-Object Length -Descending | Select-Object -First 1
if (-not $exe) { Write-Output "NO_EXE_FOUND"; exit 1 }
Write-Output "Found exe: $($exe.FullName)"

# Upload asset
$uploadUrl = $rel.upload_url -replace '\{.*\}$',''
$assetName = [System.Uri]::EscapeDataString($exe.Name)
Write-Output "Uploading asset as $assetName to $uploadUrl"
try {
  Invoke-RestMethod -Uri ($uploadUrl + "?name=$assetName") -Method Post -Headers $headers -InFile $exe.FullName -ContentType 'application/octet-stream'
  Write-Output "UPLOAD_OK"
} catch {
  Write-Output "ERROR_UPLOADING_ASSET"
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $err = $reader.ReadToEnd()
    Write-Output $err
  } else {
    Write-Output $_.Exception.Message
  }
  exit 1
}

# Verify
try {
  $check = Invoke-RestMethod -Uri 'https://api.github.com/repos/TheAnhD/navody/releases/tags/v1.0.0' -Headers $headers
  Write-Output "RELEASE_VERIFIED"
  Write-Output ($check | ConvertTo-Json -Depth 4)
} catch {
  Write-Output "ERROR_VERIFYING_RELEASE"
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output $reader.ReadToEnd()
  } else {
    Write-Output $_.Exception.Message
  }
  exit 1
}