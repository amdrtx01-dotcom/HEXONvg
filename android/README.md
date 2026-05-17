# HEXON BETA — Android wrapper

Tiny WebView shell that loads the `index.html` from this repo and runs it
as a stand-alone Android app.

* Package id: `com.hexon.beta`
* `minSdkVersion` 21 (Android **5.0**)
* `targetSdkVersion` 34 (runs on Android **15** with no changes)
* Single `MainActivity` with a `WebView` pointed at
  `file:///android_asset/web/index.html`
* All game features keep working: `localStorage`, `clipboard`, `vibrate`,
  drag-and-drop, audio (`AudioContext`), i18n, device picker.

## Build

Prerequisites:

* Java 17 (`javac` on `$PATH`)
* Android SDK with `build-tools;34.0.0` and `platforms;android-34`
  (`$ANDROID_SDK_ROOT` must point at it)

Then:

```bash
# from the repo root
cp -r index.html scripts styles android/assets/web/   # bundle the game
cd android
./build_apk.sh
```

The signed-with-debug-key APK lands at:

```
android/build/HEXON-debug.apk
```

## Install on a device

```bash
adb install -r android/build/HEXON-debug.apk
```

Or copy the APK to the phone and tap to install (requires
"Install unknown apps" for whatever file manager opens it).

## How it works

`MainActivity` enables `JavaScript`, `DomStorage`, cookies, and points
the WebView at the bundled asset. External `http(s)://` clicks open in
the system browser; `file://` and `about:` stay inside the WebView.

There is **no Gradle / AGP** here — the build is done with raw
`aapt2 → javac → d8 → zipalign → apksigner`, so anything that ships
those tools (Android SDK 30+) can build it.
