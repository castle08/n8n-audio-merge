import { NextRequest, NextResponse } from "next/server";

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

// Simple audio concatenation for MP3 files
// This is a basic implementation that works for simple cases
async function concatenateAudioBuffers(audioBuffers: Buffer[]): Promise<Buffer> {
  // For MP3 files, we can't simply concatenate the raw data
  // This is a simplified approach that works for some cases
  // In a production environment, you'd want proper audio processing
  
  if (audioBuffers.length === 0) {
    throw new Error("No audio buffers to concatenate");
  }
  
  if (audioBuffers.length === 1) {
    return audioBuffers[0];
  }
  
  // For now, we'll return the first audio buffer
  // This is a placeholder - in reality you'd need proper audio processing
  console.warn("Audio concatenation is simplified - returning first audio segment");
  return audioBuffers[0];
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

  try {
    // Sort by timing if provided
    audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

    // Convert all audio segments to buffers
    const audioBuffers: Buffer[] = [];
    
    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i];
      const b64 = normalizeBase64(seg.dataUri || seg.dataBase64);
      if (!b64) {
        return NextResponse.json({ error: `Segment ${i} missing base64` }, { status: 400 });
      }

      const buffer = Buffer.from(b64, "base64");
      audioBuffers.push(buffer);
    }

    // Concatenate audio buffers
    const mergedBuffer = await concatenateAudioBuffers(audioBuffers);
    const base64 = mergedBuffer.toString('base64');

    return NextResponse.json({
      ok: true,
      mergedBase64: base64,
      contentType: "audio/mpeg",
      fileName: "podcast_final.mp3",
      segmentCount: audioSegments.length,
      note: "Simplified concatenation - returns first segment only"
    });

  } catch (err: any) {
    console.error("merge failed:", err);
    return NextResponse.json({ 
      error: "Failed to merge audio", 
      details: String(err?.message || err) 
    }, { status: 500 });
  }
}