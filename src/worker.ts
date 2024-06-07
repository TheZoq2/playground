import { runYosys, Tree, Exit as YosysExit } from '@yowasp/yosys';
import { runSpade, } from '@spade-lang/spade'
import { runSwim, runSwimPrepare } from '@spade-lang/swim'

import { HostToWorkerMessage, WorkerToHostMessage } from './proto';
import { Runner } from './command';

function postMessage(data: WorkerToHostMessage, transfer?: Transferable[]) {
  console.log('[Worker] Sending', data);
  self.postMessage(data, { transfer });
}

self.onerror = (event) => {
  self.postMessage({type: "commandFailure", message: '[Worker] Failure', event})
  console.error('[Worker] Failure', event);
};


self.onmessage = async (event: MessageEvent<HostToWorkerMessage>) => {
  switch (event.data.type) {
    case "loadPackages":
      console.log("Load packages is currently a no-op")
      break;
    case "runCommand":
      const runOptions = {
        stdout: (bytes: Uint8Array) => {
          self.postMessage({type: "stdoutWrite", text: bytes})
        },
        stderr: (bytes: Uint8Array) => {
          self.postMessage({type: "stderrWrite", text: bytes})
        }
      }

      async function run(runner: Runner, args: string[], files: Tree) {
        let out: Tree;
        try {
          out = await runner(args, files, runOptions)
        } catch (e) {
          self.postMessage({type: 'commandFailure', error: e})
        }
        self.postMessage({type: "commandDone", tree: out})
      }

      switch (event.data.name) {
        case "swimPrepare":
          run(runSwimPrepare, event.data.args, event.data.files)
          break;
        case "swim":
          run(runSwim, event.data.args, event.data.files)
          break;
        case "spade":
          run(runSpade, event.data.args, event.data.files)
          break;
        default:
          self.postMessage({type: 'commandFailure', error: `${event.data.name} is not a command`})
          break;
      }
      break;
  }
}
