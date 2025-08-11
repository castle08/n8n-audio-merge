import { NextRequest, NextResponse } from "next/server";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Lazy, shared ffmpeg instance across invocations
let ffmpeg: FFmpeg | null = null;
let ffmpegReady = false;

async function getFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }
  if (!ffmpegReady) {
    // Load ffmpeg.wasm core from CDN
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegReady = true;
  }
  return ffmpeg!;
}

// accepts both dataUri and dataBase64; returns raw base64
function normalizeBase64(input: string) {
  if (!input) return "";
  const m = input.match(/^data:[^;]+;base64,(.*)$/);
  return m ? m[1] : input;
}

// Writes list.txt for concat demuxer
async function writeConcatList(ffmpeg: FFmpeg, files: string[]) {
  const lines = files.map((f) => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(lines));
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

    // Clean FS from previous run (best-effort)
    try { await ff.deleteFile("list.txt"); } catch {}
    try { await ff.deleteFile("output.mp3"); } catch {}

    // Sort by timing if provided
    audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

    // Write all clips to ffmpeg FS as MP3s
    const fileNames: string[] = [];
    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i];
      const b64 = normalizeBase64(seg.dataUri || seg.dataBase64);
      if (!b64) {
        return NextResponse.json(
          { error: "Segment missing base64 (dataUri or dataBase64)" },
          { status: 400 }
        );
      }
      const name = (seg.fileName || `seg_${i}.mp3`).toLowerCase().replace(/\s+/g, "_");
      const fileName = name.endsWith(".mp3") ? name : name.replace(/\.\w+$/, "") + ".mp3";

      const buf = Buffer.from(b64, "base64");
      await ff.writeFile(fileName, new Uint8Array(buf));
      fileNames.push(fileName);
    }

    // Concat with demuxer (no re-encode)
    await writeConcatList(ff, fileNames);
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "output.mp3"]);

    const out = await ff.readFile("output.mp3");
    const base64 = Buffer.from(out as Uint8Array).toString("base64");

    return NextResponse.json(
      {
        ok: true,
        mergedBase64: base64,
        contentType: "audio/mpeg",
        fileName: "podcast_final.mp3",
        segmentCount: audioSegments.length
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("merge failed:", err);
    return NextResponse.json(
      { error: "Failed to merge audio", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}