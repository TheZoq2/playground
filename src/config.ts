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

use std::conv::int_to_uint;

struct Color {
  r: uint<8>,
  g: uint<8>,
  b: uint<8>
}

// ***********************************************************************
// This is the best place to start playing around with changing the output
// ***********************************************************************
entity pixel_to_color(
  clk: clock,
  rst: bool,
  new_frame: bool,
  pixel: (uint<15>, uint<15>)
) -> Color {
  let (x, y) = pixel;

  // In order to get some movement in our design, we'll keep track of
  // how many frames have passed since the start of the frame.
  reg(clk) counter: uint<15> reset(rst: 0) = if new_frame {
      trunc(counter + 1)
    } else {
      counter
    };


  // use the x and y-coordinates to generate a nice pattern. We'll use the
  // counter to offset the pattern, but because the counter counts up
  // so fast, we divide it a bit by shifting it.
  Color$(
    r: trunc(x + (counter >> 5)),
    g: trunc(y + (counter >> 7)),
    b: 255
  )
}

// ***********************************************************************
// The pixel_to_color entity above is used together with a library for
// driving the VGA monitor. That driving happens here. You probably don't
// need to modify it
// ***********************************************************************

// This is the top module that we will connect to the simulator here,
// or to a real monitor on an FPGA. #[no_mangle] tells the Spade compiler
// to not change any names which makes mapping the signals to simulator
// or physical outputs easier.
#[no_mangle]
entity top(
  // Digital hardware is driven by a clock. Every time it flips from 0 to 1,
  // all the signals in our design will be re-computed
  #[no_mangle] clk: clock,
  
  // These are the signals we'll send to the display
  #[no_mangle] hsync: &mut bool,
  #[no_mangle] vsync: &mut bool,
  #[no_mangle] r: &mut uint<8>,
  #[no_mangle] g: &mut uint<8>,
  #[no_mangle] b: &mut uint<8>,
) {
  // In order to set our circuit back to its initial state on startup, we'll
  // generate a reset signal to use later
  let rst = inst power_on_reset(clk);

  // We use a VGA library to generate the signals for driving the VGA display.
  // That library is specified in swim.toml
  let vga_state = inst vga_fsm(clk, rst, true, vga_timing());
  let vga_out = vga_output(vga_state);

  // The VGA library gives us an x and y coordinate, and it is our job to fill in
  // the color at that pixel here. Some clock cycles, VGA doesn't output any pixels
  // because it is busy 'syncing', which is why we need to do a match here.
  let color = match vga_out.pixel {
    Some((x, y)) => {
      inst pixel_to_color(clk, rst, vga_out.vsync, (int_to_uint(x), int_to_uint(y)))
    },
    None => Color(0, 0, 0)
  };

  // Finally, we can set the VGA signals
  set r = color.r;
  set g = color.g;
  set b = color.b;
  set hsync = vga_out.hsync;
  set vsync = vga_out.vsync;
}

// VGA has several important timing parameters that need to be set for it to work.
// These are correct for a 640x480 display which we simulate here.
fn vga_timing() -> VgaTiming {
  VgaTiming$(
    x_pixels: 640,
    x_front_porch: 1,
    x_sync_width: 1,
    x_back_porch: 1,

    y_pixels: 480,
    y_front_porch: 1,
    y_sync_width: 1,
    y_back_porch: 1,
  )
}

entity power_on_reset(clk: clock) -> bool {
  reg(clk) rst_counter: uint<4> initial(5) =
    if rst_counter == 0 {
      0
    } else {
      trunc(rst_counter-1)
    };
  rst_counter != 0
}
`,
  demoToml: `\
name = "playground"

[libraries]
vga = {git = "https://gitlab.com/spade-lang/lib/vga_spade", branch = "main"}
`
};
