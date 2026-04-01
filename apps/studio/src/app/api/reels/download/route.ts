import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Vercel serverless: only /tmp is writable/readable for dynamic files
const OUTPUTS_DIR = process.env.VERCEL
  ? path.join("/tmp", "reels-rendered")
  : path.resolve(process.cwd(), "../../outputs/reels/rendered");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");

  if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(OUTPUTS_DIR, file);

  try {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${file}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: process.env.VERCEL ? "File not found — ephemeral /tmp storage on Vercel. Configure R2 for persistent files." : "File not found" },
      { status: 404 },
    );
  }
}
