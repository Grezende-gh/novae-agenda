"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, BarChart3, Bell, CalendarDays, CalendarPlus,
  Check, CheckCheck, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleHelp,
  Clock3, FileText, Home, LogOut, Mail, MapPin,
  Menu, MessageCircle, Moon, MoreHorizontal, Pencil, Phone, Plus, ReceiptText, Search,
  Settings2, ShieldCheck, Sparkles, Sun, Tag, TrendingUp, UserPlus,
  UserRound, Users, WalletCards, X, XCircle, Zap,
} from "lucide-react";
import { useStore, type Toast } from "@/store/store";
import { api, ApiError, formatPhoneForWhatsApp } from "@/lib/api-client";
import { avatarColor, formatCurrency, initials, PAYMENT_LABELS, STATUS_LABELS } from "@/lib/client-utils";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import type {
  AppointmentDTO, AppointmentStatus, ClientDTO, EmployeeDTO, PaymentMethod, ServiceCategoryDTO, ServiceDTO,
} from "@/shared/types";

type ViewKey = "dashboard" | "agenda" | "clientes" | "servicos" | "equipe" | "financeiro" | "configuracoes";
type CalendarMode = "day" | "week" | "month";

const navItems: Array<{ id: ViewKey; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Início", icon: Home },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "servicos", label: "Serviços", icon: Tag },
  { id: "equipe", label: "Equipe", icon: UserRound },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "configuracoes", label: "Configurações", icon: Settings2 },
];

const pageTitles: Record<ViewKey, { title: string; eyebrow: string }> = {
  dashboard: { title: "Visão geral", eyebrow: "Acompanhe o dia de hoje" },
  agenda: { title: "Agenda", eyebrow: "Organize seus atendimentos" },
  clientes: { title: "Clientes", eyebrow: "Relacionamentos que fazem seu negócio crescer" },
  servicos: { title: "Serviços", eyebrow: "Catálogo e preços do estabelecimento" },
  equipe: { title: "Equipe", eyebrow: "Profissionais e disponibilidade" },
  financeiro: { title: "Financeiro", eyebrow: "Acompanhe a saúde do seu negócio" },
  configuracoes: { title: "Configurações", eyebrow: "Deixe a Agenda com a sua cara" },
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}
function normalizeTime(time: string): string {
  return time.length > 5 ? time.slice(0, 5) : time;
}

