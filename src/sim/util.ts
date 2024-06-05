import { Tree } from "@yowasp/yosys";

export function byteArrayToString(data: number[] | Uint8Array): string {
  let str = '';
  if (data != null) {
    const charLUT = new Array();
    for (let i = 0; i < 256; ++i) {
      charLUT[i] = String.fromCharCode(i);
    }
    const len = data.length;
    for (let i = 0; i < len; i++) {
      str += charLUT[data[i]];
    }
  }
  return str;
}

// only does primitives, 1D arrays and no recursion
export function safeExtend(deep, dest, src) {
  // TODO: deep ignored
  for (const key in src) {
    const val = src[key];
    const type = typeof val;
    if (val === null || type == 'undefined') {
      dest[key] = val;
    } else if (type == 'function') {
      // ignore function
    } else if (type == 'object') {
      if (val['slice']) {
        // array?
        dest[key] = val.slice();
      } else {
        // ignore object
      }
    } else {
      dest[key] = val;
    }
  }
  return dest;
}


export function getFileInTree(tree: Tree, file: string[]) : string  {
  if (file.length == 0) {
    throw Error("Failed to get file with no path")
  } else if (file.length == 1) {
    const f = tree[file[0]] as string
    if (f !== null) {
      return f
    } else {
      throw Error(`Failed to get file ${file}, expected string but got ${typeof file}`)
    }
  } else {
    const t = tree[file[0]] as Tree
    if (t !== null) {
      return getFileInTree(t, file.slice(1))
    } else {
      throw Error(`Failed to get file ${file}, expected dir but got ${typeof file}`)
    }
  }
}

