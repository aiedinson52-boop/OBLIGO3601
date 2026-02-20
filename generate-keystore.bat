@echo off
echo Generating keystore for Obligo360...
keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -storepass obligo360release -keypass obligo360release -alias obligo360-key -keystore "%~dp0android\app\obligo360-release.jks" -dname "CN=Obligo360, OU=Development, O=Obligo360, L=Bogota, ST=Cundinamarca, C=CO"
echo.
echo Done! Keystore generated at android\app\obligo360-release.jks
pause
