# dsh-chat - start the DSH interactive CLI chat (cli profile)
$ErrorActionPreference = "Stop"
if ($MyInvocation.ExpectingInput) {
    $input | dsh --profile cli @args
} else {
    dsh --profile cli @args
}
exit $LASTEXITCODE
