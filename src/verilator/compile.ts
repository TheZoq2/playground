import { VerilogXMLParser } from '../sim/vxmlparser';
import { ErrorParser, IErrorMessage } from './ErrorParser';
import verilator_bin from './verilator_bin';
import verilator_wasm from './verilator_bin.wasm?url';

const verilator_wasm_bin = await fetch(verilator_wasm).then((res) => res.arrayBuffer());

export interface ICompileOptions {
  topModule: string;
  sources: Record<string, string>;
}

export async function compileVerilator(opts: ICompileOptions, onStdout: (s: string) => void) {
  const verilatorInst = verilator_bin({
    wasmBinary: verilator_wasm_bin,
    noInitialRun: true,
    noExitRuntime: true,
    print: console.log,
    printErr: onStdout,
  });
  await verilatorInst.ready;
  const { FS } = verilatorInst;

  let sourceList: string[] = [];
  FS.mkdir('src');
  for (const [name, source] of Object.entries(opts.sources)) {
    console.log(`Creating src/${name}`)
    const path = `src/${name}`;
    sourceList.push(path);
    FS.writeFile(path, source);
  }
  const xmlPath = `obj_dir/V${opts.topModule}.xml`;
  try {
    const args = [
      '--cc',
      '-O3',
      '-Wall',
      '-Wno-EOFNEWLINE',
      '-Wno-DECLFILENAME',
      '--x-assign',
      'fast',
      '--debug-check', // for XML output
      '-Isrc/',
      '--top-module',
      opts.topModule,
      ...sourceList,
    ];
    console.log("Starting verilator")
    verilatorInst.callMain(args);
  } catch (e) {
    console.log(e);
  }

  console.log("Verilator done");
  const xmlParser = new VerilogXMLParser();
  try {
    const xmlContent = FS.readFile(xmlPath, { encoding: 'utf8' });
    xmlParser.parse(xmlContent);
  } catch (e) {
    console.log(e, e.stack);
  }
  return {
    output: xmlParser,
  };
}
