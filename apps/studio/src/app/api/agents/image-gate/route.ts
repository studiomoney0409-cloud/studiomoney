import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

/** GET /api/agents/image-gate — list pending image gates */
export async function GET() {
  const gates = await prisma.imageGate.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(gates);
}

/** PATCH /api/agents/image-gate — confirm image selection */
export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, selectedUrls, status } = body as {
    id: string;
    selectedUrls?: string[];
    status?: "selected" | "skipped";
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const gate = await prisma.imageGate.findUnique({ where: { id } });
  if (!gate) {
    return NextResponse.json({ error: "ImageGate not found" }, { status: 404 });
  }

  const newStatus = status ?? "selected";
  const urls = selectedUrls ?? [];

  const updated = await prisma.imageGate.update({
    where: { id },
    data: {
      selectedUrls: urls,
      status: newStatus,
    },
  });

  // Trigger Design Director via Inngest event
  if (newStatus === "selected" && urls.length > 0) {
    // Preferred path: design with selected images
    await inngest.send({
      name: "agent/image-gate.selected",
      data: {
        imageGateId: id,
        topic: gate.topic,
        selectedUrls: urls,
        platforms: gate.platforms,
        personaId: gate.personaId,
        pipelineRunId: gate.pipelineRunId,
        agentRunId: gate.agentRunId,
      },
    });
  } else if (newStatus === "skipped") {
    // Skipped: proceed without images (trigger fallback design)
    await inngest.send({
      name: "agent/image-gate.selected",
      data: {
        imageGateId: id,
        topic: gate.topic,
        selectedUrls: [],
        platforms: gate.platforms,
        personaId: gate.personaId,
        pipelineRunId: gate.pipelineRunId,
        agentRunId: gate.agentRunId,
      },
    });
  }

  return NextResponse.json(updated);
}
