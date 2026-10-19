$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root  = 'C:\Users\Gu mo\Documents\deepseek-harness\default-workspace\skyrunner-3d'
$ghExe = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe'
$tok   = (& $ghExe auth token).Trim()
$H     = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'dsh-agent' }
$owner = '13shisan53'
$repo  = 'skyrunner-3d'

function PostJson([string]$uri, $obj, [int]$depth = 6) {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $H -ContentType 'application/json' `
        -Body ($obj | ConvertTo-Json -Depth $depth -Compress) -TimeoutSec 120
}

Write-Output '--- 1. repository ---'
try {
    $r = PostJson 'https://api.github.com/user/repos' @{
        name        = $repo
        private     = $false
        description = 'SKYRUNNER — a 3D platformer that runs in the browser'
        auto_init   = $false
    }
    Write-Output "created: $($r.full_name)"
} catch {
    Write-Output "create response: $($_.Exception.Message)"
}

Write-Output '--- 1b. initialise empty repo (git data API needs a commit) ---'
$parentSha = $null
try {
    $initB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("`n"))
    $init = Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$owner/$repo/contents/.nojekyll" `
        -Headers $H -ContentType 'application/json' `
        -Body (@{ message = 'chore: initialise'; content = $initB64 } | ConvertTo-Json -Compress) -TimeoutSec 60
    $parentSha = $init.commit.sha
    Write-Output "initialised: $parentSha"
} catch {
    Write-Output "init: $($_.Exception.Message)"
    try {
        $refNow = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/git/ref/heads/main" -Headers $H -TimeoutSec 30
        $parentSha = $refNow.object.sha
        Write-Output "existing head: $parentSha"
    } catch { Write-Output "no head: $($_.Exception.Message)" }
}

Write-Output '--- 2. blobs ---'
$files = Get-ChildItem -Recurse -File $root | Where-Object { $_.FullName -notmatch '\\\.git\\' }
$entries = @()
foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
    $blob = PostJson "https://api.github.com/repos/$owner/$repo/git/blobs" @{ content = $b64; encoding = 'base64' }
    $entries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha }
    Write-Output ("  {0,-48} {1}" -f $rel, $blob.sha.Substring(0, 10))
}

Write-Output '--- 3. tree ---'
$tree = PostJson "https://api.github.com/repos/$owner/$repo/git/trees" @{ tree = $entries } 8
Write-Output "tree: $($tree.sha)"

Write-Output '--- 4. commit ---'
$parents = @()
if ($parentSha) { $parents += $parentSha }
$commit = PostJson "https://api.github.com/repos/$owner/$repo/git/commits" @{
    message = 'feat: SKYRUNNER — 3D platformer with momentum movement, coyote time and bloom'
    tree    = $tree.sha
    parents = $parents
}
Write-Output "commit: $($commit.sha)"

Write-Output '--- 5. branch ---'
try {
    $ref = PostJson "https://api.github.com/repos/$owner/$repo/git/refs" @{ ref = 'refs/heads/main'; sha = $commit.sha }
    Write-Output "ref: $($ref.ref)"
} catch {
    Write-Output "ref create failed: $($_.Exception.Message)"
    $u = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$repo/git/refs/heads/main" `
        -Headers $H -ContentType 'application/json' -Body (@{ sha = $commit.sha; force = $true } | ConvertTo-Json)
    Write-Output "ref forced: $($u.ref)"
}

Write-Output '--- 6. pages ---'
try {
    $p = PostJson "https://api.github.com/repos/$owner/$repo/pages" @{
        source = @{ branch = 'main'; path = '/' }
    }
    Write-Output "pages: $($p.html_url)"
} catch {
    Write-Output "pages: $($_.Exception.Message)"
    try {
        $p2 = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/pages/builds" -Headers $H -TimeoutSec 30
        Write-Output "requested build: $($p2.status)"
    } catch { Write-Output "build request: $($_.Exception.Message)" }
}

Write-Output '--- done ---'
