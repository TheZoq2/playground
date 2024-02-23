import { createRoot } from 'react-dom/client';

import * as React from 'react';

import {default as wasmbin} from "../spade/spade-compiler/pkg/spade_bg.wasm"
import init, {compile, File} from "spade";

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

import * as monaco from 'monaco-editor';
import { EditorState, Editor } from './monaco';
import { Viewer as WaveformViewer } from './d3wave';
import { PythonError, runner } from './runner';
import data from './config';

import './app.css';

function stealHashQuery() {
  const { hash } = window.location;
  if (hash !== '') {
    history.replaceState(null, '', ' '); // remove #... from URL entirely
    const hashQuery = decodeURIComponent(hash).substring(1);
    try {
      return JSON.parse(hashQuery);
    } catch {}
  }
}

interface TerminalChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

async function setup_wasm() {
	await init(wasmbin);
}

function TerminalOutput(key: string, output: TerminalChunk[]) {
  return output.map((chunk, index) =>
    <span key={`${key}-${index}`} className={`terminal-${chunk.stream}`}>{chunk.text}</span>);
}

function AppContent() {
  const {mode, setMode} = useColorScheme();
  useEffect(() => monaco.editor.setTheme(mode === 'light' ? 'vs' : 'vs-dark'), [mode]);

  const query: { av?: string, s?: string } | undefined = stealHashQuery();
  const [running, setRunning] = useState(false);
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
  const [generatedVerilog, setGeneratedVerilog] = useState<string | null>(null);
  const [pythonOutput, setPythonOutput] = useState<TerminalChunk[] | null>(null);
  const [pythonOutputWasNull, setPythonOutputWasNull] = useState(true);
  const [waveforms, setWaveforms] = useState<object | null>(null);
  const [productsOutOfDate, setProductsOutOfDate] = useState(false);
  const [rtlilProduct, setRtlilProduct] = useState<string | null>(null);
  const [verilogProduct, setVerilogProduct] = useState<string | null>(null);

  function loadDemoCode() {
    setSourceEditorState(new EditorState(data.demoCode));
    setActiveTab('amaranth-source');
  }

  function completeTutorial() {
    setTutorialDone(true);
    setActiveTab('amaranth-source');
  }

  async function runCode() {
    if (running)
      return;
    try {
      setRunning(true);
      if (pythonOutput !== null)
        setPythonOutput([]);
      let gotRtlil = false;
      let gotVerilog = false;
      let gotWaveforms = false;

      await setup_wasm()
      let file = new File("playground", "playground", "playground.spade", sourceEditorState.text);

      setProductsOutOfDate(false);

      try {
        let verilog = compile([file])
        setVerilogProduct(verilog)
        setCompilerError(null)
        setActiveTab("verilog-product")
      } catch (e) {
        setCompilerError(e)
        setVerilogProduct(null)
        setActiveTab("compiler-output")
        console.log(e)
      }

    } finally {
      setRunning(false);
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
      title: <QuestionMarkIcon/>,
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

  if (waveforms !== null)
    tabsWithPanels.push(tabAndPanel({
      key: 'waveforms',
      title: 'Waveforms',
      titleStyle: productsOutOfDate ? { textDecoration: 'line-through' } : {},
      content:
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {productsOutOfDate && <Alert variant='soft' color='warning' sx={{ borderRadius: 0 }}>
            The waveforms are out of date. Run the program again to refresh them.
          </Alert>}
          <Box sx={{ flexGrow: 1 }}>
            <WaveformViewer data={waveforms}/>
          </Box>
        </Box>
    }));

  if (rtlilProduct !== null)
    tabsWithPanels.push(tabAndPanel({
      key: 'rtlil-product',
      title: 'Generated RTLIL',
      titleStyle: productsOutOfDate ? { textDecoration: 'line-through' } : {},
      content:
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {productsOutOfDate && <Alert variant='soft' color='warning' sx={{ borderRadius: 0 }}>
            The generated RTLIL is out of date. Run the program again to refresh it.
          </Alert>}
          <Box sx={{ flexGrow: 1 }}>
            <Editor
              padding={{ top: 10, bottom: 10 }}
              language='rtlil'
              state={new EditorState(rtlilProduct)}
              focus
            />
          </Box>
        </Box>
    }));

  if (verilogProduct !== null)
    tabsWithPanels.push(tabAndPanel({
      key: 'verilog-product',
      title: 'Generated Verilog',
      titleStyle: productsOutOfDate ? { textDecoration: 'line-through' } : {},
      content:
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {productsOutOfDate && <Alert variant='soft' color='warning' sx={{ borderRadius: 0 }}>
            The generated Verilog is out of date. Run the program again to refresh it.
          </Alert>}
          <Box sx={{ flexGrow: 1 }}>
            <Editor
              padding={{ top: 10, bottom: 10 }}
              language='verilog'
              state={new EditorState(verilogProduct)}
              focus
            />
          </Box>
        </Box>
    }));

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
          startDecorator={<PlayArrowIcon/>}
          loading={running}
          onClick={() => runCode()}
        >
          Run
        </Button>

        {/* spacer */} <Box sx={{ flexGrow: 1 }}/>

        <Button
          size='lg'
          sx={{ borderRadius: 10 }}
          color='neutral'
          variant='outlined'
          endDecorator={<ShareIcon/>}
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
          {mode === 'light' ? <DarkModeIcon/> : <LightModeIcon/>}
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
    <CssBaseline/>
    <AppContent/>
  </CssVarsProvider>
);

console.log('Build ID:', globalThis.GIT_COMMIT);

// https://esbuild.github.io/api/#live-reload
if (!globalThis.IS_PRODUCTION)
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
