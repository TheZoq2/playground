import { createRoot } from 'react-dom/client';

import * as React from 'react';

import { useState, useEffect, useRef } from 'react';

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

class Product {
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

class Command {
  constructor(runner: Runner, args: string[], produces: Product | null) {
    this.runner = runner
    this.args = args
    this.produces = produces
  }
  runner: Runner
  args: string[]
  produces: Product | null
}

function getFileInTree(tree: Tree, file: string[]) : string  {
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

function handleIostream(s: Uint8Array | null, setter: React.Dispatch<React.SetStateAction<string | null>>) {
  let decoder = new TextDecoder()
  if (s !== null) {
    let newNow = decoder.decode(s, { stream: true })
    setter((prev) => prev === null ? newNow : prev + newNow)
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
  const [activeTab, setActiveTab] = useState(tutorialDone ? 'amaranth-source' : 'tutorial');
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

  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [productsOutOfDate, setProductsOutOfDate] = useState(false);
  const [verilogProduct, setVerilogProduct] = useState<string | null>(null);
  const [backendOutput, setBackendOutput] = useState<string | null>(null);
  const [hardwareJson, setHardwareJson] = useState<string | null>(null);
  const [bitFile, setBitFile] = useState<Uint8Array | null>(null);
  const [uploading, setUploading] = useState<Uint8Array | null>(null);


  async function runCommands(commands: Command[]) {
    if (running)
      return;

    setCommandOutput(null)

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
        setActiveTab("command-output")
        break;
      }
    }

    setRunning(false)
  }

  const swimCommands = [
    new Command(
      runSwimPrepare,
      [],
      null
    ),
    new Command(
      runSwim,
      ["build"],
      null
    )
  ]

  const spadeCommands = swimCommands.concat([
    new Command(
      runSpade,
      ["--command-file", "build/commands.json", "-o", "build/spade.sv", "dummy_file", "--no-color"],
      new Product(["build", "spade.sv"], "verilog-product", setVerilogProduct)
    )
  ]);

  const yosysCommands = spadeCommands.concat([
    new Command(
      runYosys,
      ["-p", "read_verilog -sv build/spade.sv; synth_ecp5 -top top -json hardware.json"],
      new Product(["hardware.json"], "hardware-json", setHardwareJson)
    )
  ]);

  // async function pnr() {
  //   if (runningPnr) {
  //     return
  //   }
  //   try {
  //     setRunningPnr(true)
  //     setBitFile(null)

  //     await synthesize();

  //     if (hardwareJson !== null) {
  //       setActiveTab("backend-output")
  //       setBackendOutput(backendOutput + "\nRunning PNR\n")
  //       let pnrOut = await runNextpnrEcp5(
  //         ,
  //         { "hardware.json": hardwareJson, "ulx3s_v20.lpf": ecpix5_lpf },
  //       )
  //       setBackendOutput(backendOutput + "\nRunning ECPpack\n")

  //       let packOut = await runEcppack(
  //         ["hardware.config", "hardware.bit", "--idcode", "0x81112043"],
  //         pnrOut,
  //       )

  //       if (packOut != null) {
  //         let outFile = packOut["hardware.bit"]
  //         setBitFile(outFile)
  //       }
  //     }
  //   }
  //   finally {
  //     setRunningPnr(false)
  //   }
  // }

  // async function upload() {
  //   if (uploading) {
  //     return
  //   }
  //   try {
  //     if (bitFile !== null) {
  //       await runOpenFPGALoader(["-b", "ecpix5", "hardware.bit"], {"hardware.bit": bitFile})
  //     } else{
  //       console.log("No bit file generated")
  //     }
  //   }
  //   finally {
  //     setUploading(false)
  //   }
  // } 

  function tabAndPanel({ key, title, titleStyle = {}, content }) {
    return [
      <Tab key={`${key}-tab`} value={key} style={titleStyle}>{title}</Tab>,
      <TabPanel key={`${key}-tabpanel`} value={key} sx={{ padding: 0 }}>{content}</TabPanel>
    ];
  }

  const tabsWithPanels = [
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
      key: 'amaranth-source',
      title: 'playground.spade',
      content: <Editor
        padding={{ top: 10, bottom: 10 }}
        language='rust'
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
            run: () => runCommands(spadeCommands),
          }
        ]}
      />
    }),
    tabAndPanel({
      key: 'toml-source',
      title: 'swim.toml',
      content: <Editor
        padding={{ top: 10, bottom: 10 }}
        language='rust'
        state={tomlEditorState}
        setState={setTomlEditorState}
        focus
      />
    }),
    tabAndPanel({
      key: 'command-output',
      title: 'Command output',
      content:
        <pre>{commandOutput}</pre>
    }),
  ];

  const prevSourceCode = useRef(sourceEditorState.text);
  useEffect(() => {
    if (sourceEditorState.text != prevSourceCode.current)
      setProductsOutOfDate(true);
    prevSourceCode.current = sourceEditorState.text;
  }, [sourceEditorState]);



  function maybeEditorTab(product: string | null, key: string, title: string, language: string) {
    if (product !== null)
      tabsWithPanels.push(tabAndPanel({
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
          Run
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

        <IconButton
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
        >
          {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>

      </Box>
      <Tabs
        sx={{ height: '100%' }}
        value={activeTab}
        onChange={(_event, value) => setActiveTab(value as string)}
      >
        <TabList>{tabsWithPanels.map(([tab, _panel]) => tab)}</TabList>
        {tabsWithPanels.map(([_tab, panel]) => panel)}
      </Tabs>
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
