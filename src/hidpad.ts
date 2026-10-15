// WebHID fallback for the d-pad of the generic DragonRise "USB Gamepad" (0079:0011), switched on with
// ?webhid in the URL. Its HID descriptor names four axes X and one Y; Chrome on macOS drops them, so
// the Gamepad API sees no d-pad at all. Reading the raw reports gets it back: byte 3 is left/right,
// byte 4 up/down, each 00 / 7f / ff.

// TypeScript's DOM lib has no WebHID types yet; this is the little we use.
interface HIDDevice extends EventTarget {
  opened: boolean;
  vendorId: number;
  productId: number;
  open(): Promise<void>;
}
interface HIDInputReportEvent extends Event {
  device: HIDDevice;
  data: DataView;
}
interface HIDConnectionEvent extends Event {
  device: HIDDevice;
}
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(o: { filters: { vendorId: number; productId: number }[] }): Promise<HIDDevice[]>;
}

const FILTER = { vendorId: 0x0079, productId: 0x0011 };
const axis = (b: number) => (b < 0x40 ? -1 : b > 0xc0 ? 1 : 0);

let dpad = { x: 0, y: 0 };
let device: HIDDevice | null = null;

/** The d-pad as -1/0/1 per axis, or null when the fallback is off or no pad is connected. */
export function hidDpad(): { x: number; y: number } | null {
  return device ? dpad : null;
}

/** Turns the fallback on when the URL has ?webhid: reuses a pad granted before, or offers a button. */
export function setupHidPad() {
  if (!new URLSearchParams(location.search).has('webhid')) return;
  const hid = (navigator as Navigator & { hid?: HID }).hid;
  if (!hid) return void console.warn('?webhid: this browser has no WebHID');

  // Picking a device needs a click, so this button stays up until a pad is connected.
  const button = document.createElement('button');
  button.id = 'hidpad';
  button.textContent = 'CONNECT GAMEPAD';
  button.addEventListener('click', async () => {
    const [d] = await hid.requestDevice({ filters: [FILTER] }).catch(() => []);
    if (d) await use(d);
  });

  const matches = (d: HIDDevice) => d.vendorId === FILTER.vendorId && d.productId === FILTER.productId;

  async function use(d: HIDDevice) {
    if (device) return;
    if (!d.opened) await d.open();
    d.addEventListener('inputreport', (e) => {
      const { data } = e as HIDInputReportEvent;
      if (data.byteLength > 4) dpad = { x: axis(data.getUint8(3)), y: axis(data.getUint8(4)) };
    });
    device = d;
    button.remove();
  }

  hid.addEventListener('connect', (e) => {
    const d = (e as HIDConnectionEvent).device;
    if (!device && matches(d)) void use(d);
  });
  hid.addEventListener('disconnect', (e) => {
    if ((e as HIDConnectionEvent).device !== device) return;
    device = null;
    dpad = { x: 0, y: 0 };
    document.body.append(button);
  });

  void hid.getDevices().then((ds) => {
    const d = ds.find(matches);
    if (d) void use(d);
    else document.body.append(button);
  });
}
