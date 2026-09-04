"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Shield,
  UserRound,
  KeyRound,
  CheckCircle2,
  MailCheck,
  ShieldCheck,
  Check,
  RotateCcw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useStore } from "@/store/store";

type Mode = "login" | "register" | "forgot-password";
type Role = "user" | "admin";
type RecoveryStep = "request_email" | "email_sent" | "reset_password";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (needsOnboarding: boolean) => void }) {
  const { reloadSession } = useStore();
  const [role, setRole] = useState<Role>("user");
  const [mode, setMode] = useState<Mode>("login");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("request_email");

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("usuario@studioprime.com.br");
  const [password, setPassword] = useState("senha123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  // Recovery states
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resend cooldown timer countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setMode("login");
    setError(null);
    setSuccessBanner(null);
    if (newRole === "admin") {
      setEmail("admin@studioprime.com.br");
      setPassword("senha123");
    } else {
      setEmail("usuario@studioprime.com.br");
      setPassword("senha123");
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setSuccessBanner(null);
    if (newMode === "register") {
      setEmail("");
      setPassword("");
    } else if (newMode === "forgot-password") {
      setRecoveryStep("request_email");
      setRecoveryEmail(email || (role === "admin" ? "admin@studioprime.com.br" : "usuario@studioprime.com.br"));
    } else {
      if (role === "admin") {
        setEmail((prev) => prev || "admin@studioprime.com.br");
        setPassword((prev) => prev || "senha123");
      } else {
        setEmail((prev) => prev || "usuario@studioprime.com.br");
        setPassword((prev) => prev || "senha123");
      }
    }
  };

  const handleOpenForgotPassword = () => {
    setRecoveryEmail(email || (role === "admin" ? "admin@studioprime.com.br" : "usuario@studioprime.com.br"));
    setRecoveryStep("request_email");
    setError(null);
    setSuccessBanner(null);
    setMode("forgot-password");
  };

  // Submit for Login / Register
  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessBanner(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const loginEndpoint = role === "admin" ? "/api/auth/admin/login" : "/api/auth/login";
        await api(loginEndpoint, { method: "POST", body: JSON.stringify({ email, password }) });
        const updatedSession = await reloadSession();
        onAuthenticated(!updatedSession?.company?.onboarded);
      } else {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password, confirmPassword }),
        });
        const updatedSession = await reloadSession();
        onAuthenticated(!updatedSession?.company?.onboarded);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Submit email for Forgot Password (Google-style Step 1)
  const submitRecoveryEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recoveryEmail.trim()) {
      setError("Informe seu endereço de e-mail.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api<{ success: boolean; message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      setRecoveryStep("email_sent");
      setResendCooldown(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível processar a recuperação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Resend recovery email
  const handleResendRecoveryEmail = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      await api<{ success: boolean; message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      setResendCooldown(30);
      setSuccessBanner("Instruções reenviadas com sucesso!");
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao reenviar e-mail.");
    } finally {
      setLoading(false);
    }
  };

  // Reset password submit (Google-style Step 3)
  const submitResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api<{ success: boolean; message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: recoveryEmail.trim(),
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });

      // Populate login with updated password and return to login screen
      setEmail(recoveryEmail.trim());
      setPassword(newPassword);
      setMode("login");
      setSuccessBanner("Senha redefinida com sucesso! Você já pode entrar com sua nova senha.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível redefinir a senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-brand-mark">
          <Sparkles size={18} strokeWidth={2.4} />
        </div>
        <span className="auth-brand-name">
          agenda<span>.</span>
        </span>
      </div>

      {/* Role selector */}
      <div className="auth-role-selector">
        <button
          id="btn-role-user"
          type="button"
          className={`auth-role-chip ${role === "user" ? "active" : ""}`}
          onClick={() => handleRoleChange("user")}
        >
          <UserRound size={14} />
          Usuário
        </button>
        <button
          id="btn-role-admin"
          type="button"
          className={`auth-role-chip ${role === "admin" ? "active admin" : ""}`}
          onClick={() => handleRoleChange("admin")}
        >
          <Shield size={14} />
          Admin
        </button>
      </div>

      <div className={`auth-card ${role === "admin" ? "auth-card--admin" : ""}`}>
        {/* ========================================================= */}
        {/* RECOVERY MODE (Esqueci minha senha - Inspirado no Google) */}
        {/* ========================================================= */}
        {mode === "forgot-password" ? (
          <div className="auth-view-animated">
            {recoveryStep === "request_email" && (
              <>
                <div className="auth-recovery-header">
                  <div className={`auth-recovery-badge ${role === "admin" ? "admin" : ""}`}>
                    <KeyRound size={13} />
                    Recuperação de conta
                  </div>
                  <h1>Recuperar acesso</h1>
                  <p className="auth-subtitle">
                    Informe o e-mail cadastrado na sua conta para receber as instruções de recuperação.
                  </p>
                </div>

                {error && (
                  <div className="auth-error">
                    <span>{error}</span>
                  </div>
                )}

                <div className="auth-info-banner">
                  <ShieldCheck size={16} />
                  <div>
                    <strong>Recuperação segura</strong>
                    <div>Enviaremos um link de confirmação para validar a propriedade da sua conta.</div>
                  </div>
                </div>

                <form onSubmit={submitRecoveryEmail} className="auth-form">
                  <label className="field">
                    <span className="field-label">E-mail cadastrado</span>
                    <div className="input-with-icon">
                      <Mail size={15} />
                      <input
                        className="input"
                        type="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="voce@email.com"
                        autoComplete="email"
                        required
                        autoFocus
                      />
                    </div>
                  </label>

                  <div className="auth-actions-split">
                    <button
                      type="button"
                      className="auth-dark-btn"
                      onClick={() => handleModeChange("login")}
                    >
                      <ArrowLeft size={14} /> Voltar ao login
                    </button>
                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? "Aguarde..." : "Avançar"} {!loading && <ArrowRight size={16} />}
                    </button>
                  </div>
                </form>
              </>
            )}

            {recoveryStep === "email_sent" && (
              <>
                <div className="auth-recovery-header">
                  <div className={`auth-recovery-badge ${role === "admin" ? "admin" : ""}`}>
                    <MailCheck size={13} />
                    Instruções enviadas
                  </div>
                  <h1>Verifique seu e-mail</h1>
                  <p className="auth-subtitle">
                    Instruções de redefinição foram enviadas para o endereço informado.
                  </p>
                </div>

                {successBanner && (
                  <div className="auth-success-banner">
                    <CheckCircle2 size={15} />
                    <span>{successBanner}</span>
                  </div>
                )}
                {error && (
                  <div className="auth-error">
                    <span>{error}</span>
                  </div>
                )}

                <div className="auth-success-card">
                  <div className="auth-success-icon">
                    <MailCheck size={26} />
                  </div>
                  <div className="auth-email-pill">
                    <Mail size={13} />
                    <span>{recoveryEmail}</span>
                  </div>
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "12px", lineHeight: 1.5, maxWidth: "320px" }}>
                    Abra sua caixa de entrada e clique no link de recuperação ou utilize o botão abaixo para definir sua nova senha.
                  </p>
                </div>

                <div className="auth-actions-split">
                  <button
                    type="button"
                    className="auth-dark-btn"
                    onClick={() => handleModeChange("login")}
                  >
                    <ArrowLeft size={14} /> Voltar ao login
                  </button>
                  <button
                    type="button"
                    className="auth-submit"
                    onClick={() => {
                      setError(null);
                      setRecoveryStep("reset_password");
                    }}
                  >
                    Nova senha {!loading && <ArrowRight size={16} />}
                  </button>
                </div>

                <div className="auth-resend-row">
                  <span>Não recebeu o e-mail?</span>
                  <button
                    type="button"
                    className="auth-link"
                    disabled={resendCooldown > 0 || loading}
                    onClick={handleResendRecoveryEmail}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RotateCcw size={12} />
                    {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar e-mail"}
                  </button>
                </div>
              </>
            )}

            {recoveryStep === "reset_password" && (
              <>
                <div className="auth-recovery-header">
                  <div className={`auth-recovery-badge ${role === "admin" ? "admin" : ""}`}>
                    <KeyRound size={13} />
                    Nova senha
                  </div>
                  <h1>Definir nova senha</h1>
                  <p className="auth-subtitle">
                    Crie uma nova senha segura para a conta <strong>{recoveryEmail}</strong>.
                  </p>
                </div>

                {error && (
                  <div className="auth-error">
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={submitResetPassword} className="auth-form">
                  <label className="field">
                    <span className="field-label">Nova senha</span>
                    <div className="input-with-icon">
                      <Lock size={15} />
                      <input
                        className="input"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo de 8 caracteres"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="input-eye"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label="Mostrar senha"
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </label>

                  <label className="field">
                    <span className="field-label">Confirmar nova senha</span>
                    <div className="input-with-icon">
                      <Lock size={15} />
                      <input
                        className="input"
                        type={showNewPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                    </div>
                  </label>

                  <div className="auth-actions-split">
                    <button
                      type="button"
                      className="auth-dark-btn"
                      onClick={() => setRecoveryStep("email_sent")}
                    >
                      <ArrowLeft size={14} /> Voltar
                    </button>
                    <button type="submit" className="auth-submit" disabled={loading}>
                      {loading ? "Salvando..." : "Salvar senha"} {!loading && <Check size={16} />}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* LOGIN / REGISTER MODE                                      */
          /* ========================================================= */
          <div className="auth-view-animated">
            {role === "admin" && (
              <div className="auth-admin-badge">
                <Shield size={12} />
                Acesso Administrativo
              </div>
            )}
            <h1>
              {mode === "login"
                ? role === "admin"
                  ? "Painel Admin"
                  : "Bem-vindo de volta"
                : "Crie sua conta"}
            </h1>
            <p className="auth-subtitle">
              {mode === "login"
                ? role === "admin"
                  ? "Entre com suas credenciais de administrador."
                  : "Entre para acessar sua agenda e seus clientes."
                : "Organize seu negócio em poucos segundos."}
            </p>

            {role === "user" && (
              <div className="auth-tabs">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => handleModeChange("login")}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={mode === "register" ? "active" : ""}
                  onClick={() => handleModeChange("register")}
                >
                  Criar conta
                </button>
              </div>
            )}

            {successBanner && (
              <div className="auth-success-banner">
                <CheckCircle2 size={15} />
                <span>{successBanner}</span>
              </div>
            )}

            {error && (
              <div className="auth-error">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submitAuth} className="auth-form">
              {mode === "register" && (
                <label className="field">
                  <span className="field-label">Nome</span>
                  <div className="input-with-icon">
                    <User size={15} />
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome"
                      autoComplete="name"
                      required
                      minLength={2}
                    />
                  </div>
                </label>
              )}
              <label className="field">
                <span className="field-label">E-mail</span>
                <div className="input-with-icon">
                  <Mail size={15} />
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span className="field-label">Senha</span>
                <div className="input-with-icon">
                  <Lock size={15} />
                  <input
                    className="input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="input-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="Mostrar senha"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {mode === "register" && <span className="field-hint">Pelo menos 8 caracteres</span>}
              </label>
              {mode === "register" && (
                <label className="field">
                  <span className="field-label">Confirmar senha</span>
                  <div className="input-with-icon">
                    <Lock size={15} />
                    <input
                      className="input"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                </label>
              )}

              {mode === "login" && (
                <div className="auth-row">
                  <label className="remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Lembrar meu acesso</span>
                  </label>
                  <button
                    type="button"
                    className="auth-link"
                    onClick={handleOpenForgotPassword}
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}{" "}
                {!loading && <ArrowRight size={16} />}
              </button>
            </form>

            <button
              type="button"
              className="auth-back"
              onClick={() => handleModeChange(mode === "login" ? "register" : "login")}
            >
              <ArrowLeft size={14} /> {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
            </button>
          </div>
        )}
      </div>
      <p className="auth-footer">Agenda · gestão simples para o seu negócio</p>
    </div>
  );
}
