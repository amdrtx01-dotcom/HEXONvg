#!/usr/bin/env bash
# -------------------------------------------------------------------------
# Build the HEXON BETA APK for the WebView wrapper without Gradle.
#
# Requires:
#   ANDROID_SDK_ROOT pointing at a directory containing
#     build-tools/<v>/ (aapt2, d8, zipalign, apksigner)
#     platforms/android-34/android.jar
#   JAVA_HOME with javac >= 11 (Java 17 is fine).
#
# The output APK lands at android/build/HEXON.apk and is signed with
# a local keystore (regenerated if missing). The build still uses the
# debug signing config; rename of the artifact is purely cosmetic.
# -------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

: "${ANDROID_SDK_ROOT:?ANDROID_SDK_ROOT must be set}"
BUILD_TOOLS_VER="${BUILD_TOOLS_VER:-34.0.0}"
PLATFORM_VER="${PLATFORM_VER:-android-34}"

BT="$ANDROID_SDK_ROOT/build-tools/$BUILD_TOOLS_VER"
ANDROID_JAR="$ANDROID_SDK_ROOT/platforms/$PLATFORM_VER/android.jar"

AAPT2="$BT/aapt2"
D8="$BT/d8"
ZIPALIGN="$BT/zipalign"
APKSIGNER="$BT/apksigner"

for tool in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER"; do
    [[ -x "$tool" ]] || { echo "missing tool: $tool" >&2; exit 1; }
done
[[ -f "$ANDROID_JAR" ]] || { echo "missing $ANDROID_JAR" >&2; exit 1; }

OUT="$HERE/build"
rm -rf "$OUT"
mkdir -p "$OUT/compiled-res" "$OUT/classes" "$OUT/dex" "$OUT/gen"

# ------------------------------------------------------- 0. sync web assets
# The WebView wrapper loads file:///android_asset/web/index.html. Mirror the
# repo-root web bundle into android/assets/web/ on every build so the APK
# always reflects the latest scripts/styles/index.html.
REPO_ROOT="$(cd "$HERE/.." && pwd)"
WEB_DST="$HERE/assets/web"
rm -rf "$WEB_DST"
mkdir -p "$WEB_DST"
cp    "$REPO_ROOT/index.html" "$WEB_DST/"
cp -r "$REPO_ROOT/scripts"    "$WEB_DST/"
cp -r "$REPO_ROOT/styles"     "$WEB_DST/"
# Anything else the page needs at runtime (images, fonts, manifest) gets
# mirrored too if present at the repo root.
for extra in icons fonts assets img images manifest.json favicon.ico; do
    if [[ -e "$REPO_ROOT/$extra" ]]; then cp -r "$REPO_ROOT/$extra" "$WEB_DST/"; fi
done
echo "synced web assets ->" "$WEB_DST"

# ---------------------------------------------------------------- 1. resources
# Compile every resource file independently.
RES_FILES=$(find res -type f \( -name '*.xml' -o -name '*.png' -o -name '*.jpg' -o -name '*.webp' \))
"$AAPT2" compile -o "$OUT/compiled-res" $RES_FILES

# Link them into an APK skeleton + generate R.java.
"$AAPT2" link \
    -o "$OUT/base.apk" \
    -I "$ANDROID_JAR" \
    --manifest AndroidManifest.xml \
    --java "$OUT/gen" \
    --min-sdk-version 21 \
    --target-sdk-version 34 \
    --version-code 1 \
    --version-name "BETA" \
    -A assets \
    --auto-add-overlay \
    $(find "$OUT/compiled-res" -name '*.flat' -printf '%p ')

# ---------------------------------------------------------------- 2. java
SRC_FILES=$(find src -name '*.java')
GEN_FILES=$(find "$OUT/gen" -name '*.java')

javac \
    -source 1.8 -target 1.8 \
    -bootclasspath "$ANDROID_JAR" \
    -d "$OUT/classes" \
    -encoding UTF-8 \
    -Xlint:-options \
    $SRC_FILES $GEN_FILES

# ---------------------------------------------------------------- 3. dex
CLASS_FILES=$(find "$OUT/classes" -name '*.class')
"$D8" \
    --lib "$ANDROID_JAR" \
    --min-api 21 \
    --output "$OUT/dex" \
    $CLASS_FILES

# ---------------------------------------------------------------- 4. add dex + assets to APK
cp "$OUT/base.apk" "$OUT/unaligned.apk"
( cd "$OUT/dex"  && zip -q -u "$OUT/unaligned.apk" classes.dex )

# ---------------------------------------------------------------- 5. align + sign
"$ZIPALIGN" -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"

KEYSTORE="$HERE/debug.keystore"
if [[ ! -f "$KEYSTORE" ]]; then
    keytool -genkeypair -v \
        -keystore "$KEYSTORE" \
        -storepass android -keypass android \
        -alias androiddebugkey \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=HEXON Debug, OU=Dev, O=HEXON, L=NA, ST=NA, C=NA"
fi

"$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --key-pass  pass:android \
    --ks-key-alias androiddebugkey \
    --v1-signing-enabled true \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    --min-sdk-version 21 \
    --out "$OUT/HEXON.apk" \
    "$OUT/aligned.apk"

"$APKSIGNER" verify --print-certs "$OUT/HEXON.apk" >/dev/null
echo
echo "OK  -> $OUT/HEXON.apk"
ls -la "$OUT/HEXON.apk"
