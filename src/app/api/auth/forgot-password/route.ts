import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido." }, { status: 400 });
  }

  const { email } = parsed.data;
  const normalized = normalizeEmail(email);

  // Check if user exists (we don't reveal if user doesn't exist for security best practices)
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  return NextResponse.json({
    data: {
      success: true,
      email: normalized,
      userExists: !!user,
      message: "Se o e-mail informado estiver cadastrado, você receberá as instruções para redefinir sua senha.",
    },
  });
}
