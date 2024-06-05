import { RunOptions, Tree } from "@yowasp/yosys";
import { compileVerilator } from "./verilator/compile";
import { getFileInTree } from "./sim/util";

export async function runVerilator(args: string[], files: Tree, options: RunOptions): Promise<Tree> {
  const buildDir = files["build"] as Tree
  const spade_sv = getFileInTree(files, ["build", "spade.sv"])

  if (buildDir != null) {
    await compileVerilator({ topModule: "top", sources: { "spade.sv": spade_sv } }, (message) => {
      const enc = new TextEncoder();
      options.stdout(enc.encode(message))
      options.stdout(enc.encode("\n"))
    })
  }
  return files
}
