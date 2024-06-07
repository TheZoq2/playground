import { createRoot } from 'react-dom/client';

import * as React from 'react';
import Ansi from "@curvenote/ansi-to-react"

import { useState, useEffect, useRef, useLayoutEffect } from 'react';

import { CssVarsProvider, useColorScheme } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import '@fontsource/inter/latin-400';

import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import IconButton from '@mui/joy/IconButton';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import Link from '@mui/joy/Link';
import Snackbar from '@mui/joy/Snackbar';
import Alert from '@mui/joy/Alert';
import Tabs from '@mui/joy/Tabs';
import TabList from '@mui/joy/TabList';
import Tab from '@mui/joy/Tab';
import TabPanel from '@mui/joy/TabPanel';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShareIcon from '@mui/icons-material/Share';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark'

import { runSpade, } from '@spade-lang/spade'
import { runSwim, runSwimPrepare } from '@spade-lang/swim'
import { RunOptions, Tree, runYosys, } from '@yowasp/yosys'
import { runNextpnrEcp5, runEcppack } from '@yowasp/nextpnr-ecp5'
import { runOpenFPGALoader } from 'https://cdn.jsdelivr.net/npm/@yowasp/openfpgaloader/gen/bundle.js'

import * as monaco from 'monaco-editor';
import { EditorState, Editor } from './monaco';
import { Viewer as WaveformViewer } from './d3wave';
import data from './config';

import './app.css';
import { ecpix5_lpf } from './ulx3s_lpf';
import { Command, Product, asyncRunner } from './command';
import { runVerilator } from './verilator_yowasp';
import { getFileInTree } from './sim/util';
import { HDLModuleWASM } from './sim/hdlwasm';
import { getVGASignals, waitFor } from './vga_util';
import { terminal } from './terminal';

function stealHashQuery() {
  const { hash } = window.location;
  if (hash !== '') {
    history.replaceState(null, '', ' '); // remove #... from URL entirely
    const hashQuery = decodeURIComponent(hash).substring(1);
    try {
      return JSON.parse(hashQuery);
    } catch { }
  }
}

interface TerminalChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}


function TerminalOutput(key: string, output: TerminalChunk[]) {
  return output.map((chunk, index) =>
    <span key={`${key}-${index}`} className={`terminal-${chunk.stream}`}>{chunk.text}</span>);
}

function handleIostream(s: Uint8Array | string | null, setter: React.Dispatch<React.SetStateAction<string | null>>) {
  let decoder = new TextDecoder()
  if (s != null) {
    if (typeof s === "string") {
      setter((prev) => prev === null ? s : prev + s)
    }
    else {
      let newNow = decoder.decode(s, { stream: true })
      setter((prev) => prev === null ? newNow : prev + newNow)
    }
  }
}

