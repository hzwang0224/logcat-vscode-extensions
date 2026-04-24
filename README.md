# Logcat

Android Logcat viewer for VSCode. Stream and filter real-time device logs via ADB.

## Build

Install dependencies:

```bash
npm install
```

Compile the extension:

```bash
npm run compile
```

Package the extension into a VSIX:

```bash
npx @vscode/vsce package --allow-missing-repository --skip-license
```

Run TypeScript in watch mode during development. This keeps recompiling automatically when source files change:

```bash
npm run watch
```