const statusClass: Record<AppointmentStatus, string> = {
  scheduled: "status-scheduled",
  confirmed: "status-confirmed",
  waiting: "status-waiting",
  in_progress: "status-progress",
  completed: "status-finished",
  cancelled: "status-cancelled",
  no_show: "status-cancelled",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00`));
}
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

/* ---------- Small UI primitives ---------- */
function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar avatar-${size}`} style={{ backgroundColor: color }}>{initials(name)}</span>;
}
function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return <div className="brand-lockup"><span className="brand-mark"><Sparkles size={17} strokeWidth={2.4} /></span>{!collapsed && <span className="brand-name">agenda<span>.</span></span>}</div>;
}
function Button({ variant = "primary", className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
function IconButton({ label, children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}
function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`status-badge ${statusClass[status]}`}><span className="status-dot" />{STATUS_LABELS[status]}</span>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input select-input" {...props} />;
}
function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-header"><div>{eyebrow && <p className="modal-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><IconButton label="Fechar" onClick={onClose}><X size={19} /></IconButton></div>
        {children}
      </section>
    </div>
  );
}
function EmptyState({ icon: Icon = CalendarDays, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return <div className="toast-stack">{toasts.map((toast) => <div key={toast.id} className={`toast ${toast.tone === "error" ? "toast-error" : ""}`}>{toast.tone === "error" ? <XCircle size={17} /> : <CheckCircle size={17} />}<span>{toast.message}</span><button onClick={() => onDismiss(toast.id)}><X size={14} /></button></div>)}</div>;
}

/* ---------- Pages ---------- */
function DashboardPage({ onNew, onAppointment, onGoToAgenda }: { onNew: () => void; onAppointment: (apt: AppointmentDTO) => void; onGoToAgenda: () => void }) {
  const { stats, appointments, services } = useStore();
  const today = todayKey();
  const todayApts = appointments.filter((apt) => apt.date === today).filter((apt) => !["cancelled", "no_show"].includes(apt.status));
  const pending = todayApts.filter((apt) => apt.status !== "completed");
  const next = pending[0];
  const realized = stats?.today.realized ?? 0;
  const forecast = stats?.today.forecast ?? 0;

  return (
    <div className="page-content dashboard-page">
      <div className="page-intro"><div><p className="eyebrow">{pageTitles.dashboard.eyebrow}</p><h1>Olá! Aqui está seu dia</h1><p className="intro-copy">Acompanhe os atendimentos e a receita do seu estabelecimento hoje.</p></div><Button onClick={onNew}><Plus size={17} /> Novo agendamento</Button></div>

      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-icon metric-teal"><CalendarDays size={18} /></div><div className="metric-copy"><p>Atendimentos hoje</p><strong>{stats?.today.appointments ?? 0}</strong><span className="metric-detail">agendados para hoje</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-lilac"><TrendingUp size={18} /></div><div className="metric-copy"><p>Receita prevista</p><strong>{formatCurrency(forecast)}</strong><span className="metric-detail">para hoje</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-amber"><WalletCards size={18} /></div><div className="metric-copy"><p>Receita realizada</p><strong>{formatCurrency(realized)}</strong><span className="metric-detail">já recebida hoje</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-rose"><Users size={18} /></div><div className="metric-copy"><p>Clientes atendidos</p><strong>{stats?.today.clientsServed ?? 0}</strong><span className="metric-detail">finalizados hoje</span></div></div>
      </div>

      <div className="dashboard-grid">
        <section className="panel next-panel">
          <SectionHeading title="Próximo atendimento" action={next ? <button className="link-button" onClick={() => onAppointment(next)}>Ver detalhes <ArrowRight size={14} /></button> : undefined} />
          {next ? (
            <div className="next-appointment">
              <div className="next-time"><span>Próximo</span><strong>{normalizeTime(next.startTime)}</strong><small>{next.clientName.split(" ")[0]}</small></div>
              <div className="next-person"><Avatar name={next.clientName} color={avatarColor(next.clientName)} size="lg" /><div><h3>{next.clientName}</h3><p>{next.serviceName}</p><span><UserRound size={13} /> com {next.employeeName}</span></div></div>
              <div className="next-price"><span>Valor</span><strong>{formatCurrency(next.total)}</strong><StatusBadge status={next.status} /></div>
            </div>
          ) : (
            <EmptyState title="Agenda livre hoje" description="Você ainda não tem atendimentos para hoje." action={<Button onClick={onNew}><Plus size={16} /> Criar atendimento</Button>} />
          )}
        </section>

        <section className="panel day-summary-panel">
          <SectionHeading title="Resumo do dia" />
          <div className="summary-list">
            <div><span className="summary-icon green"><CheckCheck size={15} /></span><span>Confirmados</span><strong>{todayApts.filter((a) => a.status === "confirmed").length}</strong></div>
            <div><span className="summary-icon yellow"><Clock3 size={15} /></span><span>Aguardando</span><strong>{todayApts.filter((a) => a.status === "waiting").length}</strong></div>
            <div><span className="summary-icon blue"><Zap size={15} /></span><span>Em atendimento</span><strong>{todayApts.filter((a) => a.status === "in_progress").length}</strong></div>
            <div><span className="summary-icon green"><Check size={15} /></span><span>Finalizados</span><strong>{todayApts.filter((a) => a.status === "completed").length}</strong></div>
          </div>
          <button className="summary-footer" onClick={onGoToAgenda}><CalendarPlus size={15} /> Abrir agenda completa <ArrowRight size={14} /></button>
        </section>
      </div>

      <section className="panel agenda-today-panel">
        <SectionHeading title="Agenda de hoje" description="Atendimentos em ordem cronológica" action={<button className="link-button" onClick={onGoToAgenda}>Ver agenda <ArrowRight size={14} /></button>} />
        {todayApts.length ? <div className="appointment-list">{todayApts.map((apt) => <AppointmentCard key={apt.id} appointment={apt} onClick={() => onAppointment(apt)} />)}</div> : <EmptyState title="Nenhum atendimento hoje" description="Sua agenda de hoje está vazia." action={<Button onClick={onNew}><Plus size={16} /> Novo agendamento</Button>} />}
        {services.length === 0 && <div className="dashboard-onboarding-hint"><ShieldCheck size={15} /><span>Cadastre serviços para começar a agendar.</span></div>}
      </section>
    </div>
  );
}

function AppointmentCard({ appointment, onClick }: { appointment: AppointmentDTO; onClick: () => void }) {
  return (
    <button className="appointment-card" onClick={onClick} style={{ "--appointment-color": appointment.serviceColor ?? "#1f6f66" } as React.CSSProperties}>
      <div className="appointment-card-top"><span className="appointment-time">{normalizeTime(appointment.startTime)}</span><StatusBadge status={appointment.status} /></div>
      <div className="appointment-main"><Avatar name={appointment.clientName} color={avatarColor(appointment.clientName)} size="sm" /><span className="appointment-client"><strong>{appointment.clientName}</strong><small>{appointment.serviceName}</small></span></div>
      <div className="appointment-meta"><span><Clock3 size={13} /> {appointment.durationMinutes} min</span><span><UserRound size={13} /> {appointment.employeeName}</span><strong>{formatCurrency(appointment.total)}</strong></div>
    </button>
  );
}

function ClientsPage({ onSelect, onNew }: { onSelect: (client: ClientDTO) => void; onNew: () => void }) {
  const { clients } = useStore();
  const [query, setQuery] = useState("");
  const filtered = clients.filter((client) => {
    const q = query.toLowerCase();
    return !q || client.name.toLowerCase().includes(q) || (client.phone ?? "").toLowerCase().includes(q) || (client.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="page-content">
      <div className="page-intro"><div><p className="eyebrow">Base de relacionamento</p><h1>Clientes</h1><p className="intro-copy">{clients.length} pessoas já fazem parte da sua história.</p></div><Button onClick={onNew}><UserPlus size={17} /> Novo cliente</Button></div>
      <section className="panel clients-panel">
        <div className="panel-toolbar"><div><h2>Todos os clientes</h2><p>Pesquise por nome, telefone ou e-mail</p></div><div className="table-tools"><div className="search-box small"><Search size={16} /><input placeholder="Buscar cliente..." value={query} onChange={(e) => setQuery(e.target.value)} /></div></div></div>
        {filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Cliente</th><th>Contato</th><th>Último atendimento</th><th>Atendimentos</th><th>Total gasto</th><th /></tr></thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id} onClick={() => onSelect(client)}>
                    <td><div className="table-person"><Avatar name={client.name} color={avatarColor(client.name)} /><strong>{client.name}</strong></div></td>
                    <td><span className="muted-text">{client.phone}</span>{client.email && <small>{client.email}</small>}</td>
                    <td>{client.lastVisit ? shortDate(client.lastVisit) : "—"}</td>
                    <td><span className="visit-count">{client.visits}</span></td>
                    <td><strong>{formatCurrency(client.spent)}</strong></td>
                    <td><IconButton label={`Abrir ${client.name}`}><ChevronRight size={17} /></IconButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title={query ? "Nenhum cliente encontrado" : "Você ainda não tem clientes"} description={query ? "Tente buscar por outro nome." : "Cadastre seu primeiro cliente para começar a agendar."} action={<Button onClick={onNew}><UserPlus size={16} /> Novo cliente</Button>} />
        )}
      </section>
    </div>
  );
}

function ClientDrawer({ clientId, onClose, onNewAppointment }: { clientId: string; onClose: () => void; onNewAppointment: (client: ClientDTO) => void }) {
  const { clients } = useStore();
  const [detail, setDetail] = useState<import("@/shared/types").ClientDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    let active = true;
    api<import("@/shared/types").ClientDetailDTO>(`/api/clients/${clientId}`)
      .then((data) => { if (active) setDetail(data); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : "Erro ao carregar."); });
    return () => { active = false; };
  }, [clientId]);

  if (!client) return null;
  const phone = detail?.phone ?? client.phone ?? "";

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="profile-drawer">
        <div className="drawer-header"><span className="eyebrow">Perfil do cliente</span><IconButton label="Fechar perfil" onClick={onClose}><X size={19} /></IconButton></div>
        <div className="profile-hero">
          <Avatar name={client.name} color={avatarColor(client.name)} size="lg" />
          <h2>{client.name}</h2>
          <p>Cliente desde {new Date(detail?.createdAt ?? Date.now()).toLocaleDateString("pt-BR")}</p>
          <div className="profile-actions">
            {phone && <a className="whatsapp-button" href={`https://wa.me/${formatPhoneForWhatsApp(phone)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
            <Button onClick={() => onNewAppointment(client)}><CalendarPlus size={15} /> Agendar</Button>
          </div>
        </div>
        <div className="profile-contact"><div><Phone size={15} /><span>{phone}</span></div>{detail?.email && <div><Mail size={15} /><span>{detail.email}</span></div>}</div>
        <div className="profile-stats">
          <div><strong>{formatCurrency(detail?.spent ?? client.spent)}</strong><span>Total gasto</span></div>
          <div><strong>{detail?.visits ?? client.visits}</strong><span>Atendimentos</span></div>
          <div><strong>{detail?.lastVisit ? shortDate(detail.lastVisit) : "—"}</strong><span>Última visita</span></div>
        </div>
        {detail?.nextVisit && <div className="profile-next"><CalendarDays size={14} /> Próximo: {detail.nextVisit}</div>}
        <section className="profile-section">
          <SectionHeading title="Histórico de atendimentos" />
          {error && <p className="profile-error">{error}</p>}
          {detail && !detail.history.length && <p className="profile-empty">Nenhum atendimento registrado ainda.</p>}
          {detail?.history && detail.history.length > 0 && <div className="history-list">{detail.history.slice(0, 12).map((item) => <div key={item.id}><span className="history-date">{shortDate(item.date)}</span><div><strong>{item.service}</strong><span>{item.employee}</span></div><b>{formatCurrency(item.total)}</b></div>)}</div>}
        </section>
        <section className="profile-section">
          <SectionHeading title="Observações" />
          <div className="profile-note"><Pencil size={14} /><span>{detail?.notes || client.notes || "Nenhuma observação."}</span></div>
        </section>
      </aside>
    </div>
  );
}

function ServicesPage({ onNew }: { onNew: () => void }) {
  const { services, toggleService, categories } = useStore();
  const [filter, setFilter] = useState("Todos");

  const visible = services.filter((service) => filter === "Todos" || (service.active === (filter === "Ativos")));

  return (
    <div className="page-content">
      <div className="page-intro"><div><p className="eyebrow">Catálogo de serviços</p><h1>Serviços</h1><p className="intro-copy">Crie experiências claras para seus clientes e sua equipe.</p></div><Button onClick={onNew}><Plus size={17} /> Novo serviço</Button></div>
      {categories.length > 0 && <div className="category-tabs">{["Todos", "Ativos", "Inativos"].map((tab) => <button key={tab} className={filter === tab ? "active" : ""} onClick={() => setFilter(tab)}>{tab}</button>)}</div>}
      <div className="service-grid">
        {visible.map((service) => (
          <article className={`service-card ${!service.active ? "inactive" : ""}`} key={service.id}>
            <div className="service-card-head"><span className="service-color" style={{ backgroundColor: service.color ?? "#1f6f66" }}><Tag size={16} /></span></div>
            <div className="service-card-body"><h3>{service.name}</h3><span className="service-category">{service.categoryName ?? "Sem categoria"}</span>{service.description && <p>{service.description}</p>}</div>
            <div className="service-card-footer"><div><strong>{formatCurrency(service.price)}</strong><span><Clock3 size={13} /> {service.durationMinutes} min</span></div><label className="toggle"><input type="checkbox" checked={service.active} onChange={() => toggleService(service.id, !service.active)} /><span /></label></div>
          </article>
        ))}
        <button className="add-service-card" onClick={onNew}><span><Plus size={19} /></span><strong>Criar novo serviço</strong><small>Adicione preço, duração e categoria</small></button>
      </div>
      {visible.length === 0 && <EmptyState icon={Tag} title="Nenhum serviço" description="Cadastre serviços para começar a agendar." action={<Button onClick={onNew}><Plus size={16} /> Novo serviço</Button>} />}
    </div>
  );
}

function TeamPage({ onNew }: { onNew: () => void }) {
  const { employees } = useStore();
  return (
    <div className="page-content">
      <div className="page-intro"><div><p className="eyebrow">Pessoas e permissões</p><h1>Equipe</h1><p className="intro-copy">{employees.length} profissionais ativos no seu estabelecimento.</p></div><Button onClick={onNew}><UserPlus size={17} /> Adicionar profissional</Button></div>
      <div className="team-grid">
        {employees.map((employee) => (
          <article className="team-card" key={employee.id}>
            <div className="team-card-top"><Avatar name={employee.name} color={avatarColor(employee.name)} size="lg" /><span className="active-dot" /></div>
            <h3>{employee.name}</h3>
            <span className="team-role">{employee.jobTitle ?? "Profissional"}</span>
            <div className="team-services">{employee.services.map((service) => <span key={service}>{service}</span>)}{employee.services.length === 0 && <span className="team-no-services">Sem serviços vinculados</span>}</div>
            <div className="team-schedule-static"><Clock3 size={13} /> {employee.active ? "Ativo" : "Inativo"}</div>
          </article>
        ))}
        {employees.length === 0 && <EmptyState icon={UserRound} title="Nenhum profissional" description="Adicione profissionais para atribuir atendimentos." action={<Button onClick={onNew}><UserPlus size={16} /> Adicionar profissional</Button>} />}
      </div>
    </div>
  );
}

function FinancialPage() {
  const { stats, employees } = useStore();
  const byEmployee = stats?.byEmployee ?? [];
  return (
    <div className="page-content">
      <div className="page-intro"><div><p className="eyebrow">Visão financeira</p><h1>Financeiro</h1><p className="intro-copy">Faturamento real, calculado a partir dos atendimentos finalizados.</p></div></div>
      <div className="metrics-grid finance-metrics">
        <div className="metric-card"><div className="metric-icon metric-teal"><WalletCards size={18} /></div><div className="metric-copy"><p>Receita hoje</p><strong>{formatCurrency(stats?.today.realized ?? 0)}</strong><span className="metric-detail">{stats?.today.completed ?? 0} atendimentos finalizados</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-lilac"><TrendingUp size={18} /></div><div className="metric-copy"><p>Receita na semana</p><strong>{formatCurrency(stats?.week.revenue ?? 0)}</strong><span className="metric-detail">{stats?.week.appointments ?? 0} atendimentos</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-amber"><BarChart3 size={18} /></div><div className="metric-copy"><p>Receita no mês</p><strong>{formatCurrency(stats?.month.revenue ?? 0)}</strong><span className="metric-detail">{stats?.month.appointments ?? 0} atendimentos</span></div></div>
        <div className="metric-card"><div className="metric-icon metric-rose"><ReceiptText size={18} /></div><div className="metric-copy"><p>Ticket médio</p><strong>{formatCurrency(stats?.today.averageTicket ?? 0)}</strong><span className="metric-detail">por atendimento hoje</span></div></div>
      </div>

      <section className="panel revenue-team-panel">
        <SectionHeading title="Faturamento por profissional" description="Atendimentos finalizados no período" />
        {byEmployee.length ? (
          <div className="revenue-table">
            {byEmployee.map((row, index) => {
              const max = byEmployee[0]?.revenue || 1;
              const emp = employees.find((e) => e.id === row.employeeId);
              return (
                <div key={row.employeeId}>
                  <div className="revenue-person"><span className="rank">{index + 1}</span>{emp ? <Avatar name={row.employeeName} color={avatarColor(row.employeeName)} size="sm" /> : <span className="rank" />}<strong>{row.employeeName}</strong></div>
                  <div className="revenue-bar"><span style={{ width: `${(row.revenue / max) * 100}%` }} /></div>
                  <span className="revenue-visits">{row.appointments} atendimentos</span>
                  <strong className="revenue-total">{formatCurrency(row.revenue)}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={WalletCards} title="Sem faturamento ainda" description="Finalize atendimentos para ver a receita por profissional." />
        )}
      </section>

      {stats?.byMethod && stats.byMethod.length > 0 && (
        <section className="panel payment-panel" style={{ marginTop: 18 }}>
          <SectionHeading title="Por forma de pagamento" />
          <div className="payment-legend">
            {stats.byMethod.map((row) => <div key={row.method}><i className="legend-teal" /><span>{PAYMENT_LABELS[row.method]}</span><strong>{formatCurrency(row.total)}</strong></div>)}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsPage({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const { session, notify } = useStore();
  const company = session?.company;
  const defaultPhone = "(21) 99999-9999";
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : "";
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };
  const [activeTab, setActiveTab] = useState<"empresa" | "funcionamento" | "ajuda">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("agenda-settings-tab");
      return (saved as "empresa" | "funcionamento" | "ajuda") || "empresa";
    }
    return "empresa";
  });
  const [name, setName] = useState(company?.name ?? "");
  const [phone, setPhone] = useState(company?.phone ?? defaultPhone);
  const [whatsapp, setWhatsapp] = useState(company?.whatsapp ?? defaultPhone);
  const [email, setEmail] = useState(company?.email ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [instagram, setInstagram] = useState(company?.instagram ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/company", { method: "PATCH", body: JSON.stringify({ name, phone, whatsapp, email, address, instagram }) });
      notify("Configurações salvas com sucesso.");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Erro ao salvar.", "error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("agenda-settings-tab", activeTab);
  }, [activeTab]);

  return (
    <div className="page-content settings-page">
      <div className="page-intro"><div><p className="eyebrow">Preferências do espaço</p><h1>Configurações</h1><p className="intro-copy">Personalize a experiência do seu estabelecimento.</p></div><Button onClick={save}>{saving ? "Salvando..." : <><Check size={16} /> Salvar alterações</>}</Button></div>
      <div className="settings-layout">
        <aside className="settings-nav">
          <button className={activeTab === "empresa" ? "active" : ""} onClick={() => setActiveTab("empresa")}><Settings2 size={16} /> Empresa</button>
          <button className={activeTab === "funcionamento" ? "active" : ""} onClick={() => setActiveTab("funcionamento")}><Clock3 size={16} /> Funcionamento</button>
          <button className={activeTab === "ajuda" ? "active" : ""} onClick={() => setActiveTab("ajuda")}><CircleHelp size={16} /> Ajuda</button>
        </aside>

        <div className="settings-sections">
          {activeTab === "empresa" && (
            <>
              <section className="settings-section">
                <SectionHeading title="Informações da empresa" description="Esses dados aparecem nos seus agendamentos e comunicações." />
                <div className="settings-form">
                  <Field label="Nome da empresa"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label="Telefone"><input className="input" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(21) 99999-9999" inputMode="numeric" pattern="[0-9]*" /></Field>
                  <Field label="WhatsApp"><input className="input" value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} placeholder="(21) 99999-9999" inputMode="numeric" pattern="[0-9]*" /></Field>
                  <Field label="E-mail">
                    <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@dominio.com" />
                  </Field>
                  <Field label="Endereço"><div className="input-with-icon"><MapPin size={16} /><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div></Field>
                  <Field label="Instagram"><div className="input-with-icon"><span className="at-symbol">@</span><input className="input" value={instagram} onChange={(e) => setInstagram(e.target.value)} /></div></Field>
                </div>
              </section>

              <section className="settings-section">
                <SectionHeading title="Aparência" description="A Agenda se adapta ao seu jeito de trabalhar." />
                <div className="theme-options">
                  <button className={theme === "light" ? "theme-option active" : "theme-option"} onClick={() => setTheme("light")}>
                    <span className="theme-preview light-preview"><Sun size={17} /></span>
                    <span className="theme-copy"><strong>Claro</strong><small>Leve e arejado</small></span>
                    {theme === "light" && <CheckCircle size={17} className="theme-check" />}
                  </button>
                  <button className={theme === "dark" ? "theme-option active" : "theme-option"} onClick={() => setTheme("dark")}>
                    <span className="theme-preview dark-preview"><Moon size={17} /></span>
                    <span className="theme-copy"><strong>Escuro</strong><small>Confortável à noite</small></span>
                    {theme === "dark" && <CheckCircle size={17} className="theme-check" />}
                  </button>
                </div>
              </section>

              <section className="settings-section">
                <SectionHeading title="Sessão" />
                <div className="profile-note"><UserRound size={14} /><span>Você está conectado(a) como <strong>{session?.name}</strong> ({session?.role === "owner" ? "Proprietário" : session?.role === "admin" ? "Administrador" : "Profissional"}).</span></div>
              </section>
            </>
          )}

          {activeTab === "funcionamento" && (
            <section className="settings-section">
              <SectionHeading title="Funcionamento" description="Configure os horários e regras do seu estabelecimento." />
              <div className="settings-form">
                <div className="settings-tab-list">
                  <button className="settings-tab active">Horários</button>
                  <button className="settings-tab">Pausas</button>
                  <button className="settings-tab">Disponibilidade</button>
                </div>

                <div className="settings-feature-grid">
                  <div className="settings-feature-card">
                    <span className="feature-pill">Horário de abertura</span>
                    <strong>08:00</strong>
                    <small>Primeira entrada do dia</small>
                  </div>
                  <div className="settings-feature-card">
                    <span className="feature-pill">Horário de fechamento</span>
                    <strong>18:00</strong>
                    <small>Últimos atendimentos</small>
                  </div>
                  <div className="settings-feature-card">
                    <span className="feature-pill">Dias ativos</span>
                    <strong>Seg - Sáb</strong>
                    <small>Funcionamento padrão</small>
                  </div>
                </div>

                <Field label="Abertura"><input className="input" value="08:00" readOnly /></Field>
                <Field label="Fechamento"><input className="input" value="18:00" readOnly /></Field>
                <Field label="Dias de atendimento"><input className="input" value="Segunda a Sábado" readOnly /></Field>
              </div>
            </section>
          )}

          {activeTab === "ajuda" && (
            <section className="settings-section">
              <SectionHeading title="Ajuda" description="Acesse informações rápidas e suporte do sistema." />
              <div className="settings-form">
                <div className="settings-tab-list">
                  <button className="settings-tab active">Perguntas</button>
                  <button className="settings-tab">Contato</button>
                  <button className="settings-tab">Guia</button>
                </div>

                <div className="settings-feature-grid">
                  <div className="settings-feature-card">
                    <span className="feature-pill">Pergunta rápida</span>
                    <strong>Como criar um agendamento?</strong>
                    <small>Fluxo inicial</small>
                  </div>
                  <div className="settings-feature-card">
                    <span className="feature-pill">Suporte</span>
                    <strong>Chat ou e-mail</strong>
                    <small>Resposta rápida</small>
                  </div>
                  <div className="settings-feature-card">
                    <span className="feature-pill">Guia</span>
                    <strong>Serviços + equipe</strong>
                    <small>Configuração inicial</small>
                  </div>
                </div>

                <Field label="Dúvida frequente"><input className="input" value="Como criar um agendamento?" readOnly /></Field>
                <Field label="Suporte"><input className="input" value="Atendimento via chat ou e-mail" readOnly /></Field>
                <Field label="Guia rápido"><input className="input" value="Cadastre serviços, equipe e horários" readOnly /></Field>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Modals ---------- */
function NewAppointmentModal({ onClose, defaultDate }: { onClose: () => void; defaultDate: string }) {
  const { clients, services, employees, createAppointment, notify } = useStore();
  const [clientId, setClientId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedServices = services.filter((s) => serviceIds.includes(s.id));
  const duration = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const total = selectedServices.reduce((sum, s) => sum + s.price, 0);

  // employees that can perform all selected services
  const eligibleEmployees = employees.filter((employee) => {
    if (serviceIds.length === 0) return employee.active;
    return serviceIds.every((sid) => employee.serviceIds.includes(sid));
  });

  const toggleService = (id: string) => {
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clientId || serviceIds.length === 0 || !employeeId) {
      notify("Selecione cliente, serviço e profissional.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await createAppointment({ clientId, employeeId, serviceIds, date, startTime, notes: notes || undefined });
      notify("Agendamento criado com sucesso.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível criar o agendamento.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Novo agendamento" eyebrow="Agendamento rápido" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-form-grid">
          <Field label="Cliente"><SelectField value={clientId} onChange={(e) => setClientId(e.target.value)} required><option value="">Selecione...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</SelectField></Field>
          <Field label="Profissional"><SelectField value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required><option value="">Selecione...</option>{eligibleEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</SelectField></Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Horário"><input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></Field>
          <Field label="Serviços" hint={`${duration} min · ${formatCurrency(total)}`}>
            <div className="service-multi-select">
              {services.filter((s) => s.active).map((service) => (
                <button type="button" key={service.id} className={serviceIds.includes(service.id) ? "service-option active" : "service-option"} onClick={() => toggleService(service.id)}>
                  <span>{service.name}</span><small>{formatCurrency(service.price)} · {service.durationMinutes} min</small>
                </button>
              ))}
              {services.filter((s) => s.active).length === 0 && <span className="field-hint">Cadastre serviços primeiro.</span>}
            </div>
          </Field>
          <Field label="Observações"><textarea className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguma informação importante?" /></Field>
        </div>
        {serviceIds.length > 0 && eligibleEmployees.length === 0 && <div className="form-note" style={{ color: "var(--warning)", marginTop: 10 }}><CircleAlert size={14} /> Nenhum profissional selecionável realiza os serviços escolhidos.</div>}
        <div className="modal-footer"><span className="form-note"><ShieldCheck size={14} /> Conflitos são verificados automaticamente</span><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Criando..." : <><Check size={16} /> Confirmar agendamento</>}</Button></div></div>
      </form>
    </Modal>
  );
}

function NewClientModal({ onClose }: { onClose: () => void }) {
  const { createClient, notify } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createClient({ name, phone, email: email || undefined, notes: notes || undefined });
      notify("Cliente cadastrado com sucesso.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível cadastrar o cliente.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Novo cliente" eyebrow="Adicionar à sua base" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-form-grid single">
          <Field label="Nome completo"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fernanda Almeida" required minLength={2} /></Field>
          <Field label="Telefone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" required minLength={8} /></Field>
          <Field label="E-mail (opcional)"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" /></Field>
          <Field label="Observações (opcional)"><textarea className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="modal-footer"><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : <><UserPlus size={16} /> Cadastrar cliente</>}</Button></div></div>
      </form>
    </Modal>
  );
}

function NewServiceModal({ onClose }: { onClose: () => void }) {
  const { createService, notify, categories } = useStore();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createService({ name, price: Number(price) || 0, durationMinutes: Number(duration) || 60, description: description || undefined });
      notify("Serviço criado com sucesso.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível criar o serviço.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Novo serviço" eyebrow="Expanda seu catálogo" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-form-grid">
          <Field label="Nome do serviço"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Corte" required minLength={2} /></Field>
          <Field label="Valor"><div className="input-with-prefix"><span>R$</span><input className="input" type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} required /></div></Field>
          <Field label="Duração"><div className="input-with-suffix"><input className="input" type="number" min="5" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required /><span>min</span></div></Field>
          <Field label="Descrição"><textarea className="input textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição." /></Field>
        </div>
        {categories.length === 0 && <div className="form-note" style={{ marginTop: 8 }}><Tag size={14} /> Você poderá organizar em categorias depois.</div>}
        <div className="modal-footer"><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Criando..." : <><Plus size={16} /> Criar serviço</>}</Button></div></div>
      </form>
    </Modal>
  );
}

function NewEmployeeModal({ onClose }: { onClose: () => void }) {
  const { createEmployee, notify, services } = useStore();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("Profissional");
  const [phone, setPhone] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createEmployee({ name, jobTitle, phone: phone || undefined, serviceIds });
      notify("Profissional adicionado com sucesso.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível adicionar o profissional.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Adicionar profissional" eyebrow="Pessoas e permissões" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-form-grid">
          <Field label="Nome completo"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Beatriz Ramos" required minLength={2} /></Field>
          <Field label="Cargo ou especialidade"><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></Field>
          <Field label="Telefone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></Field>
          <Field label="Serviços que realiza">
            <div className="service-multi-select">
              {services.map((service) => (
                <button type="button" key={service.id} className={serviceIds.includes(service.id) ? "service-option active" : "service-option"} onClick={() => setServiceIds((current) => current.includes(service.id) ? current.filter((s) => s !== service.id) : [...current, service.id])}>
                  <span>{service.name}</span>
                </button>
              ))}
              {services.length === 0 && <span className="field-hint">Cadastre serviços primeiro.</span>}
            </div>
          </Field>
        </div>
        <div className="modal-footer"><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : <><UserPlus size={16} /> Adicionar</>}</Button></div></div>
      </form>
    </Modal>
  );
}

function BlockModal({ onClose, defaultDate }: { onClose: () => void; defaultDate: string }) {
  const { employees, createBlock, notify } = useStore();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState("12:00");
  const [endsAt, setEndsAt] = useState("13:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeId) { notify("Selecione um profissional.", "error"); return; }
    setSubmitting(true);
    try {
      await createBlock({ employeeId, date, startsAt, endsAt, allDay, reason: reason || (allDay ? "Folga" : "Bloqueio") });
      notify("Horário bloqueado com sucesso.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível bloquear o horário.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Bloquear horário" eyebrow="Reserve um período da agenda" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-form-grid">
          <Field label="Profissional"><SelectField value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required><option value="">Selecione...</option>{employees.filter((e) => e.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</SelectField></Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Tipo"><SelectField value={allDay ? "day" : "period"} onChange={(e) => setAllDay(e.target.value === "day")}><option value="period">Período</option><option value="day">Dia inteiro</option></SelectField></Field>
          <Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: almoço, feriado..." required /></Field>
          {!allDay && <Field label="Início"><input className="input" type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></Field>}
          {!allDay && <Field label="Fim"><input className="input" type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /></Field>}
        </div>
        <div className="modal-footer"><span className="form-note"><CircleAlert size={14} /> Novos atendimentos não poderão ocupar este período</span><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={submitting}>{submitting ? "Bloqueando..." : <><Clock3 size={16} /> Bloquear</>}</Button></div></div>
      </form>
    </Modal>
  );
}

function AppointmentDetailModal({ appointment, onClose }: { appointment: AppointmentDTO; onClose: () => void }) {
  const { updateAppointmentStatus, finishAppointment, rescheduleAppointment, notify, employees, clients } = useStore();
  const shareUrl = `https://wa.me/${formatPhoneForWhatsApp(appointment.clientPhone)}?text=${encodeURIComponent(`Olá, ${appointment.clientName}! Seu atendimento de ${appointment.serviceName} está marcado para ${shortDate(appointment.date)} às ${normalizeTime(appointment.startTime)}.`)}`;

  const confirm = async () => {
    try { await updateAppointmentStatus(appointment.id, "confirmed"); notify("Atendimento confirmado."); onClose(); } catch (e) { notify(e instanceof ApiError ? e.message : "Erro.", "error"); }
  };
  const start = async () => {
    try { await updateAppointmentStatus(appointment.id, "in_progress"); notify("Atendimento iniciado."); onClose(); } catch (e) { notify(e instanceof ApiError ? e.message : "Erro.", "error"); }
  };
  const cancel = async () => {
    if (!window.confirm("Cancelar este atendimento?")) return;
    try { await updateAppointmentStatus(appointment.id, "cancelled"); notify("Atendimento cancelado."); onClose(); } catch (e) { notify(e instanceof ApiError ? e.message : "Erro.", "error"); }
  };

  const [finishing, setFinishing] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [amount, setAmount] = useState(appointment.total);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(appointment.date);
  const [newTime, setNewTime] = useState(normalizeTime(appointment.startTime));
  const [newEmployee, setNewEmployee] = useState(appointment.employeeId);

  const doFinish = async () => {
    setFinishing(true);
    try {
      await finishAppointment(appointment.id, amount, method);
      notify("Atendimento finalizado e pagamento registrado.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Erro ao finalizar.", "error");
    } finally {
      setFinishing(false);
    }
  };

  const doReschedule = async () => {
    setRescheduling(true);
    try {
      await rescheduleAppointment(appointment.id, { date: newDate, startTime: newTime, employeeId: newEmployee });
      notify("Atendimento reagendado.");
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Não foi possível reagendar.", "error");
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <Modal title="Detalhes do atendimento" eyebrow={`${shortDate(appointment.date)} · ${normalizeTime(appointment.startTime)}`} onClose={onClose} wide>
      <div className="detail-person"><Avatar name={appointment.clientName} color={avatarColor(appointment.clientName)} size="lg" /><div><h3>{appointment.clientName}</h3><p>{appointment.clientPhone}</p></div><StatusBadge status={appointment.status} /></div>
      <div className="detail-grid">
        <div><span>Serviço</span><strong>{appointment.serviceName}</strong></div>
        <div><span>Profissional</span><strong>{appointment.employeeName}</strong></div>
        <div><span>Horário</span><strong>{normalizeTime(appointment.startTime)} – {normalizeTime(appointment.endTime)}</strong></div>
        <div><span>Duração</span><strong>{appointment.durationMinutes} minutos</strong></div>
        <div><span>Valor</span><strong>{formatCurrency(appointment.total)}</strong></div>
        <div><span>Pagamento</span><strong>{appointment.paid ? "Recebido" : "Pendente"}</strong></div>
      </div>
      {appointment.notes && <div className="detail-note"><FileText size={15} /><span>{appointment.notes}</span></div>}

      {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no_show" && (
        <>
          <div className="detail-actions-inline">
            {appointment.status === "scheduled" && <Button variant="secondary" onClick={confirm}><Check size={15} /> Confirmar</Button>}
            {appointment.status !== "in_progress" && <Button variant="secondary" onClick={start}><Zap size={15} /> Iniciar</Button>}
            <Button variant="danger" onClick={cancel}><X size={15} /> Cancelar</Button>
            {appointment.clientPhone && <a className="whatsapp-button" href={shareUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>}
          </div>

          <div className="detail-section">
            <div className="detail-section-head"><h3>Finalizar atendimento</h3><Button onClick={doFinish} disabled={finishing}>{finishing ? "Finalizando..." : <><CheckCheck size={16} /> Finalizar e receber</>}</Button></div>
            <div className="finish-fields">
              <Field label="Valor recebido"><div className="input-with-prefix"><span>R$</span><input className="input" type="number" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div></Field>
              <Field label="Forma de pagamento"><SelectField value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{(["pix", "cash", "debit", "credit", "other"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</SelectField></Field>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-head"><h3>Reagendar</h3><Button variant="secondary" onClick={doReschedule} disabled={rescheduling}>{rescheduling ? "Reagendando..." : <><CalendarDays size={15} /> Reagendar</>}</Button></div>
            <div className="finish-fields">
              <Field label="Nova data"><input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></Field>
              <Field label="Novo horário"><input className="input" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} /></Field>
              <Field label="Profissional"><SelectField value={newEmployee} onChange={(e) => setNewEmployee(e.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</SelectField></Field>
            </div>
          </div>
        </>
      )}
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
    </Modal>
  );
}

/* ---------- Profile drawer ---------- */
function ProfileDrawer({ onClose, session, onSettings, onLogout }: { onClose: () => void; session: any; onSettings: () => void; onLogout: () => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="profile-drawer">
        <div className="drawer-header"><span className="eyebrow">Sua conta</span><IconButton label="Fechar perfil" onClick={onClose}><X size={19} /></IconButton></div>
        
        <div className="profile-hero">
          <span className="profile-avatar-large">{initials(session?.name ?? "U")}</span>
          <h2>{session?.name}</h2>
          <p className="profile-role">{session?.role === "owner" ? "Proprietário" : session?.role === "admin" ? "Administrador" : "Profissional"}</p>
          <p className="profile-company">{session?.company.name}</p>
        </div>

        <div className="profile-info">
          <div className="info-item">
            <span className="info-label">E-mail</span>
            <strong>{session?.email || "não informado"}</strong>
          </div>
          <div className="info-item">
            <span className="info-label">Acesso desde</span>
            <strong>{new Date(session?.createdAt || Date.now()).toLocaleDateString("pt-BR")}</strong>
          </div>
        </div>

        <div className="profile-actions-drawer">
          <Button onClick={() => { onSettings(); onClose(); }} className="full-width"><Settings2 size={16} /> Configurações da conta</Button>
          <Button variant="secondary" onClick={() => { onLogout(); onClose(); }} className="full-width"><LogOut size={16} /> Sair da conta</Button>
        </div>

        <div className="profile-footer">
          <span className="profile-version">agenda. v1.0</span>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Main shell ---------- */
export function AppShell() {
  const { session, appointments, employees, blocks, logout, toasts, dismissToast } = useStore();
  const [view, setView] = useState<ViewKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("agenda-view");
      return (saved as ViewKey) || "dashboard";
    }
    return "dashboard";
  });
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [collapsed, setCollapsed] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [calMode, setCalMode] = useState<CalendarMode>("day");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [globalSearch, setGlobalSearch] = useState("");

  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [detailAppointment, setDetailAppointment] = useState<AppointmentDTO | null>(null);
  const [clientDrawer, setClientDrawer] = useState<ClientDTO | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("agenda-view", view);
  }, [view]);

  const navigate = (v: ViewKey) => { setView(v); setMobileMenu(false); };

  const render = () => {
    switch (view) {
      case "dashboard":
        return <DashboardPage onNew={() => setNewAppointmentOpen(true)} onAppointment={setDetailAppointment} onGoToAgenda={() => navigate("agenda")} />;
      case "clientes":
        return <ClientsPage onSelect={setClientDrawer} onNew={() => setNewClientOpen(true)} />;
      case "servicos":
        return <ServicesPage onNew={() => setNewServiceOpen(true)} />;
      case "equipe":
        return <TeamPage onNew={() => setNewEmployeeOpen(true)} />;
      case "financeiro":
        return <FinancialPage />;
      case "configuracoes":
        return <SettingsPage theme={theme} setTheme={setTheme} />;
      case "agenda":
        return <CalendarPage />;
    }
  };

  function CalendarPage() {
    const displayed = appointments.filter((a) => a.date === selectedDate && (employeeFilter === "all" || a.employeeId === employeeFilter));
    const changeDate = (days: number) => {
      const d = new Date(`${selectedDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      setSelectedDate(d.toISOString().slice(0, 10));
    };
    return (
      <div className="page-content calendar-page">
        <div className="page-intro compact-intro"><div><p className="eyebrow">Agenda do estabelecimento</p><h1>{calMode === "month" ? monthFormatter.format(new Date(`${selectedDate}T12:00:00`)) : dateLabel(selectedDate)}</h1><p className="intro-copy">{displayed.length} atendimentos · {formatCurrency(displayed.reduce((sum, a) => sum + a.total, 0))} previsto</p></div></div>
        <div className="calendar-toolbar">
          <div className="calendar-date-controls"><button className="today-button" onClick={() => setSelectedDate(todayKey())}>Hoje</button><IconButton label="Anterior" onClick={() => changeDate(-1)}><ChevronLeft size={18} /></IconButton><IconButton label="Próxima" onClick={() => changeDate(1)}><ChevronRight size={18} /></IconButton><strong>{calMode === "month" ? monthFormatter.format(new Date(`${selectedDate}T12:00:00`)) : dateLabel(selectedDate)}</strong></div>
          <div className="toolbar-actions">
            <div className="view-switcher">{(["day", "week", "month"] as CalendarMode[]).map((m) => <button key={m} className={calMode === m ? "active" : ""} onClick={() => setCalMode(m)}>{m === "day" ? "Dia" : m === "week" ? "Semana" : "Mês"}</button>)}</div>
            <Button variant="secondary" onClick={() => setBlockOpen(true)}><Clock3 size={16} /> Bloquear horário</Button>
            <Button onClick={() => setNewAppointmentOpen(true)}><Plus size={16} /> Novo agendamento</Button>
          </div>
        </div>
        <div className="calendar-filter-row">
          <div className="employee-filter-label"><Users size={15} /><span>Profissional:</span><SelectField value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}><option value="all">Todos os profissionais</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</SelectField></div>
        </div>
        {calMode === "day" && <DayCalendar appointments={displayed} onAppointment={setDetailAppointment} />}
        {calMode === "week" && <WeekCalendar appointments={appointments} onAppointment={setDetailAppointment} setDate={setSelectedDate} />}
        {calMode === "month" && <MonthCalendar appointments={appointments} onAppointment={setDetailAppointment} setDate={setSelectedDate} />}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileMenu ? "mobile-open" : ""}`}>
        <div className="sidebar-top"><Logo collapsed={collapsed} /><IconButton label="Recolher menu" onClick={() => setCollapsed((v) => !v)}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</IconButton></div>
        <div className="workspace-switcher"><span className="workspace-logo">{initials(session?.company.name ?? "A")}</span>{!collapsed && <div><strong>{session?.company.name}</strong><small>Unidade principal</small></div>}</div>
        <nav className="sidebar-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{id === "agenda" && !collapsed && <em>{appointments.filter((a) => a.date === todayKey() && !["cancelled", "no_show"].includes(a.status)).length}</em>}</button>)}</nav>
        <div className="sidebar-bottom">
          <button className="profile-nav" onClick={() => setProfileDrawerOpen(true)}><span className="profile-avatar">{initials(session?.name ?? "U")}</span>{!collapsed && <span><strong>{session?.name}</strong><small>{session?.role === "owner" ? "Proprietário" : session?.role === "admin" ? "Administrador" : "Profissional"}</small></span>}<MoreHorizontal size={17} /></button>
          <button className="logout-button" onClick={logout}><LogOut size={17} /><span>{!collapsed ? "Sair da conta" : "Sair"}</span></button>
        </div>
      </aside>

      <main className={`main-content ${collapsed ? "main-expanded" : ""}`}>
        <header className="topbar">
          <div className="topbar-left"><IconButton label="Menu" className="mobile-menu-button" onClick={() => setMobileMenu((v) => !v)}><Menu size={20} /></IconButton><div className="breadcrumb"><span>{session?.company.name}</span><ChevronRight size={14} /><strong>{pageTitles[view].title}</strong></div></div>
          <div className="topbar-actions">
            <div className="global-search"><Search size={17} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar na Agenda" onKeyDown={(e) => { if (e.key === "Enter" && globalSearch) navigate("clientes"); }} /></div>
            <IconButton label="Alternar tema" onClick={() => setTheme((t) => {
              const next = t === "light" ? "dark" : "light";
              applyTheme(next);
              return next;
            })}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</IconButton>
            <button className="notification-button" aria-label="Notificações"><Bell size={18} />{appointments.some((a) => a.date === todayKey() && a.status === "confirmed") && <i />}</button>
            <button className="topbar-profile-button" onClick={() => setProfileDrawerOpen(true)} aria-label="Perfil"><span className="topbar-avatar">{initials(session?.name ?? "U")}</span></button>
          </div>
        </header>
        {render()}
      </main>

      <nav className="mobile-bottom-nav">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}<button className="mobile-add-button" onClick={() => setNewAppointmentOpen(true)}><Plus size={21} /></button></nav>

      <button className="floating-add" onClick={() => setNewAppointmentOpen(true)} aria-label="Novo agendamento"><Plus size={23} /></button>

      {newAppointmentOpen && <NewAppointmentModal onClose={() => setNewAppointmentOpen(false)} defaultDate={selectedDate} />}
      {newClientOpen && <NewClientModal onClose={() => setNewClientOpen(false)} />}
      {newServiceOpen && <NewServiceModal onClose={() => setNewServiceOpen(false)} />}
      {newEmployeeOpen && <NewEmployeeModal onClose={() => setNewEmployeeOpen(false)} />}
      {blockOpen && <BlockModal onClose={() => setBlockOpen(false)} defaultDate={selectedDate} />}
      {detailAppointment && <AppointmentDetailModal appointment={detailAppointment} onClose={() => setDetailAppointment(null)} />}
      {clientDrawer && <ClientDrawer clientId={clientDrawer.id} onClose={() => setClientDrawer(null)} onNewAppointment={(client) => { setClientDrawer(null); setSelectedDate(todayKey()); setNewAppointmentOpen(true); }} />}
      {profileDrawerOpen && <ProfileDrawer onClose={() => setProfileDrawerOpen(false)} session={session} onSettings={() => navigate("configuracoes")} onLogout={logout} />}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function DayCalendar({ appointments, onAppointment }: { appointments: AppointmentDTO[]; onAppointment: (a: AppointmentDTO) => void }) {
  const hourHeight = 74;
  const slots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  return (
    <section className="panel day-calendar-panel">
      <div className="day-calendar-body">
        <div className="time-column">{slots.map((time) => <span key={time} style={{ height: `${hourHeight}px` }}>{time}</span>)}</div>
        <div className="timeline-canvas" style={{ height: `${slots.length * hourHeight}px` }}>
          <div className="hour-lines">{slots.map((time) => <span key={time} style={{ height: `${hourHeight}px` }} />)}</div>
          {appointments.map((apt) => {
            const top = ((timeToMinutes(normalizeTime(apt.startTime)) - 480) / 60) * hourHeight;
            const height = Math.max((apt.durationMinutes / 60) * hourHeight - 6, 40);
            return <button key={apt.id} className="timeline-appointment" style={{ top, height, "--appointment-color": apt.serviceColor ?? "#1f6f66" } as React.CSSProperties} onClick={() => onAppointment(apt)}><span className="timeline-time">{normalizeTime(apt.startTime)} – {normalizeTime(apt.endTime)}</span><strong>{apt.clientName}</strong><small>{apt.serviceName}</small><em>{apt.employeeName}</em></button>;
          })}
        </div>
      </div>
      {appointments.length === 0 && <div className="day-empty"><CalendarDays size={18} /> Nenhum atendimento nesta data.</div>}
    </section>
  );
}

function WeekCalendar({ appointments, onAppointment, setDate }: { appointments: AppointmentDTO[]; onAppointment: (a: AppointmentDTO) => void; setDate: (d: string) => void }) {
  const today = todayKey();
  const start = new Date(`${today}T12:00:00Z`);
  const monday = new Date(start);
  monday.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  return (
    <section className="panel week-calendar">
      <div className="week-head"><div className="week-time-space" />{days.map((day) => <button key={day} className={day === today ? "week-day today" : "week-day"} onClick={() => setDate(day)}><span>{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][days.indexOf(day)]}</span><strong>{day.slice(8, 10)}</strong></button>)}</div>
      <div className="week-grid">
        <div className="week-time-column">{["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"].map((t) => <span key={t}>{t}</span>)}</div>
        {days.map((day) => <div className="week-day-column" key={day}>{appointments.filter((a) => a.date === day).map((apt) => <button key={apt.id} className="week-appointment" onClick={() => onAppointment(apt)}><b>{normalizeTime(apt.startTime)}</b><strong>{apt.clientName}</strong><small>{apt.serviceName}</small><i>{apt.employeeName.split(" ")[0]}</i></button>)}</div>)}
      </div>
    </section>
  );
}

function MonthCalendar({ appointments, onAppointment, setDate }: { appointments: AppointmentDTO[]; onAppointment: (a: AppointmentDTO) => void; setDate: (d: string) => void }) {
  const today = todayKey();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  return (
    <section className="panel month-calendar">
      <div className="month-weekdays">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="month-grid">
        {cells.map((cell, i) => cell ? (
          <button key={cell.date} className={`month-cell ${cell.date === today ? "current" : ""}`} onClick={() => setDate(cell.date)}>
            <span className="month-number">{cell.day}</span>
            {appointments.filter((a) => a.date === cell.date).slice(0, 3).map((apt) => <span key={apt.id} className="month-event" onClick={(e) => { e.stopPropagation(); onAppointment(apt); }}><i />{normalizeTime(apt.startTime)} {apt.clientName.split(" ")[0]}</span>)}
            {appointments.filter((a) => a.date === cell.date).length > 3 && <em>+{appointments.filter((a) => a.date === cell.date).length - 3} mais</em>}
          </button>
        ) : <div key={`empty-${i}`} className="month-cell muted" />)}
      </div>
    </section>
  );
}
