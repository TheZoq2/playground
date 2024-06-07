import { Tree } from "@spade-lang/spade";

export interface LoadPackagesMessage {
  type: 'loadPackages',
  pkgs: string[]
}

export interface RunCommand {
  type: 'runCommand';
  name: string;
  args: string[];
  files: Tree
}

export type HostToWorkerMessage =
| LoadPackagesMessage
| RunCommand;

export interface StdoutWriteMessage {
  type: 'stdoutWrite',
  text: Uint8Array
}

export interface StderrWriteMessage {
  type: 'stderrWrite',
  text: Uint8Array
}

export interface CommandDoneMessage {
  type: 'commandDone',
  tree: Tree,
}
export interface CommandFailureMessage {
  type: 'commandFailure'
  message: string,
}


export type WorkerToHostMessage =
| StdoutWriteMessage
| StderrWriteMessage
| CommandDoneMessage
| CommandFailureMessage