function AppContent() {
  const { mode, setMode } = useColorScheme();
  useEffect(() => monaco.editor.setTheme(mode === 'light' ? 'vs' : 'vs-dark'), [mode]);

  const query: { av?: string, s?: string } | undefined = stealHashQuery();
  const [running, setRunning] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [runningPnr, setRunningPnr] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(localStorage.getItem('amaranth-playground.tutorialDone') !== null);
  useEffect(() => tutorialDone ? localStorage.setItem('amaranth-playground.tutorialDone', '') : void 0, [tutorialDone]);
  const [activeLeftTab, setActiveLeftTab] = useState('amaranth-source');
  const [activeRightTab, setActiveRightTab] = useState('tutorial');
  const [sourceEditorState, setSourceEditorState] = useState(new EditorState(
    query?.s
    ?? localStorage.getItem('amaranth-playground.source')
    ?? data.demoCode));
  useEffect(() => localStorage.setItem('amaranth-playground.source', sourceEditorState.text), [sourceEditorState]);

  const [tomlEditorState, setTomlEditorState] = useState(new EditorState(
    query?.s
    ?? localStorage.getItem('amaranth-playground.toml')
    ?? data.demoToml));
  useEffect(() => localStorage.setItem('amaranth-playground.toml', tomlEditorState.text), [tomlEditorState]);

  const canvasRef = useRef<HTMLCanvasElement>();

  const [swimPrepareCache, setSwimPrepareCache] = useState<[string, Tree] | null>(null);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [productsOutOfDate, setProductsOutOfDate] = useState(false);
  const [verilogProduct, setVerilogProduct] = useState<string | null>(null);
  const [backendOutput, setBackendOutput] = useState<string | null>(null);
  const [hardwareJson, setHardwareJson] = useState<string | null>(null);
  const [bitFile, setBitFile] = useState<Uint8Array | null>(null);
  const [uploading, setUploading] = useState<Uint8Array | null>(null);
  const [hdlMod, setHdlMod] = useState<HDLModuleWASM | null>(null);


  async function runCommands(commands: Command[], onDone?: () => void) {
    if (running)
      return;

    setCommandOutput(null)
    if (hdlMod) {
      hdlMod.dispose()
    }
    setHdlMod(null)
    setActiveRightTab('command-output')

    let files = {
      "src": {"playground.spade": sourceEditorState.text},
      "swim.toml": tomlEditorState.text
    }

    for (const cmd of commands) {
      setRunning(true);
      setProductsOutOfDate(false);

      const handlers = {
        stdout: (s) => handleIostream(s, setCommandOutput),
        stderr: (s) => handleIostream(s, setCommandOutput),
      }

      handlers.stdout(`[Playground] Running ${cmd.name} ${cmd.args}\n`)

      try {
        files = await cmd.runner(cmd.args, files, handlers)

        if (cmd.produces !== null) {
          try {
            cmd.produces.stateUpdater(getFileInTree(files, cmd.produces.file))
          } catch(e) {
            setCommandOutput(prev => prev + e)
          }
        }
      } catch(e) {
        console.log(e)
        handlers.stdout(`[Playground] ${cmd.name} exited with error ${e}\n`)
        setActiveRightTab("command-output")
        break;
      }
      handlers.stdout(`[Playground] ${cmd.name} done\n`)
    }

    setRunning(false)
    if (onDone) {
      onDone()
    }
  }

  const swimCommands = [
    new Command(
      "swim-prepare",
      asyncRunner("swimPrepare"),
      [],
      null
    ),
    new Command(
      "swim",
      asyncRunner("swim"),
      ["build"],
      null
    )
  ]

  const spadeCommands = swimCommands.concat([
    new Command(
      "spade",
      asyncRunner("spade"),
      ["--command-file", "build/commands.json", "-o", "build/spade.sv", "dummy_file", "--no-color"],
      new Product(["build", "spade.sv"], "verilog-product", setVerilogProduct)
    )
  ]);

  const simulationCommands = spadeCommands.concat([
    new Command (
      "verilator",
      async (args, files, options) => {
        const res = await runVerilator(args, files, options);

        if (res.output) {
          if (hdlMod) {
            hdlMod.dispose()
          }
          let mod = new HDLModuleWASM(res.output.modules['TOP'], res.output.modules['@CONST-POOL@'])
          await mod.init()
          mod.powercycle()

          mod.state.a = 5;
          mod.state.b = 6;
          mod.tick2(10)
          console.log(mod.state.out)

          setHdlMod(mod)
        } else {
          console.log("No output from verilator")
        }

        return files
      },
      [],
      null
    )
  ])

  const yosysCommands = spadeCommands.concat([
    new Command(
      "yosys",
      runYosys,
      ["-p", "read_verilog -sv build/spade.sv; synth_ecp5 -top top -json hardware.json"],
      new Product(["hardware.json"], "hardware-json", setHardwareJson)
    )
  ]);


  const prevSourceCode = useRef(sourceEditorState.text);
  useEffect(() => {
    if (sourceEditorState.text != prevSourceCode.current)
      setProductsOutOfDate(true);
    prevSourceCode.current = sourceEditorState.text;
  }, [sourceEditorState]);

  const [counter, setCounter] = useState(0)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const animate = () => {
      setCounter(c => c + 1)
      if (canvas && hdlMod) {
        requestAnimationFrame(animate)
      }
    }
    if (canvas && hdlMod) {
      requestAnimationFrame(animate)
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && hdlMod) {
      const context = canvas.getContext('2d')

      context.fillStyle = "#000000"
      context.fillRect(0, 0, 640, 480)
      const imageData = context.createImageData(640, 480)

      const data = new Uint8Array(imageData.data.buffer);
      frameLoop: for (let y = 0; y < 480; y++) {
        waitFor(hdlMod, () => !getVGASignals(hdlMod).hsync);

        for (let x = 0; x < 640; x++) {
          const offset = (y * 640 + x) * 4;
          hdlMod.tick2(1);
          const { hsync, vsync, r, g, b } = getVGASignals(hdlMod);
          if (hsync) {
            break;
          }
          if (vsync) {
            break frameLoop;
          }
          data[offset] = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = 0xff;
        }
        waitFor(hdlMod, () => getVGASignals(hdlMod).hsync);
      }
      context!.putImageData(imageData, 0, 0);
      waitFor(hdlMod, () => getVGASignals(hdlMod).vsync);
      waitFor(hdlMod, () => !getVGASignals(hdlMod).vsync);
    }
  }, [counter])


  function tabAndPanel({ key, title, titleStyle = {}, content }) {
    return [
      <Tab key={`${key}-tab`} value={key} style={titleStyle}>{title}</Tab>,
      <TabPanel key={`${key}-tabpanel`} value={key} sx={{ padding: 0 }}>{content}</TabPanel>
    ];
  }

  const rightTabsWithPanels = [
    tabAndPanel({
      key: 'tutorial',
      title: <QuestionMarkIcon />,
      content: <Box sx={{ padding: 2, maxWidth: '80em' }}>
        <p>
          Hi there!
        </p>
        <p>
          This is a very experimental Spade playground. It is heavily based on the <Link href="https://amaranth-lang.org/play/">amaranth playground</Link>.

          The source code of the original amaranth playground is is {}
          <Link href="https://github.com/amaranth-lang/playground">available on GitHub</Link>.
        </p>
      </Box>
    }),
    tabAndPanel({
      key: 'command-output',
      title: 'Command output',
      content: terminal(commandOutput)
    }),
    tabAndPanel({
      key: 'canvas',
      title: 'VGA/HDMI Output',
      content:
        <canvas ref={canvasRef}
          width = "640px"
          height = "480px"/>
    }),
  ];

  const leftTabsWithPanels = [
    tabAndPanel({
      key: 'amaranth-source',
      title: 'playground.spade',
      content: <Editor
        padding={{ top: 10, bottom: 10 }}
        language='spade'
        state={sourceEditorState}
        setState={setSourceEditorState}
        focus
        actions={[
          {
            id: 'amaranth-playground.run',
            label: 'Run Code',
            keybindings: [
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            ],
            run: () => runCommands(simulationCommands, () => setActiveRightTab('canvas')),
          }
        ]}
      />
    }),
    tabAndPanel({
      key: 'toml-source',
      title: 'swim.toml',
      content: <Editor
        padding={{ top: 10, bottom: 10 }}
        language='toml'
        state={tomlEditorState}
        setState={setTomlEditorState}
        focus
      />
    }),
  ]



  function maybeEditorTab(product: string | null, key: string, title: string, language: string) {
    if (product !== null)
      rightTabsWithPanels.push(tabAndPanel({
        key: key,
        title: title,
        titleStyle: productsOutOfDate ? { textDecoration: 'line-through' } : {},
        content:
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {productsOutOfDate && <Alert variant='soft' color='warning' sx={{ borderRadius: 0 }}>
              The generated Verilog is out of date. Run the program again to refresh it.
            </Alert>}
            <Box sx={{ flexGrow: 1 }}>
              <Editor
                padding={{ top: 10, bottom: 10 }}
                language={language}
                state={new EditorState(product)}
                focus
              />
            </Box>
          </Box>
      }));
  }

  maybeEditorTab(verilogProduct, "verilog-product", "Generated Verilog", "verilog")
  maybeEditorTab(backendOutput, "backend-output", "Tool logs", "")
  maybeEditorTab(hardwareJson, "hardware-json", "hardware.json", "json")



  // FIXME: populating `tabsWithPanels` this way leads to bugs

  return <>
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      padding: 2,
      gap: 2
    }}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 2
      }}>

        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={running}
          onClick={() => runCommands(spadeCommands)}
        >
          Build
        </Button>

        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={running}
          onClick={() => runCommands(simulationCommands, () => setActiveRightTab('canvas'))}
        >
          Simulate
        </Button>


        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={synthesizing}
          onClick={() => runCommands(yosysCommands)}
        >
          Synthesize
        </Button>


        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={runningPnr}
          onClick={() => {console.log("no pnr right now")}}
        >
          PNR
        </Button>

        {
          bitFile ?
              <Button
                size='lg'
                sx={{ borderRadius: 10 }}
                variant='outlined'
                startDecorator={<PlayArrowIcon />}
                loading={runningPnr}
                onClick={() => {console.log("no upload right now")}}
              >
                Upload
              </Button> : null
        }

        {/* spacer */} <Box sx={{ flexGrow: 1 }} />

        {
          /*
          <Button
            size='lg'
            sx={{ borderRadius: 10 }}
            color='neutral'
            variant='outlined'
            endDecorator={<ShareIcon />}
            onClick={() => setSharingOpen(true)}
          >
            Share
          </Button>
          */
        }

        <IconButton
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
        >
          {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>

      </Box>

      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100vw',
        height: "95%",
        padding: 2,
        gap: 2
      }}>

        <Tabs
          sx={{ height: '100%', width: '50%' }}
          value={activeLeftTab}
          onChange={(_event, value) => setActiveLeftTab(value as string)}
        >
          <TabList>{leftTabsWithPanels.map(([tab, _panel]) => tab)}</TabList>
          {leftTabsWithPanels.map(([_tab, panel]) => panel)}
        </Tabs>

        <Tabs
          sx={{ height: '100%', width: '50%' }}
          value={activeRightTab}
          onChange={(_event, value) => setActiveRightTab(value as string)}
        >
          <TabList>{rightTabsWithPanels.map(([tab, _panel]) => tab)}</TabList>
          {rightTabsWithPanels.map(([_tab, panel]) => panel)}
        </Tabs>
      </Box>
    </Box>
  </>;
}

createRoot(document.getElementById('root')!).render(
  <CssVarsProvider>
    <CssBaseline />
    <AppContent />
  </CssVarsProvider>
);

console.log('Build ID:', globalThis.GIT_COMMIT);

// https://esbuild.github.io/api/#live-reload
if (!globalThis.IS_PRODUCTION)
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
