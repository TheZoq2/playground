import { runYosys, Exit as YosysExit } from '@yowasp/yosys';

import { HostToWorkerMessage, WorkerToHostMessage } from './proto';

function postMessage(data: WorkerToHostMessage, transfer?: Transferable[]) {
  console.log('[Worker] Sending', data);
  self.postMessage(data, { transfer });
}


// Start preloading Yosys.
const yosysPromise = (runYosys() as unknown as Promise<void>).then(() => {
  console.log('[Worker] Preloaded Yosys');
});


self.onerror = (event) => {
  console.error('[Worker] Failure', event);
};
