import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.VERCEL
  ? path.join("/tmp", "reels-uploads")
  : path.resolve(process.cwd(), "../../outputs/reels/uploads");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");

  if (!name || name.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // If name looks like an R2 key (contains /), redirect to signed URL
  if (name.includes("/") && process.env.R2_ENDPOINT) {
    const { getFileSignedUrl } = await import("@/lib/storage");
    const signedUrl = await getFileSignedUrl(name);
    return NextResponse.redirect(signedUrl);
  }

  // Local file serving
  if (name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(UPLOAD_DIR, name);

  try {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);

    const ext = path.extname(name).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".mkv": "video/x-matroska",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
