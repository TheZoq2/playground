import { RunOptions, Tree } from "@yowasp/yosys";

export class Product {
  constructor (file: string[], tab: string, stateUpdater: React.Dispatch<React.SetStateAction<string | null>>) {
    this.file = file
    this.tab = tab
    this.stateUpdater = stateUpdater
  }
  file: string[];
  tab: string;
  stateUpdater: React.Dispatch<React.SetStateAction<string | null>>
}

type Runner = (args: string[], files: Tree, options: RunOptions) => Tree | Promise<Tree>

export class Command {
  constructor(runner: Runner, args: string[], produces: Product | null) {
    this.runner = runner
    this.args = args
    this.produces = produces
  }
  runner: Runner
  args: string[]
  produces: Product | null
}
