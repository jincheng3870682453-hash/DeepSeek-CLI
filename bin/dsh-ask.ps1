# dsh-ask - one-shot question to the DSH headless profile
$ErrorActionPreference = "Stop"
if ($args.Count -eq 0 -and -not $MyInvocation.ExpectingInput) {
    Write-Host "Usage: dsh-ask <question...>"
    Write-Host "Example: dsh-ask write a python bubble sort"
    exit 1
}
$q = ($args -join " ")
if ($MyInvocation.ExpectingInput) {
    $extra = ($input | Out-String).Trim()
    if ($extra -ne "") { $q = if ($q) { "$q`n$extra" } else { $extra } }
}
if ($q -eq "") {
    Write-Host "Usage: dsh-ask <question...>"
    exit 1
}
dsh --profile headless $q
exit $LASTEXITCODE
