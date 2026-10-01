import { createRequire } from "node:module";
import path from "node:path";

const appRoot = process.argv[2];
if (!appRoot) throw new Error("Usage: remote-app-video-smoke.mjs <installed-app-root>");
const require = createRequire(path.join(appRoot, "package.json"));
const wrtc = require("@roamhq/wrtc");

if (typeof wrtc.nonstandard?.RTCVideoSink !== "function")
  throw new Error("Native WebRTC video sink required for video round-trip smoke");

const width = 32;
const height = 16;
const rgba = new Uint8ClampedArray(width * height * 4);
for (let pixel = 0; pixel < width * height; pixel++) {
  const offset = pixel * 4;
  rgba[offset] = pixel % 255;
  rgba[offset + 1] = (pixel * 3) % 255;
  rgba[offset + 2] = 200;
  rgba[offset + 3] = 255;
}
const i420 = new Uint8ClampedArray(width * height * 3 / 2);
wrtc.nonstandard.rgbaToI420(
  { width, height, data: rgba }, { width, height, data: i420 }
);

const source = new wrtc.nonstandard.RTCVideoSource();
const track = source.createTrack();
const sender = new wrtc.RTCPeerConnection({ iceServers: [] });
const receiver = new wrtc.RTCPeerConnection({ iceServers: [] });
let sink;
let timer;
let frames;
try {
  await new Promise(async (resolve, reject) => {
    timer = setTimeout(() => reject(new Error(
      "Synthetic Remote App video did not arrive through the native WebRTC media path"
    )), 12_000);
    sender.onicecandidate = ({ candidate }) => {
      if (candidate) void receiver.addIceCandidate(candidate).catch(reject);
    };
    receiver.onicecandidate = ({ candidate }) => {
      if (candidate) void sender.addIceCandidate(candidate).catch(reject);
    };
    receiver.ontrack = ({ track: incoming }) => {
      sink = new wrtc.nonstandard.RTCVideoSink(incoming);
      sink.onframe = ({ frame }) => {
        if (frame.width === width && frame.height === height &&
          frame.data?.length === width * height * 3 / 2) resolve();
      };
    };
    sender.addTrack(track);
    try {
      const offer = await sender.createOffer();
      await sender.setLocalDescription(offer);
      await receiver.setRemoteDescription(sender.localDescription);
      const answer = await receiver.createAnswer();
      await receiver.setLocalDescription(answer);
      await sender.setRemoteDescription(receiver.localDescription);
      frames = setInterval(() => source.onFrame({ width, height, data: i420 }), 60);
    } catch (error) { reject(error); }
  });
  console.log("Remote App synthetic RGBA → I420 → WebRTC → RTCVideoSink: passed");
} finally {
  clearTimeout(timer);
  clearInterval(frames);
  sink?.stop();
  track.stop();
  sender.close();
  receiver.close();
}
