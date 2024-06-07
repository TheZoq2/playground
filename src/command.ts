import { RunOptions, Tree } from "@yowasp/yosys";
import { HostToWorkerMessage, WorkerToHostMessage } from "./proto";

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

export type Runner = (args: string[], files: Tree, options: RunOptions) => Promise<Tree> | Tree

export class Command {
  constructor(
    name: string,
    runner: Runner,
    args: string[],
    produces: Product | null,
  ) {
    this.name = name
    this.runner = runner
    this.args = args
    this.produces = produces
  }
  public name: string
  public runner: Runner
  public args: string[]
  public produces: Product | null
  public continuation: Command[]
}

type Result<T> = {type: "ok", data: T} | {type: "err", message: string}

const worker = new Worker("app.worker.js", {type: "module"})

export function asyncRunner(commandName: string) : Runner {
  return async (args: string[], files: Tree, options: RunOptions) => {
    const promise: Promise<Result<Tree>> = new Promise(function(resolve) {
      worker.postMessage({type: "runCommand", name: commandName, args: args, files: files})

      worker.onmessage = function(event: MessageEvent<WorkerToHostMessage>) {
        switch (event.data.type) {
          case "stdoutWrite":
            options.stdout(event.data.text)
            break
          case "stderrWrite":
            options.stderr(event.data.text)
            break
          case "commandDone":
            resolve({type: "ok", data: event.data.tree})
            break
          case "commandFailure":
            resolve({type: "err", message: event.data.message})
            break
        }
      };
    })

    const result = await promise;
    switch (result.type) {
      case "ok":
        console.log(`Command finished with result ${result}`)
        return result.data;
      case "err":
        throw Error(result.message);
    }
  }
}
