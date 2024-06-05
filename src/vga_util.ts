import { HDLModuleWASM } from "./sim/hdlwasm";

export function waitFor(mod: HDLModuleWASM, condition: () => boolean, timeout = 10000) {
  let counter = 0;
  while (!condition() && counter < timeout) {
    mod.tick2(1);
    counter++;
  }
}

export class VgaSignals {
  hsync: boolean
  vsync: boolean
  r: number
  g: number
  b: number
}

export function getVGASignals(mod: HDLModuleWASM): VgaSignals {
  return {
    hsync: mod.state.hsync == 1,
    vsync: mod.state.vsync == 1,
    r: mod.state.r,
    g: mod.state.g,
    b: mod.state.b,
  }
}
