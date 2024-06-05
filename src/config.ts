export default {
  amaranthVersions: ['v0.4.2'],
  pythonPackages: {
    'v0.4.2': [
      'https://files.pythonhosted.org/packages/98/8d/a0d8fb2b9611f3ae22ddc98890b346833fa2c645ad21fd282e61ccdad477/pyvcd-0.4.0-py2.py3-none-any.whl',
      'https://files.pythonhosted.org/packages/27/1c/39881fbd48f9de91d64955f206a7f32fd912d306d18e8c5f74126ee5962f/amaranth-0.4.2-py3-none-any.whl',
    ],
  },
  demoCode: `\
use vga::vga::VgaTiming;
use vga::vga::vga_fsm;
use vga::vga::vga_output;

#[no_mangle]
entity top(
  #[no_mangle] clk: clock,
  
  #[no_mangle] hsync: &mut bool,
  #[no_mangle] vsync: &mut bool,
  #[no_mangle] r: &mut uint<8>,
  #[no_mangle] g: &mut uint<8>,
  #[no_mangle] b: &mut uint<8>,
) {
  reg(clk) rst_counter: uint<4> initial(5)  = if rst_counter == 0 {0} else {trunc(rst_counter-1)};
  let rst = rst_counter != 0;

  // Our simulator doesn't actually care about anything but pixels,
  // let's use small values for slightly higher speed
  let timing = VgaTiming$(
    x_pixels: 640,
    x_front_porch: 1,
    x_sync_width: 1,
    x_back_porch: 1,

    y_pixels: 480,
    y_front_porch: 1,
    y_sync_width: 1,
    y_back_porch: 1,
  );

  let vga_state = inst vga_fsm(clk, rst, true, timing);

  let vga_out = vga_output(vga_state);

  reg(clk) counter: uint<15> reset(rst: 0) = if vga_out.vsync { trunc(counter + 1) } else {counter};

  let color = match vga_out.pixel {
    Some((x, y)) => (trunc(std::conv::int_to_uint(x) + (counter >> 5)), trunc(std::conv::int_to_uint(y) + (counter >> 7)), 0),
    None => (0, 0, 0)
  };

  set r = color#0;
  set g = color#1;
  set b = color#2;
  set hsync = vga_out.hsync;
  set vsync = vga_out.vsync;
}
`,
  demoToml: `\
name = "playground"

[libraries]
vga = {git = "https://gitlab.com/spade-lang/lib/vga_spade", branch = "main"}
`
};
