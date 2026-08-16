# deepseek - launch the DeepSeek CLI chat (dsh cli profile)
$ErrorActionPreference = "Stop"
if ($MyInvocation.ExpectingInput) {
    $input | dsh --profile cli @args
} else {
    dsh --profile cli @args
}
exit $LASTEXITCODE
