import { NextRequest, NextResponse } from "next/server";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegReady = false;

async function getFFmpeg() {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!ffmpegReady) {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegReady = true;
  }
  return ffmpeg!;
}

function normalizeBase64(input: string) {
  if (!input) return "";
  const m = input.match(/^data:[^;]+;base64,(.*)$/);
  return m ? m[1] : input;
}

function getExtensionFromDataUri(dataUri: string, fallback = "mp3") {
  const m = dataUri.match(/^data:audio\/([a-zA-Z0-9+]+);base64,/);
  if (m && m[1]) {
    let ext = m[1].toLowerCase();
    if (ext === "mpeg") return "mp3";
    if (ext === "x-wav") return "wav";
    return ext;
  }
  return fallback;
}

async function writeConcatList(ff: FFmpeg, files: string[]) {
  const lines = files.map((f) => `file '${f}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(lines));
}

export async function POST(req: NextRequest) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const audioSegments = payload?.audioSegments;
  if (!Array.isArray(audioSegments) || audioSegments.length === 0) {
    return NextResponse.json({ error: "audioSegments array required" }, { status: 400 });
  }

  try {
    const ff = await getFFmpeg();

    try { await ff.deleteFile("list.txt"); } catch {}
    try { await ff.deleteFile("output.mp3"); } catch {}

    audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

    const fileNames: string[] = [];

    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i];
      const b64 = normalizeBase64(seg.dataUri || seg.dataBase64);
      if (!b64) {
        return NextResponse.json({ error: `Segment ${i} missing base64` }, { status: 400 });
      }

      let ext = "mp3";
      if (seg.dataUri) ext = getExtensionFromDataUri(seg.dataUri);
      else if (seg.fileName) ext = seg.fileName.split(".").pop()?.toLowerCase() || "mp3";

      const fileName = `seg_${i}.${ext}`;
      await ff.writeFile(fileName, new Uint8Array(Buffer.from(b64, "base64")));
      fileNames.push(fileName);
    }

    await writeConcatList(ff, fileNames);

    // Force re-encode to MP3 so mixed formats won't fail
    await ff.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "192k",
      "output.mp3"
    ]);

    const out = await ff.readFile("output.mp3");
    const base64 = Buffer.from(out as Uint8Array).toString("base64");

    return NextResponse.json({
      ok: true,
      mergedBase64: base64,
      contentType: "audio/mpeg",
      fileName: "podcast_final.mp3",
      segmentCount: audioSegments.length
    });
  } catch (err: any) {
    console.error("merge failed:", err);
    return NextResponse.json({ error: "Failed to merge audio", details: String(err?.message || err) }, { status: 500 });
  }
}