import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const tempFiles: string[] = [];
  const outputFile = join(tmpdir(), `output_${Date.now()}.mp3`);

  try {
    // Sort by timing if provided
    audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

    // Write all audio segments to temporary files
    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i];
      const b64 = normalizeBase64(seg.dataUri || seg.dataBase64);
      if (!b64) {
        return NextResponse.json({ error: `Segment ${i} missing base64` }, { status: 400 });
      }

      let ext = "mp3";
      if (seg.dataUri) ext = getExtensionFromDataUri(seg.dataUri);
      else if (seg.fileName) ext = seg.fileName.split(".").pop()?.toLowerCase() || "mp3";

      const tempFile = join(tmpdir(), `seg_${i}_${Date.now()}.${ext}`);
      await writeFile(tempFile, Buffer.from(b64, "base64"));
      tempFiles.push(tempFile);
    }

    // Create a concat file for ffmpeg
    const concatFile = join(tmpdir(), `concat_${Date.now()}.txt`);
    const concatContent = tempFiles.map(file => `file '${file}'`).join('\n');
    await writeFile(concatFile, concatContent);
    tempFiles.push(concatFile);

    // Merge audio files using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-ar', '44100',
          '-ac', '2',
          '-b:a', '192k'
        ])
        .output(outputFile)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Read the merged file and convert to base64
    const mergedBuffer = await readFile(outputFile);
    const base64 = mergedBuffer.toString('base64');

    // Clean up temporary files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {}
    }
    try {
      await unlink(outputFile);
    } catch {}

    return NextResponse.json({
      ok: true,
      mergedBase64: base64,
      contentType: "audio/mpeg",
      fileName: "podcast_final.mp3",
      segmentCount: audioSegments.length
    });

  } catch (err: any) {
    console.error("merge failed:", err);
    
    // Clean up temporary files on error
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {}
    }
    try {
      await unlink(outputFile);
    } catch {}

    return NextResponse.json({ 
      error: "Failed to merge audio", 
      details: String(err?.message || err) 
    }, { status: 500 });
  }
}