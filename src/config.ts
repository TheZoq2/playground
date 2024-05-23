export default {
  amaranthVersions: ['v0.4.2'],
  pythonPackages: {
    'v0.4.2': [
      'https://files.pythonhosted.org/packages/98/8d/a0d8fb2b9611f3ae22ddc98890b346833fa2c645ad21fd282e61ccdad477/pyvcd-0.4.0-py2.py3-none-any.whl',
      'https://files.pythonhosted.org/packages/27/1c/39881fbd48f9de91d64955f206a7f32fd912d306d18e8c5f74126ee5962f/amaranth-0.4.2-py3-none-any.whl',
    ],
  },
  demoCode: `\
fn top(a: int<8>, b: int<8>) -> int<9> {
  a + b
}
`,
  demoToml: `\
name = "playground"
`
};
