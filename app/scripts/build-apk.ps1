# Builds the release APK to app/dist/steal-eth.apk.
#   powershell -File app/scripts/build-apk.ps1 -JavaHome <JDK 17 or 21>
# Builds from a short folder because React Native's C++ paths overflow Windows' 260-character limit from a long one.
# The signing key lives outside the repo in ~\.sonic-heist. Back that folder up: Android rejects updates signed with any other key.
param(
  [Parameter(Mandatory = $true)][string]$JavaHome,
  [string]$WorkDir = 'F:\a\app',
  [string]$CxxDir = 'F:/c',
  [string]$Architectures = 'arm64-v8a,armeabi-v7a,x86_64'
)
$ErrorActionPreference = 'Stop'
$appDir = Split-Path -Parent $PSScriptRoot

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_NO_TELEMETRY = '1'
$env:CI = '1'

$keyDir = Join-Path $env:USERPROFILE '.sonic-heist'
$keystore = Join-Path $keyDir 'release.keystore'
$passwordFile = Join-Path $keyDir 'keystore-password.txt'
if (-not (Test-Path $keystore)) {
  New-Item -ItemType Directory -Force $keyDir | Out-Null
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $password = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
  Set-Content -Path $passwordFile -Value $password -NoNewline -Encoding ascii
  $env:SONIC_KEY_PASSWORD = $password
  & "$JavaHome\bin\keytool.exe" -genkeypair -keystore $keystore -alias sonic-heist -keyalg RSA -keysize 2048 -validity 10000 `
    -dname 'CN=Sonic Heist' -storepass:env SONIC_KEY_PASSWORD -keypass:env SONIC_KEY_PASSWORD -storetype PKCS12
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the signing key' }
  Write-Output "Created a signing key in $keyDir. Back it up."
}
$env:SONIC_KEYSTORE = $keystore
$env:SONIC_KEY_PASSWORD = (Get-Content -Raw $passwordFile)

# Exclude by full path: packages in node_modules have their own "build" and "android" folders that must be copied.
robocopy $appDir $WorkDir /MIR /NFL /NDL /NJH /NJS /NP /MT:16 /XD "$appDir\android" "$appDir\dist" "$appDir\.expo" | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed with code $LASTEXITCODE" }

Push-Location $WorkDir
try {
  cmd /c "npx --no-install expo prebuild -p android --no-install --clean > `"$WorkDir\prebuild.log`" 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "Prebuild failed. See $WorkDir\prebuild.log" }

  $gradleFile = Join-Path $WorkDir 'android\app\build.gradle'
  $text = [IO.File]::ReadAllText($gradleFile)
  $signing = "signingConfigs {`n        release {`n            storeFile file(System.getenv('SONIC_KEYSTORE'))`n            storePassword System.getenv('SONIC_KEY_PASSWORD')`n            keyAlias 'sonic-heist'`n            keyPassword System.getenv('SONIC_KEY_PASSWORD')`n        }"
  $patched = [regex]::Replace($text, 'signingConfigs \{', $signing, 'None', [TimeSpan]::FromSeconds(5))
  if ($patched -eq $text) { throw 'signingConfigs block not found' }
  # The template signs release builds with the shared debug key.
  $release = [regex]::Match($patched, '(?s)release \{\s*// Caution!.*?signingConfig signingConfigs\.debug')
  if (-not $release.Success) { throw 'release signing line not found' }
  $patched = $patched.Remove($release.Index, $release.Length).Insert($release.Index, ($release.Value -replace 'signingConfigs\.debug$', 'signingConfigs.release'))
  $android = [regex]::Match($patched, '(?m)^android \{\s*$')
  if (-not $android.Success) { throw 'android block not found' }
  $patched = $patched.Insert($android.Index + $android.Length, "`n    externalNativeBuild { cmake { buildStagingDirectory = file('$CxxDir') } }")
  [IO.File]::WriteAllText($gradleFile, $patched)
} finally {
  Pop-Location
}

$gradlew = Join-Path $WorkDir 'android\gradlew.bat'
cmd /c "cd /d `"$WorkDir\android`" && `"$gradlew`" assembleRelease -PreactNativeArchitectures=$Architectures --console=plain --no-daemon > `"$WorkDir\build.log`" 2>&1"
if ($LASTEXITCODE -ne 0) { throw "Build failed. See $WorkDir\build.log" }

New-Item -ItemType Directory -Force (Join-Path $appDir 'dist') | Out-Null
$apk = Join-Path $appDir 'dist\steal-eth.apk'
Copy-Item (Join-Path $WorkDir 'android\app\build\outputs\apk\release\app-release.apk') $apk -Force
Write-Output "Built $apk"
