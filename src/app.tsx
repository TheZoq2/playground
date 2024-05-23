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
import { runYosys, } from '@yowasp/yosys'
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

function handleIostream(s: Uint8Array | null, prev: string | null, setter: React.Dispatch<React.SetStateAction<string | null>>) {
  let decoder = new TextDecoder()
  if (s !== null) {
    let newNow = decoder.decode(s, { stream: true })
    if (prev !== null) {
      setter(prev + newNow)
    }
    else {
      setter(newNow)
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
  const [activeTab, setActiveTab] = useState(tutorialDone ? 'amaranth-source' : 'tutorial');
  const [sourceEditorState, setSourceEditorState] = useState(new EditorState(
    query?.s
    ?? localStorage.getItem('amaranth-playground.source')
    ?? data.demoCode));
  useEffect(() => localStorage.setItem('amaranth-playground.source', sourceEditorState.text), [sourceEditorState]);
  const [compilerError, setCompilerError] = useState<string | null>(null);
  const [pythonOutput, setPythonOutput] = useState<TerminalChunk[] | null>(null);
  const [pythonOutputWasNull, setPythonOutputWasNull] = useState(true);
  const [productsOutOfDate, setProductsOutOfDate] = useState(false);
  const [verilogProduct, setVerilogProduct] = useState<string | null>(null);
  const [backendOutput, setBackendOutput] = useState<string | null>(null);
  const [hardwareJson, setHardwareJson] = useState<string | null>(null);
  const [bitFile, setBitFile] = useState<Uint8Array | null>(null);
  const [uploading, setUploading] = useState<Uint8Array | null>(null);


  async function runCode() {
    if (running)
      return;
    try {
      setRunning(true);
      setVerilogProduct(null)

      setProductsOutOfDate(false);

      try {
        const filesOut = await runSpade(["spade.spade", "-o", "spade.sv"], {"spade.spade": sourceEditorState.text});
        // let verilog = compile([file])
        setVerilogProduct(filesOut["spade.sv"])
        setCompilerError(null)
        setActiveTab("verilog-product")
      } catch (e) {
        setCompilerError(e)
        setVerilogProduct(null)
        setActiveTab("compiler-output")
      }

    } finally {
      setRunning(false);
    }
  }

  async function synthesize() {
    if (synthesizing) {
      return
    }
    try {
      setSynthesizing(true)
      setHardwareJson(null)

      await runCode()

      setBackendOutput("")

      if (verilogProduct !== null) {
        setActiveTab("backend-output")
        let filesOut = await runYosys(
          ["-p", "read_verilog -sv spade.sv; synth_ecp5 -top top -json hardware.json"],
          { "spade.sv": verilogProduct },
          {
            stdout: (s) => handleIostream(s, backendOutput, setBackendOutput),
            stderr: (s) => {
              let decoder = new TextDecoder()
              if (s !== null) {
                setBackendOutput(backendOutput + decoder.decode(s))
              }
            },
          }
        )

        if (filesOut != null) {
          let outFile = filesOut["hardware.json"]
          setHardwareJson(outFile as string)
          setActiveTab("hardware-json")
        }
      }
    }
    finally {
      setSynthesizing(false)
    }
  }

  async function pnr() {
    if (runningPnr) {
      return
    }
    try {
      setRunningPnr(true)
      setBitFile(null)

      await synthesize();

      if (hardwareJson !== null) {
        setActiveTab("backend-output")
        setBackendOutput(backendOutput + "\nRunning PNR\n")
        let pnrOut = await runNextpnrEcp5(
          [
            "--45k",
            "--json",
            "hardware.json",
            "--lpf",
            "ulx3s_v20.lpf",
            "--textcfg",
            "hardware.config",
            "--package",
            "CABGA554"
          ],
          { "hardware.json": hardwareJson, "ulx3s_v20.lpf": ecpix5_lpf },
        )
        setBackendOutput(backendOutput + "\nRunning ECPpack\n")

        let packOut = await runEcppack(
          ["hardware.config", "hardware.bit", "--idcode", "0x81112043"],
          pnrOut,
        )

        if (packOut != null) {
          let outFile = packOut["hardware.bit"]
          setBitFile(outFile)
        }
      }
    }
    finally {
      setRunningPnr(false)
    }
  }

  async function upload() {
    if (uploading) {
      return
    }
    try {
      if (bitFile !== null) {
        await runOpenFPGALoader(["-b", "ecpix5", "hardware.bit"], {"hardware.bit": bitFile})
      } else{
        console.log("No bit file generated")
      }
    }
    finally {
      setUploading(false)
    }
  } 

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
      title: 'Spade Source',
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
            run: runCode,
          }
        ]}
      />
    }),
    tabAndPanel({
      key: 'compiler-output',
      title: 'Compiler output',
      content:
        <pre>{compilerError ? compilerError.replaceAll("\"", "").replaceAll("\\n", "\n") : null}</pre>
    }),
  ];

  const prevSourceCode = useRef(sourceEditorState.text);
  useEffect(() => {
    if (sourceEditorState.text != prevSourceCode.current)
      setProductsOutOfDate(true);
    prevSourceCode.current = sourceEditorState.text;
  }, [sourceEditorState]);

  if (pythonOutput !== null)
    tabsWithPanels.push(tabAndPanel({
      key: 'python-output',
      title: 'Python Output',
      content:
        <Box
          className='terminal-output'
          sx={{ paddingX: 2, paddingY: 1 }}
        >{TerminalOutput('python-output', pythonOutput)}</Box>
    }));

  useEffect(() => {
    // Open tab if we're running code for the first time, since it may not be clear that anything
    // has happened otherwise.
    if (pythonOutput !== null && pythonOutputWasNull)
      setActiveTab('python-output');
    setPythonOutputWasNull(pythonOutput === null);
  }, [pythonOutput]);


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
          onClick={() => runCode()}
        >
          Run
        </Button>


        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={synthesizing}
          onClick={() => synthesize()}
        >
          Synthesize
        </Button>


        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          variant='outlined'
          startDecorator={<PlayArrowIcon />}
          loading={runningPnr}
          onClick={() => pnr()}
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
                onClick={() => upload()}
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
