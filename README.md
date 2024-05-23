# Amaranth Playground

This repository contains the source code for the Spade Playground. It is a lightly modified version of the [amaranth playground][]

[amaranth playground]: https://amaranth-lang.org/play/

## Development

Requires [Node.js](https://nodejs.org/) and [npm](https://npmjs.org/), and `wasm-pack`. Install them and run:

```console
(cd spade/spade-compiler && wasmpack build --target web)
npm install
npm run serve
```

This will start a local server at http://localhost:8000/ (or a subsequent port if this one is in use). Any modifications to the source will cause the application to be reloaded with the modifications applied.

If you are using Visual Studio Code, you can also use <kbd>Shift</kbd>+<kbd>Ctrl</kbd>+<kbd>B</kbd> instead.


## License

This application is released under the [two-clause BSD license](LICENSE.txt).
