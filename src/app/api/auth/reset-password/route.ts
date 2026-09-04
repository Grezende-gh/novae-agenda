import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, normalizeEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres.").max(72),
  confirmPassword: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const { email, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const normalized = normalizeEmail(email);
  const [user] = await db
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (!user || !user.active) {
    return NextResponse.json({ error: "Conta de usuário não encontrada ou inativa." }, { status: 404 });
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    data: {
      success: true,
      message: "Senha atualizada com sucesso! Você já pode entrar com sua nova senha.",
    },
  });
}
