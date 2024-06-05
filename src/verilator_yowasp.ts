import { RunOptions, Tree } from "@yowasp/yosys";
import { compileVerilator } from "./verilator/compile";
import { getFileInTree } from "./sim/util";
import { VerilogXMLParser } from "./sim/vxmlparser";

export async function runVerilator(args: string[], files: Tree, options: RunOptions): Promise<{output: VerilogXMLParser}> {
  const buildDir = files["build"] as Tree
  const spade_sv = getFileInTree(files, ["build", "spade.sv"])

  if (buildDir != null) {
    return await compileVerilator({ topModule: "top", sources: { "spade.sv": spade_sv } }, (message) => {
      const enc = new TextEncoder();
      options.stdout(enc.encode(message))
      options.stdout(enc.encode("\n"))
    })
  } else {
    throw Error("Did not find build/spade.sv") 
  }
}
