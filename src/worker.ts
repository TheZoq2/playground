import { runYosys, Tree, Exit as YosysExit } from '@yowasp/yosys';
import { runSpade, } from '@spade-lang/spade'
import { runSwim, runSwimPrepare } from '@spade-lang/swim'

import { HostToWorkerMessage, WorkerToHostMessage } from './proto';
import { Runner } from './command';
import { getFileInTree } from './sim/util';

function postMessage(data: WorkerToHostMessage, transfer?: Transferable[]) {
  console.log('[Worker] Sending', data);
  self.postMessage(data, { transfer });
}

self.onerror = (event) => {
  self.postMessage({ type: "commandFailure", message: '[Worker] Failure', event })
  console.error('[Worker] Failure', event);
};

class PrepareCache {
  swim_toml: string = null
  value: Tree = null
}
const prepareCache = new PrepareCache()


self.onmessage = async (event: MessageEvent<HostToWorkerMessage>) => {
  switch (event.data.type) {
    case "loadPackages":
      console.log("Load packages is currently a no-op")
      break;
    case "runCommand":
      const runOptions = {
        stdout: (bytes: Uint8Array) => {
          self.postMessage({ type: "stdoutWrite", text: bytes })
        },
        stderr: (bytes: Uint8Array) => {
          self.postMessage({ type: "stderrWrite", text: bytes })
        }
      }

      async function run(runner: Runner, args: string[], files: Tree) {
        let out: Tree;
        try {
          out = await runner(args, files, runOptions)
        } catch (e) {
          self.postMessage({ type: 'commandFailure', error: e })
        }
        self.postMessage({ type: "commandDone", tree: out })
      }

      switch (event.data.name) {
        case "swimPrepare":
          const files = event.data.files;
          const args = event.data.args;
          const cachedSwimToml = getFileInTree(files, ["swim.toml"])
          let out: Tree;
          if (cachedSwimToml !== prepareCache.swim_toml || prepareCache.swim_toml === null) {
            try {
              out = await runSwimPrepare(args, files, runOptions)
            } catch (e) {
              self.postMessage({ type: 'commandFailure', error: e })
            }
          } else {
            self.postMessage({
              type: "stdoutWrite",
              text: "swim.toml is unchanged using cached dependencies\n"
            });
            out = prepareCache.value
          }
          prepareCache.swim_toml = cachedSwimToml;
          prepareCache.value = out
          self.postMessage({ type: "commandDone", tree: out })
          break;
        case "swim":
          run(runSwim, event.data.args, event.data.files)
          break;
        case "spade":
          run(runSpade, event.data.args, event.data.files)
          break;
        default:
          self.postMessage({ type: 'commandFailure', error: `${event.data.name} is not a command` })
          break;
      }
      break;
  }
}
