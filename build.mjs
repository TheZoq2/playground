import * as process from 'node:process';
import * as child_process from 'node:child_process';
import * as esbuild from 'esbuild';
import metaUrlPlugin from '@chialab/esbuild-plugin-meta-url';

import * as path from 'path'
import * as fs from 'fs'

const gitCommit = child_process.execSync('git rev-parse HEAD', { encoding: 'utf-8' }).replace(/\n$/, '');

let wasmPlugin = {
  name: 'wasm',
  setup(build) {
    // Resolve ".wasm" files to a path with a namespace
    build.onResolve({ filter: /\.wasm$/ }, args => {
      if (args.resolveDir === '') {
        return // Ignore unresolvable paths
      }
      return {
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
          namespace: 'wasm-binary',
      }
    })

    // Virtual modules in the "wasm-binary" namespace contain the
    // actual bytes of the WebAssembly file. This uses esbuild's
    // built-in "binary" loader instead of manually embedding the
    // binary data inside JavaScript code ourselves.
    build.onLoad({ filter: /.*/, namespace: 'wasm-binary' }, async (args) => ({
      contents: await fs.promises.readFile(args.path),
      loader: 'binary',
    }))
  },
}

const mode = (process.argv[2] ?? 'build');
const options = {
    logLevel: 'info',
    plugins: [metaUrlPlugin(), wasmPlugin],
    bundle: true,
    loader: {
        '.html': 'copy',
        '.svg': 'dataurl',
        '.ttf': 'file',
        '.woff': 'file',
        '.woff2': 'file',
        '.json': 'file',
        '.zip': 'file',
    },
    external: [
        'fs/promises', // @yowasp/yosys
    ],
    define: {
        'globalThis.GIT_COMMIT': `"${mode === 'minify' ? gitCommit : 'HEAD'}"`,
        'globalThis.IS_PRODUCTION': (mode === 'minify' ? 'true' : 'false'),
    },
    target: 'es2021',
    format: 'esm',
    sourcemap: 'linked',
    minify: (mode === 'minify'),
    outdir: 'dist',
    entryPoints: {
        'index': './src/index.html',
        'app': './src/app.tsx',
        'app.worker': './src/worker.ts',
        'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
    },
};

if (mode === 'build' || mode === 'minify') {
    await esbuild.build(options);
} else if (mode === 'watch') {
    const context = await esbuild.context(options);
    await context.watch();
} else if (mode === 'serve') {
    const context = await esbuild.context(options);
    await context.rebuild();
    await context.watch();
    // Specifying `servedir` is necessary for files built by meta URL plugin to be accessible.
    await context.serve({ servedir: 'dist' });
} else {
    console.error(`Usage: ${process.argv0} [build|watch|serve|minify]`);
}
