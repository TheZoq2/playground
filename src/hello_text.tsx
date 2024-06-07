import Box from "@mui/joy/Box";
import Link from "@mui/joy/Link";
import React from "react";

export function helloText() {
  return <Box sx={{ padding: 2, maxWidth: '80em' }}>
    <p>
      Hi 👋
    </p>
    <p>
      This is a playground for the <Link href="https://spade-lang.org">Spade programming language</Link>. You can write code in the editor on the left, then click <code>Simulate</code> to compile and run it right here in the browser.
      The page simulates a VGA or HDMI monitor, so any code you write here can later be uploaded to an FPGA to show the same output on a real monitor.
    </p>

    <p>
      To get started with the Spade language, there is some (rudimentary) documentation at <Link href="https://docs.spade-lang.org/">{"https://docs.spade-lang.org/"}</Link>. If you get stuck, feel free to reach out on <Link href="https://matrix.to/#/!hGcAXtiOzeTkdWrTEa:matrix.org?via=matrix.org&via=t2bot.io&via=envs.net">Matrix</Link> <Link href="https://discord.gg/YtXbeamxEX">Discord</Link>
    </p>

    <p>
      The code for this playground is heavily based on the <Link href="https://amaranth-lang.org/play/">amaranth playground</Link>, and the Spade web assembly support is made possible by <Link href="http://yowasp.org/">YoWASP</Link>.

      The source code for this playground is available on <Link href="https://gitlab.com/spade-lang/playground">gitlab</Link> and source code of the original amaranth playground is is 
      <Link href="https://github.com/amaranth-lang/playground">available on GitHub</Link>.
    </p>
  </Box>

}
