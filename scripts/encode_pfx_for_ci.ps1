<#
Script: encode_pfx_for_ci.ps1
Purpose: Base64-encode a PFX and print helpful commands to put it into GitHub Secrets as CSC_LINK.
Usage:
  .\scripts\encode_pfx_for_ci.ps1 -PfxPath "C:\path\to\code-sign.pfx" -Password (ConvertTo-SecureString 'pfxPassword' -AsPlainText -Force)

Notes:
- Do NOT paste the resulting base64 value into chat. Instead copy it into the GitHub repository secret named CSC_LINK.
- Set CSC_KEY_PASSWORD to the PFX password value (also stored as a secret).
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$PfxPath,
  [Parameter(Mandatory=$false)]
  [System.Security.SecureString]$Password
)

if (-not (Test-Path $PfxPath)) {
  Write-Error "PFX file not found: $PfxPath"
  exit 1
}

try {
  $bytes = [System.IO.File]::ReadAllBytes($PfxPath)
  $b64 = [System.Convert]::ToBase64String($bytes)
  Write-Output "Base64-encoded PFX (truncated output below). DO NOT paste this into chat."
  Write-Output ("First 200 chars: {0}" -f $b64.Substring(0,[Math]::Min(200,$b64.Length)))
  Write-Output ("Length: {0} characters" -f $b64.Length)
  Write-Output "`n--- Copy the full base64 string (use Out-File or Set-Clipboard) and add it to GitHub repository secret 'CSC_LINK'.`n"

  Write-Output "Recommended steps to add the secret:"
  Write-Output "  1) In the GitHub web UI: Repository → Settings → Secrets and variables → Actions → New repository secret"
  Write-Output "     - Name: CSC_LINK"
  Write-Output "     - Value: <paste the full base64 string from pfx-base64.txt>"
  Write-Output "  2) Set CSC_KEY_PASSWORD to the PFX password (or empty string if none)."
  Write-Output "If you prefer the CLI, write the base64 to a file and use your gh client to paste it into the secret."

  if ($null -ne $Password) {
    Write-Output "You provided a password (SecureString); remember to set CSC_KEY_PASSWORD secret to the corresponding plaintext password."
  } else {
    Write-Output "If your PFX is password-protected, set CSC_KEY_PASSWORD secret to the password. If it has no password, set CSC_KEY_PASSWORD to an empty string."
  }

  # Save the base64 to a local file if user wants
  $out = Join-Path -Path (Get-Location) -ChildPath 'pfx-base64.txt'
  [System.IO.File]::WriteAllText($out,$b64)
  Write-Output "Wrote full base64 to: $out (safe to delete afterwards)"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
