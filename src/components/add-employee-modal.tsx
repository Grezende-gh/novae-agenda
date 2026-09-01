"use client";

import { useState, type FormEvent } from "react";
import { Phone, ShieldCheck, UserPlus, X } from "lucide-react";
import type { Employee } from "@/lib/demo-data";

export function AddEmployeeModal({ onClose, onSave }: { onClose: () => void; onSave: (data: Pick<Employee, "name" | "role" | "phone">) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Profissional");
  const [phone, setPhone] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
        <div className="modal-header">
          <div><p className="modal-eyebrow">Pessoas e permissões</p><h2 id="employee-modal-title">Adicionar profissional</h2></div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={19} /></button>
        </div>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSave({ name, role, phone }); }}>
          <div className="modal-form-grid single">
            <label className="field"><span className="field-label">Nome completo</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Beatriz Ramos" required /></label>
            <label className="field"><span className="field-label">Cargo ou especialidade</span><input className="input" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Profissional" required /></label>
            <label className="field"><span className="field-label">Telefone</span><div className="input-with-icon"><Phone size={15} /><input className="input" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1)$2").replace(/^(\(\d{2}\))(\d{5})(\d)/, "$1$2-$3"))} placeholder="(21)99999-9999" required inputMode="numeric" pattern="[0-9]*" /></div></label>
          </div>
          <div className="modal-footer"><span className="form-note"><ShieldCheck size={14} /> O acesso poderá ser configurado depois</span><div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="button"><UserPlus size={16} /> Adicionar</button></div></div>
        </form>
      </section>
    </div>
  );
}
